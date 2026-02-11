import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutGrid, ChefHat, Receipt, Settings, LogOut, Wifi, WifiOff, CircleDollarSign, Package, Truck, BarChart3, Heart, Gauge, CalendarDays, Type, Smartphone, Tablet, Monitor } from 'lucide-react';
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

export default function Layout() {
  const { user, logout, isOnline, hasPermission, largeMode, toggleLargeMode, device } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  
  // Responsive helpers
  const isMobile = device?.isMobile;
  const isTablet = device?.isTablet;

  const filteredNav = navItems.filter(item => {
    if (item.to === '/dashboard') return hasPermission('view_dashboard');
    if (item.to === '/reservations') return hasPermission('manage_reservations');
    if (item.to === '/settings') return true;
    return true;
  });

  // Device indicator icon
  const DeviceIcon = isMobile ? Smartphone : isTablet ? Tablet : Monitor;

  return (
    <div className="h-screen flex overflow-hidden bg-background" data-testid="main-layout">
      {/* Sidebar - Bottom on mobile, Side on tablet/desktop */}
      {isMobile ? (
        // Mobile Bottom Navigation
        <aside className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom" data-testid="mobile-nav">
          <nav className="flex justify-around items-center py-2 px-1">
            {filteredNav.slice(0, 5).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                data-testid={`nav-${label.toLowerCase()}`}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all min-w-[50px] ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
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
              className="flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl text-muted-foreground hover:text-destructive min-w-[50px]"
            >
              <LogOut size={20} />
              <span className="text-[9px] font-medium">Salir</span>
            </button>
          </nav>
        </aside>
      ) : (
        // Tablet/Desktop Side Navigation
        <aside className={`${isTablet ? 'w-16' : largeMode ? 'w-20 lg:w-24' : 'w-16 lg:w-20'} flex flex-col items-center py-3 lg:py-4 bg-card border-r border-border shrink-0`} data-testid="sidebar">
          <div className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg bg-primary flex items-center justify-center mb-4 lg:mb-6`}>
            <span className={`font-oswald font-bold text-primary-foreground ${isTablet ? 'text-base' : largeMode ? 'text-xl' : 'text-lg'}`}>RD</span>
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
                      ? 'bg-primary text-primary-foreground shadow-[0_4px_14px_0_rgba(255,100,0,0.39)]'
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
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title="Modo texto grande (A+)"
            >
              <span className={`font-bold ${isTablet ? 'text-xs' : largeMode ? 'text-base' : 'text-sm'}`}>A+</span>
            </button>
            
            {/* Device & Connection Status */}
            <div className="flex flex-col items-center gap-1" data-testid="status-indicators">
              <DeviceIcon size={isTablet ? 14 : largeMode ? 18 : 14} className="text-muted-foreground/50" title={device?.deviceLabel} />
              <div data-testid="online-status">
                {isOnline ? (
                  <Wifi size={isTablet ? 14 : largeMode ? 20 : 16} className="text-table-free" />
                ) : (
                  <WifiOff size={isTablet ? 14 : largeMode ? 20 : 16} className="text-destructive animate-pulse" />
                )}
              </div>
            </div>
            
            <div className="text-center" data-testid="user-info">
              <div className={`${isTablet ? 'w-8 h-8' : largeMode ? 'w-10 h-10' : 'w-8 h-8'} rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold font-oswald ${isTablet ? 'text-xs' : largeMode ? 'text-sm' : 'text-xs'}`}>
                {user?.name?.[0]}
              </div>
              <p className={`text-muted-foreground mt-0.5 ${isTablet ? 'text-[7px] max-w-[45px]' : largeMode ? 'text-[10px] max-w-[60px]' : 'text-[8px] max-w-[50px]'} truncate`}>{user?.name}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              data-testid="logout-btn"
              className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} text-muted-foreground hover:text-destructive`}
            >
              <LogOut size={isTablet ? 16 : largeMode ? 22 : 18} />
            </Button>
          </div>
        </aside>
      )}

      {/* Main content - Add padding for mobile bottom nav */}
      <main className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
