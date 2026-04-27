import { useState, useEffect, useCallback, useRef } from 'react';
import { kitchenAPI } from '@/lib/api';
import { Clock, ChefHat, CheckCircle2, ArrowRight, Printer, Monitor, Wifi, WifiOff } from 'lucide-react';
import { notify } from '@/lib/notify';
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
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  // SSE Connection for real-time updates
  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    if (!token) return;

    const connectSSE = () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `${API_BASE}/api/kitchen/stream`;
      eventSourceRef.current = new EventSource(url);

      eventSourceRef.current.onopen = () => {
        setConnected(true);
        console.log('KDS: Connected to real-time stream');
      };

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setOrders(data);
          setConnected(true);
        } catch (e) {
          console.error('KDS: Error parsing SSE data', e);
        }
      };

      eventSourceRef.current.onerror = (err) => {
        console.error('KDS: SSE connection error', err);
        setConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [API_BASE]);

  // Fallback polling if SSE fails
  const fetchOrders = useCallback(async () => {
    try {
      const res = await kitchenAPI.orders();
      setOrders(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchOrders();
    // Fallback polling every 10 seconds (SSE should handle most updates)
    const interval = setInterval(() => {
      if (!connected) {
        fetchOrders();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders, connected]);

  const advanceItem = async (orderId, itemId, currentStatus) => {
    const next = statusFlow[currentStatus];
    if (!next) return;
    try {
      await kitchenAPI.updateItem(orderId, itemId, { status: next });
      notify.success(`Item: ${statusLabels[next]}`);
      // Refresh immediately after action
      fetchOrders();
    } catch {
      notify.error('Error actualizando');
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
          {/* Connection indicator */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
            {connected ? 'EN VIVO' : 'RECONECTANDO...'}
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-xs">{orders.length} ordenes activas</Badge>
        <a href="/kitchen-tv" target="_blank" rel="noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-oswald hover:bg-primary hover:text-white transition-all"
          data-testid="kitchen-tv-link">
          <Monitor size={14} /> PANTALLA TV
        </a>
      </div>

      <div className="flex-1 p-4 pb-28 sm:pb-4 overflow-auto">
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
              const kitchenItems = order.items.filter(i => i.sent_to_kitchen && !['served', 'cancelled'].includes(i.status) && !i.is_combo);
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
                  <div className="px-3 py-1.5 border-b border-dashed border-gray-300 text-xs text-gray-600 flex items-center justify-between">
                    <span>Mesero: <span className="font-semibold">{order.waiter_name}</span></span>
                    <button onClick={async () => {
                      try { const r = await fetch(`${API_BASE}/api/print/comanda/${order.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
                        const d = await r.json(); setPrintHtml(d.html); setPrintOpen(true); } catch {}
                    }} className="text-gray-400 hover:text-gray-700"><Printer size={14} /></button>
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
                              {item.is_open_item && (
                                <span className="text-[9px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded" data-testid={`kitchen-libre-badge`}>*** LIBRE ***</span>
                              )}
                              <span className={`text-sm font-semibold ${item.is_open_item ? 'text-orange-700' : 'text-gray-800'}`}>
                                {item.product_name?.replace(/^\[LIBRE\]\s*/, '')}
                              </span>
                            </div>
                            {item.is_open_item && item.kitchen_note && (
                              <p className="text-xs text-orange-700 font-semibold mt-1">★ {item.kitchen_note}</p>
                            )}
                            {item.modifiers?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.modifiers.map((m, i) => {
                                  const prefix = m.group_name ? `${m.group_name.toUpperCase()}: ` : '';
                                  return (
                                    <span key={i} className="text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium" data-testid={`kitchen-mod-${i}`}>
                                      {prefix}{m.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            {item.notes && <p className="text-xs text-gray-500 mt-1 italic">{item.notes}</p>}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-bold uppercase shrink-0 ml-2">
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

      {/* Print Comanda Dialog */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-sm bg-white text-black" data-testid="print-comanda-dialog">
          <DialogHeader><DialogTitle className="text-black font-oswald">Vista Previa de Comanda</DialogTitle></DialogHeader>
          <div className="p-2" style={{maxWidth: '72mm', margin: '0 auto'}} dangerouslySetInnerHTML={{ __html: printHtml }} />
          <Button onClick={() => {
            const w = window.open('', '_blank', 'width=320,height=600');
            w.document.write(`<html><head><style>@page{size:80mm auto;margin:0;}body{width:80mm;margin:0 auto;padding:0;font-family:monospace;}</style></head><body>${printHtml}</body></html>`);
            w.document.close();
            w.print();
          }} className="w-full h-11 bg-gray-900 text-white font-oswald font-bold active:scale-95">
            <Printer size={16} className="mr-2" /> IMPRIMIR COMANDA
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
