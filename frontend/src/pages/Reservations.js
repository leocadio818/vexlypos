import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, Plus, Clock, Users, Phone, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { NumericInput } from '@/components/NumericKeypad';
import { NeoDatePicker, NeoTimePicker } from '@/components/DateTimePicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const statusColors = { confirmed: 'bg-green-600', seated: 'bg-blue-600', cancelled: 'bg-destructive', completed: 'bg-muted' };

export default function Reservations() {
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  
  // Use local date, not UTC
  const getLocalDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  
  const [date, setDate] = useState(getLocalDate());
  const [dialog, setDialog] = useState({ 
    open: false, editId: null, customer_name: '', phone: '', date: getLocalDate(), time: '', party_size: 2, 
    table_ids: [], area_id: '', notes: '',
    activation_minutes: 60,
    tolerance_minutes: 15
  });
  const [areas, setAreas] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [rRes, tRes, aRes] = await Promise.all([
        axios.get(`${API}/reservations`, { params: { date }, headers: hdrs() }),
        axios.get(`${API}/tables`, { headers: hdrs() }),
        axios.get(`${API}/areas`, { headers: hdrs() }),
      ]);
      setReservations(rRes.data);
      setTables(tRes.data);
      setAreas(aRes.data);
    } catch {}
  }, [date]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    if (!dialog.customer_name || !dialog.date || !dialog.time) { toast.error('Completa los campos requeridos'); return; }
    if (dialog.table_ids.length === 0) { toast.error('Selecciona al menos una mesa'); return; }
    try {
      await axios.post(`${API}/reservations`, {
        ...dialog,
        reservation_date: dialog.date,
        reservation_time: dialog.time,
      }, { headers: hdrs() });
      toast.success('Reservacion creada');
      setDialog({ 
        open: false, editId: null, customer_name: '', phone: '', date: getLocalDate(), time: '', party_size: 2, 
        table_ids: [], area_id: '', notes: '',
        activation_minutes: 60, tolerance_minutes: 15
      });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleUpdate = async () => {
    if (!dialog.customer_name || !dialog.date || !dialog.time) { toast.error('Completa los campos requeridos'); return; }
    if (dialog.table_ids.length === 0) { toast.error('Selecciona al menos una mesa'); return; }
    try {
      await axios.put(`${API}/reservations/${dialog.editId}`, { 
        customer_name: dialog.customer_name,
        phone: dialog.phone,
        reservation_date: dialog.date,
        reservation_time: dialog.time,
        party_size: dialog.party_size,
        table_ids: dialog.table_ids,
        area_id: dialog.area_id,
        notes: dialog.notes,
        activation_minutes: dialog.activation_minutes,
        tolerance_minutes: dialog.tolerance_minutes
      }, { headers: hdrs() });
      toast.success('Reservacion actualizada');
      setDialog({ 
        open: false, editId: null, customer_name: '', phone: '', date: getLocalDate(), time: '', party_size: 2, 
        table_ids: [], area_id: '', notes: '',
        activation_minutes: 60, tolerance_minutes: 15
      });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const openEdit = (res) => {
    setDialog({
      open: true,
      editId: res.id,
      customer_name: res.customer_name || '',
      phone: res.phone || '',
      date: res.reservation_date || res.date || getLocalDate(),
      time: res.reservation_time || res.time || '',
      party_size: res.party_size || 2,
      table_ids: res.table_ids || [],
      area_id: res.area_id || '',
      notes: res.notes || '',
      activation_minutes: res.activation_minutes || 60,
      tolerance_minutes: res.tolerance_minutes || 15
    });
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`${API}/reservations/${id}`, { status }, { headers: hdrs() });
      toast.success('Actualizado'); fetchAll();
    } catch { toast.error('Error'); }
  };

  const deleteRes = async (id) => {
    try { await axios.delete(`${API}/reservations/${id}`, { headers: hdrs() }); toast.success('Eliminada'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Group by time slots
  const timeSlots = {};
  reservations.forEach(r => {
    const slot = (r.reservation_time || r.time || '?').slice(0, 5);
    if (!timeSlots[slot]) timeSlots[slot] = [];
    timeSlots[slot].push(r);
  });

  return (
    <div className="h-full flex flex-col" data-testid="reservations-page">
      {/* Header - Glassmorphism */}
      <div className="px-4 py-3 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={22} className="text-orange-400" />
          <h1 className="font-oswald text-xl font-bold tracking-wide text-white">RESERVACIONES</h1>
        </div>
        <div className="flex items-center gap-2">
          <NeoDatePicker value={date} onChange={e => setDate(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono" />
          <button onClick={() => setDialog({ 
            open: true, editId: null, customer_name: '', phone: '', date, time: '19:00', party_size: 2, 
            table_ids: [], area_id: '', notes: '',
            activation_minutes: 60, tolerance_minutes: 15
          })}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold active:scale-95 flex items-center gap-1 text-sm" data-testid="new-reservation-btn">
            <Plus size={14} /> Nueva
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-3xl mx-auto">
          {reservations.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-oswald text-lg">Sin reservaciones para {date}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(timeSlots).sort().map(([time, items]) => (
                <div key={time}>
                  <h3 className="font-oswald text-sm text-white/50 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Clock size={14} /> {time}
                  </h3>
                  <div className="space-y-2">
                    {items.map(r => (
                      <div key={r.id} 
                        onClick={() => openEdit(r)}
                        className="p-3 rounded-xl backdrop-blur-xl bg-white/10 border border-white/20 cursor-pointer hover:bg-white/15 transition-colors" 
                        data-testid={`reservation-${r.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-white">{r.customer_name}</span>
                              <Badge className={statusColors[r.status]}>{r.status === 'confirmed' ? 'Confirmada' : r.status === 'seated' ? 'Sentados' : r.status === 'cancelled' ? 'Cancelada' : 'Completada'}</Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-white/50 flex-wrap">
                              <span className="flex items-center gap-1"><Users size={10} /> {r.party_size} personas</span>
                              {r.phone && <span className="flex items-center gap-1"><Phone size={10} /> {r.phone}</span>}
                              {r.table_numbers?.length > 0 && <span>Mesas: {r.table_numbers.join(', ')}</span>}
                              {r.notes && <span className="italic truncate max-w-[150px]">{r.notes}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          {r.status === 'confirmed' && (
                            <button className="h-8 w-8 rounded-lg text-green-400 hover:text-green-300 hover:bg-white/10 flex items-center justify-center transition-all"
                              onClick={() => updateStatus(r.id, 'seated')}><Check size={14} /></button>
                          )}
                          {r.status !== 'cancelled' && r.status !== 'completed' && (
                            <button className="h-8 w-8 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition-all"
                              onClick={() => updateStatus(r.id, 'cancelled')}><X size={14} /></button>
                          )}
                          <button className="h-8 w-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition-all"
                            onClick={() => deleteRes(r.id)}><Trash2 size={12} /></button>
                        </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New/Edit Reservation Dialog - Glassmorphism */}
      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog(p => ({ ...p, open: false, editId: null }))}>
        <DialogContent className="max-w-3xl w-[95vw] backdrop-blur-xl bg-slate-900/90 border-white/20" data-testid="new-reservation-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white">{dialog.editId ? 'Editar Reservacion' : 'Nueva Reservacion'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={dialog.customer_name} onChange={e => setDialog(p => ({ ...p, customer_name: e.target.value }))}
              placeholder="Nombre del cliente" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 outline-none" data-testid="res-name" />
            <input value={dialog.phone} onChange={e => setDialog(p => ({ ...p, phone: e.target.value }))}
              placeholder="Telefono" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 outline-none" data-testid="res-phone" />
            <div className="grid grid-cols-2 gap-2">
              <NeoDatePicker value={dialog.date} onChange={e => setDialog(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" />
              <NeoTimePicker value={dialog.time} onChange={e => setDialog(p => ({ ...p, time: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Personas</label>
                <NumericInput label="Valor" value={dialog.party_size} onChange={e => setDialog(p => ({ ...p, party_size: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-oswald text-white focus:border-white/30 outline-none" />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Area</label>
                <select value={dialog.area_id} onChange={e => {
                  const aid = e.target.value;
                  setDialog(p => ({ ...p, area_id: aid }));
                  if (aid === '__all__') {
                    const areaTables = tables.filter(t => t.status === 'free' || t.status === 'available');
                    setDialog(p => ({ ...p, table_ids: areaTables.map(t => t.id) }));
                  }
                }} className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 outline-none" style={{ colorScheme: 'dark' }}>
                  <option value="">Seleccionar area...</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-white/70 mb-2 block">Mesas ({dialog.table_ids.length} seleccionadas)</label>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-3 bg-white/5 rounded-xl border border-white/10">
                {dialog.area_id && (
                  <button onClick={() => {
                    const areaTables = tables.filter(t => t.area_id === dialog.area_id && (t.status === 'free' || t.status === 'available'));
                    setDialog(p => ({ ...p, table_ids: areaTables.map(t => t.id) }));
                  }} className="px-4 py-2.5 rounded-xl bg-orange-500/20 text-orange-400 text-xs font-bold border border-orange-500/30 hover:bg-orange-500/30 transition-all">
                    Seleccionar toda el area
                  </button>
                )}
                {tables.filter(t => (t.status === 'free' || t.status === 'available') && (!dialog.area_id || t.area_id === dialog.area_id)).map(t => {
                  const selected = dialog.table_ids.includes(t.id);
                  return (
                    <button key={t.id} onClick={() => {
                      setDialog(p => ({ ...p, table_ids: selected ? p.table_ids.filter(id => id !== t.id) : [...p.table_ids, t.id] }));
                    }} className={`px-4 py-2.5 rounded-xl text-sm font-oswald font-bold transition-all active:scale-95 min-w-[80px] ${
                      selected ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                    }`}>
                      Mesa {t.number}
                    </button>
                  );
                })}
              </div>
            </div>
            <input value={dialog.notes} onChange={e => setDialog(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas (cumpleanos, alergias, etc.)" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 outline-none" />
            
            {/* Timing Configuration */}
            <div className="p-3 bg-purple-500/20 border border-purple-500/30 rounded-lg space-y-2">
              <p className="text-xs font-semibold text-purple-400">⏰ Configuración de Tiempos</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 mb-1 block">Activar (min antes)</label>
                  <select value={dialog.activation_minutes} onChange={e => setDialog(p => ({ ...p, activation_minutes: parseInt(e.target.value) }))}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-white/30 outline-none" style={{ colorScheme: 'dark' }}>
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>1 hora</option>
                    <option value={90}>1.5 horas</option>
                    <option value={120}>2 horas</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-white/50 mb-1 block">Tolerancia si no llega</label>
                  <select value={dialog.tolerance_minutes} onChange={e => setDialog(p => ({ ...p, tolerance_minutes: parseInt(e.target.value) }))}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-white/30 outline-none" style={{ colorScheme: 'dark' }}>
                    <option value={10}>10 minutos</option>
                    <option value={15}>15 minutos</option>
                    <option value={20}>20 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>1 hora</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-white/60">
                La mesa se marcara como reservada {dialog.activation_minutes} min antes de la hora. 
                Si no llega despues de {dialog.tolerance_minutes} min, se liberara automaticamente.
              </p>
            </div>
            
            <button onClick={dialog.editId ? handleUpdate : handleCreate} className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-oswald font-bold active:scale-95 transition-all" data-testid="confirm-reservation">
              {dialog.editId ? 'ACTUALIZAR' : 'RESERVAR'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
