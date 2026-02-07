import { useState, useEffect, useCallback } from 'react';
import { kitchenAPI } from '@/lib/api';
import { Clock, ChefHat, CheckCircle2, ArrowRight, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const statusFlow = { sent: 'preparing', preparing: 'ready', ready: 'served' };
const statusLabels = { sent: 'Pendiente', preparing: 'Preparando', ready: 'Listo', served: 'Servido' };
const statusColors = {
  sent: 'bg-yellow-500/20 border-yellow-500 text-yellow-400',
  preparing: 'bg-orange-500/20 border-orange-500 text-orange-400',
  ready: 'bg-green-500/20 border-green-500 text-green-400',
  served: 'bg-green-800/20 border-green-700 text-green-600',
};

export default function Kitchen() {
  const [orders, setOrders] = useState([]);
  const [printHtml, setPrintHtml] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  const fetchOrders = useCallback(async () => {
    try {
      const res = await kitchenAPI.orders();
      setOrders(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const advanceItem = async (orderId, itemId, currentStatus) => {
    const next = statusFlow[currentStatus];
    if (!next) return;
    try {
      await kitchenAPI.updateItem(orderId, itemId, { status: next });
      toast.success(`Item: ${statusLabels[next]}`);
      fetchOrders();
    } catch {
      toast.error('Error actualizando');
    }
  };

  const getTimeSince = (isoStr) => {
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
    if (diff < 1) return 'Ahora';
    if (diff < 60) return `${diff} min`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  return (
    <div className="h-full flex flex-col" data-testid="kitchen-page">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <ChefHat size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">COCINA</h1>
        </div>
        <Badge variant="outline" className="font-mono text-xs">{orders.length} ordenes activas</Badge>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {orders.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <ChefHat size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-oswald text-lg">Sin ordenes pendientes</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orders.map(order => {
              const kitchenItems = order.items.filter(i => i.sent_to_kitchen && !['served', 'cancelled'].includes(i.status));
              if (kitchenItems.length === 0) return null;

              const hasPreparing = kitchenItems.some(i => i.status === 'preparing');
              const isUrgent = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000) > 15;

              return (
                <div
                  key={order.id}
                  data-testid={`kitchen-order-${order.id}`}
                  className={`receipt-paper ticket-edge relative rounded-t-lg overflow-hidden ${isUrgent ? 'ring-2 ring-red-500 animate-pulse' : ''}`}
                >
                  {/* Header */}
                  <div className="bg-primary px-3 py-2 flex items-center justify-between">
                    <span className="font-oswald text-lg font-bold text-white">Mesa {order.table_number}</span>
                    <span className="flex items-center gap-1 text-white/80 text-xs font-mono">
                      <Clock size={12} /> {getTimeSince(order.created_at)}
                    </span>
                  </div>

                  {/* Waiter */}
                  <div className="px-3 py-1.5 border-b border-dashed border-gray-300 text-xs text-gray-600">
                    Mesero: <span className="font-semibold">{order.waiter_name}</span>
                  </div>

                  {/* Items */}
                  <div className="p-3 space-y-2">
                    {kitchenItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => advanceItem(order.id, item.id, item.status)}
                        data-testid={`kitchen-item-${item.id}`}
                        className={`w-full text-left p-2 rounded-lg border transition-all active:scale-[0.97] ${statusColors[item.status]}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-oswald text-base font-bold text-gray-900">{item.quantity}x</span>
                              <span className="text-sm font-semibold text-gray-800">{item.product_name}</span>
                            </div>
                            {item.modifiers?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.modifiers.map((m, i) => (
                                  <span key={i} className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">{m.name}</span>
                                ))}
                              </div>
                            )}
                            {item.notes && <p className="text-[10px] text-gray-500 mt-1 italic">{item.notes}</p>}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-bold uppercase shrink-0 ml-2">
                            <span>{statusLabels[item.status]}</span>
                            {statusFlow[item.status] && <ArrowRight size={12} />}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
