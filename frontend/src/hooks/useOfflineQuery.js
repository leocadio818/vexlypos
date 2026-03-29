import { useState, useEffect, useCallback, useRef } from 'react';
import { useOffline } from '@/contexts/OfflineContext';

/**
 * Hook that wraps an API call with automatic offline caching.
 * When online: fetches from API, caches the result in IndexedDB.
 * When offline: returns cached data from IndexedDB.
 *
 * @param {string} cacheKey - One of: 'products', 'categories', 'tables', 'config', 'customers'
 * @param {Function} apiFn - The API function to call (must return { data })
 * @param {object} options - { autoFetch: true, transform: fn }
 */
export function useOfflineQuery(cacheKey, apiFn, options = {}) {
  const { autoFetch = true, transform } = options;
  const { isOnline, cacheApiData, getOfflineData } = useOffline();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsOfflineData(false);

    try {
      if (navigator.onLine) {
        const response = await apiFn();
        let result = response?.data ?? response;
        if (transform) result = transform(result);
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
        // Cache in background
        if (cacheKey && Array.isArray(result)) {
          cacheApiData(cacheKey, result).catch(() => {});
        } else if (cacheKey && result && typeof result === 'object') {
          cacheApiData(cacheKey, result).catch(() => {});
        }
      } else {
        throw new Error('offline');
      }
    } catch (err) {
      // Try offline cache
      try {
        const cached = await getOfflineData(cacheKey);
        if (cached && (Array.isArray(cached) ? cached.length > 0 : true)) {
          if (mountedRef.current) {
            setData(cached);
            setIsOfflineData(true);
            setLoading(false);
          }
          return;
        }
      } catch {
        // IndexedDB failed too
      }
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
    }
  }, [apiFn, cacheKey, transform, cacheApiData, getOfflineData]);

  useEffect(() => {
    if (autoFetch) fetchData();
  }, [autoFetch, fetchData]);

  // Refetch when coming back online
  useEffect(() => {
    if (isOnline && isOfflineData) {
      fetchData();
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, isOfflineData, refetch: fetchData };
}
