/**
 * Centralized timezone utility for the POS system.
 * Reads the configured timezone from the backend API.
 * All "now" evaluations in the frontend MUST use these utilities
 * instead of raw `new Date()`.
 */

const API_URL = process.env.REACT_APP_BACKEND_URL;

// In-memory cache
let _cachedTimezone = null;

/**
 * Fetch the system timezone from the backend config.
 * Caches the result for the session.
 */
export async function getSystemTimezone() {
  if (_cachedTimezone) return _cachedTimezone;
  try {
    const res = await fetch(`${API_URL}/api/timezone`);
    if (res.ok) {
      const data = await res.json();
      _cachedTimezone = data.timezone;
      return _cachedTimezone;
    }
  } catch (e) {
    console.warn('Failed to fetch timezone config, using default');
  }
  _cachedTimezone = 'America/Santo_Domingo';
  return _cachedTimezone;
}

/**
 * Invalidate the cached timezone (call after config update).
 */
export function invalidateTimezoneCache() {
  _cachedTimezone = null;
}

/**
 * Get the current date/time formatted for the configured system timezone.
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatSystemDate(date, options = {}) {
  const tz = _cachedTimezone || 'America/Santo_Domingo';
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: tz,
    ...options,
  }).format(date instanceof Date ? date : new Date(date));
}

/**
 * Get today's date string (YYYY-MM-DD) in the system timezone.
 */
export function getSystemToday() {
  const tz = _cachedTimezone || 'America/Santo_Domingo';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA format returns YYYY-MM-DD
}

/**
 * Get the current time string (HH:MM) in the system timezone.
 */
export function getSystemTime() {
  const tz = _cachedTimezone || 'America/Santo_Domingo';
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}
