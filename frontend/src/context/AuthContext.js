import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, seedAPI, processOfflineQueue } from '@/lib/api';
import useDeviceDetect from '@/hooks/useDeviceDetect';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
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

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); processOfflineQueue(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('pos_token');
    if (!token) { setLoading(false); return; }
    try {
      const res = await authAPI.me();
      setUser(res.data);
    } catch {
      localStorage.removeItem('pos_token');
    }
    setLoading(false);
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (pin) => {
    const res = await authAPI.login(pin);
    localStorage.setItem('pos_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const hasPermission = (perm) => {
    if (!user) return false;
    return user.permissions?.[perm] === true;
  };

  const logout = async () => {
    // Auto-send all pending orders before logout
    try {
      const token = localStorage.getItem('pos_token');
      if (token) {
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/orders?status=active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const orders = await res.json();
        for (const order of orders) {
          const pending = order.items?.filter(i => i.status === 'pending') || [];
          if (pending.length > 0) {
            await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/orders/${order.id}/send-kitchen`, {
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

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isOnline, ensureSeed, hasPermission, largeMode, toggleLargeMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
