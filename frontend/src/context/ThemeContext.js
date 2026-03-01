import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

// ── Default Glass Theme (Original) ──
const defaultTheme = {
  gradientStart: '#0f0f23',
  gradientMid1: '#1a1a3e',
  gradientMid2: '#2d1b4e',
  gradientEnd: '#1e3a5f',
  accentColor: '#ff6600',
  glassOpacity: 0.1,
  glassBlur: 12,
  orbColor1: 'rgba(168, 85, 247, 0.3)',
  orbColor2: 'rgba(59, 130, 246, 0.2)',
  orbColor3: 'rgba(6, 182, 212, 0.2)',
};

// ── Default Neumorphic Colors ──
const defaultNeoColors = {
  neoBgColor: '#f0f5f9',
  neoDarkBg: '#0f172a',
  neoGlowColor: '#a78bfa',
  neoAccentColor: '#1e293b',
};

// ── Helpers ──
function adjustBrightness(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToHslParts(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function ThemeProvider({ children }) {
  // Load from localStorage FIRST for instant apply (no FOUC)
  // Priority: user preferences > theme cache
  const cached = (() => {
    try {
      const userPrefs = JSON.parse(localStorage.getItem('pos_user_ui_prefs') || 'null');
      if (userPrefs) {
        return {
          activeThemeMode: userPrefs.theme || 'original',
          neoMode: userPrefs.color_mode || 'light',
          neoBgColor: userPrefs.neo_bg_color,
          neoDarkBg: userPrefs.neo_dark_bg,
          neoGlowColor: userPrefs.neo_glow_color,
          neoAccentColor: userPrefs.neo_accent_color,
        };
      }
      return JSON.parse(localStorage.getItem('pos_theme_cache') || '{}');
    } catch { return {}; }
  })();

  const [theme, setTheme] = useState(defaultTheme);
  const [activeThemeMode, setActiveThemeMode] = useState(cached.activeThemeMode || 'original');
  const [neoColors, setNeoColors] = useState({
    ...defaultNeoColors,
    ...(cached.neoBgColor ? { neoBgColor: cached.neoBgColor } : {}),
    ...(cached.neoDarkBg ? { neoDarkBg: cached.neoDarkBg } : {}),
    ...(cached.neoGlowColor ? { neoGlowColor: cached.neoGlowColor } : {}),
    ...(cached.neoAccentColor ? { neoAccentColor: cached.neoAccentColor } : {}),
  });
  const [neoMode, setNeoMode] = useState(cached.neoMode || 'light');
  const [loading, setLoading] = useState(true);

  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  // ── Fetch GLOBAL theme (only applies if no user preferences are cached) ──
  const fetchTheme = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/theme-config`);
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setTheme(prev => ({ ...defaultTheme, ...data }));
          
          // Only apply global theme/mode if NO user preferences in cache
          const hasUserPrefs = localStorage.getItem('pos_user_ui_prefs');
          if (!hasUserPrefs) {
            setActiveThemeMode(data.activeThemeMode || 'original');
            setNeoMode(data.neoMode || 'light');
            setNeoColors({
              neoBgColor: data.neoBgColor || defaultNeoColors.neoBgColor,
              neoDarkBg: data.neoDarkBg || defaultNeoColors.neoDarkBg,
              neoGlowColor: data.neoGlowColor || defaultNeoColors.neoGlowColor,
              neoAccentColor: data.neoAccentColor || defaultNeoColors.neoAccentColor,
            });
          }
        }
      }
    } catch (err) {
      console.error('Error fetching theme:', err);
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  // ── Save everything ──
  const saveAllThemeSettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('pos_token');
      if (!token) return false;
      const payload = { ...theme, activeThemeMode, neoMode, ...neoColors };
      const res = await fetch(`${API_BASE}/api/theme-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (err) {
      console.error('Error saving theme:', err);
      return false;
    }
  }, [API_BASE, theme, activeThemeMode, neoColors, neoMode]);

  // ── Save glass theme only (backward compat) ──
  const saveTheme = useCallback(async (newTheme) => {
    try {
      const token = localStorage.getItem('pos_token');
      if (!token) return false;
      const payload = { ...newTheme, activeThemeMode, ...neoColors };
      const res = await fetch(`${API_BASE}/api/theme-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) { setTheme(newTheme); return true; }
      return false;
    } catch (err) {
      console.error('Error saving theme:', err);
      return false;
    }
  }, [API_BASE, activeThemeMode, neoColors]);

  // Update a single glass property
  const updateTheme = useCallback((key, value) => {
    setTheme(prev => ({ ...prev, [key]: value }));
  }, []);

  // Update a single neo color
  const updateNeoColor = useCallback((key, value) => {
    setNeoColors(prev => ({ ...prev, [key]: value }));
  }, []);

  // Reset to defaults
  const resetTheme = useCallback(() => {
    setTheme(defaultTheme);
    setActiveThemeMode('original');
    setNeoColors(defaultNeoColors);
    return saveAllThemeSettings();
  }, [saveAllThemeSettings]);

  useEffect(() => { fetchTheme(); }, [fetchTheme]);

  // ── Cache to localStorage for instant apply on refresh ──
  useEffect(() => {
    localStorage.setItem('pos_theme_cache', JSON.stringify({
      activeThemeMode, neoMode,
      neoBgColor: neoColors.neoBgColor, neoDarkBg: neoColors.neoDarkBg,
      neoGlowColor: neoColors.neoGlowColor, neoAccentColor: neoColors.neoAccentColor,
    }));
  }, [activeThemeMode, neoMode, neoColors]);


  // ── Apply / remove theme class + CSS variables ──
  useEffect(() => {
    const root = document.body; // Set on body for highest specificity over CSS declarations
    const isDark = neoMode === 'dark';

    if (activeThemeMode === 'minimalist') {
      document.body.classList.add('theme-minimalist');
      document.body.classList.remove('theme-original');

      // Choose bg based on light/dark mode
      const activeBg = isDark ? neoColors.neoDarkBg : neoColors.neoBgColor;

      // Toggle dark class
      if (isDark) {
        document.body.classList.add('neo-dark');
      } else {
        document.body.classList.remove('neo-dark');
      }

      // Compute shadows from active bg
      const dk = adjustBrightness(activeBg, isDark ? -20 : -40);
      const lt = adjustBrightness(activeBg, isDark ? 20 : 15);

      root.style.setProperty('--neo-bg', activeBg);
      root.style.setProperty('--neo-shadow-dark', dk);
      root.style.setProperty('--neo-shadow-light', lt);
      root.style.setProperty('--neo-glow', neoColors.neoGlowColor + '40');
      root.style.setProperty('--neo-glow-solid', neoColors.neoGlowColor);
      // Glow is MORE visible on dark backgrounds
      root.style.setProperty('--neo-glow-strong', neoColors.neoGlowColor + (isDark ? '90' : '70'));
      root.style.setProperty('--neo-glow-medium', neoColors.neoGlowColor + (isDark ? '65' : '50'));
      root.style.setProperty('--neo-glow-soft', neoColors.neoGlowColor + (isDark ? '40' : '28'));
      root.style.setProperty('--neo-accent', neoColors.neoAccentColor);

      // Dynamic Shadcn overrides
      const bgHsl = hexToHslParts(activeBg);
      if (isDark) {
        root.style.setProperty('--background', bgHsl);
        root.style.setProperty('--card', bgHsl);
        root.style.setProperty('--popover', bgHsl);
        root.style.setProperty('--foreground', '210 40% 96%');
        root.style.setProperty('--card-foreground', '210 40% 96%');
        root.style.setProperty('--popover-foreground', '210 40% 96%');
      } else {
        const fgHsl = hexToHslParts(neoColors.neoAccentColor);
        root.style.setProperty('--background', bgHsl);
        root.style.setProperty('--card', bgHsl);
        root.style.setProperty('--popover', bgHsl);
        root.style.setProperty('--foreground', fgHsl);
        root.style.setProperty('--card-foreground', fgHsl);
        root.style.setProperty('--popover-foreground', fgHsl);
      }
    } else {
      document.body.classList.remove('theme-minimalist');
      document.body.classList.remove('neo-dark');
      document.body.classList.add('theme-original');

      // Restore original dark variables
      root.style.setProperty('--background', '240 10% 4%');
      root.style.setProperty('--foreground', '0 0% 95%');
      root.style.setProperty('--card', '240 10% 8%');
      root.style.setProperty('--card-foreground', '0 0% 95%');
      root.style.setProperty('--popover', '240 10% 8%');
      root.style.setProperty('--popover-foreground', '0 0% 95%');

      ['--neo-bg','--neo-shadow-dark','--neo-shadow-light','--neo-glow','--neo-glow-solid','--neo-glow-strong','--neo-glow-medium','--neo-glow-soft','--neo-accent'].forEach(p => root.style.removeProperty(p));
    }
  }, [activeThemeMode, neoColors, neoMode]);

  // ── CSS variable map for glass theme (used by Layout/Login) ──
  const cssVariables = {
    '--glass-gradient': `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
    '--glass-opacity': theme.glassOpacity,
    '--glass-blur': `${theme.glassBlur}px`,
    '--accent-color': theme.accentColor,
    '--orb-color-1': theme.orbColor1,
    '--orb-color-2': theme.orbColor2,
    '--orb-color-3': theme.orbColor3,
  };

  const glassStyles = {
    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
    card: `backdrop-blur-xl bg-white/${Math.round(theme.glassOpacity * 100)} border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]`,
    cardHover: `hover:bg-white/${Math.round((theme.glassOpacity + 0.05) * 100)} hover:border-white/30`,
    cardActive: `bg-white/${Math.round((theme.glassOpacity + 0.1) * 100)} border-white/40`,
    button: `backdrop-blur-md bg-white/${Math.round(theme.glassOpacity * 100)} border border-white/20 hover:bg-white/20`,
    input: `backdrop-blur-md bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10`,
  };

  const isMinimalist = activeThemeMode === 'minimalist';
  const isNeoDark = isMinimalist && neoMode === 'dark';

  // Apply user's ui_preferences from login (WINS over global theme)
  const applyUserPreferences = useCallback((prefs) => {
    if (!prefs || Object.keys(prefs).length === 0) return;
    const newMode = prefs.theme || 'original';
    const newColorMode = prefs.color_mode || 'light';
    setActiveThemeMode(newMode);
    setNeoMode(newColorMode);
    if (prefs.neo_bg_color || prefs.neo_dark_bg || prefs.neo_glow_color || prefs.neo_accent_color) {
      setNeoColors(prev => ({
        ...prev,
        ...(prefs.neo_bg_color ? { neoBgColor: prefs.neo_bg_color } : {}),
        ...(prefs.neo_dark_bg ? { neoDarkBg: prefs.neo_dark_bg } : {}),
        ...(prefs.neo_glow_color ? { neoGlowColor: prefs.neo_glow_color } : {}),
        ...(prefs.neo_accent_color ? { neoAccentColor: prefs.neo_accent_color } : {}),
      }));
    }
    // Mark user has personal prefs (prevents fetchTheme from overwriting)
    localStorage.setItem('pos_user_ui_prefs', JSON.stringify(prefs));
  }, []);

  // Reset theme on logout (clean slate for next user)
  const resetThemeOnLogout = useCallback(() => {
    localStorage.removeItem('pos_user_ui_prefs');
    localStorage.removeItem('pos_theme_cache');
    setActiveThemeMode('original');
    setNeoMode('light');
    setNeoColors(defaultNeoColors);
  }, []);

  return (
    <ThemeContext.Provider value={{
      theme, setTheme, updateTheme,
      saveTheme, resetTheme,
      activeThemeMode, setActiveThemeMode,
      neoColors, setNeoColors, updateNeoColor,
      neoMode, setNeoMode,
      saveAllThemeSettings, applyUserPreferences, resetThemeOnLogout,
      loading, cssVariables, glassStyles, defaultTheme,
      isMinimalist, isNeoDark,
      refetchTheme: fetchTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

export { defaultTheme };
