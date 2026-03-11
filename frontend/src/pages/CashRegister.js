import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { posSessionsAPI, businessDaysAPI, formatMoney } from '@/lib/api';
import { CircleDollarSign, Play, Square, Clock, Banknote, CreditCard, AlertTriangle, TrendingUp, ArrowDownCircle, ArrowUpCircle, History, Wallet, CheckCircle2, Calculator, Coins, Receipt, RefreshCw, FileX, Search, Printer, X, Calendar, Lock, KeyRound, Tag, XCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import CreditNoteModal from '@/components/CreditNoteModal';
import ReportXZ from '@/components/ReportXZ';
import { NumericInput } from '@/components/NumericKeypad';
import { PinPad } from '@/components/PinPad';

// Denominaciones de billetes y monedas RD (estructura del usuario)
const DENOMINACIONES = [
  {"label": "RD$ 2,000", "valor": 2000, "tipo": "billete"},
  {"label": "RD$ 1,000", "valor": 1000, "tipo": "billete"},
  {"label": "RD$ 500", "valor": 500, "tipo": "billete"},
  {"label": "RD$ 200", "valor": 200, "tipo": "billete"},
  {"label": "RD$ 100", "valor": 100, "tipo": "billete"},
  {"label": "RD$ 50", "valor": 50, "tipo": "billete"},
  {"label": "RD$ 25", "valor": 25, "tipo": "moneda"},
  {"label": "RD$ 10", "valor": 10, "tipo": "moneda"},
  {"label": "RD$ 5", "valor": 5, "tipo": "moneda"},
  {"label": "RD$ 1", "valor": 1, "tipo": "moneda"}
];

// Colores por denominación
const COLORES_DENOMINACION = {
  2000: 'bg-violet-500',
  1000: 'bg-blue-500',
  500: 'bg-emerald-500',
  200: 'bg-orange-500',
  100: 'bg-red-500',
  50: 'bg-cyan-500',
  25: 'bg-yellow-500',
  10: 'bg-amber-500',
  5: 'bg-zinc-400',
  1: 'bg-zinc-500'
};

export default function CashRegister() {
  const { user, logout } = useAuth();
  const [currentSession, setCurrentSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [terminals, setTerminals] = useState([]);
  const [terminalsInUse, setTerminalsInUse] = useState({});
  
  // Form states
  const [selectedTerminal, setSelectedTerminal] = useState('');
  const [terminalName, setTerminalName] = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  
  // Closing form with denomination breakdown
  const [denominationCounts, setDenominationCounts] = useState(
    DENOMINACIONES.reduce((acc, d) => ({ ...acc, [d.valor]: 0 }), {})
  );
  const [cardDeclared, setCardDeclared] = useState('');
  const [transferDeclared, setTransferDeclared] = useState('');
  const [differenceNotes, setDifferenceNotes] = useState('');
  
  // Movement form
  const [movementForm, setMovementForm] = useState({
    movement_type: 'cash_in',
    amount: '',
    description: '',
    reason_code: '',
    notes: ''
  });
  
  // Credit Note Modal (B04)
  const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
  const [pendingB04Transaction, setPendingB04Transaction] = useState(null);
  
  // Estado para diálogo de error por mesas abiertas
  const [openTablesError, setOpenTablesError] = useState({ show: false, message: '' });
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [reprintLoading, setReprintLoading] = useState(false);
  const [movementSearch, setMovementSearch] = useState('');
  
  // Cierre de Día
  const [closeDayDialog, setCloseDayDialog] = useState(false);
  const [closeDayPin, setCloseDayPin] = useState('');
  const [closeDayNotes, setCloseDayNotes] = useState('');
  const [closeDayLoading, setCloseDayLoading] = useState(false);
  
  // Re-imprimir reporte
  const [reprintSessionId, setReprintSessionId] = useState(null);
  const [logoutAfterReport, setLogoutAfterReport] = useState(false);
  
  // Teclado flotante para campos de monto
  const [floatingKeypad, setFloatingKeypad] = useState({ open: false, field: null, value: '' });
  
  // Desglose detallado de ventas por forma de pago
  const [salesBreakdown, setSalesBreakdown] = useState(null);
  
  // Check URL params for B04 redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openB04') === 'true') {
      // Get pending transaction from sessionStorage
      const pendingTrans = sessionStorage.getItem('pendingB04Transaction');
      if (pendingTrans) {
        setPendingB04Transaction(parseInt(pendingTrans, 10));
        sessionStorage.removeItem('pendingB04Transaction');
      }
      // Open B04 modal
      setCreditNoteModalOpen(true);
      // Clean URL
      window.history.replaceState({}, '', '/cash-register');
    }
  }, []);
  
  // Default terminals if none configured
  const defaultTerminals = [
    { id: null, code: 'POS1', name: 'Caja 1' },
    { id: null, code: 'POS2', name: 'Caja 2' },
    { id: null, code: 'BAR1', name: 'Barra' },
    { id: null, code: 'TERR', name: 'Terraza' },
    { id: null, code: 'VIP', name: 'VIP' }
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: Get current session + independent data IN PARALLEL (skip check — redundant)
      const [currentResult, historyRes, termRes] = await Promise.all([
        posSessionsAPI.current().catch(() => ({ data: null })),
        posSessionsAPI.history({ limit: 20, status: 'closed' }).catch(() => ({ data: [] })),
        posSessionsAPI.terminals().catch(() => ({ data: defaultTerminals })),
      ]);

      setSessions(historyRes.data || []);

      // Set terminals
      const terminalsData = termRes.data?.length > 0 ? termRes.data : defaultTerminals;
      setTerminals(terminalsData);
      posSessionsAPI.terminalsInUse().then(r => setTerminalsInUse(r.data || {})).catch(() => {
        const inUse = {};
        terminalsData.forEach(t => { if (t.in_use) inUse[t.name] = t.in_use_by || 'En uso'; });
        setTerminalsInUse(inUse);
      });
      const availableTerminal = terminalsData.find(t => !t.in_use);
      if (availableTerminal && !terminalName) {
        setSelectedTerminal(availableTerminal.id);
        setTerminalName(availableTerminal.name);
      }

      // Step 2: If has open session, load movements + sync
      const sessionData = currentResult.data;
      if (sessionData?.id && sessionData?.status === 'open') {
        setCurrentSession(sessionData);
        const sid = sessionData.id;
        
        // Step 3: Sync + movements + breakdown IN PARALLEL
        const [syncResult, movResult, breakdownResult] = await Promise.allSettled([
          fetch(`${process.env.REACT_APP_BACKEND_URL}/api/pos-sessions/${sid}/sync-sales`, {
            method: 'PUT', headers: { 'Authorization': `Bearer ${localStorage.getItem('pos_token')}` }
          }),
          posSessionsAPI.getMovements(sid),
          posSessionsAPI.salesBreakdown(sid),
        ]);

        if (movResult.status === 'fulfilled') setMovements(movResult.value.data || []);
        if (breakdownResult.status === 'fulfilled') setSalesBreakdown(breakdownResult.value.data);

        // Refresh session after sync
        if (syncResult.status === 'fulfilled' && syncResult.value?.ok) {
          posSessionsAPI.current().then(r => setCurrentSession(r.data)).catch(() => {});
        }
      } else {
        setCurrentSession(null);
        setMovements([]);
      }
    } catch (err) {
      console.error('Error fetching session data:', err);
      toast.error('Error cargando datos de caja');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calculate total from denomination counts
  const totalDeclarado = Object.entries(denominationCounts).reduce(
    (total, [valor, cantidad]) => total + (parseInt(valor) * cantidad), 0
  );

  // Calculate expected cash (total_esperado) - Solo efectivo RD$ en caja
  const totalEsperado = currentSession ? (
    (currentSession.opening_amount || 0) +
    (salesBreakdown?.cash_rd ?? currentSession.cash_sales ?? 0) +
    (currentSession.cash_in || 0) -
    (currentSession.cash_out || 0)
  ) : 0;

  const totalSales = currentSession ? (
    (currentSession.cash_sales || 0) +
    (currentSession.card_sales || 0) +
    (currentSession.transfer_sales || 0) +
    (currentSession.other_sales || 0)
  ) : 0;

  // Diferencia = Declarado - Esperado
  const diferenciaCaja = totalDeclarado - totalEsperado;
  
  // Determinar estado de alerta
  const getAlertStatus = () => {
    if (Math.abs(diferenciaCaja) < 1) return { type: 'success', text: 'Cuadrado', color: 'text-green-400' };
    if (diferenciaCaja > 0) return { type: 'surplus', text: 'Sobrante', color: 'text-emerald-400' };
    if (diferenciaCaja < 0 && Math.abs(diferenciaCaja) <= 50) return { type: 'minor', text: 'Faltante menor', color: 'text-yellow-400' };
    return { type: 'major', text: 'Descuadre', color: 'text-red-400' };
  };

  const handleOpenSession = async () => {
    // Validar que haya un terminal seleccionado
    if (!terminalName) {
      toast.error('Selecciona una estación', {
        description: 'Debes seleccionar una estación disponible'
      });
      return;
    }
    
    // Validar que el terminal no esté en uso
    if (terminalsInUse[terminalName]) {
      toast.error('Estación no disponible', {
        description: `${terminalName} ya está en uso por ${terminalsInUse[terminalName]}`
      });
      return;
    }
    
    try {
      const res = await posSessionsAPI.open({
        terminal_id: selectedTerminal || null,
        terminal_name: terminalName,
        opening_amount: parseFloat(openingAmount) || 0
      });
      
      setCurrentSession(res.data);
      toast.success('Turno abierto correctamente', {
        description: `${res.data.ref} - ${res.data.terminal_name}`
      });
      setOpenDialog(false);
      setOpeningAmount('');
      fetchData();
    } catch (err) {
      toast.error('Error abriendo turno', {
        description: err.response?.data?.detail || 'Intenta de nuevo'
      });
    }
  };

  const handleCloseSession = async () => {
    if (!currentSession) return;
    
    // Build cash breakdown object con estructura detallada
    const cashBreakdown = {
      denominaciones: {},
      total_declarado: totalDeclarado,
      total_esperado: totalEsperado,
      diferencia: diferenciaCaja,
      fecha_arqueo: new Date().toISOString()
    };
    
    DENOMINACIONES.forEach(d => {
      const cantidad = denominationCounts[d.valor] || 0;
      cashBreakdown.denominaciones[d.valor] = {
        label: d.label,
        tipo: d.tipo,
        cantidad: cantidad,
        subtotal: d.valor * cantidad
      };
    });
    
    try {
      const res = await posSessionsAPI.close(currentSession.id, {
        cash_declared: totalDeclarado,
        card_declared: parseFloat(cardDeclared) || 0,
        transfer_declared: parseFloat(transferDeclared) || 0,
        cash_breakdown: cashBreakdown,
        difference_notes: differenceNotes
      });
      
      const alertStatus = getAlertStatus();
      if (alertStatus.type === 'major') {
        toast.error('⚠️ ALERTA: Descuadre de caja', {
          description: `Diferencia: ${formatMoney(diferenciaCaja)} - Requiere revisión`
        });
      } else if (alertStatus.type === 'minor') {
        toast.warning('Turno cerrado con faltante menor', {
          description: `Diferencia: ${formatMoney(diferenciaCaja)}`
        });
      } else if (alertStatus.type === 'surplus') {
        toast.info('Turno cerrado con sobrante', {
          description: `Diferencia: ${formatMoney(diferenciaCaja)}`
        });
      } else {
        toast.success('Turno cerrado - Caja cuadrada');
      }
      
      setCurrentSession(null);
      setCloseDialog(false);
      resetClosingForm();
      fetchData();
      
      // Abrir automáticamente el Reporte X para imprimir
      if (res.data?.session_id) {
        setReprintSessionId(res.data.session_id);
        setLogoutAfterReport(true);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      // Si el error es por mesas abiertas o turnos activos, mostrar dialogo dedicado
      if (err.response?.status === 400 && (detail.includes('cuenta') || detail.includes('turno') || detail.includes('No se puede cerrar'))) {
        setOpenTablesError({ show: true, message: detail });
      } else {
        toast.error('Error cerrando turno', {
          description: detail || 'Intenta de nuevo'
        });
      }
    }
  };

  const resetClosingForm = () => {
    setDenominationCounts(DENOMINACIONES.reduce((acc, d) => ({ ...acc, [d.valor]: 0 }), {}));
    setCardDeclared('');
    setTransferDeclared('');
    setDifferenceNotes('');
  };

  const handleAddMovement = async () => {
    if (!currentSession || !movementForm.amount || !movementForm.description) {
      toast.error('Completa los campos requeridos');
      return;
    }
    
    try {
      await posSessionsAPI.addMovement(currentSession.id, {
        movement_type: movementForm.movement_type,
        amount: parseFloat(movementForm.amount),
        description: movementForm.description,
        reason_code: movementForm.reason_code || null,
        notes: movementForm.notes || null,
        payment_method: 'cash'
      });
      
      toast.success('Movimiento registrado');
      setMovementDialog(false);
      setMovementForm({ movement_type: 'cash_in', amount: '', description: '', reason_code: '', notes: '' });
      fetchData();
    } catch (err) {
      toast.error('Error registrando movimiento', {
        description: err.response?.data?.detail
      });
    }
  };

  // Re-imprimir factura desde movimiento seleccionado
  const handleReprint = async () => {
    if (!selectedMovement) return;
    
    setReprintLoading(true);
    try {
      // Extraer el bill_id de la descripción del movimiento (formato: "Venta NCF - método")
      // El NCF está en la descripción, necesitamos buscar el bill
      const ncfMatch = selectedMovement.description?.match(/B\d{10}/);
      
      if (ncfMatch) {
        // Buscar el bill por NCF
        const searchRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/bills?ncf=${ncfMatch[0]}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
        });
        const bills = await searchRes.json();
        
        if (bills && bills.length > 0) {
          const bill = bills[0];
          // Enviar a imprimir
          const printRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/print/receipt/${bill.id}/send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
          });
          
          if (printRes.ok) {
            toast.success('Factura enviada a imprimir', {
              description: `NCF: ${ncfMatch[0]}`
            });
          } else {
            throw new Error('Error al enviar a imprimir');
          }
        } else {
          toast.error('No se encontró la factura');
        }
      } else {
        toast.error('Este movimiento no es una venta facturable');
      }
    } catch (err) {
      toast.error('Error al reimprimir', {
        description: err.message
      });
    } finally {
      setReprintLoading(false);
      setSelectedMovement(null);
    }
  };

  const updateDenomination = (valor, delta) => {
    setDenominationCounts(prev => ({
      ...prev,
      [valor]: Math.max(0, (prev[valor] || 0) + delta)
    }));
  };

  // Cierre de Día
  // Cierre de Día - estados adicionales
  const [closedDayId, setClosedDayId] = useState(null);
  
  const handleCloseDay = async () => {
    if (!closeDayPin) {
      toast.error('Ingresa el PIN de autorización');
      return;
    }
    setCloseDayLoading(true);
    try {
      const res = await businessDaysAPI.close({
        authorizer_pin: closeDayPin,
        closing_notes: closeDayNotes || '',
        force_close: false
      });
      toast.success('Jornada cerrada exitosamente');
      setCloseDayDialog(false);
      setCloseDayPin('');
      setCloseDayNotes('');
      
      // Show Z report then force logout
      if (res.data?.day_id || res.data?.id) {
        setClosedDayId(res.data.day_id || res.data.id);
      }
      
      // Force logout after Cierre Z - brief delay to let user see the toast
      if (res.data?.force_logout) {
        setTimeout(() => {
          logout();
          toast.info('Jornada cerrada. Se requiere nuevo login para iniciar la próxima jornada.');
        }, 2000);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || 'Error al cerrar jornada';
      // Si el error es por turnos/cuentas abiertas, mostrar dialogo detallado
      if (err.response?.status === 400 && (detail.includes('cuenta') || detail.includes('turno') || detail.includes('No se puede cerrar'))) {
        setOpenTablesError({ show: true, message: detail });
      } else {
        toast.error('No se puede cerrar la jornada', {
          description: detail
        });
      }
    } finally {
      setCloseDayLoading(false);
    }
  };

  // Re-imprimir Reporte X de un turno cerrado
  const handleReprintReport = async (sessionId) => {
    try {
      toast.info('Generando reporte...');
      setReprintSessionId(sessionId);
      // El reporte se abre en el componente ReportXZ
    } catch (err) {
      toast.error('Error generando reporte');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="cash-register-page">
      {/* Header */}
      <div className="px-4 py-3 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleDollarSign size={22} className="text-orange-400" />
          <h1 className="font-oswald text-xl font-bold tracking-wide text-white">CAJA / TURNOS</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={fetchData} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all">
            <RefreshCw size={16} />
          </button>
          {/* Botón Nota de Crédito B04 - Solo para Admin */}
          {user?.role === 'admin' && (
            <button 
              onClick={() => setCreditNoteModalOpen(true)} 
              data-testid="credit-note-btn"
              className="px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-400 font-medium text-sm flex items-center gap-2 transition-all"
              title="Re-abrir Transacción (Nota de Crédito B04)"
            >
              <FileX size={16} /> B04
            </button>
          )}
          {/* Botón Cierre de Día - Solo para Admin */}
          {user?.role === 'admin' && !currentSession && (
            <button 
              onClick={() => setCloseDayDialog(true)} 
              data-testid="close-day-btn"
              className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 text-amber-400 font-medium text-sm flex items-center gap-2 transition-all"
              title="Cierre de Día (Z)"
            >
              <Calendar size={16} /> CIERRE Z
            </button>
          )}
          {currentSession && (
            <button onClick={() => setMovementDialog(true)} data-testid="add-movement-btn"
              className="px-3 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 text-blue-400 font-medium text-sm flex items-center gap-2 transition-all">
              <Wallet size={16} /> Movimiento
            </button>
          )}
          {!currentSession ? (
            <button onClick={() => setOpenDialog(true)} data-testid="open-shift-btn"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-oswald font-bold active:scale-95 flex items-center gap-2 transition-all whitespace-nowrap">
              <Play size={16} /> ABRIR TURNO
            </button>
          ) : (
            <button onClick={() => setCloseDialog(true)} data-testid="close-shift-btn"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-oswald font-bold active:scale-95 flex items-center gap-2 transition-all whitespace-nowrap">
              <Square size={16} /> CERRAR TURNO
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {/* Current Session Card */}
        {currentSession && (
          <div className="max-w-3xl mx-auto mb-8" data-testid="current-session">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
              <div className="bg-green-500/20 border-b border-green-500/30 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-oswald text-lg font-bold text-white">Turno Activo</h2>
                  <p className="text-xs text-white/60">{currentSession.ref} - {currentSession.terminal_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500 animate-pulse text-white">En Curso</Badge>
                  <span className="text-xs text-white/50">{currentSession.opened_by_name}</span>
                </div>
              </div>
              
              {/* Stats Grid */}
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-cash-rd">
                  <Banknote size={20} className="mx-auto mb-1 text-green-400" />
                  <p className="text-[10px] text-white/50 uppercase">Efectivo RD$</p>
                  <p className="font-oswald text-lg font-bold text-green-400">{formatMoney(salesBreakdown?.cash_rd ?? currentSession.cash_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-card">
                  <CreditCard size={20} className="mx-auto mb-1 text-blue-400" />
                  <p className="text-[10px] text-white/50 uppercase">Tarjeta</p>
                  <p className="font-oswald text-lg font-bold text-blue-400">{formatMoney(salesBreakdown?.card ?? currentSession.card_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-transfer">
                  <RefreshCw size={20} className="mx-auto mb-1 text-purple-400" />
                  <p className="text-[10px] text-white/50 uppercase">Transferencia</p>
                  <p className="font-oswald text-lg font-bold text-purple-400">{formatMoney(salesBreakdown?.transfer ?? currentSession.transfer_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-usd">
                  <CircleDollarSign size={20} className="mx-auto mb-1 text-yellow-400" />
                  <p className="text-[10px] text-white/50 uppercase">USD Dolar</p>
                  <p className="font-oswald text-lg font-bold text-yellow-400">{formatMoney(salesBreakdown?.usd ?? 0)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-eur">
                  <Coins size={20} className="mx-auto mb-1 text-cyan-400" />
                  <p className="text-[10px] text-white/50 uppercase">Euro</p>
                  <p className="font-oswald text-lg font-bold text-cyan-400">{formatMoney(salesBreakdown?.eur ?? 0)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-total-sales">
                  <TrendingUp size={20} className="mx-auto mb-1 text-orange-400" />
                  <p className="text-[10px] text-white/50 uppercase">Total Ventas</p>
                  <p className="font-oswald text-lg font-bold text-orange-400">{formatMoney(salesBreakdown?.total ?? totalSales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-discounts">
                  <Tag size={20} className="mx-auto mb-1 text-rose-400" />
                  <p className="text-[10px] text-white/50 uppercase">Descuentos</p>
                  <p className="font-oswald text-lg font-bold text-rose-400">-{formatMoney(salesBreakdown?.discounts ?? 0)}</p>
                  <p className="text-[9px] text-white/40">{salesBreakdown?.discounts_count ?? 0} facturas</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-cash-in">
                  <ArrowUpCircle size={20} className="mx-auto mb-1 text-emerald-400" />
                  <p className="text-[10px] text-white/50 uppercase">Ingresos</p>
                  <p className="font-oswald text-lg font-bold text-emerald-400">{formatMoney(currentSession.cash_in)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-cash-out">
                  <ArrowDownCircle size={20} className="mx-auto mb-1 text-red-400" />
                  <p className="text-[10px] text-white/50 uppercase">Retiros</p>
                  <p className="font-oswald text-lg font-bold text-red-400">-{formatMoney(salesBreakdown?.withdrawals ?? currentSession.cash_out ?? 0)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-voids">
                  <XCircle size={20} className="mx-auto mb-1 text-orange-500" />
                  <p className="text-[10px] text-white/50 uppercase">Anulaciones</p>
                  <p className="font-oswald text-lg font-bold text-orange-500">-{formatMoney(salesBreakdown?.voids_total ?? 0)}</p>
                  <p className="text-[9px] text-white/40">{salesBreakdown?.voids_count ?? 0} anuladas</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10" data-testid="stat-credit-notes">
                  <FileText size={20} className="mx-auto mb-1 text-amber-400" />
                  <p className="text-[10px] text-white/50 uppercase">Notas Credito</p>
                  <p className="font-oswald text-lg font-bold text-amber-400">-{formatMoney(salesBreakdown?.credit_notes_total ?? 0)}</p>
                  <p className="text-[9px] text-white/40">{salesBreakdown?.credit_notes_count ?? 0} B04</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-green-500/10 border border-green-500/30" data-testid="stat-cash-balance">
                  <Wallet size={20} className="mx-auto mb-1 text-green-300" />
                  <p className="text-[10px] text-green-300/70 uppercase font-bold">Balance Efectivo</p>
                  <p className="font-oswald text-xl font-bold text-green-300">{formatMoney(salesBreakdown?.cash_balance ?? 0)}</p>
                  <p className="text-[9px] text-white/40">Apertura + Ventas - Retiros</p>
                </div>
              </div>
              
              {/* Expected Cash - Solo visible para admin, oculto para cajeros para conteo ciego */}
              {user?.role === 'admin' && (
                <div className="px-6 pb-4">
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-yellow-400 font-medium">Efectivo Esperado en Caja</p>
                      <p className="text-[10px] text-white/50">Apertura + Ventas Efectivo + Ingresos - Retiros</p>
                    </div>
                    <p className="font-oswald text-2xl font-bold text-yellow-400">{formatMoney(totalEsperado)}</p>
                  </div>
                </div>
              )}
              
              {/* Footer info */}
              <div className="px-6 pb-4 flex items-center justify-between text-xs text-white/50">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Abierto: {new Date(currentSession.opened_at).toLocaleString('es-DO')}
                </span>
                <span className="flex items-center gap-1">
                  <CircleDollarSign size={12} /> Apertura: {formatMoney(currentSession.opening_amount)}
                </span>
                <span className="flex items-center gap-1">
                  <Receipt size={12} /> {currentSession.total_invoices} facturas
                </span>
              </div>
            </div>
            
            {/* Recent Movements with Search and Reprint */}
            {movements.length > 0 && (
              <div className="mt-4">
                <h3 className="font-oswald text-sm font-bold text-white/50 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <History size={14} /> Movimientos del Turno
                </h3>
                
                {/* Buscador Inteligente */}
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Buscar por NCF, # orden, monto, descripción..."
                    value={movementSearch}
                    onChange={(e) => setMovementSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white text-sm placeholder:text-white/30 focus:border-orange-400/50 focus:outline-none transition-all"
                    data-testid="movement-search"
                  />
                  {movementSearch && (
                    <button 
                      onClick={() => setMovementSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                
                {/* Lista de Movimientos Filtrada */}
                <div className="space-y-2 max-h-64 overflow-auto">
                  {movements
                    .filter(mov => {
                      if (!movementSearch) return true;
                      const search = movementSearch.toLowerCase();
                      // Extraer número de transacción de la descripción (ej: "Venta B0100000186")
                      const transMatch = mov.description?.match(/#?(\d+)/);
                      const transNum = transMatch ? transMatch[1] : '';
                      return (
                        mov.description?.toLowerCase().includes(search) ||
                        mov.ref?.toLowerCase().includes(search) ||
                        mov.payment_method?.toLowerCase().includes(search) ||
                        String(mov.amount).includes(search) ||
                        transNum.includes(search)
                      );
                    })
                    .slice(0, 20)
                    .map(mov => (
                    <div 
                      key={mov.id} 
                      onClick={() => setSelectedMovement(selectedMovement?.id === mov.id ? null : mov)}
                      className={`backdrop-blur-xl border rounded-lg p-3 flex items-center justify-between cursor-pointer transition-all ${
                        selectedMovement?.id === mov.id 
                          ? 'bg-orange-500/20 border-orange-500/50 ring-1 ring-orange-400/30' 
                          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                      }`}
                      data-testid={`movement-${mov.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {mov.direction === 1 ? (
                          <ArrowUpCircle size={18} className="text-green-400" />
                        ) : (
                          <ArrowDownCircle size={18} className="text-red-400" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-white">{(mov.description || '').replace(/\[BILL:[^\]]+\]\s*/g, '')}</p>
                          <p className="text-[10px] text-white/50">{mov.ref} - {mov.payment_method} - {new Date(mov.created_at).toLocaleTimeString('es-DO')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className={`font-oswald text-base font-bold ${mov.direction === 1 ? 'text-green-400' : 'text-red-400'}`}>
                          {mov.direction === 1 ? '+' : '-'}{formatMoney(mov.amount)}
                        </p>
                        {selectedMovement?.id === mov.id && (
                          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                        )}
                      </div>
                    </div>
                  ))}
                  {movements.filter(mov => {
                    if (!movementSearch) return true;
                    const search = movementSearch.toLowerCase();
                    const transMatch = mov.description?.match(/#?(\d+)/);
                    const transNum = transMatch ? transMatch[1] : '';
                    return (
                      mov.description?.toLowerCase().includes(search) ||
                      mov.ref?.toLowerCase().includes(search) ||
                      mov.payment_method?.toLowerCase().includes(search) ||
                      String(mov.amount).includes(search) ||
                      transNum.includes(search)
                    );
                  }).length === 0 && (
                    <p className="text-center text-white/40 text-sm py-4">No se encontraron movimientos</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Session - Show prompt */}
        {!currentSession && (
          <div className="max-w-md mx-auto mt-12 text-center">
            <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-xl p-8">
              <CircleDollarSign size={48} className="mx-auto mb-4 text-orange-400/50" />
              <h2 className="font-oswald text-xl font-bold text-white mb-2">Sin Turno Abierto</h2>
              <p className="text-sm text-white/60 mb-6">
                Abre un turno para comenzar a registrar ventas y movimientos de caja.
              </p>
              <button onClick={() => setOpenDialog(true)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-oswald font-bold active:scale-95 flex items-center gap-2 mx-auto transition-all">
                <Play size={18} /> ABRIR TURNO
              </button>
            </div>
          </div>
        )}

        {/* Session History */}
        <div className="max-w-3xl mx-auto mt-8">
          <h3 className="font-oswald text-sm font-bold text-white/50 mb-3 uppercase tracking-wider">Historial de Turnos</h3>
          <div className="space-y-2">
            {sessions.map(session => (
              <div key={session.id} data-testid={`session-${session.id}`}
                className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{session.opened_by_name}</p>
                    <span className="text-white/30">-</span>
                    <p className="text-sm text-white/70">{session.terminal_name}</p>
                    {session.status === 'closed' ? (
                      <CheckCircle2 size={14} className="text-green-400" />
                    ) : session.status === 'pending_approval' ? (
                      <AlertTriangle size={14} className="text-yellow-400" />
                    ) : null}
                  </div>
                  <p className="text-[10px] text-white/50 font-mono">
                    {session.ref} | {new Date(session.opened_at).toLocaleString('es-DO')} → {session.closed_at ? new Date(session.closed_at).toLocaleTimeString('es-DO') : '-'}
                  </p>
                </div>
                <div className="text-right flex items-center gap-2">
                  {session.status === 'closed' && (
                    <button 
                      onClick={() => setReprintSessionId(session.id)}
                      data-testid={`reprint-report-${session.id}`}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-white/40 hover:text-cyan-400 transition-all"
                      title="Re-imprimir Reporte X"
                    >
                      <Printer size={14} />
                    </button>
                  )}
                  <div>
                    <p className="font-oswald text-base font-bold text-orange-400">
                      {formatMoney((session.cash_sales || 0) + (session.card_sales || 0) + (session.transfer_sales || 0))}
                    </p>
                    {session.total_difference && Math.abs(session.total_difference) > 0.01 && (
                      <p className={`text-[10px] ${session.total_difference > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        Dif: {formatMoney(session.total_difference)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-white/40 text-center py-4">No hay turnos cerrados</p>
            )}
          </div>
        </div>
      </div>

      {/* Open Session Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-sm backdrop-blur-xl bg-slate-900/90 border-white/20" data-testid="open-session-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white">Abrir Turno</DialogTitle>
            <DialogDescription className="text-white/60">Selecciona la estación e ingresa el monto inicial</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-white/60 mb-2 block">Estación / Terminal</label>
              <div className="grid grid-cols-2 gap-2">
                {terminals.map(t => {
                  const isInUse = t.in_use || terminalsInUse[t.name];
                  const inUseBy = t.in_use_by || terminalsInUse[t.name];
                  const isSelected = terminalName === t.name;
                  
                  return (
                    <button 
                      key={t.code} 
                      onClick={() => { 
                        if (!isInUse) {
                          setSelectedTerminal(t.id); 
                          setTerminalName(t.name); 
                        }
                      }}
                      disabled={isInUse}
                      className={`p-2.5 rounded-lg text-sm font-medium transition-all border relative ${
                        isInUse 
                          ? 'border-red-500/30 bg-red-500/10 text-red-400/60 cursor-not-allowed'
                          : isSelected 
                            ? 'border-orange-400 bg-orange-400/20 text-orange-400' 
                            : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
                      }`}
                    >
                      <span className="block">{t.name}</span>
                      {isInUse && (
                        <span className="text-[10px] block text-red-400/80 mt-0.5">
                          En uso: {inUseBy}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {Object.keys(terminalsInUse).length > 0 && (
                <p className="text-[10px] text-amber-400/70 mt-2 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500/50"></span>
                  Las estaciones en rojo ya tienen un turno activo
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block">Monto de Apertura (RD$)</label>
              <NumericInput label="Valor"
                value={openingAmount}
                onChange={e => setOpeningAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-oswald text-lg focus:border-orange-400/50 focus:bg-white/10 outline-none transition-all"
                data-testid="opening-amount-input"
              />
              <p className="text-[10px] text-white/40 mt-1">Cantidad de efectivo inicial en la caja</p>
            </div>
            <button onClick={handleOpenSession} data-testid="confirm-open-session"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-oswald font-bold active:scale-95 transition-all flex items-center justify-center gap-2">
              <Play size={18} /> ABRIR TURNO
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog - ARQUEO DE CAJA */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-2xl backdrop-blur-xl bg-slate-900/90 border-white/20 max-h-[90vh] overflow-y-auto" data-testid="close-session-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white flex items-center gap-2">
              <Calculator size={20} className="text-orange-400" />
              Arqueo de Caja
            </DialogTitle>
            <DialogDescription className="text-white/60">Cuenta los billetes y monedas para cerrar el turno</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Nota informativa - El cajero NO debe ver el total esperado */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-blue-400 text-sm text-center">
                Cuenta cuidadosamente todo el efectivo en tu caja
              </p>
            </div>

            {/* Denomination Counter */}
            <div>
              <h4 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
                <Coins size={16} /> Conteo de Efectivo
              </h4>
              
              {/* Bills */}
              <div className="mb-4">
                <p className="text-[10px] text-white/40 uppercase mb-2 flex items-center gap-1"><Banknote size={12} /> Billetes</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DENOMINACIONES.filter(d => d.tipo === 'billete').map(denom => (
                    <div key={denom.valor} className="bg-white/5 border border-white/10 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${COLORES_DENOMINACION[denom.valor]} text-white`}>{denom.label}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <button 
                          onClick={() => updateDenomination(denom.valor, -1)}
                          className="w-10 h-10 sm:w-8 sm:h-8 rounded bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-all shrink-0"
                        >-</button>
                        <NumericInput label="Valor"
                          value={denominationCounts[denom.valor]}
                          onChange={e => setDenominationCounts(prev => ({...prev, [denom.valor]: Math.max(0, parseInt(e.target.value) || 0)}))}
                          className="w-12 text-center bg-transparent text-white font-oswald text-lg border-none outline-none"
                        />
                        <button 
                          onClick={() => updateDenomination(denom.valor, 1)}
                          className="w-10 h-10 sm:w-8 sm:h-8 rounded bg-green-500/20 text-green-400 font-bold hover:bg-green-500/30 transition-all shrink-0"
                        >+</button>
                      </div>
                      <p className="text-[10px] text-white/50 text-center mt-1">
                        = {formatMoney(denom.valor * denominationCounts[denom.valor])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Coins */}
              <div>
                <p className="text-[10px] text-white/40 uppercase mb-2 flex items-center gap-1"><Coins size={12} /> Monedas</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DENOMINACIONES.filter(d => d.tipo === 'moneda').map(denom => (
                    <div key={denom.valor} className="bg-white/5 border border-white/10 rounded-lg p-2">
                      <div className="flex items-center justify-center mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${COLORES_DENOMINACION[denom.valor]} text-white`}>{denom.label}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <button 
                          onClick={() => updateDenomination(denom.valor, -1)}
                          className="w-10 h-10 sm:w-6 sm:h-6 rounded bg-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-all shrink-0"
                        >-</button>
                        <NumericInput label="Valor"
                          value={denominationCounts[denom.valor]}
                          onChange={e => setDenominationCounts(prev => ({...prev, [denom.valor]: Math.max(0, parseInt(e.target.value) || 0)}))}
                          className="w-10 text-center bg-transparent text-white font-oswald border-none outline-none"
                        />
                        <button 
                          onClick={() => updateDenomination(denom.valor, 1)}
                          className="w-10 h-10 sm:w-6 sm:h-6 rounded bg-green-500/20 text-green-400 text-sm font-bold hover:bg-green-500/30 transition-all shrink-0"
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Total Counted - Solo muestra el total sin comparaciones */}
            <div className="p-4 rounded-lg border bg-white/5 border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-white/70 font-medium">Total Efectivo Contado</span>
                <span className="font-oswald text-2xl font-bold text-white">{formatMoney(totalDeclarado)}</span>
              </div>
            </div>

            {/* Other payment methods - Teclado flotante */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-white/60 mb-1 block flex items-center gap-1">
                  <CreditCard size={14} /> Tarjeta Declarado
                </label>
                <button
                  type="button"
                  onClick={() => setFloatingKeypad({ open: true, field: 'card', value: cardDeclared || '' })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-left text-white font-oswald hover:border-blue-400/50 transition-all"
                  data-testid="card-declared-btn"
                >
                  {cardDeclared || <span className="text-white/30">0.00</span>}
                </button>
              </div>
              <div>
                <label className="text-sm font-semibold text-white/60 mb-1 block">Transferencias</label>
                <button
                  type="button"
                  onClick={() => setFloatingKeypad({ open: true, field: 'transfer', value: transferDeclared || '' })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-left text-white font-oswald hover:border-cyan-400/50 transition-all"
                  data-testid="transfer-declared-btn"
                >
                  {transferDeclared || <span className="text-white/30">0.00</span>}
                </button>
              </div>
            </div>

            {/* Notes - Siempre visible para que el cajero pueda agregar comentarios */}
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block">Notas del cierre (opcional)</label>
              <textarea
                value={differenceNotes}
                onChange={e => setDifferenceNotes(e.target.value)}
                placeholder="Agregar comentarios..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-orange-400/50 outline-none transition-all resize-none"
              />
            </div>

            {/* Close Button */}
            <button onClick={handleCloseSession} data-testid="confirm-close-session"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-oswald font-bold active:scale-95 transition-all flex items-center justify-center gap-2">
              <Square size={18} /> CERRAR TURNO
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Movement Dialog */}
      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent className="max-w-sm backdrop-blur-xl bg-slate-900/90 border-white/20" data-testid="movement-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white">Nuevo Movimiento de Caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-white/60 mb-2 block">Tipo de Movimiento</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMovementForm({...movementForm, movement_type: 'cash_in'})}
                  className={`p-3 rounded-lg text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
                    movementForm.movement_type === 'cash_in' ? 'border-green-400 bg-green-400/20 text-green-400' : 'border-white/10 bg-white/5 text-white/70'
                  }`}>
                  <ArrowUpCircle size={16} /> Ingreso
                </button>
                <button onClick={() => setMovementForm({...movementForm, movement_type: 'cash_out'})}
                  className={`p-3 rounded-lg text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
                    movementForm.movement_type === 'cash_out' ? 'border-red-400 bg-red-400/20 text-red-400' : 'border-white/10 bg-white/5 text-white/70'
                  }`}>
                  <ArrowDownCircle size={16} /> Retiro
                </button>
                <button onClick={() => setMovementForm({...movementForm, movement_type: 'deposit'})}
                  className={`p-3 rounded-lg text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
                    movementForm.movement_type === 'deposit' ? 'border-blue-400 bg-blue-400/20 text-blue-400' : 'border-white/10 bg-white/5 text-white/70'
                  }`}>
                  <Banknote size={16} /> Depósito
                </button>
                <button onClick={() => setMovementForm({...movementForm, movement_type: 'petty_cash'})}
                  className={`p-3 rounded-lg text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
                    movementForm.movement_type === 'petty_cash' ? 'border-yellow-400 bg-yellow-400/20 text-yellow-400' : 'border-white/10 bg-white/5 text-white/70'
                  }`}>
                  <Wallet size={16} /> Caja Chica
                </button>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block">Monto (RD$)</label>
              <NumericInput label="Valor"
                value={movementForm.amount}
                onChange={e => setMovementForm({...movementForm, amount: e.target.value})}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-oswald text-lg focus:border-orange-400/50 outline-none transition-all"
                data-testid="movement-amount-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block">Descripción</label>
              <input
                type="text"
                value={movementForm.description}
                onChange={e => setMovementForm({...movementForm, description: e.target.value})}
                placeholder="Ej: Reposición de cambio, Pago a proveedor..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-orange-400/50 outline-none transition-all"
                data-testid="movement-description-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block">Notas (opcional)</label>
              <textarea
                value={movementForm.notes}
                onChange={e => setMovementForm({...movementForm, notes: e.target.value})}
                placeholder="Detalles adicionales..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-orange-400/50 outline-none transition-all resize-none"
              />
            </div>
            
            <button onClick={handleAddMovement} data-testid="confirm-movement"
              className={`w-full h-12 rounded-xl text-white font-oswald font-bold active:scale-95 transition-all flex items-center justify-center gap-2 ${
                movementForm.movement_type === 'cash_in' 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600' 
                  : 'bg-gradient-to-r from-red-500 to-rose-600'
              }`}>
              {movementForm.movement_type === 'cash_in' ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
              REGISTRAR MOVIMIENTO
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit Note Modal (B04 - Nota de Crédito para Post-Venta) */}
      <CreditNoteModal 
        open={creditNoteModalOpen} 
        onOpenChange={(open) => {
          setCreditNoteModalOpen(open);
          if (!open) setPendingB04Transaction(null);
        }}
        API_BASE={process.env.REACT_APP_BACKEND_URL}
        initialTransactionNumber={pendingB04Transaction}
      />

      {/* Diálogo de Error: Mesas Abiertas */}
      <Dialog open={openTablesError.show} onOpenChange={(v) => !v && setOpenTablesError({ show: false, message: '' })}>
        <DialogContent className="max-w-md backdrop-blur-xl bg-slate-900/90 border-red-500/30" data-testid="open-tables-error-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-red-400 flex items-center gap-2">
              <AlertTriangle size={20} />
              No se puede cerrar turno
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 space-y-2">
              {openTablesError.message.split(' | ').map((reason, idx) => (
                <p key={idx} className="text-white text-sm">
                  {reason}
                </p>
              ))}
            </div>
            <p className="text-white/60 text-xs">
              Debes cerrar todas las cuentas abiertas y asegurarte de que no haya otros turnos activos antes de cerrar tu turno.
            </p>
            <button 
              onClick={() => setOpenTablesError({ show: false, message: '' })}
              data-testid="close-open-tables-error"
              className="w-full h-11 rounded-xl bg-white/10 border border-white/20 text-white font-oswald font-bold hover:bg-white/20 transition-all"
            >
              ENTENDIDO
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Botón Flotante de Re-impresión */}
      {selectedMovement && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="backdrop-blur-xl bg-slate-900/95 border border-orange-500/30 rounded-2xl p-4 shadow-2xl shadow-orange-500/20 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{(selectedMovement.description || '').replace(/\[BILL:[^\]]+\]\s*/g, '')}</p>
              <p className="text-white/50 text-xs">{formatMoney(selectedMovement.amount)} - {selectedMovement.ref}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReprint}
                disabled={reprintLoading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-sm flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                data-testid="reprint-btn"
              >
                <Printer size={16} className={reprintLoading ? 'animate-pulse' : ''} />
                {reprintLoading ? 'Enviando...' : 'Re-imprimir'}
              </button>
              <button
                onClick={() => setSelectedMovement(null)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo Cierre de Día (Z) */}
      <Dialog open={closeDayDialog} onOpenChange={setCloseDayDialog}>
        <DialogContent className="max-w-sm backdrop-blur-xl bg-slate-900/90 border-amber-500/30" data-testid="close-day-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-amber-400 flex items-center gap-2">
              <Calendar size={20} />
              Cierre de Día (Z)
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm">
              Esto cerrará la jornada de trabajo. Todos los turnos deben estar cerrados y no debe haber cuentas abiertas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <PinPad value={closeDayPin} onChange={setCloseDayPin} label="PIN de Autorizacion (Admin)" placeholder="PIN del administrador" />
            <div>
              <label className="text-white/60 text-xs mb-1 block">Notas de cierre (opcional)</label>
              <textarea
                value={closeDayNotes}
                onChange={(e) => setCloseDayNotes(e.target.value)}
                placeholder="Observaciones del día..."
                data-testid="close-day-notes"
                rows={2}
                className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:ring-2 focus:ring-amber-500/50 outline-none resize-none"
              />
            </div>
            <button
              onClick={handleCloseDay}
              disabled={closeDayLoading || !closeDayPin}
              data-testid="confirm-close-day"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-white font-oswald font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Lock size={18} />
              {closeDayLoading ? 'CERRANDO...' : 'CERRAR JORNADA'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ReportXZ Modal para re-impresión de turno (X) */}
      <ReportXZ 
        type="X"
        sessionId={reprintSessionId}
        open={!!reprintSessionId}
        onClose={() => {
          const shouldLogout = logoutAfterReport;
          setReprintSessionId(null);
          setLogoutAfterReport(false);
          if (shouldLogout) {
            logout();
          }
        }}
      />
      
      {/* ReportXZ Modal para cierre de día (Z) */}
      <ReportXZ 
        type="Z"
        dayId={closedDayId}
        open={!!closedDayId}
        onClose={() => setClosedDayId(null)}
      />

      {/* Teclado Flotante Numerico - Fuera de todos los dialogs para z-index correcto */}
      {floatingKeypad.open && createPortal(
        <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 99999 }} onClick={() => {
          if (floatingKeypad.field === 'card') setCardDeclared(floatingKeypad.value);
          else if (floatingKeypad.field === 'transfer') setTransferDeclared(floatingKeypad.value);
          setFloatingKeypad({ open: false, field: null, value: '' });
        }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div 
            className="relative w-full max-w-md mx-4 mb-4 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(15,15,30,0.97)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 0 40px rgba(138,43,226,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Display */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs text-white/40 mb-1">
                {floatingKeypad.field === 'card' ? 'Tarjeta Declarado' : 'Transferencias'}
              </p>
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-white/40">RD$</span>
                <span className="font-oswald text-2xl font-bold text-white">
                  {floatingKeypad.value || '0'}
                </span>
              </div>
            </div>
            {/* Keys */}
            <div className="grid grid-cols-3 gap-2 p-4">
              {['1','2','3','4','5','6','7','8','9','.','0','del'].map(key => (
                <button
                  key={key}
                  data-testid={`keypad-${key}`}
                  onClick={() => {
                    if (key === 'del') {
                      setFloatingKeypad(p => ({ ...p, value: p.value.slice(0, -1) }));
                    } else if (key === '.') {
                      if (!floatingKeypad.value.includes('.')) {
                        setFloatingKeypad(p => ({ ...p, value: p.value + '.' }));
                      }
                    } else {
                      setFloatingKeypad(p => ({ ...p, value: p.value + key }));
                    }
                  }}
                  className={`h-14 rounded-xl font-oswald text-xl font-bold transition-all active:scale-90 ${
                    key === 'del' 
                      ? 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25' 
                      : key === '.' 
                        ? 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                        : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {key === 'del' ? <X size={20} className="mx-auto" /> : key}
                </button>
              ))}
            </div>
            {/* Confirm */}
            <div className="px-4 pb-4">
              <button
                data-testid="keypad-confirm"
                onClick={() => {
                  if (floatingKeypad.field === 'card') setCardDeclared(floatingKeypad.value);
                  else if (floatingKeypad.field === 'transfer') setTransferDeclared(floatingKeypad.value);
                  setFloatingKeypad({ open: false, field: null, value: '' });
                }}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-oswald font-bold active:scale-95 transition-all"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
