import { useTheme } from '@/context/ThemeContext';

// Glassmorphism background with animated orbs
export function GlassBackground({ children, className = '' }) {
  const { theme } = useTheme();
  
  const bgStyle = {
    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
  };

  return (
    <div className={`relative overflow-hidden ${className}`} style={bgStyle}>
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-40 -left-40 w-80 h-80 rounded-full blur-[100px] animate-pulse"
          style={{ backgroundColor: theme.orbColor1 }}
        />
        <div 
          className="absolute top-1/2 -right-20 w-60 h-60 rounded-full blur-[80px] animate-pulse"
          style={{ backgroundColor: theme.orbColor2, animationDelay: '1s' }}
        />
        <div 
          className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full blur-[90px] animate-pulse"
          style={{ backgroundColor: theme.orbColor3, animationDelay: '2s' }}
        />
        <div 
          className="absolute top-20 right-1/4 w-40 h-40 rounded-full blur-[60px] animate-pulse"
          style={{ backgroundColor: theme.orbColor1, animationDelay: '0.5s', opacity: 0.6 }}
        />
      </div>
      
      {/* Content */}
      <div className="relative z-10 h-full">
        {children}
      </div>
    </div>
  );
}

// Glass card component
export function GlassCard({ children, className = '', hover = true, active = false, onClick }) {
  const { theme } = useTheme();
  
  const opacity = Math.round(theme.glassOpacity * 100);
  const hoverOpacity = Math.round((theme.glassOpacity + 0.05) * 100);
  const activeOpacity = Math.round((theme.glassOpacity + 0.1) * 100);
  
  const baseClasses = `backdrop-blur-xl border shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300`;
  const colorClasses = active 
    ? `bg-white/${activeOpacity} border-white/40`
    : `bg-white/${opacity} border-white/20`;
  const hoverClasses = hover && !active ? `hover:bg-white/${hoverOpacity} hover:border-white/30` : '';
  
  return (
    <div 
      className={`${baseClasses} ${colorClasses} ${hoverClasses} ${className}`}
      onClick={onClick}
      style={{ backdropFilter: `blur(${theme.glassBlur}px)` }}
    >
      {children}
    </div>
  );
}

// Glass button component
export function GlassButton({ children, className = '', variant = 'default', disabled = false, onClick, ...props }) {
  const { theme } = useTheme();
  
  const opacity = Math.round(theme.glassOpacity * 100);
  
  const variants = {
    default: `bg-white/${opacity} border-white/20 hover:bg-white/20 text-white/90`,
    primary: `bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white border-0`,
    accent: `bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-400/30 hover:border-purple-400/50 text-purple-200`,
    danger: `bg-red-500/20 border-red-500/30 hover:bg-red-500/30 text-red-400`,
  };
  
  return (
    <button 
      className={`backdrop-blur-md border transition-all duration-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      style={{ backdropFilter: `blur(${theme.glassBlur}px)` }}
      {...props}
    >
      {children}
    </button>
  );
}

// Glass input component
export function GlassInput({ className = '', ...props }) {
  const { theme } = useTheme();
  
  return (
    <input 
      className={`backdrop-blur-md bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10 text-white placeholder-white/40 outline-none transition-all duration-300 ${className}`}
      style={{ backdropFilter: `blur(${theme.glassBlur}px)` }}
      {...props}
    />
  );
}

// Glass header component
export function GlassHeader({ children, className = '' }) {
  const { theme } = useTheme();
  const opacity = Math.round(theme.glassOpacity * 100);
  
  return (
    <div 
      className={`backdrop-blur-xl bg-white/${opacity} border-b border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.2)] ${className}`}
      style={{ backdropFilter: `blur(${theme.glassBlur}px)` }}
    >
      {children}
    </div>
  );
}

// Export glass style utilities
export function useGlassStyles() {
  const { theme } = useTheme();
  
  const opacity = Math.round(theme.glassOpacity * 100);
  const hoverOpacity = Math.round((theme.glassOpacity + 0.05) * 100);
  const activeOpacity = Math.round((theme.glassOpacity + 0.1) * 100);
  
  return {
    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
    card: `backdrop-blur-xl bg-white/${opacity} border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]`,
    cardHover: `hover:bg-white/${hoverOpacity} hover:border-white/30`,
    cardActive: `bg-white/${activeOpacity} border-white/40`,
    button: `backdrop-blur-md bg-white/${opacity} border border-white/20 hover:bg-white/20`,
    input: `backdrop-blur-md bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10`,
    blur: theme.glassBlur,
    opacity: theme.glassOpacity,
  };
}
