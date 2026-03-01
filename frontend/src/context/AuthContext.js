import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI, seedAPI, processOfflineQueue } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import useDeviceDetect from '@/hooks/useDeviceDetect';
import offlineDB from '@/lib/offlineDB';
import { toast } from 'sonner';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Offline sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const wasOfflineRef = useRef(!navigator.onLine);
  const syncIntervalRef = useRef(null);
  
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
      
      // Removed toast notification - silent reconnection
      if (wasOfflineRef.current) {
        // Auto-sync after coming online
        setTimeout(() => {
          syncPendingOperations();
        }, 1500);
      }
      
      wasOfflineRef.current = false;
    };

    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
      // Removed toast notification - silent offline mode
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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

  const login = async (pin) => {
    const res = await authAPI.login(pin);
    localStorage.setItem('pos_token', res.data.token);
    setUser(res.data.user);
    // Cache data after login
    setTimeout(cacheForOffline, 1000);
    
    // Notify if business day was auto-opened
    if (res.data.business_day_opened) {
      // Use a small delay so the login completes first
      setTimeout(() => {
        const { toast } = require('sonner');
        toast.success('Nueva jornada de trabajo iniciada', {
          description: `Abierta automáticamente al hacer login como ${res.data.user.name}`
        });
      }, 500);
    }
    
    return res.data.user;
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
      }
    } catch {}
    localStorage.removeItem('pos_token');
    setUser(null);
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

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      loading, 
      isOnline, 
      ensureSeed, 
      hasPermission, 
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
