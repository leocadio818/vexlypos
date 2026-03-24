import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatMoney } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Heart, Plus, Search, Gift, Star, Phone, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { NumericInput } from '@/components/NumericKeypad';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Admin roles that can configure loyalty points
const ADMIN_ROLES = ['admin', 'gerente', 'propietario', 'manager', 'owner'];

export default function Customers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [config, setConfig] = useState({ points_per_hundred: 10, point_value_rd: 1, min_redemption: 50 });
  const [addDialog, setAddDialog] = useState({ open: false, name: '', phone: '', email: '' });
  const [redeemDialog, setRedeemDialog] = useState({ open: false, customer: null, points: '' });
  const [configDialog, setConfigDialog] = useState(false);

  // Check if current user has admin privileges
  const isAdmin = user && ADMIN_ROLES.includes(user.role?.toLowerCase());

  const fetchAll = useCallback(async () => {
    try {
      const [cRes, cfgRes] = await Promise.all([
        axios.get(`${API}/customers`, { headers: headers() }),
        axios.get(`${API}/loyalty/config`, { headers: headers() }),
      ]);
      setAllCustomers(cRes.data);
      setConfig(cfgRes.data);
    } catch (e) { console.error('Error loading customers:', e); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filter customers locally for instant search
  useEffect(() => {
    if (!search) {
      setCustomers(allCustomers);
    } else {
      const q = search.toLowerCase();
      setCustomers(allCustomers.filter(c => 
        c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
      ));
    }
  }, [search, allCustomers]);

  const handleAddCustomer = async () => {
    if (!addDialog.name) return;
    try {
      await axios.post(`${API}/customers`, { name: addDialog.name, phone: addDialog.phone, email: addDialog.email }, { headers: headers() });
      toast.success('Cliente registrado');
      setAddDialog({ open: false, name: '', phone: '', email: '' });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleRedeem = async () => {
    const pts = parseInt(redeemDialog.points);
    if (!pts || pts < config.min_redemption) { toast.error(`Minimo ${config.min_redemption} puntos`); return; }
    try {
      const res = await axios.post(`${API}/customers/${redeemDialog.customer.id}/redeem-points`, { points: pts }, { headers: headers() });
      toast.success(`${pts} puntos canjeados = ${formatMoney(res.data.discount_rd)} descuento`);
      setRedeemDialog({ open: false, customer: null, points: '' });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const handleUpdateConfig = async () => {
    try {
      await axios.put(`${API}/loyalty/config`, config, { headers: headers() });
      toast.success('Configuracion actualizada');
      setConfigDialog(false);
    } catch { toast.error('Error'); }
  };

  return (
    <div className="h-full flex flex-col" data-testid="customers-page">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-muted rounded-lg transition-colors" data-testid="customers-back-btn">
            <ArrowLeft size={20} />
          </button>
          <Heart size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">CLIENTES & FIDELIDAD</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setConfigDialog(true)} className="text-xs" data-testid="loyalty-config-btn">
              <Star size={14} className="mr-1" /> Config Puntos
            </Button>
          )}
          <Button size="sm" onClick={() => setAddDialog({ open: true, name: '', phone: '', email: '' })}
            className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-customer-btn">
            <Plus size={14} className="mr-1" /> Nuevo Cliente
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Loyalty Info */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <Star size={20} className="mx-auto mb-1 text-yellow-400" />
              <p className="text-xs text-muted-foreground uppercase">Puntos por RD$100</p>
              <p className="font-oswald text-2xl font-bold">{config.points_per_hundred}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <Gift size={20} className="mx-auto mb-1 text-green-400" />
              <p className="text-xs text-muted-foreground uppercase">Valor del Punto</p>
              <p className="font-oswald text-2xl font-bold">RD$ {config.point_value_rd}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <Heart size={20} className="mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground uppercase">Min para Canjeo</p>
              <p className="font-oswald text-2xl font-bold">{config.min_redemption} pts</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente por nombre o telefono..."
              className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm" data-testid="customer-search" />
          </div>

          {/* Customer List */}
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {customers.map(c => (
                <div key={c.id} className="p-4 rounded-xl bg-card border border-border flex items-center justify-between" data-testid={`customer-${c.id}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <Badge variant="outline" className="text-[11px] border-yellow-500 text-yellow-400">
                        <Star size={8} className="mr-0.5" /> {c.points} pts
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {c.phone && <span className="flex items-center gap-1"><Phone size={10} /> {c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail size={10} /> {c.email}</span>}
                      <span>Visitas: {c.visits}</span>
                      <span>Consumo: {formatMoney(c.total_spent)}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setRedeemDialog({ open: true, customer: c, points: '' })}
                    disabled={c.points < config.min_redemption}
                    className="text-xs border-primary/50 text-primary" data-testid={`redeem-${c.id}`}>
                    <Gift size={14} className="mr-1" /> Canjear
                  </Button>
                </div>
              ))}
              {customers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay clientes registrados</p>}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(o) => !o && setAddDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-customer-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nuevo Cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={addDialog.name} onChange={e => setAddDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre completo" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="customer-name-input" />
            <input value={addDialog.phone} onChange={e => setAddDialog(p => ({ ...p, phone: e.target.value }))}
              placeholder="Telefono" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="customer-phone-input" />
            <input value={addDialog.email} onChange={e => setAddDialog(p => ({ ...p, email: e.target.value }))}
              placeholder="Email (opcional)" type="email" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={handleAddCustomer} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-add-customer">
              REGISTRAR CLIENTE
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Redeem Dialog */}
      <Dialog open={redeemDialog.open} onOpenChange={(o) => !o && setRedeemDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-xs bg-card border-border" data-testid="redeem-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Canjear Puntos</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{redeemDialog.customer?.name}</p>
              <p className="font-oswald text-3xl font-bold text-yellow-400">{redeemDialog.customer?.points} pts</p>
            </div>
            <NumericInput label="Valor" value={redeemDialog.points} onChange={e => setRedeemDialog(p => ({ ...p, points: e.target.value }))}
               placeholder={`Minimo ${config.min_redemption} puntos`}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald text-center text-lg" data-testid="redeem-points-input" />
            {redeemDialog.points && (
              <p className="text-center text-sm">Descuento: <span className="font-oswald text-primary font-bold">{formatMoney(parseInt(redeemDialog.points) * config.point_value_rd)}</span></p>
            )}
            <Button onClick={handleRedeem} className="w-full h-11 bg-green-600 text-white font-oswald font-bold active:scale-95" data-testid="confirm-redeem">
              <Gift size={16} className="mr-2" /> CANJEAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={configDialog} onOpenChange={setConfigDialog}>
        <DialogContent className="max-w-xs bg-card border-border" data-testid="loyalty-config-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Configurar Puntos</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Puntos por cada RD$100</label>
              <NumericInput label="Valor" value={config.points_per_hundred} onChange={e => setConfig(p => ({ ...p, points_per_hundred: parseInt(e.target.value) || 0 }))}
                 className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Valor de cada punto (RD$)</label>
              <NumericInput label="Valor" value={config.point_value_rd} onChange={e => setConfig(p => ({ ...p, point_value_rd: parseFloat(e.target.value) || 0 }))}
                 className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Minimo puntos para canjeo</label>
              <NumericInput label="Valor" value={config.min_redemption} onChange={e => setConfig(p => ({ ...p, min_redemption: parseInt(e.target.value) || 0 }))}
                 className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
            </div>
            <Button onClick={handleUpdateConfig} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
              GUARDAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
