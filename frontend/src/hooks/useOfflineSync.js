import { useState, useEffect, useCallback, useRef } from 'react';
import { notify } from '@/lib/notify';
import offlineDB from '@/lib/offlineDB';

/**
 * Hook for managing offline functionality
 * Handles caching, sync queue, and automatic synchronization
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const syncIntervalRef = useRef(null);
  const wasOfflineRef = useRef(!navigator.onLine);
  
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const count = await offlineDB.getSyncQueueCount();
    setPendingCount(count);
  }, []);

  // Sync with server
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    
    const token = localStorage.getItem('pos_token');
    if (!token) return;
    
    setIsSyncing(true);
    setSyncError(null);
    
    try {
      const result = await offlineDB.syncWithServer(API_BASE, token);
      setLastSyncTime(new Date());
      
      if (result.synced > 0) {
        notify.success(`✓ ${result.synced} operación(es) sincronizada(s)`, {
          description: result.failed > 0 ? `${result.failed} pendiente(s)` : undefined,
        });
      }
      
      if (result.failed > 0 && result.errors?.length > 0) {
        console.error('[Sync] Errors:', result.errors);
        setSyncError(`${result.failed} operación(es) fallaron`);
      }
      
      await updatePendingCount();
      
      // Cleanup old synced data
      await offlineDB.cleanupSyncedData();
      
      return result;
    } catch (error) {
      console.error('[Sync] Error:', error);
      setSyncError(error.message);
      notify.error('Error al sincronizar', { description: error.message });
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
    } catch (error) {
      console.error('[Cache] Error caching data:', error);
    }
  }, [API_BASE]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      
      // If we were offline and now online, show notification and sync
      if (wasOfflineRef.current) {
        notify.success('🌐 Conexión restaurada', {
          description: pendingCount > 0 
            ? `Sincronizando ${pendingCount} operación(es)...` 
            : 'Sistema en línea',
          duration: 4000,
        });
        
        // Auto-sync after coming online
        setTimeout(() => {
          syncNow();
        }, 1000);
      }
      
      wasOfflineRef.current = false;
    };

    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
      
      notify.warning('📴 Sin conexión', {
        description: 'El sistema funciona offline. Los cambios se sincronizarán automáticamente.',
        duration: 4000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pendingCount, syncNow]);

  // Periodic sync when online
  useEffect(() => {
    if (isOnline) {
      // Sync every 30 seconds when online and there are pending items
      syncIntervalRef.current = setInterval(async () => {
        const count = await offlineDB.getSyncQueueCount();
        if (count > 0) {
          syncNow();
        }
      }, 30000);
      
      // Initial cache of data
      cacheForOffline();
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isOnline, syncNow, cacheForOffline]);

  // Update pending count periodically
  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  // Initial cache when component mounts
  useEffect(() => {
    if (navigator.onLine) {
      cacheForOffline();
    }
  }, [cacheForOffline]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    syncError,
    syncNow,
    cacheForOffline,
    updatePendingCount,
  };
}

/**
 * Hook for offline data access
 * Provides cached data when offline
 */
export function useOfflineData(key, fetchFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (navigator.onLine) {
        // Try to fetch fresh data
        const freshData = await fetchFn();
        setData(freshData);
        setIsFromCache(false);
        
        // Cache the data for offline use
        if (freshData) {
          await offlineDB.cacheData(key, freshData);
        }
      } else {
        // Use cached data when offline
        const cachedData = await offlineDB.getCachedData(key);
        if (cachedData) {
          setData(cachedData);
          setIsFromCache(true);
        } else {
          setError('No hay datos en caché');
        }
      }
    } catch (err) {
      console.error(`[OfflineData] Error loading ${key}:`, err);
      
      // Fallback to cache on error
      const cachedData = await offlineDB.getCachedData(key);
      if (cachedData) {
        setData(cachedData);
        setIsFromCache(true);
        notify.info('Usando datos en caché', { 
          description: 'No se pudo conectar al servidor' 
        });
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [key, fetchFn]);

  useEffect(() => {
    loadData();
  }, [loadData, ...deps]);

  return { data, loading, error, isFromCache, reload: loadData };
}

/**
 * Hook for offline-capable mutations
 * Queues operations when offline
 */
export function useOfflineMutation(mutationFn, options = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { 
    onSuccess, 
    onError, 
    offlineAction,
    syncPriority = 5,
  } = options;

  const mutate = useCallback(async (variables) => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (navigator.onLine) {
        // Online: execute normally
        const result = await mutationFn(variables);
        onSuccess?.(result, variables);
        return result;
      } else {
        // Offline: queue for later
        if (offlineAction) {
          const action = await offlineDB.addToSyncQueue({
            type: offlineAction,
            priority: syncPriority,
            data: variables,
          });
          
          notify.info('Guardado offline', {
            description: 'Se sincronizará cuando vuelva la conexión',
          });
          
          onSuccess?.({ offline: true, localId: action.id }, variables);
          return { offline: true, localId: action.id };
        } else {
          throw new Error('Esta operación requiere conexión');
        }
      }
    } catch (err) {
      setError(err.message);
      onError?.(err, variables);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [mutationFn, onSuccess, onError, offlineAction, syncPriority]);

  return { mutate, isLoading, error };
}

export default {
  useOfflineSync,
  useOfflineData,
  useOfflineMutation,
};
