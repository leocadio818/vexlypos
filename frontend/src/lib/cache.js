/**
 * Simple in-memory cache with Stale-While-Revalidate pattern
 * Shows cached data INSTANTLY, then silently refreshes in background
 */

const cache = new Map();

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry.data;
}

export function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * useSWRCache — Stale-While-Revalidate hook
 * Returns cached data immediately, fetches fresh data in background
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function that returns data
 * @param {object} opts - { staleTime: ms (default 5min) }
 */
export function useSWRCache(key, fetcher, opts = {}) {
  const { useState, useEffect, useCallback, useRef } = require('react');
  const staleTime = opts.staleTime || 5 * 60 * 1000; // 5 min default
  
  const cached = getCached(key);
  const [data, setData] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(async () => {
    try {
      const fresh = await fetcherRef.current();
      setData(fresh);
      setCache(key, fresh);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    const entry = cache.get(key);
    const isStale = !entry || (Date.now() - entry.timestamp > staleTime);
    
    if (cached && !isStale) {
      // Fresh cache — use it, no fetch needed
      setData(cached);
      setLoading(false);
    } else if (cached) {
      // Stale cache — show cached, revalidate in background
      setData(cached);
      setLoading(false);
      revalidate();
    } else {
      // No cache — loading state + fetch
      setLoading(true);
      revalidate();
    }
  }, [key, staleTime, revalidate, cached]);

  return { data, loading, error, revalidate };
}
