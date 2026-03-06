import React, { useState, useEffect, useCallback } from 'react';
import { businessDaysAPI, formatMoney } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { 
  Calendar, Sun, Moon, Clock, Lock, Unlock, CheckCircle2, 
  AlertTriangle, TrendingUp, Banknote, CreditCard, ArrowRight,
  History, FileText, X, Shield, Printer
} from 'lucide-react';
import { PinPad } from '@/components/PinPad';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ReportXZ from '@/components/ReportXZ';

/**
 * BusinessDayManager - Componente para gestionar Jornadas de Trabajo
 * 
 * Flujo:
 * 1. Verifica si hay jornada abierta
 * 2. Permite abrir/cerrar jornada con autorización de gerente
 * 3. Muestra estadísticas de la jornada actual
 */
export default function BusinessDayManager({ 
  compact = false,
  onDayStatusChange,
  showStatsInline = false 
}) {
  const { user, logout } = useAuth();
  const [businessDay, setBusinessDay] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  
  // Dialogs
  const [openDayDialog, setOpenDayDialog] = useState(false);
  const [closeDayDialog, setCloseDayDialog] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [pinDialog, setPinDialog] = useState({ open: false, action: null });
  const [reportZDialog, setReportZDialog] = useState({ open: false, dayId: null });
  
  // Form states
  const [authorizerPin, setAuthorizerPin] = useState('');
  const [authorizer, setAuthorizer] = useState(null);
  const [businessDate, setBusinessDate] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [forceClose, setForceClose] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Cargar estado actual
  const fetchCurrentDay = useCallback(async () => {
    try {
      setLoading(true);
      const res = await businessDaysAPI.current();
      setBusinessDay(res.data.business_day);
      setStats(res.data.stats);
      
      if (onDayStatusChange) {
        onDayStatusChange(res.data.has_open_day, res.data.business_day);
      }
    } catch (err) {
      console.error('Error fetching business day:', err);
    } finally {
      setLoading(false);
    }
  }, [onDayStatusChange]);

  useEffect(() => {
    fetchCurrentDay();
  }, [fetchCurrentDay]);

  // Cargar historial
  const fetchHistory = async () => {
    try {
      const res = await businessDaysAPI.history({ limit: 30 });
      setHistory(res.data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  // Verificar PIN de autorización
  const handleVerifyPin = async () => {
    if (!authorizerPin || authorizerPin.length < 4) {
      toast.error('Ingresa un PIN válido');
      return;
    }
    
    setProcessing(true);
    try {
      const res = await businessDaysAPI.authorize(authorizerPin, pinDialog.action);
      setAuthorizer(res.data);
      setPinDialog({ open: false, action: null });
      
      // Abrir el diálogo correspondiente
      if (pinDialog.action === 'open') {
        setBusinessDate(new Date().toISOString().split('T')[0]);
        setOpenDayDialog(true);
      } else if (pinDialog.action === 'close') {
        setCloseDayDialog(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'PIN inválido o sin autorización');
    } finally {
      setProcessing(false);
    }
  };

  // Abrir Jornada
  const handleOpenDay = async () => {
    if (!authorizer) {
      toast.error('Se requiere autorización');
      return;
    }
    
    setProcessing(true);
    try {
      const res = await businessDaysAPI.open({
        business_date: businessDate,
        authorizer_pin: authorizerPin,
        opening_notes: openingNotes || null
      });
      
      toast.success(res.data.message);
      setOpenDayDialog(false);
      setAuthorizer(null);
      setAuthorizerPin('');
      setOpeningNotes('');
      fetchCurrentDay();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al abrir jornada');
    } finally {
      setProcessing(false);
    }
  };

  // Cerrar Jornada
  const handleCloseDay = async () => {
    if (!authorizer) {
      toast.error('Se requiere autorización');
      return;
    }
    
    setProcessing(true);
    try {
      const res = await businessDaysAPI.close({
        authorizer_pin: authorizerPin,
        closing_notes: closingNotes || null,
        force_close: forceClose
      });
      
      toast.success(res.data.message);
      setCloseDayDialog(false);
      setAuthorizer(null);
      setAuthorizerPin('');
      setClosingNotes('');
      setForceClose(false);
      
      // After closing day → logout to login screen
      setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, 2000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cerrar jornada');
    } finally {
      setProcessing(false);
    }
  };

  // Iniciar proceso de apertura/cierre
  const startAction = (action) => {
    setAuthorizerPin('');
    setAuthorizer(null);
    setPinDialog({ open: true, action });
  };

  // Formato de fecha legible
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-DO', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleTimeString('es-DO', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  };

  // Vista compacta (para sidebar o header)
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {loading ? (
          <div className="animate-pulse flex items-center gap-2">
            <div className="w-4 h-4 bg-white/20 rounded-full" />
            <div className="w-20 h-4 bg-white/20 rounded" />
          </div>
        ) : businessDay ? (
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 cursor-pointer hover:bg-green-500/30 transition-all"
            onClick={() => {
              fetchHistory();
              setHistoryDialog(true);
            }}
            data-testid="business-day-indicator"
          >
            <Sun size={14} className="text-green-400" />
            <span className="text-green-300 text-xs font-medium">
              {businessDay.business_date}
            </span>
          </div>
        ) : (
          <button
            onClick={() => startAction('open')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-all animate-pulse"
            data-testid="open-day-compact-btn"
          >
            <Moon size={14} className="text-red-400" />
            <span className="text-red-300 text-xs font-medium">
              Sin Jornada
            </span>
          </button>
        )}
      </div>
    );
  }

  // Vista completa
  return (
    <div className="space-y-4">
      {/* Estado actual */}
      <div className={`rounded-2xl p-5 transition-all ${
        businessDay 
          ? 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20' 
          : 'bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {businessDay ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <Sun size={24} className="text-green-400" />
                </div>
                <div>
                  <h3 className="font-oswald font-bold text-white text-lg">JORNADA ABIERTA</h3>
                  <p className="text-green-300 text-sm">{formatDate(businessDay.business_date)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center animate-pulse">
                  <Moon size={24} className="text-red-400" />
                </div>
                <div>
                  <h3 className="font-oswald font-bold text-white text-lg">SIN JORNADA</h3>
                  <p className="text-red-300 text-sm">Debe abrir el día para operar</p>
                </div>
              </>
            )}
          </div>
          
          <div className="flex gap-2">
            {businessDay ? (
              <>
                <Button
                  onClick={() => setReportZDialog({ open: true, dayId: businessDay.id })}
                  className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-300"
                  data-testid="report-z-btn"
                >
                  <FileText size={16} className="mr-2" />
                  Reporte Z
                </Button>
                <Button
                  onClick={() => startAction('close')}
                  className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300"
                  data-testid="close-day-btn"
                >
                  <Lock size={16} className="mr-2" />
                  Cerrar Día
                </Button>
              </>
            ) : (
              <Button
                onClick={() => startAction('open')}
                className="bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300"
                data-testid="open-day-btn"
              >
                <Unlock size={16} className="mr-2" />
                Abrir Día
              </Button>
            )}
            
            <Button
              onClick={() => {
                fetchHistory();
                setHistoryDialog(true);
              }}
              variant="outline"
              className="border-white/20 text-white/70 hover:bg-white/10"
            >
              <History size={16} />
            </Button>
          </div>
        </div>
        
        {/* Info de la jornada */}
        {businessDay && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="text-center">
              <p className="text-white/50 text-xs mb-1">Abierta</p>
              <p className="text-white font-medium text-sm">{formatTime(businessDay.opened_at)}</p>
            </div>
            <div className="text-center">
              <p className="text-white/50 text-xs mb-1">Por</p>
              <p className="text-white font-medium text-sm">{businessDay.opened_by_name}</p>
            </div>
            <div className="text-center">
              <p className="text-white/50 text-xs mb-1">Autorizado</p>
              <p className="text-white font-medium text-sm">{businessDay.authorized_by_name}</p>
            </div>
            <div className="text-center">
              <p className="text-white/50 text-xs mb-1">Referencia</p>
              <p className="text-cyan-400 font-mono text-sm">{businessDay.ref}</p>
            </div>
          </div>
        )}
        
        {/* Estadísticas del día */}
        {businessDay && stats && showStatsInline && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <TrendingUp size={20} className="text-green-400 mx-auto mb-1" />
              <p className="text-white/50 text-xs">Ventas</p>
              <p className="font-oswald font-bold text-green-400">{formatMoney(stats.total_sales)}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <Banknote size={20} className="text-emerald-400 mx-auto mb-1" />
              <p className="text-white/50 text-xs">Efectivo</p>
              <p className="font-oswald font-bold text-emerald-400">{formatMoney(stats.total_cash)}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <CreditCard size={20} className="text-blue-400 mx-auto mb-1" />
              <p className="text-white/50 text-xs">Tarjeta</p>
              <p className="font-oswald font-bold text-blue-400">{formatMoney(stats.total_card)}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <FileText size={20} className="text-cyan-400 mx-auto mb-1" />
              <p className="text-white/50 text-xs">Facturas</p>
              <p className="font-oswald font-bold text-cyan-400">{stats.total_invoices}</p>
            </div>
          </div>
        )}
      </div>

      {/* Dialogo PIN de Autorización */}
      <Dialog open={pinDialog.open} onOpenChange={(open) => !open && setPinDialog({ open: false, action: null })}>
        <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white flex items-center gap-2">
              <Shield className="text-amber-400" size={20} />
              Autorización Requerida
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Ingresa el PIN de un Gerente o Administrador para {pinDialog.action === 'open' ? 'abrir' : 'cerrar'} la jornada
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <PinPad
              value={authorizerPin}
              onChange={setAuthorizerPin}
              label="PIN de Autorizacion"
              placeholder="Ingresa PIN"
            />
            
            <div className="flex gap-3">
              <Button
                onClick={() => setPinDialog({ open: false, action: null })}
                variant="outline"
                className="flex-1 border-white/20 text-white/70"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleVerifyPin}
                disabled={processing || authorizerPin.length < 4}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="verify-pin-btn"
              >
                {processing ? 'Verificando...' : 'Verificar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogo Abrir Día */}
      <Dialog open={openDayDialog} onOpenChange={setOpenDayDialog}>
        <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white flex items-center gap-2">
              <Sun className="text-green-400" size={20} />
              Abrir Jornada de Trabajo
            </DialogTitle>
            {authorizer && (
              <Badge className="bg-green-500/20 text-green-300 w-fit">
                Autorizado por: {authorizer.authorizer_name}
              </Badge>
            )}
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-white/70 text-sm block mb-2">Fecha de Negocio (Contable)</label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                className="w-full h-12 bg-white/5 border border-white/20 rounded-xl px-4 text-white focus:border-green-400 outline-none"
                data-testid="business-date-input"
              />
              <p className="text-white/40 text-xs mt-1">
                Esta fecha se usará para todas las transacciones hasta el cierre
              </p>
            </div>
            
            <div>
              <label className="text-white/70 text-sm block mb-2">Notas de Apertura (Opcional)</label>
              <textarea
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                placeholder="Ej: Inicio normal, fondo de caja verificado..."
                className="w-full h-20 bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:border-green-400 outline-none resize-none"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => setOpenDayDialog(false)}
                variant="outline"
                className="flex-1 border-white/20 text-white/70"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleOpenDay}
                disabled={processing || !businessDate}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                data-testid="confirm-open-day-btn"
              >
                {processing ? 'Abriendo...' : 'Abrir Jornada'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogo Cerrar Día */}
      <Dialog open={closeDayDialog} onOpenChange={setCloseDayDialog}>
        <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white flex items-center gap-2">
              <Moon className="text-red-400" size={20} />
              Cerrar Jornada de Trabajo
            </DialogTitle>
            {authorizer && (
              <Badge className="bg-red-500/20 text-red-300 w-fit">
                Autorizado por: {authorizer.authorizer_name}
              </Badge>
            )}
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            {/* Resumen del día */}
            {stats && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h4 className="text-white/70 text-sm mb-3">Resumen del Día</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-white/50">Ventas Totales:</span>
                    <p className="font-oswald font-bold text-green-400">{formatMoney(stats.total_sales)}</p>
                  </div>
                  <div>
                    <span className="text-white/50">Facturas:</span>
                    <p className="font-oswald font-bold text-cyan-400">{stats.total_invoices}</p>
                  </div>
                  <div>
                    <span className="text-white/50">Efectivo:</span>
                    <p className="font-oswald font-bold text-emerald-400">{formatMoney(stats.total_cash)}</p>
                  </div>
                  <div>
                    <span className="text-white/50">Tarjeta:</span>
                    <p className="font-oswald font-bold text-blue-400">{formatMoney(stats.total_card)}</p>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <label className="text-white/70 text-sm block mb-2">Notas de Cierre (Opcional)</label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Ej: Cierre sin novedad, efectivo cuadrado..."
                className="w-full h-20 bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:border-red-400 outline-none resize-none"
              />
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={forceClose}
                onChange={(e) => setForceClose(e.target.checked)}
                className="w-4 h-4 rounded border-white/30 bg-white/5 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-white/70 text-sm">Forzar cierre (cierra turnos abiertos)</span>
            </label>
            
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => setCloseDayDialog(false)}
                variant="outline"
                className="flex-1 border-white/20 text-white/70"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCloseDay}
                disabled={processing}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                data-testid="confirm-close-day-btn"
              >
                {processing ? 'Cerrando...' : 'Cerrar Jornada'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogo Historial */}
      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white flex items-center gap-2">
              <History className="text-cyan-400" size={20} />
              Historial de Jornadas
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 pt-4">
            {history.length === 0 ? (
              <p className="text-white/50 text-center py-8">No hay jornadas registradas</p>
            ) : (
              history.map((day) => (
                <div 
                  key={day.id}
                  className={`p-4 rounded-xl border transition-all ${
                    day.status === 'open' 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {day.status === 'open' ? (
                        <Sun size={20} className="text-green-400" />
                      ) : (
                        <Moon size={20} className="text-white/40" />
                      )}
                      <div>
                        <p className="font-oswald font-bold text-white">{day.business_date}</p>
                        <p className="text-white/50 text-xs">{day.ref}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={day.status === 'open' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'}>
                        {day.status === 'open' ? 'Abierta' : 'Cerrada'}
                      </Badge>
                      {day.total_sales > 0 && (
                        <p className="font-oswald font-bold text-green-400 mt-1">
                          {formatMoney(day.total_sales)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/10 text-xs">
                    <div>
                      <span className="text-white/40">Abierta:</span>
                      <p className="text-white/70">{formatTime(day.opened_at)}</p>
                    </div>
                    <div>
                      <span className="text-white/40">Por:</span>
                      <p className="text-white/70">{day.opened_by_name}</p>
                    </div>
                    <div>
                      <span className="text-white/40">Cerrada:</span>
                      <p className="text-white/70">{day.closed_at ? formatTime(day.closed_at) : '-'}</p>
                    </div>
                    <div>
                      <span className="text-white/40">Facturas:</span>
                      <p className="text-white/70">{day.total_invoices || 0}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reporte Z Dialog */}
      <ReportXZ
        type="Z"
        dayId={reportZDialog.dayId}
        open={reportZDialog.open}
        onClose={() => setReportZDialog({ open: false, dayId: null })}
      />
    </div>
  );
}
