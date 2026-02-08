import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutGrid, ChefHat, Receipt, Settings, LogOut, Wifi, WifiOff, CircleDollarSign, Package, Truck, BarChart3, Heart, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import '@/App.css';

const navItems = [
  { to: '/tables', icon: LayoutGrid, label: 'Mesas' },
  { to: '/kitchen', icon: ChefHat, label: 'Cocina' },
  { to: '/cash-register', icon: CircleDollarSign, label: 'Caja' },
  { to: '/inventory', icon: Package, label: 'Invent.' },
  { to: '/suppliers', icon: Truck, label: 'Compras' },
  { to: '/reports', icon: BarChart3, label: 'Reporte' },
  { to: '/customers', icon: Heart, label: 'Clientes' },
  { to: '/settings', icon: Settings, label: 'Config' },
];

export default function Layout() {
  const { user, logout, isOnline } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="h-screen flex overflow-hidden bg-background" data-testid="main-layout">
      {/* Sidebar */}
      <aside className="w-16 lg:w-20 flex flex-col items-center py-4 bg-card border-r border-border shrink-0" data-testid="sidebar">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mb-6">
          <span className="font-oswald text-lg font-bold text-primary-foreground">RD</span>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={`nav-${label.toLowerCase()}`}
              className={({ isActive }) =>
                `w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all btn-press ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-[0_4px_14px_0_rgba(255,100,0,0.39)]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <Icon size={20} />
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col items-center gap-3 mt-auto">
          <div className="flex items-center justify-center" data-testid="online-status">
            {isOnline ? (
              <Wifi size={16} className="text-table-free" />
            ) : (
              <WifiOff size={16} className="text-destructive animate-pulse" />
            )}
          </div>
          <div className="text-center">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold font-oswald">
              {user?.name?.[0]}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="logout-btn"
            className="w-10 h-10 text-muted-foreground hover:text-destructive"
          >
            <LogOut size={18} />
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
