import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { posSessionsAPI, formatMoney } from '@/lib/api';
import { CircleDollarSign, Play, Square, Clock, Banknote, CreditCard, AlertTriangle, TrendingUp, ArrowDownCircle, ArrowUpCircle, History, Wallet, CheckCircle2, Calculator, Coins, Receipt, RefreshCw, FileX, Search, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import CreditNoteModal from '@/components/CreditNoteModal';

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
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [terminals, setTerminals] = useState([]);
  
  // Form states
  const [selectedTerminal, setSelectedTerminal] = useState('');
  const [terminalName, setTerminalName] = useState('Caja 1');
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
  
  // Buscador de movimientos y selección para re-impresión
  const [movementSearch, setMovementSearch] = useState('');
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [reprintLoading, setReprintLoading] = useState(false);
  
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
      const checkRes = await posSessionsAPI.check();
      if (checkRes.data.has_open_session && checkRes.data.session) {
        const currentRes = await posSessionsAPI.current();
        setCurrentSession(currentRes.data);
        
        if (currentRes.data?.id) {
          const movRes = await posSessionsAPI.getMovements(currentRes.data.id);
          setMovements(movRes.data || []);
        }
      } else {
        setCurrentSession(null);
        setMovements([]);
      }
      
      const historyRes = await posSessionsAPI.history({ limit: 20, status: 'closed' });
      setSessions(historyRes.data || []);
      
      try {
        const termRes = await posSessionsAPI.terminals();
        setTerminals(termRes.data?.length > 0 ? termRes.data : defaultTerminals);
      } catch {
        setTerminals(defaultTerminals);
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

  // Calculate expected cash (total_esperado)
  const totalEsperado = currentSession ? (
    (currentSession.opening_amount || 0) +
    (currentSession.cash_sales || 0) +
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
    } catch (err) {
      toast.error('Error cerrando turno', {
        description: err.response?.data?.detail || 'Intenta de nuevo'
      });
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

  const updateDenomination = (valor, delta) => {
    setDenominationCounts(prev => ({
      ...prev,
      [valor]: Math.max(0, (prev[valor] || 0) + delta)
    }));
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
        <div className="flex items-center gap-2">
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
          {currentSession && (
            <button onClick={() => setMovementDialog(true)} data-testid="add-movement-btn"
              className="px-3 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 text-blue-400 font-medium text-sm flex items-center gap-2 transition-all">
              <Wallet size={16} /> Movimiento
            </button>
          )}
          {!currentSession ? (
            <button onClick={() => setOpenDialog(true)} data-testid="open-shift-btn"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-oswald font-bold active:scale-95 flex items-center gap-2 transition-all">
              <Play size={16} /> ABRIR TURNO
            </button>
          ) : (
            <button onClick={() => setCloseDialog(true)} data-testid="close-shift-btn"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-oswald font-bold active:scale-95 flex items-center gap-2 transition-all">
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
              <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <Banknote size={20} className="mx-auto mb-1 text-green-400" />
                  <p className="text-[10px] text-white/50 uppercase">Efectivo</p>
                  <p className="font-oswald text-lg font-bold text-green-400">{formatMoney(currentSession.cash_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <CreditCard size={20} className="mx-auto mb-1 text-blue-400" />
                  <p className="text-[10px] text-white/50 uppercase">Tarjeta</p>
                  <p className="font-oswald text-lg font-bold text-blue-400">{formatMoney(currentSession.card_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <TrendingUp size={20} className="mx-auto mb-1 text-orange-400" />
                  <p className="text-[10px] text-white/50 uppercase">Total Ventas</p>
                  <p className="font-oswald text-lg font-bold text-orange-400">{formatMoney(totalSales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <ArrowUpCircle size={20} className="mx-auto mb-1 text-emerald-400" />
                  <p className="text-[10px] text-white/50 uppercase">Ingresos</p>
                  <p className="font-oswald text-lg font-bold text-emerald-400">{formatMoney(currentSession.cash_in)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <ArrowDownCircle size={20} className="mx-auto mb-1 text-red-400" />
                  <p className="text-[10px] text-white/50 uppercase">Retiros</p>
                  <p className="font-oswald text-lg font-bold text-red-400">{formatMoney(currentSession.cash_out)}</p>
                </div>
              </div>
              
              {/* Expected Cash */}
              <div className="px-6 pb-4">
                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-yellow-400 font-medium">Efectivo Esperado en Caja</p>
                    <p className="text-[10px] text-white/50">Apertura + Ventas Efectivo + Ingresos - Retiros</p>
                  </div>
                  <p className="font-oswald text-2xl font-bold text-yellow-400">{formatMoney(totalEsperado)}</p>
                </div>
              </div>
              
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
                    placeholder="Buscar por NCF, monto, descripción..."
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
                      return (
                        mov.description?.toLowerCase().includes(search) ||
                        mov.ref?.toLowerCase().includes(search) ||
                        mov.payment_method?.toLowerCase().includes(search) ||
                        String(mov.amount).includes(search)
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
                          <p className="text-sm font-medium text-white">{mov.description}</p>
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
                    return (
                      mov.description?.toLowerCase().includes(search) ||
                      mov.ref?.toLowerCase().includes(search) ||
                      mov.payment_method?.toLowerCase().includes(search) ||
                      String(mov.amount).includes(search)
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
                <div className="text-right">
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
                {terminals.map(t => (
                  <button key={t.code} onClick={() => { setSelectedTerminal(t.id); setTerminalName(t.name); }}
                    className={`p-2.5 rounded-lg text-sm font-medium transition-all border ${
                      terminalName === t.name ? 'border-orange-400 bg-orange-400/20 text-orange-400' : 'border-white/10 bg-white/5 text-white/70'
                    }`}>{t.name}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block">Monto de Apertura (RD$)</label>
              <input
                type="number"
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
            {/* Expected Summary */}
            {currentSession && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white/70 mb-3">Resumen del Sistema</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-white/60">Apertura</span><span className="font-oswald text-white">{formatMoney(currentSession.opening_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-white/60">Ventas Efectivo</span><span className="font-oswald text-green-400">{formatMoney(currentSession.cash_sales)}</span></div>
                  <div className="flex justify-between"><span className="text-white/60">Ingresos Caja</span><span className="font-oswald text-emerald-400">+{formatMoney(currentSession.cash_in)}</span></div>
                  <div className="flex justify-between"><span className="text-white/60">Retiros Caja</span><span className="font-oswald text-red-400">-{formatMoney(currentSession.cash_out)}</span></div>
                  <div className="col-span-2 flex justify-between font-bold border-t border-white/10 pt-2 mt-2">
                    <span className="text-yellow-400">EFECTIVO ESPERADO</span>
                    <span className="font-oswald text-xl text-yellow-400">{formatMoney(totalEsperado)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Denomination Counter */}
            <div>
              <h4 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
                <Coins size={16} /> Conteo de Efectivo
              </h4>
              
              {/* Bills */}
              <div className="mb-4">
                <p className="text-[10px] text-white/40 uppercase mb-2 flex items-center gap-1"><Banknote size={12} /> Billetes</p>
                <div className="grid grid-cols-3 gap-2">
                  {DENOMINACIONES.filter(d => d.tipo === 'billete').map(denom => (
                    <div key={denom.valor} className="bg-white/5 border border-white/10 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${COLORES_DENOMINACION[denom.valor]} text-white`}>{denom.label}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <button 
                          onClick={() => updateDenomination(denom.valor, -1)}
                          className="w-8 h-8 rounded bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-all"
                        >-</button>
                        <input
                          type="number"
                          value={denominationCounts[denom.valor]}
                          onChange={e => setDenominationCounts(prev => ({...prev, [denom.valor]: Math.max(0, parseInt(e.target.value) || 0)}))}
                          className="w-12 text-center bg-transparent text-white font-oswald text-lg border-none outline-none"
                        />
                        <button 
                          onClick={() => updateDenomination(denom.valor, 1)}
                          className="w-8 h-8 rounded bg-green-500/20 text-green-400 font-bold hover:bg-green-500/30 transition-all"
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
                <div className="grid grid-cols-4 gap-2">
                  {DENOMINACIONES.filter(d => d.tipo === 'moneda').map(denom => (
                    <div key={denom.valor} className="bg-white/5 border border-white/10 rounded-lg p-2">
                      <div className="flex items-center justify-center mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${COLORES_DENOMINACION[denom.valor]} text-white`}>{denom.label}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <button 
                          onClick={() => updateDenomination(denom.valor, -1)}
                          className="w-6 h-6 rounded bg-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-all"
                        >-</button>
                        <input
                          type="number"
                          value={denominationCounts[denom.valor]}
                          onChange={e => setDenominationCounts(prev => ({...prev, [denom.valor]: Math.max(0, parseInt(e.target.value) || 0)}))}
                          className="w-10 text-center bg-transparent text-white font-oswald border-none outline-none"
                        />
                        <button 
                          onClick={() => updateDenomination(denom.valor, 1)}
                          className="w-6 h-6 rounded bg-green-500/20 text-green-400 text-sm font-bold hover:bg-green-500/30 transition-all"
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Total Counted - Con alerta de descuadre */}
            <div className={`p-4 rounded-lg border ${
              Math.abs(diferenciaCaja) < 1 
                ? 'bg-green-500/10 border-green-500/30' 
                : Math.abs(diferenciaCaja) <= 50 
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/70 font-medium">Total Declarado</span>
                <span className="font-oswald text-2xl font-bold text-white">{formatMoney(totalDeclarado)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-sm">
                  {getAlertStatus().text}
                </span>
                <span className={`font-oswald text-lg font-bold ${getAlertStatus().color}`}>
                  {diferenciaCaja > 0 ? '+' : ''}{formatMoney(diferenciaCaja)}
                </span>
              </div>
              {Math.abs(diferenciaCaja) > 50 && (
                <div className="mt-2 p-2 rounded bg-red-500/20 border border-red-500/30 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400" />
                  <span className="text-xs text-red-300">Descuadre significativo - Se requiere explicación</span>
                </div>
              )}
            </div>

            {/* Other payment methods */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-white/60 mb-1 block flex items-center gap-1">
                  <CreditCard size={14} /> Tarjeta Declarado
                </label>
                <input
                  type="number"
                  value={cardDeclared}
                  onChange={e => setCardDeclared(e.target.value)}
                  placeholder={formatMoney(currentSession?.card_sales || 0)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-oswald focus:border-blue-400/50 outline-none transition-all"
                />
                <p className="text-[10px] text-white/40 mt-1">Sistema: {formatMoney(currentSession?.card_sales || 0)}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-white/60 mb-1 block">Transferencias</label>
                <input
                  type="number"
                  value={transferDeclared}
                  onChange={e => setTransferDeclared(e.target.value)}
                  placeholder={formatMoney(currentSession?.transfer_sales || 0)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-oswald focus:border-cyan-400/50 outline-none transition-all"
                />
                <p className="text-[10px] text-white/40 mt-1">Sistema: {formatMoney(currentSession?.transfer_sales || 0)}</p>
              </div>
            </div>

            {/* Notes */}
            {Math.abs(diferenciaCaja) > 0.01 && (
              <div>
                <label className="text-sm font-semibold text-white/60 mb-1 block">Notas sobre la diferencia</label>
                <textarea
                  value={differenceNotes}
                  onChange={e => setDifferenceNotes(e.target.value)}
                  placeholder="Explica la razón de la diferencia..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-orange-400/50 outline-none transition-all resize-none"
                />
              </div>
            )}

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
              <input
                type="number"
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
    </div>
  );
}
