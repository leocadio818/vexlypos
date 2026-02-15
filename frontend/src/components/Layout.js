import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { LayoutGrid, ChefHat, Receipt, Settings, LogOut, Wifi, WifiOff, CircleDollarSign, Package, Truck, Heart, Gauge, CalendarDays, Type, Smartphone, Tablet, Monitor, CloudOff, RefreshCw, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import '@/App.css';

const navItems = [
  { to: '/dashboard', icon: Gauge, label: 'Panel' },
  { to: '/tables', icon: LayoutGrid, label: 'Mesas' },
  { to: '/kitchen', icon: ChefHat, label: 'Cocina' },
  { to: '/cash-register', icon: CircleDollarSign, label: 'Caja' },
  { to: '/reservations', icon: CalendarDays, label: 'Reservas' },
  { to: '/settings', icon: Settings, label: 'Config' },
];

// Pages that should NOT have glassmorphism (for visibility in kitchen)
const noGlassPages = ['/kitchen', '/kitchen-tv'];

export default function Layout() {
  const { user, logout, isOnline, hasPermission, largeMode, toggleLargeMode, device, offline } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => { logout(); navigate('/login'); };
  
  // Check if current page should use glass design
  const isGlassPage = !noGlassPages.some(p => location.pathname.startsWith(p));
  
  // Responsive helpers
  const isMobile = device?.isMobile;
  const isTablet = device?.isTablet;
  
  // Offline state
  const { isSyncing, pendingCount, syncNow } = offline || {};
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  const filteredNav = navItems.filter(item => {
    if (item.to === '/dashboard') return hasPermission('view_dashboard');
    if (item.to === '/reservations') return hasPermission('manage_reservations');
    // Only show Config for admins
    if (item.to === '/settings') return isAdmin;
    return true;
  });

  // Device indicator icon
  const DeviceIcon = isMobile ? Smartphone : isTablet ? Tablet : Monitor;

  // Glassmorphism background style
  const bgStyle = isGlassPage ? {
    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
  } : {};

  return (
    <div 
      className={`h-screen flex overflow-hidden ${isGlassPage ? '' : 'bg-background'}`} 
      style={bgStyle}
      data-testid="main-layout"
    >
      {/* Animated orbs for glass pages */}
      {isGlassPage && (
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
        </div>
      )}

      {/* Sidebar - Bottom on mobile, Side on tablet/desktop */}
      {isMobile ? (
        // Mobile Bottom Navigation - Glassmorphism
        <aside 
          className={`fixed bottom-0 left-0 right-0 z-50 safe-area-bottom ${isGlassPage ? 'backdrop-blur-xl bg-white/10 border-t border-white/20' : 'bg-card border-t border-border'}`}
          data-testid="mobile-nav"
        >
          {/* Offline banner for mobile */}
          {(!isOnline || pendingCount > 0) && (
            <div className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium ${
              !isOnline 
                ? 'bg-orange-500/20 text-orange-400' 
                : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {isSyncing ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Sincronizando...</span>
                </>
              ) : !isOnline ? (
                <>
                  <CloudOff size={12} />
                  <span>Modo Offline {pendingCount > 0 && `(${pendingCount} pendiente${pendingCount > 1 ? 's' : ''})`}</span>
                </>
              ) : pendingCount > 0 ? (
                <>
                  <Cloud size={12} />
                  <span>{pendingCount} por sincronizar</span>
                  <button 
                    onClick={syncNow}
                    className="underline font-bold"
                  >
                    Sincronizar
                  </button>
                </>
              ) : null}
            </div>
          )}
          <nav className="flex justify-around items-center py-2 px-1">
            {filteredNav.slice(0, 5).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                data-testid={`nav-${label.toLowerCase()}`}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all min-w-[50px] ${
                    isActive
                      ? isGlassPage 
                        ? 'bg-white/20 text-white shadow-lg'
                        : 'bg-primary text-primary-foreground'
                      : isGlassPage
                        ? 'text-white/60 hover:text-white'
                        : 'text-muted-foreground'
                  }`
                }
              >
                <Icon size={20} />
                <span className="text-[9px] font-medium">{label}</span>
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className={`flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl min-w-[50px] ${
                isGlassPage ? 'text-white/60 hover:text-red-400' : 'text-muted-foreground hover:text-destructive'
              }`}
            >
              <LogOut size={20} />
              <span className="text-[9px] font-medium">Salir</span>
            </button>
          </nav>
        </aside>
      ) : (
        // Tablet/Desktop Side Navigation - Glassmorphism
        <aside 
          className={`${isTablet ? 'w-16' : largeMode ? 'w-20 lg:w-24' : 'w-16 lg:w-20'} flex flex-col items-center py-3 lg:py-4 shrink-0 relative z-20 ${
            isGlassPage 
              ? 'backdrop-blur-xl bg-white/5 border-r border-white/10' 
              : 'bg-card border-r border-border'
          }`} 
          data-testid="sidebar"
        >
          <div 
            className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg flex items-center justify-center mb-4 lg:mb-6 ${
              isGlassPage ? 'backdrop-blur-xl bg-white/10 border border-white/20' : ''
            }`}
            style={{ backgroundColor: isGlassPage ? 'transparent' : theme.accentColor }}
          >
            <span className={`font-oswald font-bold ${isGlassPage ? 'text-white' : 'text-primary-foreground'} ${isTablet ? 'text-base' : largeMode ? 'text-xl' : 'text-lg'}`}>RD</span>
          </div>

          <nav className="flex-1 flex flex-col gap-1.5 lg:gap-2">
            {filteredNav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                data-testid={`nav-${label.toLowerCase()}`}
                className={({ isActive }) =>
                  `${isTablet ? 'w-12 h-12' : largeMode ? 'w-14 h-14 lg:w-16 lg:h-16' : 'w-12 h-12 lg:w-14 lg:h-14'} rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all btn-press ${
                    isActive
                      ? isGlassPage
                        ? 'bg-white/20 text-white shadow-[0_4px_20px_rgba(255,255,255,0.15)] border border-white/30'
                        : 'bg-primary text-primary-foreground shadow-[0_4px_14px_0_rgba(255,100,0,0.39)]'
                      : isGlassPage
                        ? 'text-white/60 hover:bg-white/10 hover:text-white'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`
                }
              >
                <Icon size={isTablet ? 18 : largeMode ? 24 : 20} />
                <span className={`font-medium leading-none ${isTablet ? 'text-[8px]' : largeMode ? 'text-[11px]' : 'text-[9px]'}`}>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Bottom section */}
          <div className="flex flex-col items-center gap-2 lg:gap-3 mt-auto">
            {/* Large Mode Toggle */}
            <button
              onClick={toggleLargeMode}
              className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                largeMode 
                  ? 'bg-green-600 text-white' 
                  : isGlassPage
                    ? 'text-white/60 hover:bg-white/10 hover:text-white'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title="Modo texto grande (A+)"
            >
              <span className={`font-bold ${isTablet ? 'text-xs' : largeMode ? 'text-base' : 'text-sm'}`}>A+</span>
            </button>
            
            {/* Sync Status */}
            {pendingCount > 0 && (
              <button
                onClick={isOnline ? syncNow : undefined}
                disabled={isSyncing || !isOnline}
                className={`relative ${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-xl flex items-center justify-center transition-all ${
                  isSyncing 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : isOnline 
                      ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                      : 'bg-orange-500/20 text-orange-400'
                }`}
                title={isSyncing ? 'Sincronizando...' : `${pendingCount} operación(es) pendiente(s)`}
                data-testid="sync-status-btn"
              >
                {isSyncing ? (
                  <RefreshCw size={isTablet ? 14 : largeMode ? 18 : 16} className="animate-spin" />
                ) : (
                  <CloudOff size={isTablet ? 14 : largeMode ? 18 : 16} />
                )}
                <span className={`absolute -top-1 -right-1 ${isTablet ? 'w-4 h-4 text-[8px]' : 'w-5 h-5 text-[10px]'} rounded-full bg-orange-500 text-white font-bold flex items-center justify-center`}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              </button>
            )}
            
            {/* Device & Connection Status */}
            <div className="flex flex-col items-center gap-1" data-testid="status-indicators">
              <DeviceIcon size={isTablet ? 14 : largeMode ? 18 : 14} className={isGlassPage ? 'text-white/30' : 'text-muted-foreground/50'} title={device?.deviceLabel} />
              <div data-testid="online-status" className="relative">
                {isOnline ? (
                  isSyncing ? (
                    <Cloud size={isTablet ? 14 : largeMode ? 20 : 16} className="text-blue-400 animate-pulse" />
                  ) : (
                    <Wifi size={isTablet ? 14 : largeMode ? 20 : 16} className="text-green-400" />
                  )
                ) : (
                  <WifiOff size={isTablet ? 14 : largeMode ? 20 : 16} className="text-orange-400 animate-pulse" />
                )}
              </div>
            </div>
            
            <div className="text-center" data-testid="user-info">
              <div className={`${isTablet ? 'w-8 h-8' : largeMode ? 'w-10 h-10' : 'w-8 h-8'} rounded-full flex items-center justify-center font-bold font-oswald ${isTablet ? 'text-xs' : largeMode ? 'text-sm' : 'text-xs'} ${
                isGlassPage 
                  ? 'bg-white/10 text-white border border-white/20' 
                  : 'bg-primary/20 text-primary'
              }`}>
                {user?.name?.[0]}
              </div>
              <p className={`mt-0.5 ${isTablet ? 'text-[7px] max-w-[45px]' : largeMode ? 'text-[10px] max-w-[60px]' : 'text-[8px] max-w-[50px]'} truncate ${
                isGlassPage ? 'text-white/50' : 'text-muted-foreground'
              }`}>{user?.name}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              data-testid="logout-btn"
              className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} ${
                isGlassPage ? 'text-white/60 hover:text-red-400 hover:bg-white/10' : 'text-muted-foreground hover:text-destructive'
              }`}
            >
              <LogOut size={isTablet ? 16 : largeMode ? 22 : 18} />
            </Button>
          </div>
        </aside>
      )}

      {/* Main content */}
      <main className={`flex-1 overflow-auto relative z-10 ${isMobile ? 'pb-20' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
