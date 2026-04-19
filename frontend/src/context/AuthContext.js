import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI, seedAPI, processOfflineQueue } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import useDeviceDetect from '@/hooks/useDeviceDetect';
import offlineDB from '@/lib/offlineDB';
import { notify } from '@/lib/notify';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { applyUserPreferences, resetThemeOnLogout } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Offline sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const wasOfflineRef = useRef(!navigator.onLine);
  const isOnlineRef = useRef(navigator.onLine);
  const syncIntervalRef = useRef(null);
  
  // Auto-logout state
  const inactivityTimerRef = useRef(null);
  const [autoLogoutConfig, setAutoLogoutConfig] = useState({ enabled: false, timeout_minutes: 30 });
  
  // Device detection for responsive UI
  const device = useDeviceDetect();
  
  // Global accessibility mode - Large text
  const [largeMode, setLargeMode] = useState(() => {
    return localStorage.getItem('pos_large_mode') === 'true';
  });
  
  const toggleLargeMode = () => {
    const newMode = !largeMode;
    setLargeMode(newMode);
    localStorage.setItem('pos_large_mode', String(newMode));
  };
  
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  // Update pending sync count
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await offlineDB.getSyncQueueCount();
      setPendingSyncCount(count);
    } catch (err) {
      console.error('[Offline] Error getting pending count:', err);
    }
  }, []);

  // Sync pending operations with server
  const syncPendingOperations = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return { synced: 0, failed: 0 };
    
    const token = localStorage.getItem('pos_token');
    if (!token) return { synced: 0, failed: 0 };
    
    setIsSyncing(true);
    
    try {
      const result = await offlineDB.syncWithServer(API_BASE, token);
      setLastSyncTime(new Date());
      
      // Removed toast notification - silent sync
      
      await updatePendingCount();
      await offlineDB.cleanupSyncedData();
      
      return result;
    } catch (error) {
      console.error('[Sync] Error:', error);
      return { synced: 0, failed: 0, error };
    } finally {
      setIsSyncing(false);
    }
  }, [API_BASE, isSyncing, updatePendingCount]);

  // Cache essential data for offline use
  const cacheForOffline = useCallback(async () => {
    const token = localStorage.getItem('pos_token');
    if (!token || !navigator.onLine) return;
    
    try {
      await offlineDB.cacheEssentialData(API_BASE, token);
      console.log('[Offline] Data cached successfully');
    } catch (error) {
      console.error('[Offline] Cache error:', error);
    }
  }, [API_BASE]);

  // Handle online/offline status changes
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      processOfflineQueue();
      if (wasOfflineRef.current) {
        setTimeout(() => { syncPendingOperations(); }, 1500);
      }
      wasOfflineRef.current = false;
    };

    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
    };

    // Real connectivity check — ping server every 10s
    const checkRealConnection = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/health`, {
          method: 'GET', signal: controller.signal, cache: 'no-store',
        });
        clearTimeout(timeout);
        if (res.ok && !isOnlineRef.current) { handleOnline(); }
        isOnlineRef.current = res.ok;
        setIsOnline(res.ok);
      } catch {
        if (isOnlineRef.current) { handleOffline(); }
        isOnlineRef.current = false;
        setIsOnline(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    checkRealConnection();
    const pingInterval = setInterval(checkRealConnection, 10000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(pingInterval);
    };
  }, [syncPendingOperations]);

  // Periodic sync and pending count update
  useEffect(() => {
    // Update pending count every 5 seconds
    const countInterval = setInterval(updatePendingCount, 5000);
    
    // Sync every 30 seconds when online and there are pending items
    if (isOnline) {
      syncIntervalRef.current = setInterval(async () => {
        const count = await offlineDB.getSyncQueueCount();
        if (count > 0) {
          syncPendingOperations();
        }
      }, 30000);
    }
    
    return () => {
      clearInterval(countInterval);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isOnline, updatePendingCount, syncPendingOperations]);

  // Initial setup
  useEffect(() => {
    updatePendingCount();
    if (navigator.onLine) {
      cacheForOffline();
    }
  }, [updatePendingCount, cacheForOffline]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('pos_token');
    if (!token) { setLoading(false); return; }
    try {
      const res = await authAPI.me();
      setUser(res.data);
      // Cache data after successful auth
      cacheForOffline();
    } catch {
      localStorage.removeItem('pos_token');
    }
    setLoading(false);
  }, [cacheForOffline]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // Load auto-logout config and set up inactivity timer
  useEffect(() => {
    if (!user) return;
    const API_BASE = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem('pos_token');
    if (!token) return;

    // Load auto-logout config
    fetch(`${API_BASE}/api/auth/auto-logout-config`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(cfg => { if (cfg) setAutoLogoutConfig(cfg); })
      .catch(() => {});

    // Session validation interval — check every 30s if session was revoked
    const sessionCheck = setInterval(async () => {
      try {
        const t = localStorage.getItem('pos_token');
        if (!t) return;
        const res = await fetch(`${API_BASE}/api/auth/heartbeat`, {
          method: 'POST', headers: { Authorization: `Bearer ${t}` }
        });
        if (res.status === 401) {
          notify.error('Tu sesion fue cerrada por un administrador');
          localStorage.removeItem('pos_token');
          setUser(null);
          resetThemeOnLogout();
        }
      } catch {}
    }, 30000);

    return () => clearInterval(sessionCheck);
  }, [user, resetThemeOnLogout]);

  // Auto-logout by inactivity
  useEffect(() => {
    if (!user || !autoLogoutConfig.enabled) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      return;
    }

    const timeoutMs = autoLogoutConfig.timeout_minutes * 60 * 1000;

    const resetTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        notify.info(`Sesion cerrada por inactividad (${autoLogoutConfig.timeout_minutes} min)`);
        logout();
      }, timeoutMs);
    };

    const events = ['mousedown', 'touchstart', 'keydown', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [user, autoLogoutConfig]);

  const login = async (pin) => {
    // Try online login first
    try {
      const res = await authAPI.login(pin);
      localStorage.setItem('pos_token', res.data.token);
      localStorage.setItem('pos_offline_user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      
      // Apply user's UI preferences (theme/mode)
      if (res.data.user?.ui_preferences) {
        applyUserPreferences(res.data.user.ui_preferences);
      }
      
      // Cache data after login
      setTimeout(cacheForOffline, 1000);
      
      // Notify if business day was auto-opened
      if (res.data.business_day_opened) {
        setTimeout(() => {
          notify.success('Nueva jornada de trabajo iniciada', {
            description: `Abierta automáticamente al hacer login como ${res.data.user.name}`
          });
        }, 500);
      }
      
      return res.data.user;
    } catch (onlineError) {
      throw onlineError;
    }
  };

  const hasPermission = (perm) => {
    if (!user) return false;
    return user.permissions?.[perm] === true;
  };

  const logout = async () => {
    // Sync pending operations before logout - silently
    if (pendingSyncCount > 0 && navigator.onLine) {
      await syncPendingOperations();
    }
    
    // Auto-send all pending orders before logout
    try {
      const token = localStorage.getItem('pos_token');
      if (token) {
        const res = await fetch(`${API_BASE}/api/orders?status=active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const orders = await res.json();
        for (const order of orders) {
          const pending = order.items?.filter(i => i.status === 'pending') || [];
          if (pending.length > 0) {
            await fetch(`${API_BASE}/api/orders/${order.id}/send-kitchen`, {
              method: 'POST', headers: { Authorization: `Bearer ${token}` }
            });
          }
        }
        
        // Log logout event for audit trail
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {}
    
    // Clear Service Worker cache to ensure fresh data on next login
    // Cross-platform: Safari iOS 15+, Android Chrome, Windows Chrome/Edge, iPad Safari
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      }
    } catch {}
    
    localStorage.removeItem('pos_token');
    setUser(null);
    resetThemeOnLogout();
  };

  const ensureSeed = async () => {
    try { await seedAPI.seed(); } catch {}
  };

  // Offline context value
  const offline = {
    isSyncing,
    pendingCount: pendingSyncCount,
    lastSyncTime,
    syncNow: syncPendingOperations,
    cacheData: cacheForOffline,
  };

  const isAdmin = user?.role === 'admin' || (user?.role_level || 0) >= 100;

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      loading, 
      isOnline, 
      ensureSeed, 
      hasPermission, 
      isAdmin,
      largeMode, 
      toggleLargeMode, 
      device,
      offline,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
