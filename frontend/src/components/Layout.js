import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GraduationCap } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { LayoutGrid, ChefHat, Receipt, Settings, LogOut, Wifi, WifiOff, CircleDollarSign, Package, Truck, Heart, Gauge, CalendarDays, Type, Smartphone, Tablet, Monitor, CloudOff, RefreshCw, Cloud, MoreHorizontal, Wrench, MoveRight, SplitSquareHorizontal, Percent, Ban, Sun, Moon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useCallback } from 'react';
import api, { businessDaysAPI, ordersAPI } from '@/lib/api';
import { toast } from 'sonner';
import BusinessDayManager from '@/components/BusinessDayManager';
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
  const { theme, isMinimalist, isNeoDark, neoColors } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [functionsMenuOpen, setFunctionsMenuOpen] = useState(false);
  const [businessDayDialogOpen, setBusinessDayDialogOpen] = useState(false);
  const [businessDay, setBusinessDay] = useState(null);
  const [businessDayLoading, setBusinessDayLoading] = useState(true);
  
  // Limpiar toasts al cambiar de ruta
  useEffect(() => {
    toast.dismiss();
  }, [location.pathname]);
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // CONTROL DE TURNO DE CAJA PARA CAJEROS - BLOQUEO TOTAL
  // ═══════════════════════════════════════════════════════════════════════════════
  const [cashierShift, setCashierShift] = useState(null);
  const [cashierShiftLoading, setCashierShiftLoading] = useState(true);
  
  // Roles que requieren turno abierto para operar (solo cajeros)
  const requiresShift = user?.role === 'cashier';
  
  // El usuario necesita turno si: requiere turno Y no tiene turno abierto Y ya terminó de cargar
  // EXCEPCIÓN: No bloquear si está en la página de Caja (para poder abrir turno)
  const isOnCashRegisterPage = location.pathname === '/cash-register';
  const cashierNeedsShift = requiresShift && !cashierShift && !cashierShiftLoading && !isOnCashRegisterPage;
  
  // Fetch shift status for users that require it
  const fetchCashierShift = useCallback(async () => {
    if (!requiresShift) {
      setCashierShiftLoading(false);
      return;
    }
    
    try {
      const res = await api.get('/pos-sessions/check');
      const data = res.data;
      setCashierShift(data?.has_open_session ? data.session : null);
    } catch (err) {
      console.error('Error checking shift:', err);
      setCashierShift(null);
    } finally {
      setCashierShiftLoading(false);
    }
  }, [requiresShift]);
  
  // Verificar turno al cargar y cada 5 segundos (para detectar cuando abre turno)
  useEffect(() => {
    fetchCashierShift();
    
    // Polling cada 5 segundos para detectar cuando abre turno
    const interval = setInterval(fetchCashierShift, 5000);
    return () => clearInterval(interval);
  }, [fetchCashierShift]);
  
  // Redirigir a Caja cuando el cajero necesita abrir turno
  const handleGoToCashRegister = () => {
    navigate('/cash-register');
  };
  
  // Logout si el cajero no quiere abrir turno
  const handleLogoutWithoutShift = () => {
    logout();
    navigate('/login');
  };

  // Fetch business day status
  const fetchBusinessDay = useCallback(async () => {
    try {
      const res = await businessDaysAPI.check();
      setBusinessDay(res.data.has_open_day ? {
        business_date: res.data.business_date,
        id: res.data.day_id,
        opened_at: res.data.opened_at
      } : null);
    } catch (err) {
      console.error('Error checking business day:', err);
    } finally {
      setBusinessDayLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinessDay();
    // Poll every 30 seconds
    const interval = setInterval(fetchBusinessDay, 30000);
    return () => clearInterval(interval);
  }, [fetchBusinessDay]);

  const handleLogout = () => { logout(); navigate('/login'); };
  
  // Logout with auto-send pending comandas
  const handleLogoutWithComandas = async () => {
    try {
      // Send pending comandas for all user's orders
      // Fetch all orders without status filter to include 'sent' status orders
      const res = await ordersAPI.list();
      const allOrders = res.data || [];
      const userOrders = allOrders.filter(o => 
        o.waiter_id === user?.id && 
        ['active', 'sent'].includes(o.status) &&
        o.items?.some(i => i.status === 'pending')
      );
      
      if (userOrders?.length > 0) {
        let sentCount = 0;
        for (const order of userOrders) {
          try {
            await ordersAPI.sendToKitchen(order.id);
            sentCount++;
            console.log('Logout: Comanda enviada para orden', order.id);
          } catch (e) {
            console.error('Logout: Error enviando orden', order.id, e);
          }
        }
        console.log('Logout: Enviadas', sentCount, 'comandas pendientes');
      }
    } catch (e) {
      console.error('Logout: Error obteniendo órdenes', e);
    }
    
    logout();
    navigate('/login');
  };
  
  // Check if current page should use glass design
  const isGlassPage = !noGlassPages.some(p => location.pathname.startsWith(p));
  
  // Hide mobile nav on payment screen for more space
  const hideNavPages = ['/payment'];
  const shouldHideNav = hideNavPages.some(p => location.pathname.startsWith(p));
  
  // Responsive helpers
  const isMobile = device?.isMobile;
  const isTablet = device?.isTablet;
  
  // Offline state
  const { isSyncing, pendingCount, syncNow } = offline || {};
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin';
  const isCashier = user?.role === 'cashier';
  const canAccessCash = isAdmin || isCashier;

  const filteredNav = navItems.filter(item => {
    if (item.to === '/dashboard') return hasPermission('view_dashboard');
    if (item.to === '/reservations') return hasPermission('manage_reservations');
    // Only show Config for admins
    if (item.to === '/settings') return isAdmin;
    // Only show Caja for cashiers and admins
    if (item.to === '/cash-register') return canAccessCash;
    return true;
  });

  // Device indicator icon
  const DeviceIcon = isMobile ? Smartphone : isTablet ? Tablet : Monitor;

  // Glassmorphism background style
  const neoBgActive = isNeoDark ? neoColors.neoDarkBg : neoColors.neoBgColor;
  const bgStyle = isGlassPage && !isMinimalist ? {
    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
  } : isMinimalist ? {
    background: neoBgActive,
  } : {};

  // For neumorphic mode, override glass page logic for styling
  const useGlassStyle = isGlassPage && !isMinimalist;

  return (
    <div 
      className={`h-screen flex overflow-hidden ${useGlassStyle ? '' : isMinimalist ? '' : 'bg-background'}`} 
      style={bgStyle}
      data-testid="main-layout"
    >
      {/* Animated orbs for glass pages (original theme only) */}
      {useGlassStyle && (
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

      {/* Subtle glow orbs for minimalist */}
      {isMinimalist && isGlassPage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full blur-[100px] neo-bg-orb" style={{ backgroundColor: neoColors.neoGlowColor, opacity: 0.35 }} />
          <div className="absolute top-1/3 -right-10 w-56 h-56 rounded-full blur-[90px] neo-bg-orb" style={{ backgroundColor: neoColors.neoGlowColor, opacity: 0.25, animationDelay: '1.5s' }} />
          <div className="absolute -bottom-16 left-1/4 w-64 h-64 rounded-full blur-[110px] neo-bg-orb" style={{ backgroundColor: neoColors.neoGlowColor, opacity: 0.3, animationDelay: '3s' }} />
          <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full blur-[80px] neo-bg-orb" style={{ backgroundColor: neoColors.neoGlowColor, opacity: 0.2, animationDelay: '2s' }} />
        </div>
      )}

      {/* Sidebar - Bottom on mobile, Side on tablet/desktop */}
      {isMobile && !shouldHideNav ? (
        // Mobile Bottom Navigation - Glassmorphism
        <aside 
          className={`fixed bottom-0 left-0 right-0 z-50 safe-area-bottom ${useGlassStyle ? 'backdrop-blur-xl bg-white/10 border-t border-white/20' : 'bg-card border-t border-border'}`}
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
                      ? useGlassStyle 
                        ? 'bg-white/20 text-white shadow-lg'
                        : 'bg-primary text-primary-foreground'
                      : useGlassStyle
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
                useGlassStyle ? 'text-white/60 hover:text-red-400' : 'text-muted-foreground hover:text-destructive'
              }`}
            >
              <LogOut size={20} />
              <span className="text-[9px] font-medium">Salir</span>
            </button>
          </nav>
        </aside>
      ) : !shouldHideNav ? (
        // Tablet/Desktop Side Navigation - Glassmorphism
        <aside 
          className={`${isTablet ? 'w-16' : largeMode ? 'w-20 lg:w-24' : 'w-16 lg:w-20'} flex flex-col items-center py-3 lg:py-4 shrink-0 relative z-20 ${
            useGlassStyle 
              ? 'backdrop-blur-xl bg-white/5 border-r border-white/10' 
              : 'bg-card border-r border-border'
          }`} 
          data-testid="sidebar"
        >
          {/* Logo RD - Click to logout with auto-send comandas */}
          <button
            onClick={handleLogoutWithComandas}
            data-testid="logo-logout-btn"
            title="Salir del sistema"
            className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg flex items-center justify-center mb-2 transition-all hover:opacity-80 active:scale-95 ${
              useGlassStyle ? 'backdrop-blur-xl bg-white/10 border border-white/20 hover:bg-white/20' : 'hover:ring-2 hover:ring-primary/50'
            }`}
            style={{ backgroundColor: useGlassStyle ? 'transparent' : theme.accentColor }}
          >
            <span className={`font-oswald font-bold ${useGlassStyle ? 'text-white' : 'text-primary-foreground'} ${isTablet ? 'text-base' : largeMode ? 'text-xl' : 'text-lg'}`}>RD</span>
          </button>
          
          {/* Business Day Indicator - Jornada de Trabajo */}
          <button
            onClick={() => setBusinessDayDialogOpen(true)}
            data-testid="business-day-sidebar-btn"
            title={businessDay ? `Jornada: ${businessDay.business_date}` : 'Sin jornada abierta'}
            className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg flex flex-col items-center justify-center mb-4 transition-all ${
              businessDayLoading ? 'animate-pulse' : ''
            } ${
              businessDay 
                ? useGlassStyle 
                  ? 'bg-green-500/20 border border-green-500/30 hover:bg-green-500/30' 
                  : 'bg-green-500/20 hover:bg-green-500/30'
                : useGlassStyle
                  ? 'bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 animate-pulse'
                  : 'bg-red-500/20 hover:bg-red-500/30 animate-pulse'
            }`}
          >
            {businessDay ? (
              <Sun size={isTablet ? 14 : largeMode ? 18 : 16} className="text-green-400" />
            ) : (
              <Moon size={isTablet ? 14 : largeMode ? 18 : 16} className="text-red-400" />
            )}
            {businessDay && (
              <span className={`font-mono ${isTablet ? 'text-[6px]' : largeMode ? 'text-[8px]' : 'text-[7px]'} text-green-400 mt-0.5`}>
                {businessDay.business_date?.slice(5)}
              </span>
            )}
          </button>
          
          {/* Business Day Management Dialog */}
          <Dialog open={businessDayDialogOpen} onOpenChange={setBusinessDayDialogOpen}>
            <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-lg">
              <BusinessDayManager 
                showStatsInline={true} 
                onDayStatusChange={(hasDay, day) => {
                  setBusinessDay(hasDay ? day : null);
                }}
              />
            </DialogContent>
          </Dialog>

          <nav className="flex-1 flex flex-col gap-1.5 lg:gap-2">
            {filteredNav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                data-testid={`nav-${label.toLowerCase()}`}
                className={({ isActive }) =>
                  `${isTablet ? 'w-12 h-12' : largeMode ? 'w-14 h-14 lg:w-16 lg:h-16' : 'w-12 h-12 lg:w-14 lg:h-14'} rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all btn-press ${
                    isActive
                      ? useGlassStyle
                        ? 'bg-white/20 text-white shadow-[0_4px_20px_rgba(255,255,255,0.15)] border border-white/30'
                        : 'bg-primary text-primary-foreground shadow-[0_4px_14px_0_rgba(255,100,0,0.39)]'
                      : useGlassStyle
                        ? 'text-white/60 hover:bg-white/10 hover:text-white'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`
                }
              >
                <Icon size={isTablet ? 18 : largeMode ? 24 : 20} />
                <span className={`font-medium leading-none ${isTablet ? 'text-[8px]' : largeMode ? 'text-[11px]' : 'text-[9px]'}`}>{label}</span>
              </NavLink>
            ))}
            
            {/* Functions Menu Button - Solo visible en pantalla de pedidos */}
            {location.pathname.startsWith('/order/') && (
              <>
                <button
                  onClick={() => setFunctionsMenuOpen(true)}
                  data-testid="sidebar-functions-btn"
                  className={`${isTablet ? 'w-12 h-12' : largeMode ? 'w-14 h-14 lg:w-16 lg:h-16' : 'w-12 h-12 lg:w-14 lg:h-14'} rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all btn-press ${
                    useGlassStyle
                      ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30'
                      : 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30'
                  }`}
                >
                  <Wrench size={isTablet ? 18 : largeMode ? 24 : 20} />
                  <span className={`font-medium leading-none ${isTablet ? 'text-[8px]' : largeMode ? 'text-[11px]' : 'text-[9px]'}`}>Funciones</span>
                </button>
                
                {/* Modal Glassmorphism de Funciones */}
                <Dialog open={functionsMenuOpen} onOpenChange={setFunctionsMenuOpen}>
                  <DialogContent 
                    className="max-w-md p-0 border-0 bg-transparent shadow-none"
                    data-testid="sidebar-functions-menu"
                  >
                    {/* Glassmorphism Container with animation */}
                    <div className="relative backdrop-blur-xl bg-slate-900/80 border border-white/20 rounded-2xl p-5 shadow-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300">
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 rounded-2xl pointer-events-none" />
                      
                      {/* Header */}
                      <div className="relative mb-4 pb-3 border-b border-white/10">
                        <h3 className="text-lg font-oswald font-bold text-white flex items-center gap-2">
                          <Wrench size={20} className="text-blue-400" />
                          Funciones de Mesa
                        </h3>
                        <p className="text-xs text-white/50 mt-1">Selecciona una acción</p>
                      </div>
                      
                      {/* Grid de botones tipo píldora */}
                      <div className="relative grid grid-cols-2 gap-3">
                        {/* Mover Mesa */}
                        <button 
                          onClick={() => { 
                            setFunctionsMenuOpen(false); 
                            window.dispatchEvent(new CustomEvent('openMoveTableDialog'));
                          }}
                          className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-400/50 transition-all duration-200 group active:scale-95"
                          data-testid="sidebar-fn-move-table"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                            <MoveRight size={16} className="text-blue-400" />
                          </div>
                          <span className="text-sm font-medium text-white/90 group-hover:text-white">Mover Mesa</span>
                        </button>
                        
                        {/* Dividir Cuenta */}
                        <button 
                          onClick={() => { 
                            setFunctionsMenuOpen(false); 
                            window.dispatchEvent(new CustomEvent('enterSplitMode'));
                          }}
                          className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 hover:bg-green-500/20 border border-white/10 hover:border-green-400/50 transition-all duration-200 group active:scale-95"
                          data-testid="sidebar-fn-split-bill"
                        >
                          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
                            <SplitSquareHorizontal size={16} className="text-green-400" />
                          </div>
                          <span className="text-sm font-medium text-white/90 group-hover:text-white">Dividir Cuenta</span>
                        </button>
                        
                        {/* Reimprimir Comanda */}
                        <button 
                          className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 border border-white/10 opacity-50 cursor-not-allowed"
                          disabled
                          data-testid="sidebar-fn-reprint-order"
                        >
                          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                            <RefreshCw size={16} className="text-orange-400" />
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-medium text-white/50">Reimprimir</span>
                            <span className="text-[10px] text-white/30">Pronto</span>
                          </div>
                        </button>
                        
                        {/* Descuento Especial */}
                        <button 
                          className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 border border-white/10 opacity-50 cursor-not-allowed"
                          disabled
                          data-testid="sidebar-fn-apply-discount"
                        >
                          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <Percent size={16} className="text-purple-400" />
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-medium text-white/50">Descuento</span>
                            <span className="text-[10px] text-white/30">Pronto</span>
                          </div>
                        </button>
                        
                        {/* Anular Cuenta Entera - ACCIÓN CRÍTICA - Span completo */}
                        <button 
                          onClick={() => { 
                            setFunctionsMenuOpen(false); 
                            window.dispatchEvent(new CustomEvent('voidEntireOrder'));
                          }}
                          className="col-span-2 flex items-center justify-center gap-3 px-4 py-3.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-400/50 transition-all duration-200 group active:scale-95"
                          data-testid="sidebar-fn-void-order"
                        >
                          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30 transition-colors">
                            <Ban size={16} className="text-red-400" />
                          </div>
                          <span className="text-sm font-semibold text-red-400 group-hover:text-red-300">Anular Cuenta Entera</span>
                        </button>
                      </div>
                      
                      {/* Footer */}
                      <div className="relative mt-4 pt-3 border-t border-white/10 flex justify-end">
                        <button 
                          onClick={() => setFunctionsMenuOpen(false)}
                          className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-medium transition-all active:scale-95"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </nav>

          {/* Bottom section */}
          <div className="flex flex-col items-center gap-2 lg:gap-3 mt-auto">
            {/* Large Mode Toggle */}
            <button
              onClick={toggleLargeMode}
              className={`${isTablet ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                largeMode 
                  ? 'bg-green-600 text-white' 
                  : useGlassStyle
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
              <DeviceIcon size={isTablet ? 14 : largeMode ? 18 : 14} className={useGlassStyle ? 'text-white/30' : 'text-muted-foreground/50'} title={device?.deviceLabel} />
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
                useGlassStyle 
                  ? 'bg-white/10 text-white border border-white/20' 
                  : 'bg-primary/20 text-primary'
              }`}>
                {user?.name?.[0]}
              </div>
              <p className={`mt-0.5 ${isTablet ? 'text-[7px] max-w-[45px]' : largeMode ? 'text-[10px] max-w-[60px]' : 'text-[8px] max-w-[50px]'} truncate ${
                useGlassStyle ? 'text-white/50' : 'text-muted-foreground'
              }`}>{user?.name}</p>
            </div>
          </div>
        </aside>
      ) : null}

      {/* Main content */}
      <main className={`flex-1 overflow-auto relative z-10 ${isMobile && !shouldHideNav ? 'pb-20' : ''}`}>
        {/* ─── Training Mode Banner ─── */}
        {user?.training_mode && (
          <div className="bg-amber-500 text-black px-4 py-1.5 flex items-center justify-center gap-2 text-sm font-bold font-oswald tracking-wider z-50" data-testid="training-mode-banner">
            <GraduationCap size={16} />
            MODO ENTRENAMIENTO — Las transacciones NO se registran como ventas reales
            <GraduationCap size={16} />
          </div>
        )}
        <Outlet />
      </main>
      
      {/* ═══════════════════════════════════════════════════════════════════════════════
          DIALOGO BLOQUEANTE - CAJERO SIN TURNO DE CAJA
          Este diálogo es PERMANENTE y aparece en TODAS las páginas hasta que abra turno
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={cashierNeedsShift} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-amber-500/50 max-w-md" hideCloseButton>
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center animate-pulse">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
            </div>
            <DialogTitle className="text-xl font-oswald text-white text-center">
              Turno de Caja Requerido
            </DialogTitle>
            <DialogDescription className="text-white/70 text-center mt-2">
              Debes abrir un turno de caja antes de poder usar el sistema.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-red-500/10 rounded-lg p-4 mt-4 border border-red-500/30">
            <p className="text-red-400 text-sm text-center font-medium">
              ⚠️ No puedes realizar ninguna operación hasta abrir un turno de caja.
            </p>
          </div>
          
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-white/60 text-xs text-center">
              El turno de caja te permite registrar ventas, recibir pagos y realizar cuadres de efectivo.
            </p>
          </div>
          
          <div className="flex flex-col gap-3 mt-4">
            <Button
              onClick={handleGoToCashRegister}
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold"
              data-testid="open-shift-btn"
            >
              <CircleDollarSign size={20} className="mr-2" />
              Ir a Abrir Turno
            </Button>
            <Button
              onClick={handleLogoutWithoutShift}
              variant="outline"
              className="w-full h-10 border-white/20 text-white/70 hover:bg-white/10"
              data-testid="logout-without-shift-btn"
            >
              <LogOut size={16} className="mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
