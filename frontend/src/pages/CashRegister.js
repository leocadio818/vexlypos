import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { shiftsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { CircleDollarSign, Play, Square, Clock, Banknote, CreditCard, AlertTriangle, TrendingUp, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export default function CashRegister() {
  const { user } = useAuth();
  const [currentShift, setCurrentShift] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [station, setStation] = useState('Caja 1');
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  const fetchData = useCallback(async () => {
    try {
      const [currentRes, shiftsRes] = await Promise.all([shiftsAPI.current(), shiftsAPI.list()]);
      setCurrentShift(currentRes.data && currentRes.data.id ? currentRes.data : null);
      setShifts(shiftsRes.data);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleOpenShift = async () => {
    try {
      const res = await shiftsAPI.open({ station, opening_amount: parseFloat(openingAmount) || 0 });
      setCurrentShift(res.data);
      toast.success('Turno abierto');
      setOpenDialog(false);
      fetchData();
    } catch {
      toast.error('Error abriendo turno');
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;
    try {
      await shiftsAPI.close(currentShift.id, { closing_amount: parseFloat(closingAmount) || 0 });
      // Send email if provided
      if (emailTo) {
        try {
          await fetch(`${API_BASE}/api/email/shift-report/${currentShift.id}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
            body: JSON.stringify({ to: emailTo })
          });
          toast.success('Reporte enviado por correo');
        } catch {}
      }
      setCurrentShift(null);
      toast.success('Turno cerrado');
      setCloseDialog(false);
      setEmailTo('');
      fetchData();
    } catch {
      toast.error('Error cerrando turno');
    }
  };

  const stations = ['Caja 1', 'Caja 2', 'Barra', 'Terraza', 'VIP'];

  return (
    <div className="h-full flex flex-col" data-testid="cash-register-page">
      {/* Header - Glassmorphism */}
      <div className="px-4 py-3 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleDollarSign size={22} className="text-orange-400" />
          <h1 className="font-oswald text-xl font-bold tracking-wide text-white">CAJA / TURNOS</h1>
        </div>
        {!currentShift ? (
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

      <div className="flex-1 p-4 overflow-auto">
        {/* Current Shift - Glassmorphism */}
        {currentShift && (
          <div className="max-w-2xl mx-auto mb-8" data-testid="current-shift">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
              <div className="bg-green-500/20 border-b border-green-500/30 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-oswald text-lg font-bold text-white">Turno Activo</h2>
                  <p className="text-xs text-white/60">{currentShift.station} - {currentShift.user_name}</p>
                </div>
                <Badge className="bg-green-500 animate-pulse text-white">En Curso</Badge>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <Banknote size={20} className="mx-auto mb-1 text-green-400" />
                  <p className="text-[10px] text-white/50 uppercase">Efectivo</p>
                  <p className="font-oswald text-lg font-bold text-green-400">{formatMoney(currentShift.cash_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <CreditCard size={20} className="mx-auto mb-1 text-blue-400" />
                  <p className="text-[10px] text-white/50 uppercase">Tarjeta</p>
                  <p className="font-oswald text-lg font-bold text-blue-400">{formatMoney(currentShift.card_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <TrendingUp size={20} className="mx-auto mb-1 text-orange-400" />
                  <p className="text-[10px] text-white/50 uppercase">Total Ventas</p>
                  <p className="font-oswald text-lg font-bold text-orange-400">{formatMoney(currentShift.total_sales)}</p>
                </div>
                <div className="text-center p-3 rounded-lg backdrop-blur-md bg-white/5 border border-white/10">
                  <CircleDollarSign size={20} className="mx-auto mb-1 text-yellow-400" />
                  <p className="text-[10px] text-white/50 uppercase">Propinas</p>
                  <p className="font-oswald text-lg font-bold text-yellow-400">{formatMoney(currentShift.total_tips)}</p>
                </div>
              </div>
              <div className="px-6 pb-4 flex items-center justify-between text-xs text-white/50">
                <span className="flex items-center gap-1"><Clock size={12} /> Abierto: {new Date(currentShift.opened_at).toLocaleString('es-DO')}</span>
                <span className="flex items-center gap-1"><AlertTriangle size={12} /> Anulaciones: {currentShift.cancelled_count}</span>
              </div>
            </div>
          </div>
        )}

        {/* Shift History - Glassmorphism */}
        <div className="max-w-2xl mx-auto">
          <h3 className="font-oswald text-sm font-bold text-white/50 mb-3 uppercase tracking-wider">Historial de Turnos</h3>
          <div className="space-y-2">
            {shifts.filter(s => s.status === 'closed').map(shift => (
              <div key={shift.id} data-testid={`shift-${shift.id}`}
                className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{shift.user_name} - {shift.station}</p>
                  <p className="text-[10px] text-white/50 font-mono">
                    {new Date(shift.opened_at).toLocaleString('es-DO')} → {shift.closed_at ? new Date(shift.closed_at).toLocaleString('es-DO') : '-'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-oswald text-base font-bold text-orange-400">{formatMoney(shift.total_sales)}</p>
                  <p className="text-[10px] text-white/50">Propinas: {formatMoney(shift.total_tips)}</p>
                </div>
              </div>
            ))}
            {shifts.filter(s => s.status === 'closed').length === 0 && (
              <p className="text-sm text-white/40 text-center py-4">No hay turnos cerrados</p>
            )}
          </div>
        </div>
      </div>

      {/* Open Shift Dialog - Glassmorphism */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-sm backdrop-blur-xl bg-slate-900/90 border-white/20" data-testid="open-shift-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white">Abrir Turno</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-white/60 mb-2 block">Estacion</label>
              <div className="grid grid-cols-2 gap-2">
                {stations.map(s => (
                  <button key={s} onClick={() => setStation(s)}
                    className={`p-2.5 rounded-lg text-sm font-medium transition-all border ${
                      station === s ? 'border-orange-400 bg-orange-400/20 text-orange-400' : 'border-white/10 bg-white/5 text-white/70'
                    }`}>{s}</button>
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
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-oswald text-lg focus:border-white/30 focus:bg-white/10 outline-none transition-all"
                data-testid="opening-amount-input"
              />
            </div>
            <button onClick={handleOpenShift} data-testid="confirm-open-shift"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-oswald font-bold active:scale-95 transition-all">
              ABRIR TURNO
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog - Glassmorphism */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-sm backdrop-blur-xl bg-slate-900/90 border-white/20" data-testid="close-shift-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white">Cerrar Turno</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {currentShift && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-white/60">Ventas Efectivo</span><span className="font-oswald text-white">{formatMoney(currentShift.cash_sales)}</span></div>
                <div className="flex justify-between"><span className="text-white/60">Ventas Tarjeta</span><span className="font-oswald text-white">{formatMoney(currentShift.card_sales)}</span></div>
                <div className="flex justify-between font-bold border-t border-white/10 pt-1"><span className="text-white">Total Ventas</span><span className="font-oswald text-orange-400">{formatMoney(currentShift.total_sales)}</span></div>
              </div>
            )}
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block">Monto de Cierre (RD$)</label>
              <input
                type="number"
                value={closingAmount}
                onChange={e => setClosingAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-oswald text-lg focus:border-white/30 focus:bg-white/10 outline-none transition-all"
                data-testid="closing-amount-input"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-white/60 mb-1 block flex items-center gap-1">
                <Mail size={12} /> Enviar reporte por correo (opcional)
              </label>
              <input
                type="email"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-white/30 focus:bg-white/10 outline-none transition-all"
                data-testid="shift-email-input"
              />
            </div>
            <button onClick={handleCloseShift} data-testid="confirm-close-shift"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-oswald font-bold active:scale-95 transition-all">
              CERRAR TURNO
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
