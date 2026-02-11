import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

// Default Glassmorphism theme
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

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(defaultTheme);
  const [loading, setLoading] = useState(true);

  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  // Fetch theme from backend
  const fetchTheme = useCallback(async () => {
    try {
      const token = localStorage.getItem('pos_token');
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/theme-config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setTheme({ ...defaultTheme, ...data });
        }
      }
    } catch (err) {
      console.error('Error fetching theme:', err);
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  // Save theme to backend
  const saveTheme = useCallback(async (newTheme) => {
    try {
      const token = localStorage.getItem('pos_token');
      if (!token) return false;
      
      const res = await fetch(`${API_BASE}/api/theme-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newTheme)
      });
      
      if (res.ok) {
        setTheme(newTheme);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error saving theme:', err);
      return false;
    }
  }, [API_BASE]);

  // Update a single theme property
  const updateTheme = useCallback((key, value) => {
    setTheme(prev => ({ ...prev, [key]: value }));
  }, []);

  // Reset to defaults
  const resetTheme = useCallback(() => {
    setTheme(defaultTheme);
    return saveTheme(defaultTheme);
  }, [saveTheme]);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  // Generate CSS variables from theme
  const cssVariables = {
    '--glass-gradient': `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
    '--glass-opacity': theme.glassOpacity,
    '--glass-blur': `${theme.glassBlur}px`,
    '--accent-color': theme.accentColor,
    '--orb-color-1': theme.orbColor1,
    '--orb-color-2': theme.orbColor2,
    '--orb-color-3': theme.orbColor3,
  };

  // Glass style helpers
  const glassStyles = {
    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
    card: `backdrop-blur-xl bg-white/${Math.round(theme.glassOpacity * 100)} border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]`,
    cardHover: `hover:bg-white/${Math.round((theme.glassOpacity + 0.05) * 100)} hover:border-white/30`,
    cardActive: `bg-white/${Math.round((theme.glassOpacity + 0.1) * 100)} border-white/40`,
    button: `backdrop-blur-md bg-white/${Math.round(theme.glassOpacity * 100)} border border-white/20 hover:bg-white/20`,
    input: `backdrop-blur-md bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10`,
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      updateTheme,
      saveTheme,
      resetTheme,
      loading,
      cssVariables,
      glassStyles,
      defaultTheme,
      refetchTheme: fetchTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export { defaultTheme };
