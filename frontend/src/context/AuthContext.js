import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, seedAPI, processOfflineQueue } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  const logout = () => {
    localStorage.removeItem('pos_token');
    setUser(null);
  };

  const ensureSeed = async () => {
    try { await seedAPI.seed(); } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isOnline, ensureSeed }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
