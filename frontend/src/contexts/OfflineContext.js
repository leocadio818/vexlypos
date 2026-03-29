import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  cacheProducts, getCachedProducts,
  cacheCategories, getCachedCategories,
  cacheTables, getCachedTables,
  cacheConfig, getCachedConfig,
  cacheCustomers, getCachedCustomers,
  addToSyncQueue, getPendingSyncActions,
  markSyncComplete, markSyncFailed,
  clearCompletedSync, getSyncQueueCount,
} from '@/lib/offlineDB';

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncIntervalRef = useRef(null);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Sync when back online
      syncPendingActions();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync count
    getSyncQueueCount().then(setPendingSync);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic sync check (every 30 seconds when online)
  useEffect(() => {
    if (isOnline) {
      syncIntervalRef.current = setInterval(() => {
        getSyncQueueCount().then((count) => {
          setPendingSync(count);
          if (count > 0) syncPendingActions();
        });
      }, 30000);
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cache data when fetched from API
  const cacheApiData = useCallback(async (type, data) => {
    try {
      switch (type) {
        case 'products': await cacheProducts(data); break;
        case 'categories': await cacheCategories(data); break;
        case 'tables': await cacheTables(data); break;
        case 'config': await cacheConfig(data); break;
        case 'customers': await cacheCustomers(data); break;
        default: break;
      }
    } catch (err) {
      console.warn('[Offline] Cache write failed:', err);
    }
  }, []);

  // Get cached data when offline
  const getOfflineData = useCallback(async (type) => {
    try {
      switch (type) {
        case 'products': return await getCachedProducts();
        case 'categories': return await getCachedCategories();
        case 'tables': return await getCachedTables();
        case 'config': return await getCachedConfig();
        case 'customers': return await getCachedCustomers();
        default: return null;
      }
    } catch (err) {
      console.warn('[Offline] Cache read failed:', err);
      return null;
    }
  }, []);

  // Queue an action for sync
  const queueAction = useCallback(async (action) => {
    await addToSyncQueue(action);
    const count = await getSyncQueueCount();
    setPendingSync(count);
  }, []);

  // Sync pending actions
  const syncPendingActions = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);

    try {
      const actions = await getPendingSyncActions();
      const API = process.env.REACT_APP_BACKEND_URL;

      for (const action of actions) {
        try {
          const response = await fetch(`${API}${action.endpoint}`, {
            method: action.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(action.token ? { 'Authorization': `Bearer ${action.token}` } : {}),
            },
            body: action.body ? JSON.stringify(action.body) : undefined,
          });

          if (response.ok) {
            await markSyncComplete(action.id);
          } else {
            await markSyncFailed(action.id);
          }
        } catch {
          await markSyncFailed(action.id);
        }
      }

      await clearCompletedSync();
      const remaining = await getSyncQueueCount();
      setPendingSync(remaining);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return (
    <OfflineContext.Provider value={{
      isOnline,
      pendingSync,
      isSyncing,
      cacheApiData,
      getOfflineData,
      queueAction,
      syncPendingActions,
    }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider');
  return ctx;
}
