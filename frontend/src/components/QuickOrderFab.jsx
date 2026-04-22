import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, X, Loader2, Eye, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { ordersAPI } from '@/lib/api';
import { formatMoney, billsAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';

// Can this user create/collect quick orders?
const canUseQuickOrder = (user, hasPermission) => {
  const level = user?.role_level || 0;
  const openOk = hasPermission?.('open_table') || level >= 20;
  const collectOk = hasPermission?.('collect_payment') || level >= 30;
  return openOk && collectOk;
};

export default function QuickOrderFab() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [createDialog, setCreateDialog] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queue, setQueue] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);

  const enabled = canUseQuickOrder(user, hasPermission);

  const fetchQueue = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await ordersAPI.listQuickActive();
      setQueue(Array.isArray(r.data) ? r.data : []);
    } catch { /* silent */ }
  }, [enabled]);

  useEffect(() => {
    fetchQueue();
    const t = setInterval(fetchQueue, 10000); // refresh every 10s
    return () => clearInterval(t);
  }, [fetchQueue]);

  if (!enabled) return null;

  const activeCount = queue.length;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await ordersAPI.createQuick(customerName.trim() || null);
      const orderId = res.data.id;
      notify.success(`Orden Rápida #${String(res.data.quick_order_number).padStart(2, '0')} creada`);
      setCreateDialog(false);
      setCustomerName('');
      navigate(`/order/quick/${orderId}`);
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error creando orden rápida');
    } finally {
      setCreating(false);
    }
  };

  const goCobrar = async (o) => {
    setActionLoading(o.id);
    try {
      // Look for an open bill first
      let billId = null;
      try {
        const bills = await billsAPI.list({ order_id: o.id, status: 'open' });
        if (bills.data?.length) billId = bills.data[0].id;
      } catch {}
      if (billId) {
        navigate(`/payment/${billId}`);
      } else {
        navigate(`/order/quick/${o.id}`);
      }
      setQueueOpen(false);
    } finally {
      setActionLoading(null);
    }
  };

  const markDelivered = async (o) => {
    setActionLoading(o.id);
    try {
      await ordersAPI.setQuickStatus(o.id, 'delivered');
      notify.success('Orden entregada');
      await fetchQueue();
    } catch {
      notify.error('Error actualizando orden');
    } finally {
      setActionLoading(null);
    }
  };

  const openOrder = (o) => {
    setQueueOpen(false);
    navigate(`/order/quick/${o.id}`);
  };

  const totalOfOrder = (o) => {
    const items = (o.items || []).filter(i => i.status !== 'cancelled');
    return items.reduce((s, i) => s + (Number(i.unit_price || 0) * Number(i.quantity || 1)), 0);
  };

  const itemsPreview = (o) => {
    const items = (o.items || []).filter(i => i.status !== 'cancelled');
    if (!items.length) return 'Sin productos';
    return items.slice(0, 3).map(i => `${i.quantity}x ${i.product_name}`).join(', ') + (items.length > 3 ? `, +${items.length - 3}` : '');
  };

  return (
    <>
      {/* Floating Action Button — bottom right */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40" data-testid="quick-order-fab">
        <div className="relative">
          <button
            onClick={() => setCreateDialog(true)}
            data-testid="quick-order-btn"
            className="bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600 hover:from-amber-500 hover:via-orange-500 hover:to-orange-700 text-white shadow-2xl shadow-orange-500/50 rounded-full h-14 pl-4 pr-5 flex items-center gap-2 transition-all active:scale-95 border-2 border-white/30 backdrop-blur-sm"
            aria-label="Orden Rápida"
          >
            <Zap size={20} className="fill-white" />
            <span className="font-oswald font-bold text-sm tracking-wider uppercase">Orden Rápida</span>
          </button>
          {activeCount > 0 && (
            <button
              onClick={() => setQueueOpen(true)}
              data-testid="quick-order-queue-badge"
              className="absolute -top-2 -left-2 min-w-[26px] h-[26px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow-md active:scale-90 transition-all"
              aria-label={`${activeCount} órdenes rápidas activas`}
            >
              {activeCount}
            </button>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialog} onOpenChange={(o) => { if (!o) { setCreateDialog(false); setCustomerName(''); } }}>
        <DialogContent className="max-w-sm" data-testid="quick-order-create-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Zap size={18} className="text-orange-500 fill-orange-400" /> Nueva Orden Rápida
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre del cliente (opcional)</label>
              <input
                autoFocus
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate(); }}
                placeholder="Nombre para el pedido (opcional)"
                maxLength={40}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                data-testid="quick-order-name-input"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Si lo dejas vacío se usará "Orden Rápida #XX" secuencial.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialog(false); setCustomerName(''); }}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="quick-order-continue-btn">
              {creating ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Zap size={14} className="mr-1.5" />}
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Queue Panel Dialog */}
      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col" data-testid="quick-order-queue-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Zap size={18} className="text-orange-500 fill-orange-400" />
              Órdenes Rápidas Activas ({queue.length})
            </DialogTitle>
          </DialogHeader>
          <p className="text-[10px] text-muted-foreground -mt-2 mb-1">
            Las órdenes cobradas se marcan como entregadas automáticamente tras 7 min.
          </p>
          <div className="space-y-2 overflow-y-auto pr-1 -mr-1">
            {queue.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No hay órdenes rápidas activas.
              </div>
            )}
            {queue.map(o => {
              const total = totalOfOrder(o);
              const status = o.quick_order_status || 'preparing';
              return (
                <div key={o.id} data-testid={`quick-order-row-${o.id}`}
                  className="border border-border rounded-lg p-3 bg-card hover:border-orange-500/50 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-oswald font-bold text-orange-500">#{String(o.quick_order_number).padStart(2, '0')}</span>
                    <span className="font-bold truncate flex-1">{o.quick_order_name || 'Sin nombre'}</span>
                    <span className="font-oswald font-bold text-sm">{formatMoney(total)}</span>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{itemsPreview(o)}</p>
                  <div className="flex items-center gap-2">
                    {status === 'preparing' && (
                      <Button size="sm" onClick={() => goCobrar(o)} disabled={actionLoading === o.id}
                        className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs flex-1"
                        data-testid={`quick-order-cobrar-${o.id}`}>
                        <DollarSign size={12} className="mr-1" /> Cobrar
                      </Button>
                    )}
                    {status === 'paid' && (
                      <Button size="sm" onClick={() => markDelivered(o)} disabled={actionLoading === o.id}
                        className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs flex-1"
                        data-testid={`quick-order-deliver-${o.id}`}>
                        <CheckCircle2 size={12} className="mr-1" /> Entregar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openOrder(o)} className="h-8 text-xs"
                      data-testid={`quick-order-view-${o.id}`}>
                      <Eye size={12} className="mr-1" /> Ver
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueueOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }) {
  if (status === 'preparing') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 text-[10px] font-bold"><Clock size={10} /> Preparando</span>;
  if (status === 'paid') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-700 text-[10px] font-bold"><DollarSign size={10} /> Cobrado</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-700 text-[10px] font-bold"><CheckCircle2 size={10} /> Entregado</span>;
}
