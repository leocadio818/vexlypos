import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GraduationCap } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, ChefHat, Receipt, Settings, LogOut, Wifi, WifiOff, CircleDollarSign, Package, Truck, Heart, Gauge, CalendarDays, Type, Smartphone, Tablet, Monitor, CloudOff, RefreshCw, Cloud, MoreHorizontal, Wrench, MoveRight, SplitSquareHorizontal, Ban, Sun, Moon, AlertTriangle, Palette, ArrowRightLeft, Clock, LogOut as LogOutIcon, Lock, FileText, Pencil, HelpCircle, ReceiptText, Search, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { PinPad } from '@/components/PinPad';
import { useState, useEffect, useCallback } from 'react';
import api, { businessDaysAPI, ordersAPI } from '@/lib/api';
import { notify } from '@/lib/notify';
import { getSystemToday } from '@/lib/timezone';
import BusinessDayManager from '@/components/BusinessDayManager';
import EcfDashboardInline from '@/pages/reports/EcfDashboard';
import StockAlertModal from '@/components/StockAlertModal';
import '@/App.css';

const navItems = [
  { to: '/dashboard', icon: Gauge, label: 'Panel' },
  { to: '/tables', icon: LayoutGrid, label: 'Mesas' },
];

// Pages that should NOT have glassmorphism (for visibility in kitchen)
const noGlassPages = ['/kitchen', '/kitchen-tv'];

export default function Layout() {
  const { user, logout, isOnline, hasPermission, largeMode, toggleLargeMode, device, offline } = useAuth();
  const { theme, isMinimalist, isNeoDark, neoColors } = useTheme();
  const { activeThemeMode, setActiveThemeMode, neoMode, setNeoMode, saveAllThemeSettings } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [functionsMenuOpen, setFunctionsMenuOpen] = useState(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [ecfDashboardOpen, setEcfDashboardOpen] = useState(false);
  const [ecfDashboardData, setEcfDashboardData] = useState(null);
  const [ecfDateFrom, setEcfDateFrom] = useState('');
  const [ecfDateTo, setEcfDateTo] = useState('');
  const [ecfPeriod, setEcfPeriod] = useState('jornada');
  
  // Credit Note E34 modal states
  const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
  const [creditNoteStep, setCreditNoteStep] = useState(1);
  const [creditNoteSearch, setCreditNoteSearch] = useState('');
  const [creditNoteBill, setCreditNoteBill] = useState(null);
  const [creditNoteReason, setCreditNoteReason] = useState('');
  const [creditNoteLoading, setCreditNoteLoading] = useState(false);
  const [creditNoteResult, setCreditNoteResult] = useState(null);
  const [creditNoteConfirmOpen, setCreditNoteConfirmOpen] = useState(false);
  const [creditNoteSearchError, setCreditNoteSearchError] = useState(null);
  
  const resetCreditNoteModal = () => {
    setCreditNoteStep(1);
    setCreditNoteSearch('');
    setCreditNoteBill(null);
    setCreditNoteReason('');
    setCreditNoteLoading(false);
    setCreditNoteResult(null);
    setCreditNoteConfirmOpen(false);
    setCreditNoteSearchError(null);
  };
  
  const searchBillForCreditNote = async () => {
    if (!creditNoteSearch.trim()) {
      setCreditNoteSearchError('Ingresa un número de transacción o e-NCF');
      return;
    }
    setCreditNoteLoading(true);
    setCreditNoteBill(null);
    setCreditNoteSearchError(null);
    try {
      const res = await api.get(`/api/credit-notes/find-bill?search=${encodeURIComponent(creditNoteSearch.trim())}`);
      setCreditNoteBill(res.data);
      setCreditNoteSearchError(null);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Factura no encontrada';
      setCreditNoteSearchError(errorMsg);
      setCreditNoteBill(null);
    } finally {
      setCreditNoteLoading(false);
    }
  };
  
  const generateE34 = async () => {
    if (!creditNoteBill || !creditNoteReason.trim()) {
      notify.error('Debes proporcionar un motivo');
      return;
    }
    setCreditNoteLoading(true);
    try {
      const res = await api.post('/api/credit-notes/generate-e34', {
        search: creditNoteSearch.trim(),
        reason: creditNoteReason.trim()
      });
      setCreditNoteResult(res.data);
      setCreditNoteStep(3);
      setCreditNoteConfirmOpen(false);
      notify.success(`Nota de Crédito E34 generada: ${res.data.ecf_encf}`);
    } catch (err) {
      setCreditNoteResult({ ok: false, error: err.response?.data?.detail || 'Error generando E34' });
      setCreditNoteStep(3);
      setCreditNoteConfirmOpen(false);
      notify.error(err.response?.data?.detail || 'Error generando E34');
    } finally {
      setCreditNoteLoading(false);
    }
  };
  
  const getEcfDates = (period) => {
    // ALWAYS use system timezone (RD America/Santo_Domingo) — not browser local.
    // Critical: test machine may be in NJ but the POS must behave as if in RD.
    const todayStr = getSystemToday(); // YYYY-MM-DD in RD timezone
    const [yy, mm, dd] = todayStr.split('-').map(Number);
    // Build a local Date anchored at the RD "today" noon (avoids DST edge cases)
    const today = new Date(yy, mm - 1, dd, 12, 0, 0);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 30);
    switch (period) {
      case 'jornada': return { from: fmt(today), to: fmt(today) };
      case 'ayer': return { from: fmt(yesterday), to: fmt(yesterday) };
      case 'semana': return { from: fmt(weekAgo), to: fmt(today) };
      case 'mes': return { from: fmt(monthAgo), to: fmt(today) };
      case 'custom': return { from: ecfDateFrom, to: ecfDateTo };
      default: return { from: '', to: '' };
    }
  };
  
  const fetchEcfDashboard = async (period) => {
    const dates = period === 'custom' ? { from: ecfDateFrom, to: ecfDateTo } : getEcfDates(period || ecfPeriod);
    try {
      const params = {};
      if (dates.from) params.date_from = dates.from;
      if (dates.to) params.date_to = dates.to;
      const r = await api.get('/ecf/dashboard', { params });
      setEcfDashboardData(r.data);
    } catch {}
  };

  // ═════ e-CF DGII Rejection Real-Time Alerts (polling 60s) ═════
  const [ecfRejections, setEcfRejections] = useState([]);
  const [ecfLastSeenAt, setEcfLastSeenAt] = useState(
    () => localStorage.getItem('pos_ecf_rejections_last_seen') || ''
  );
  const [ecfHealthAlert, setEcfHealthAlert] = useState(false); // admin only
  const canViewEcf = (user?.role === 'admin') || hasPermission('view_ecf_dashboard');
  const unseenRejections = ecfRejections.filter(
    (r) => (r.ecf_sent_at || '') > (ecfLastSeenAt || '')
  );
  const unseenRejectionCount = unseenRejections.length;

  const markRejectionsSeen = useCallback(() => {
    const latest = ecfRejections[0]?.ecf_sent_at;
    if (latest && latest !== ecfLastSeenAt) {
      localStorage.setItem('pos_ecf_rejections_last_seen', latest);
      setEcfLastSeenAt(latest);
    }
  }, [ecfRejections, ecfLastSeenAt]);

  useEffect(() => {
    if (!canViewEcf) return;
    let mounted = true;
    let prevLatest = localStorage.getItem('pos_ecf_rejections_last_seen') || '';

    const poll = async () => {
      try {
        const r = await api.get('/ecf/rejections', { params: { limit: 20 } });
        if (!mounted) return;
        const list = r.data?.rejections || [];
        setEcfRejections(list);
        const newestAt = list[0]?.ecf_sent_at || '';
        // Toast only on transitions (new rejection detected after first poll)
        if (newestAt && prevLatest && newestAt > prevLatest) {
          const newest = list[0];
          notify.error(
            `DGII rechazó T-${newest.transaction_number || ''} (${newest.ecf_type || 'e-CF'}): ${newest.ecf_reject_reason || 'sin motivo'}`,
            { duration: 10000 }
          );
        }
        prevLatest = newestAt || prevLatest;
      } catch {}
    };

    poll();
    const id = setInterval(poll, 60000);
    return () => { mounted = false; clearInterval(id); };
  }, [canViewEcf]);

  // ═════ Admin-only: Multiprod Health alert (polling 5min) ═════
  useEffect(() => {
    if (user?.role !== 'admin') return;
    let mounted = true;
    const pollHealth = async () => {
      try {
        const r = await api.get('/ecf/health-metrics');
        if (!mounted) return;
        const rate = r.data?.acceptance_rate;
        const total = r.data?.total_sends || 0;
        // Alert only when there's enough data (min 5 sends) AND rate dropped below 90%
        setEcfHealthAlert(total >= 5 && rate !== null && rate < 90);
      } catch {
        if (mounted) setEcfHealthAlert(false);
      }
    };
    pollHealth();
    const id = setInterval(pollHealth, 300000); // 5 min
    return () => { mounted = false; clearInterval(id); };
  }, [user?.role]);
  // ═════════════════════════════════════════════════════════════

  const [clockOutDialogOpen, setClockOutDialogOpen] = useState(false);
  const [clockOutLoading, setClockOutLoading] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const branding = (() => { try { return JSON.parse(localStorage.getItem('pos_branding')) || {}; } catch { return {}; } })();
  const [newPinValue, setNewPinValue] = useState('');
  const [businessDayDialogOpen, setBusinessDayDialogOpen] = useState(false);
  const [businessDay, setBusinessDay] = useState(null);
  const [businessDayLoading, setBusinessDayLoading] = useState(true);
  
  // Limpiar toasts al cambiar de ruta
  useEffect(() => {
    notify.dismiss();
  }, [location.pathname]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // NOTIFICATION POLLING — Real-time alerts for table transfers etc.
  // ═══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return;
    const API_BASE = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem('pos_token');
    if (!token) return;
    
    const pollNotifications = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/notifications/pending`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const notifications = await res.json();
        
        for (const n of notifications) {
          if (n.type === 'table_transfer') {
            notify.success(n.title, { description: n.message, duration: 8000 });
          } else {
            notify.info(n.title, { description: n.message, duration: 5000 });
          }
          // Mark as read
          fetch(`${API_BASE}/api/notifications/${n.id}/read`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => {});
        }
        
        // If we got transfer notifications, refresh tables data
        if (notifications.some(n => n.type === 'table_transfer')) {
          window.dispatchEvent(new CustomEvent('tablesUpdated'));
        }
      } catch {}
    };
    
    // Poll every 3 seconds
    const interval = setInterval(pollNotifications, 3000);
    pollNotifications(); // Initial check
    
    return () => clearInterval(interval);
  }, [user]);
  
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
      // If on an order page, send pending items for that specific order
      const orderMatch = location.pathname.match(/\/order\/([^/]+)/);
      if (orderMatch) {
        const tableId = orderMatch[1];
        try {
          const token = localStorage.getItem('pos_token');
          const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/tables/${tableId}/orders`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const orders = await res.json();
            for (const order of (Array.isArray(orders) ? orders : [])) {
              if (order.items?.some(i => i.status === 'pending')) {
                try {
                  await ordersAPI.sendToKitchen(order.id);
                } catch {}
              }
            }
          }
        } catch {}
      } else {
        // Not on order page — send all user's pending orders
        try {
          const res = await ordersAPI.list();
          const allOrders = res.data || [];
          const userOrders = allOrders.filter(o => 
            (o.waiter_id === user?.id || o.waiter_id === user?.user_id) && 
            ['active', 'sent'].includes(o.status) &&
            o.items?.some(i => i.status === 'pending')
          );
          for (const order of userOrders) {
            try { await ordersAPI.sendToKitchen(order.id); } catch {}
          }
        } catch {}
      }
    } catch {}
    
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
      {/* Stock Alert Modal - shows on login if low stock products exist */}
      <StockAlertModal blocked={cashierNeedsShift} />
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
                <span className="text-[11px] font-medium">{label}</span>
              </NavLink>
            ))}
            {!location.pathname.startsWith('/order/') && (
            <button
              onClick={() => setOptionsMenuOpen(true)}
              data-testid="nav-opciones-mobile"
              className={`relative flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all min-w-[50px] ${
                useGlassStyle ? 'text-white/60 hover:text-white' : 'text-muted-foreground'
              }`}
            >
              <MoreHorizontal size={20} />
              <span className="text-[11px] font-medium">Opciones</span>
              {unseenRejectionCount > 0 && (
                <span
                  data-testid="ecf-rejection-badge-mobile"
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg ring-2 ring-background animate-pulse"
                  title={`${unseenRejectionCount} rechazo(s) DGII nuevo(s)`}
                >
                  {unseenRejectionCount > 9 ? '9+' : unseenRejectionCount}
                </span>
              )}
              {unseenRejectionCount === 0 && ecfHealthAlert && user?.role === 'admin' && (
                <span
                  data-testid="ecf-health-alert-badge-mobile"
                  className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-amber-500 ring-2 ring-background animate-pulse"
                  title="Tasa de aceptación DGII < 90% — revisa el Diagnóstico Multiprod"
                />
              )}
            </button>
            )}
            {location.pathname.startsWith('/order/') && (
            <button
              onClick={() => setFunctionsMenuOpen(true)}
              data-testid="nav-funciones-mobile"
              className={`flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all min-w-[50px] ${
                useGlassStyle ? 'text-white/60 hover:text-white' : 'text-muted-foreground'
              }`}
            >
              <Wrench size={20} />
              <span className="text-[11px] font-medium">Funciones</span>
            </button>
            )}
            <button
              onClick={handleLogoutWithComandas}
              className={`flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl min-w-[50px] ${
                useGlassStyle ? 'text-white/60 hover:text-red-400' : 'text-muted-foreground hover:text-destructive'
              }`}
            >
              <LogOut size={20} />
              <span className="text-[11px] font-medium">Salir</span>
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
            {branding.logo_url ? (
              <img src={`${process.env.REACT_APP_BACKEND_URL}${branding.logo_url}`} alt="Logo" className="w-full h-full object-contain rounded-lg" />
            ) : (
              <span className={`font-oswald font-bold ${useGlassStyle ? 'text-white' : 'text-primary-foreground'} ${isTablet ? 'text-base' : largeMode ? 'text-xl' : 'text-lg'}`}>{(branding.restaurant_name || 'POS').substring(0, 2).toUpperCase()}</span>
            )}
          </button>
          
          {/* Business Day Indicator - Jornada de Trabajo */}
          <button
            onClick={() => { if (hasPermission('close_day') || isAdmin) setBusinessDayDialogOpen(true); }}
            data-testid="business-day-sidebar-btn"
            title={businessDay ? `Jornada: ${businessDay.business_date}` : 'Sin jornada abierta'}
            className={`${isTablet ? 'w-12 h-14' : largeMode ? 'w-14 h-16' : 'w-12 h-14'} rounded-xl flex flex-col items-center justify-center mb-4 transition-all ${
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
              <Sun size={isTablet ? 16 : largeMode ? 20 : 18} className="text-green-400" />
            ) : (
              <Moon size={isTablet ? 16 : largeMode ? 20 : 18} className="text-red-400" />
            )}
            {businessDay && (
              <span className={`font-mono font-bold ${isTablet ? 'text-[11px]' : largeMode ? 'text-[11px]' : 'text-xs'} text-green-400 mt-0.5`}>
                {businessDay.business_date?.slice(5)}
              </span>
            )}
          </button>
          
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
                <span className={`font-medium leading-none ${isTablet ? 'text-[8px]' : largeMode ? 'text-[11px]' : 'text-[11px]'}`}>{label}</span>
              </NavLink>
            ))}

            {/* Options Menu Button - Hidden inside orders */}
            {!location.pathname.startsWith('/order/') && (
            <button
              onClick={() => setOptionsMenuOpen(true)}
              data-testid="nav-opciones"
              className={`relative ${isTablet ? 'w-12 h-12' : largeMode ? 'w-14 h-14 lg:w-16 lg:h-16' : 'w-12 h-12 lg:w-14 lg:h-14'} rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all btn-press ${
                useGlassStyle
                  ? 'text-white/60 hover:bg-white/10 hover:text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <MoreHorizontal size={isTablet ? 18 : largeMode ? 24 : 20} />
              <span className={`font-medium leading-none ${isTablet ? 'text-[8px]' : largeMode ? 'text-[11px]' : 'text-[11px]'}`}>Opciones</span>
              {unseenRejectionCount > 0 && (
                <span
                  data-testid="ecf-rejection-badge-desktop"
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg ring-2 ring-background animate-pulse"
                  title={`${unseenRejectionCount} rechazo(s) DGII nuevo(s)`}
                >
                  {unseenRejectionCount > 9 ? '9+' : unseenRejectionCount}
                </span>
              )}
              {unseenRejectionCount === 0 && ecfHealthAlert && user?.role === 'admin' && (
                <span
                  data-testid="ecf-health-alert-badge-desktop"
                  className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-amber-500 ring-2 ring-background animate-pulse"
                  title="Tasa de aceptación DGII < 90% — revisa el Diagnóstico Multiprod"
                />
              )}
            </button>
            )}
            
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
                  <span className={`font-medium leading-none ${isTablet ? 'text-[8px]' : largeMode ? 'text-[11px]' : 'text-[11px]'}`}>Funciones</span>
                </button>
              </>
            )}
          </nav>

          {/* Bottom section — large touch-friendly buttons */}
          <div className="flex flex-col items-center gap-4 mt-auto pb-2">
            
            {/* Connection Status */}
            <div className="flex flex-col items-center gap-1" data-testid="status-indicators">
              <div data-testid="online-status">
                {isOnline ? (
                  <Wifi size={16} className="text-green-400" />
                ) : (
                  <WifiOff size={16} className="text-orange-400 animate-pulse" />
                )}
              </div>
            </div>
            
            {/* Sync Status */}
            {pendingCount > 0 && (
              <button
                onClick={isOnline ? syncNow : undefined}
                disabled={isSyncing || !isOnline}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                title={`${pendingCount} pendiente(s)`}
                data-testid="sync-status-btn"
              >
                {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <CloudOff size={16} />}
                <span className="absolute -top-1 -right-1 w-4 h-4 text-[8px] rounded-full bg-orange-500 text-white font-bold flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              </button>
            )}
            
            {/* User Avatar — separated from other buttons */}
            <div className="text-center mt-2 pt-3 border-t border-white/10" data-testid="user-info">
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`w-11 h-11 lg:w-12 lg:h-12 rounded-full flex items-center justify-center font-bold font-oswald text-sm transition-all hover:scale-110 active:scale-95 ${
                    useGlassStyle 
                      ? 'bg-white/10 text-white border border-white/20' 
                      : 'bg-primary/20 text-primary'
                  }`} data-testid="user-avatar-btn">
                    {user?.name?.[0]}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" align="end" className="w-48 p-2" data-testid="user-theme-popover">
                  <p className="font-oswald font-bold text-sm px-2 mb-2">{user?.name}</p>
                  <div className="space-y-1">
                    <button onClick={() => { setActiveThemeMode('original'); }}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all ${activeThemeMode === 'original' ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
                      data-testid="theme-opt-original">
                      <Moon size={14} /> Tema Original
                    </button>
                    <button onClick={() => { setActiveThemeMode('minimalist'); setNeoMode('light'); }}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all ${isMinimalist && !isNeoDark ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
                      data-testid="theme-opt-light">
                      <Sun size={14} /> Minimalista Claro
                    </button>
                    <button onClick={() => { setActiveThemeMode('minimalist'); setNeoMode('dark'); }}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all ${isNeoDark ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
                      data-testid="theme-opt-dark">
                      <Palette size={14} /> Minimalista Oscuro
                    </button>
                  </div>
                  <div className="border-t border-border mt-2 pt-2 space-y-1">
                    <button onClick={() => setChangePinOpen(true)}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium hover:bg-muted transition-all"
                      data-testid="change-pin-btn">
                      <Lock size={14} /> Cambiar PIN
                    </button>
                    {!hasPermission('close_shift') && (
                      <button onClick={() => setClockOutDialogOpen(true)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition-all"
                        data-testid="sidebar-clock-out-btn">
                        <LogOutIcon size={14} /> Marcar Salida
                      </button>
                    )}
                    <button onClick={async () => {
                      try {
                        const token = localStorage.getItem('pos_token');
                        const prefs = { theme: activeThemeMode, color_mode: neoMode };
                        await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/me/ui-preferences`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify(prefs)
                        });
                        localStorage.setItem('pos_user_ui_prefs', JSON.stringify(prefs));
                        notify.success('Preferencia guardada');
                      } catch { notify.error('Error'); }
                    }}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-all"
                      data-testid="save-my-theme-btn">
                      <Settings size={14} /> Guardar como mi tema
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              <p className={`mt-1 text-[11px] max-w-[55px] truncate ${
                useGlassStyle ? 'text-white/50' : 'text-muted-foreground'
              }`}>{user?.name}</p>
            </div>
          </div>
        </aside>
      ) : null}

      {/* Main content - PWA safe areas applied globally */}
      <main className={`flex-1 relative z-10 safe-area-top ${isMobile && !shouldHideNav ? 'pb-20 safe-area-bottom' : ''}`} style={{ overflow: 'auto', minHeight: 0 }}>
        {/* ─── Training Mode Banner ─── */}
        {user?.training_mode && (
          <div className="bg-amber-500 text-black px-4 py-1.5 flex items-center justify-center gap-2 text-sm font-bold font-oswald tracking-wider z-50" data-testid="training-mode-banner">
            <GraduationCap size={16} />
            MODO ENTRENAMIENTO — Las transacciones NO se registran como ventas reales
            <GraduationCap size={16} />
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ width: '100%', height: '100%' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      
      {/* ═══════════════════════════════════════════════════════════════════════════════
          DIALOGO BLOQUEANTE - CAJERO SIN TURNO DE CAJA
          Este diálogo es PERMANENTE y aparece en TODAS las páginas hasta que abra turno
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={cashierNeedsShift} onOpenChange={() => {}}>
        <DialogContent 
          className={`max-w-md ${isMinimalist && !isNeoDark ? 'bg-white border-amber-500/50' : 'bg-slate-900 border-amber-500/50'}`} 
          hideCloseButton
        >
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center animate-pulse ${isMinimalist && !isNeoDark ? 'bg-amber-100' : 'bg-amber-500/20'}`}>
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
            </div>
            <DialogTitle 
              className="text-xl font-oswald text-center"
              style={isMinimalist && !isNeoDark ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : { color: 'white' }}
            >
              Turno de Caja Requerido
            </DialogTitle>
            <DialogDescription 
              className="text-center mt-2"
              style={isMinimalist && !isNeoDark ? { color: '#64748B', WebkitTextFillColor: '#64748B' } : { color: 'rgba(255,255,255,0.7)' }}
            >
              Debes abrir un turno de caja antes de poder usar el sistema.
            </DialogDescription>
          </DialogHeader>
          
          <div 
            className="rounded-lg p-4 mt-4"
            style={isMinimalist && !isNeoDark 
              ? { backgroundColor: '#FEF2F2', border: '1px solid #FECACA' } 
              : { backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }
            }
          >
            <p 
              className="text-sm text-center font-medium"
              style={isMinimalist && !isNeoDark 
                ? { color: '#991B1B', WebkitTextFillColor: '#991B1B' } 
                : { color: '#F87171' }
              }
            >
              ⚠️ No puedes realizar ninguna operación hasta abrir un turno de caja.
            </p>
          </div>
          
          <div 
            className="rounded-lg p-3"
            style={isMinimalist && !isNeoDark 
              ? { backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' } 
              : { backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }
            }
          >
            <p 
              className="text-xs text-center"
              style={isMinimalist && !isNeoDark 
                ? { color: '#64748B', WebkitTextFillColor: '#64748B' } 
                : { color: 'rgba(255,255,255,0.6)' }
              }
            >
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
              className={`w-full h-10 ${isMinimalist && !isNeoDark ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-white/20 text-white/70 hover:bg-white/10'}`}
              data-testid="logout-without-shift-btn"
            >
              <LogOut size={16} className="mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* e-CF Dashboard Modal - Independent from Reports */}
      {ecfDashboardOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEcfDashboardOpen(false)}>
          <div className="bg-card border border-border rounded-2xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-oswald text-lg font-bold flex items-center gap-2">
                  <FileText size={20} className="text-emerald-500" /> e-CF Dashboard
                </h2>
                <button onClick={() => setEcfDashboardOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-all">
                  <span className="text-muted-foreground text-lg">×</span>
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { id: 'jornada', label: 'Jornada' },
                  { id: 'ayer', label: 'Ayer' },
                  { id: 'semana', label: 'Semana' },
                  { id: 'mes', label: 'Mes' },
                  { id: 'custom', label: 'Personalizado' },
                ].map(p => (
                  <button key={p.id} onClick={async () => {
                    setEcfPeriod(p.id);
                    if (p.id !== 'custom') await fetchEcfDashboard(p.id);
                  }} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${ecfPeriod === p.id ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'}`}>
                    {p.label}
                  </button>
                ))}
                {ecfPeriod === 'custom' && (
                  <>
                    <input type="date" value={ecfDateFrom} onChange={e => setEcfDateFrom(e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                    <input type="date" value={ecfDateTo} onChange={e => setEcfDateTo(e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200" />
                    <button onClick={() => fetchEcfDashboard('custom')}
                      className="text-xs text-emerald-600 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-all">
                      Filtrar
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <EcfDashboardInline data={ecfDashboardData} onRefresh={() => fetchEcfDashboard(ecfPeriod)} />
            </div>
          </div>
        </div>
      )}

      {/* Business Day Management Dialog - Global */}
      <Dialog open={businessDayDialogOpen} onOpenChange={setBusinessDayDialogOpen}>
        <DialogContent 
          className="backdrop-blur-xl border-border rounded-2xl p-4 sm:p-6"
          style={{
            width: 'calc(100% - 2rem)',
            maxWidth: '480px',
            maxHeight: 'calc(100vh - 6rem)',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <BusinessDayManager 
            showStatsInline={true} 
            onDayStatusChange={(hasDay, day) => {
              setBusinessDay(hasDay ? day : null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Functions Menu Modal - Global (works on mobile + desktop) */}
      <Dialog open={functionsMenuOpen} onOpenChange={setFunctionsMenuOpen}>
        <DialogContent className="max-w-md p-0 border-0 bg-transparent shadow-none" data-testid="sidebar-functions-menu">
          <div className="relative backdrop-blur-xl bg-slate-900/80 border border-white/20 rounded-2xl p-5 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 rounded-2xl pointer-events-none" />
            <div className="relative mb-4 pb-3 border-b border-white/10">
              <h3 className="text-lg font-oswald font-bold text-white flex items-center gap-2">
                <Wrench size={20} className="text-blue-400" /> Funciones de Mesa
              </h3>
              <p className="text-xs text-white/50 mt-1">Selecciona una acción</p>
            </div>
            <div className="relative grid grid-cols-2 gap-3">
              <button onClick={() => { setFunctionsMenuOpen(false); window.dispatchEvent(new CustomEvent('openMoveTableDialog')); }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-400/50 transition-all duration-200 group active:scale-95"
                data-testid="sidebar-fn-move-table">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors"><MoveRight size={16} className="text-blue-400" /></div>
                <span className="text-sm font-medium text-white/90 group-hover:text-white">Mover Mesa</span>
              </button>
              <button onClick={() => { setFunctionsMenuOpen(false); window.dispatchEvent(new CustomEvent('openTransferTableDialog')); }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-400/50 transition-all duration-200 group active:scale-95"
                data-testid="sidebar-fn-transfer-table">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors"><ArrowRightLeft size={16} className="text-purple-400" /></div>
                <span className="text-sm font-medium text-white/90 group-hover:text-white">Transferir Mesa</span>
              </button>
              <button onClick={() => { setFunctionsMenuOpen(false); window.dispatchEvent(new CustomEvent('enterSplitMode')); }}
                style={isMinimalist ? {
                  backgroundColor: '#F0FDF4',
                  border: '1.5px solid #22C55E'
                } : {}}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-full transition-all duration-200 group active:scale-95 ${
                  !isMinimalist ? 'bg-white/5 hover:bg-green-500/20 border border-white/10 hover:border-green-400/50' : 'hover:opacity-80'
                }`}
                data-testid="sidebar-fn-split-bill">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
                  <SplitSquareHorizontal size={16} style={isMinimalist ? { color: '#16A34A' } : {}} className={!isMinimalist ? 'text-green-400' : ''} />
                </div>
                <span 
                  style={isMinimalist ? { color: '#166534', WebkitTextFillColor: '#166534', opacity: 1 } : {}}
                  className={`text-sm font-medium ${!isMinimalist ? 'text-white/90 group-hover:text-white' : ''}`}
                >Dividir Cuenta</span>
              </button>
              <button onClick={() => { setFunctionsMenuOpen(false); window.dispatchEvent(new CustomEvent('openMoveItemsFlow')); }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/50 transition-all duration-200 group active:scale-95"
                data-testid="sidebar-fn-move-items">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors"><ArrowRightLeft size={16} className="text-cyan-400" /></div>
                <span className="text-sm font-medium text-white/90 group-hover:text-white">Mover Artículo</span>
              </button>
              <button onClick={() => { setFunctionsMenuOpen(false); window.dispatchEvent(new CustomEvent('openRenameAccountDialog')); }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-full bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-400/50 transition-all duration-200 group active:scale-95"
                data-testid="sidebar-fn-rename-account">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors"><Pencil size={16} className="text-amber-400" /></div>
                <span className="text-sm font-medium text-white/90 group-hover:text-white">Editar Nombre</span>
              </button>
              <button onClick={() => { setFunctionsMenuOpen(false); window.dispatchEvent(new CustomEvent('voidEntireOrder')); }}
                style={isMinimalist ? {
                  backgroundColor: '#FEF2F2',
                  border: '1.5px solid #EF4444'
                } : {}}
                className={`col-span-2 flex items-center justify-center gap-3 px-4 py-3.5 rounded-full transition-all duration-200 group active:scale-95 ${
                  !isMinimalist ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-400/50' : 'hover:opacity-80'
                }`}
                data-testid="sidebar-fn-void-order">
                <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-red-500/30 transition-colors" style={isMinimalist ? { backgroundColor: 'rgba(239, 68, 68, 0.15)' } : { backgroundColor: 'rgba(239, 68, 68, 0.2)' }}>
                  <Ban size={16} style={isMinimalist ? { color: '#DC2626' } : {}} className={!isMinimalist ? 'text-red-400' : ''} />
                </div>
                <span 
                  style={isMinimalist ? { color: '#991B1B', WebkitTextFillColor: '#991B1B', opacity: 1 } : {}}
                  className={`text-sm font-semibold ${!isMinimalist ? 'text-red-400 group-hover:text-red-300' : ''}`}
                >Anular Cuenta Entera</span>
              </button>
            </div>
            <div className="relative mt-4 pt-3 border-t border-white/10 flex justify-end">
              <button onClick={() => setFunctionsMenuOpen(false)} className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-medium transition-all active:scale-95">Cerrar</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Options Menu Modal */}
      {optionsMenuOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOptionsMenuOpen(false)}>
          <div className="bg-card border border-border rounded-2xl max-w-md w-full mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-oswald text-lg font-bold flex items-center gap-2">
                <MoreHorizontal size={20} className="text-primary" /> Opciones
              </h2>
              <button onClick={() => setOptionsMenuOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-all">
                <span className="text-muted-foreground text-lg">×</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-5">Selecciona una acción</p>
            <div className="grid grid-cols-2 gap-3">
              {!isCashier && (
                <button onClick={() => { setOptionsMenuOpen(false); navigate('/kitchen'); }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-muted/50 transition-all active:scale-95"
                  data-testid="opt-cocina">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
                    <ChefHat size={20} className="text-orange-500" />
                  </div>
                  <span className="font-semibold text-sm">Cocina</span>
                </button>
              )}
              {hasPermission('access_caja') && (
                <button onClick={() => { setOptionsMenuOpen(false); navigate('/cash-register'); }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-muted/50 transition-all active:scale-95"
                  data-testid="opt-caja">
                  <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                    <CircleDollarSign size={20} className="text-green-500" />
                  </div>
                  <span className="font-semibold text-sm">Caja</span>
                </button>
              )}
              {hasPermission('manage_reservations') && (
                <button onClick={() => { setOptionsMenuOpen(false); navigate('/reservations'); }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-muted/50 transition-all active:scale-95"
                  data-testid="opt-reservas">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                    <CalendarDays size={20} className="text-blue-500" />
                  </div>
                  <span className="font-semibold text-sm">Reservas</span>
                </button>
              )}
              {filteredNav.length >= 0 && (() => {
                const configPerms = [
                  'config_users','config_mesas','config_ventas','config_productos','config_inventario',
                  'config_impresion','config_estacion','config_reportes','config_clientes',
                  'config_impuestos','config_ncf','config_apariencia','config_sistema','config_descuentos',
                  'manage_users','manage_tables','manage_areas','manage_products','manage_payment_methods',
                  'manage_cancellation_reasons','manage_sale_types','manage_print_channels',
                  'manage_station_config','manage_inventory','manage_suppliers','manage_customers',
                ];
                return configPerms.some(p => hasPermission(p));
              })() && (
                <button onClick={() => { setOptionsMenuOpen(false); navigate('/settings'); }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-muted/50 transition-all active:scale-95"
                  data-testid="opt-config">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                    <Settings size={20} className="text-purple-500" />
                  </div>
                  <span className="font-semibold text-sm">Config</span>
                </button>
              )}
              {hasPermission('close_day') && (
                <button onClick={() => { setOptionsMenuOpen(false); setBusinessDayDialogOpen(true); }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-red-500/50 hover:bg-red-500/5 transition-all active:scale-95"
                  data-testid="opt-cierre-dia">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                    <Lock size={20} className="text-red-500" />
                  </div>
                  <span className="font-semibold text-sm">Cierre de Día</span>
                </button>
              )}
              {/* Ayuda - disponible para todos */}
              <button onClick={() => { setOptionsMenuOpen(false); navigate('/help'); }}
                className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-blue-500/50 hover:bg-blue-500/5 transition-all active:scale-95"
                data-testid="opt-ayuda">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <HelpCircle size={20} className="text-blue-500" />
                </div>
                <span className="font-semibold text-sm">Ayuda</span>
              </button>
              {/* Nota de Crédito E34 - solo para usuarios con permiso */}
              {(isAdmin || hasPermission('manage_credit_notes')) && (
                <button onClick={() => { setOptionsMenuOpen(false); resetCreditNoteModal(); setCreditNoteModalOpen(true); }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-amber-500/50 hover:bg-amber-500/5 transition-all active:scale-95"
                  data-testid="opt-nota-credito">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <ReceiptText size={20} className="text-amber-500" />
                  </div>
                  <span className="font-semibold text-sm">Nota de Crédito</span>
                </button>
              )}
              {(isAdmin || hasPermission('view_ecf_dashboard')) && (
                <button onClick={async () => {
                  setOptionsMenuOpen(false);
                  setEcfPeriod('jornada');
                  await fetchEcfDashboard('jornada');
                  setEcfDashboardOpen(true);
                  markRejectionsSeen();
                }}
                  className="relative flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all active:scale-95"
                  data-testid="opt-ecf-dashboard">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <FileText size={20} className="text-emerald-500" />
                  </div>
                  <span className="font-semibold text-sm">e-CF Dashboard</span>
                  {unseenRejectionCount > 0 && (
                    <span
                      data-testid="ecf-rejection-badge-option"
                      className="ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shadow-lg animate-pulse"
                      title={`${unseenRejectionCount} rechazo(s) DGII nuevo(s)`}
                    >
                      {unseenRejectionCount > 9 ? '9+' : unseenRejectionCount}
                    </span>
                  )}
                </button>
              )}
            </div>
            <button onClick={() => setOptionsMenuOpen(false)}
              className="mt-5 w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-all">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Clock Out Dialog - No PIN needed, user is already authenticated */}
      <Dialog open={clockOutDialogOpen} onOpenChange={setClockOutDialogOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center justify-center gap-2">
              <Clock size={20} className="text-red-400" /> Marcar Salida
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">¿Deseas registrar tu salida, <strong>{user?.name}</strong>?</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setClockOutDialogOpen(false)} className="flex-1 h-11 font-oswald">
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                setClockOutLoading(true);
                try {
                  const res = await api.post('/attendance/auto-clock-out');
                  notify.success(res.data.message, { duration: 8000 });
                  setClockOutDialogOpen(false);
                  logout();
                } catch (e) {
                  notify.error(e.response?.data?.detail || 'Error de conexión');
                }
                setClockOutLoading(false);
              }}
              disabled={clockOutLoading}
              className="flex-1 h-11 bg-red-500 hover:bg-red-600 text-white font-oswald font-bold"
              data-testid="confirm-clock-out-btn"
            >
              {clockOutLoading ? 'Procesando...' : 'CONFIRMAR SALIDA'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change PIN Dialog */}
      <Dialog open={changePinOpen} onOpenChange={setChangePinOpen}>
        <DialogContent className="max-w-xs sm:max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center justify-center gap-2">
              <Lock size={20} className="text-primary" /> Cambiar PIN
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground text-center">Ingresa tu nuevo PIN, {user?.name}</p>
          <PinPad
            value={newPinValue}
            onChange={setNewPinValue}
            onSubmit={async (pin) => {
              try {
                await api.put(`/users/me/pin`, { pin });
                notify.success('PIN actualizado correctamente');
                setChangePinOpen(false);
                setNewPinValue('');
              } catch (e) {
                if (e.response?.data?.detail === 'PIN_ALREADY_IN_USE') {
                  notify.error('Esta clave ya está en uso');
                } else {
                  notify.error('Error de conexión');
                }
                setNewPinValue('');
              }
            }}
            maxLength={8}
            placeholder="Nuevo PIN"
            forceKeypad
          />
          <button type="button" onClick={() => { setChangePinOpen(false); setNewPinValue(''); }}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-2">Cancelar</button>
        </DialogContent>
      </Dialog>

      {/* Credit Note E34 Modal */}
      <Dialog open={creditNoteModalOpen} onOpenChange={(open) => { if (!open) { setCreditNoteModalOpen(false); resetCreditNoteModal(); } else { setCreditNoteModalOpen(true); } }}>
        <DialogContent className="max-w-lg mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="text-amber-500" size={22} />
              Generar Nota de Crédito E34
            </DialogTitle>
            <DialogDescription>
              {creditNoteStep === 1 && 'Busca la factura a la que deseas generar nota de crédito'}
              {creditNoteStep === 2 && 'Confirma los datos y proporciona el motivo'}
              {creditNoteStep === 3 && (creditNoteResult?.ok ? 'Nota de crédito generada exitosamente' : 'Error al generar nota de crédito')}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Search */}
          {creditNoteStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={creditNoteSearch}
                  onChange={e => { setCreditNoteSearch(e.target.value); setCreditNoteSearchError(null); }}
                  onKeyDown={e => e.key === 'Enter' && searchBillForCreditNote()}
                  placeholder="Número de transacción o e-NCF"
                  className={`flex-1 px-3 py-2 bg-background border rounded-lg text-sm ${creditNoteSearchError ? 'border-red-500' : 'border-border'}`}
                  data-testid="credit-note-search-input"
                />
                <Button onClick={searchBillForCreditNote} disabled={creditNoteLoading} className="min-w-[100px]">
                  {creditNoteLoading ? <Loader2 className="animate-spin" size={16} /> : <><Search size={16} className="mr-1" /> Buscar</>}
                </Button>
              </div>

              {/* Error Message */}
              {creditNoteSearchError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                  <XCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-500">{creditNoteSearchError}</p>
                </div>
              )}

              {creditNoteBill && (
                <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-muted-foreground">e-NCF Original</p>
                      <p className="font-mono font-bold text-primary">{creditNoteBill.ecf_encf || creditNoteBill.ncf || 'N/A'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total a Acreditar</p>
                      <p className="font-bold text-lg text-amber-500">RD$ {(creditNoteBill.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Mesa:</span> {creditNoteBill.table_number || 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cajero:</span> {creditNoteBill.cashier_name || 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fecha:</span> {creditNoteBill.paid_at ? new Date(creditNoteBill.paid_at).toLocaleDateString('es-DO') : 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Trans:</span> {creditNoteBill.transaction_number || 'N/A'}
                    </div>
                  </div>

                  {creditNoteBill.items?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Items ({creditNoteBill.items.filter(i => i.status !== 'cancelled').length})</p>
                      <div className="max-h-24 overflow-y-auto text-xs space-y-1">
                        {creditNoteBill.items.filter(i => i.status !== 'cancelled').slice(0, 5).map((item, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{item.quantity}x {item.product_name}</span>
                            <span>RD$ {((item.quantity || 1) * (item.unit_price || 0)).toFixed(2)}</span>
                          </div>
                        ))}
                        {creditNoteBill.items.filter(i => i.status !== 'cancelled').length > 5 && (
                          <p className="text-muted-foreground">...y {creditNoteBill.items.filter(i => i.status !== 'cancelled').length - 5} más</p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button onClick={() => setCreditNoteStep(2)} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                    Continuar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Confirm */}
          {creditNoteStep === 2 && creditNoteBill && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-xl p-4 border border-border">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-mono text-primary">{creditNoteBill.ecf_encf}</span>
                  <span className="font-bold text-amber-500">RD$ {(creditNoteBill.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Se generará una Nota de Crédito E34 por el 100% del total de esta factura.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Motivo de la nota de crédito *</label>
                <textarea
                  value={creditNoteReason}
                  onChange={e => setCreditNoteReason(e.target.value)}
                  placeholder="Ej: Error en facturación, devolución de producto..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm min-h-[80px]"
                  data-testid="credit-note-reason-input"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCreditNoteStep(1)} className="flex-1">
                  Atrás
                </Button>
                <Button 
                  onClick={() => setCreditNoteConfirmOpen(true)} 
                  disabled={!creditNoteReason.trim()}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Generar E34
                </Button>
              </div>

              {/* Confirmation Dialog */}
              <Dialog open={creditNoteConfirmOpen} onOpenChange={setCreditNoteConfirmOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-500">
                      <AlertTriangle size={20} /> Confirmar Generación
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground py-2">
                    ¿Está seguro? Esta acción generará una <strong>Nota de Crédito E34</strong> ante la DGII y <strong>no puede deshacerse</strong>.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCreditNoteConfirmOpen(false)} className="flex-1">
                      Cancelar
                    </Button>
                    <Button onClick={generateE34} disabled={creditNoteLoading} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white">
                      {creditNoteLoading ? <Loader2 className="animate-spin mr-1" size={16} /> : null}
                      Sí, generar E34
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Step 3: Result */}
          {creditNoteStep === 3 && (
            <div className="space-y-4 py-2">
              {creditNoteResult?.ok ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-500/15 flex items-center justify-center">
                    <CheckCircle size={32} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">Nota de Crédito Generada</p>
                    <p className="font-mono text-xl text-primary mt-1">{creditNoteResult.ecf_encf}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Total acreditado: <strong>RD$ {(creditNoteResult.total_reversed || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>
                  </p>
                  {creditNoteResult.ecf_status === 'error' && (
                    <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-600">
                      Advertencia: {creditNoteResult.ecf_error || 'Error al enviar a DGII'}
                    </div>
                  )}
                  <Button onClick={() => { setCreditNoteModalOpen(false); resetCreditNoteModal(); }} className="w-full">
                    Cerrar
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 flex items-center justify-center">
                    <XCircle size={32} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-500">Error</p>
                    <p className="text-sm text-muted-foreground mt-1">{creditNoteResult?.error || 'Error desconocido'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCreditNoteStep(1)} className="flex-1">
                      Intentar de nuevo
                    </Button>
                    <Button onClick={() => { setCreditNoteModalOpen(false); resetCreditNoteModal(); }} className="flex-1">
                      Cerrar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
