// Safe localStorage helper.
//
// BUG-F2/F4 fix: Safari iOS in Private Browsing throws QuotaExceededError on
// every `localStorage.setItem`. Direct calls without try/catch crash the
// React render and leave a blank screen. This module wraps reads/writes so
// every call returns gracefully.
export const safeStorage = {
  get(key, defaultValue = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultValue : v;
    } catch {
      return defaultValue;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  getJSON(key, defaultValue = null) {
    const raw = this.get(key, null);
    if (raw == null) return defaultValue;
    try {
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  },
  setJSON(key, obj) {
    try {
      return this.set(key, JSON.stringify(obj));
    } catch {
      return false;
    }
  },
};
