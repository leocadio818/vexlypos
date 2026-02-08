import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, Plus, Clock, Users, Phone, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const statusColors = { confirmed: 'bg-green-600', seated: 'bg-blue-600', cancelled: 'bg-destructive', completed: 'bg-muted' };

export default function Reservations() {
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dialog, setDialog] = useState({ open: false, customer_name: '', phone: '', date: '', time: '', party_size: 2, table_ids: [], area_id: '', notes: '' });
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
    const tbl = tables.find(t => t.id === dialog.table_id);
    try {
      await axios.post(`${API}/reservations`, { ...dialog, table_number: tbl?.number || 0 }, { headers: hdrs() });
      toast.success('Reservacion creada');
      setDialog({ open: false, customer_name: '', phone: '', date: '', time: '', party_size: 2, table_id: '', notes: '' });
      fetchAll();
    } catch { toast.error('Error'); }
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
    const slot = r.time?.slice(0, 5) || '?';
    if (!timeSlots[slot]) timeSlots[slot] = [];
    timeSlots[slot].push(r);
  });

  return (
    <div className="h-full flex flex-col" data-testid="reservations-page">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <CalendarDays size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">RESERVACIONES</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm font-mono" data-testid="reservation-date" />
          <Button onClick={() => setDialog({ open: true, customer_name: '', phone: '', date, time: '19:00', party_size: 2, table_id: '', notes: '' })}
            size="sm" className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="new-reservation-btn">
            <Plus size={14} className="mr-1" /> Nueva
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-3xl mx-auto">
          {reservations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-oswald text-lg">Sin reservaciones para {date}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(timeSlots).sort().map(([time, items]) => (
                <div key={time}>
                  <h3 className="font-oswald text-sm text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Clock size={14} /> {time}
                  </h3>
                  <div className="space-y-2">
                    {items.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border" data-testid={`reservation-${r.id}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{r.customer_name}</span>
                            <Badge className={statusColors[r.status]}>{r.status === 'confirmed' ? 'Confirmada' : r.status === 'seated' ? 'Sentados' : r.status === 'cancelled' ? 'Cancelada' : 'Completada'}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Users size={10} /> {r.party_size} personas</span>
                            {r.phone && <span className="flex items-center gap-1"><Phone size={10} /> {r.phone}</span>}
                            {r.table_number > 0 && <span>Mesa {r.table_number}</span>}
                            {r.notes && <span className="italic">{r.notes}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {r.status === 'confirmed' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-400 hover:text-green-300"
                              onClick={() => updateStatus(r.id, 'seated')}><Check size={14} /></Button>
                          )}
                          {r.status !== 'cancelled' && r.status !== 'completed' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                              onClick={() => updateStatus(r.id, 'cancelled')}><X size={14} /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteRes(r.id)}><Trash2 size={12} /></Button>
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

      {/* New Reservation Dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="new-reservation-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Reservacion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={dialog.customer_name} onChange={e => setDialog(p => ({ ...p, customer_name: e.target.value }))}
              placeholder="Nombre del cliente" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="res-name" />
            <input value={dialog.phone} onChange={e => setDialog(p => ({ ...p, phone: e.target.value }))}
              placeholder="Telefono" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="res-phone" />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={dialog.date} onChange={e => setDialog(p => ({ ...p, date: e.target.value }))}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" />
              <input type="time" value={dialog.time} onChange={e => setDialog(p => ({ ...p, time: e.target.value }))}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Personas</label>
                <input type="number" value={dialog.party_size} onChange={e => setDialog(p => ({ ...p, party_size: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mesa (opcional)</label>
                <select value={dialog.table_id} onChange={e => setDialog(p => ({ ...p, table_id: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">Auto-asignar</option>
                  {tables.filter(t => t.status === 'free').map(t => <option key={t.id} value={t.id}>Mesa {t.number} (cap: {t.capacity})</option>)}
                </select>
              </div>
            </div>
            <input value={dialog.notes} onChange={e => setDialog(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas (cumpleanos, alergias, etc.)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={handleCreate} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-reservation">
              RESERVAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
