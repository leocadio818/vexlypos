import { useState, useEffect, useCallback } from 'react';
import { Clock, ChefHat, ArrowRight, Maximize, Minimize, Volume2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const statusFlow = { sent: 'preparing', preparing: 'ready', ready: 'served' };
const statusLabels = { sent: 'NUEVO', preparing: 'PREPARANDO', ready: 'LISTO' };
const statusBg = {
  sent: 'bg-red-600', preparing: 'bg-yellow-500 text-black', ready: 'bg-green-600',
};

export default function KitchenTV() {
  const [orders, setOrders] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [time, setTime] = useState(new Date());

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/kitchen/tv`, { headers: hdrs() });
      setOrders(res.data.orders || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 4000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const advanceItem = async (orderId, itemId, currentStatus) => {
    const next = statusFlow[currentStatus];
    if (!next) return;
    try {
      await axios.put(`${API}/kitchen/items/${orderId}/${itemId}`, { status: next }, { headers: hdrs() });
      fetchOrders();
      if (next === 'ready') {
        try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1ubpB3d3V0eX2DhYaEf3x4d3x/g4aGhYJ/').play(); } catch {}
      }
    } catch {}
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4" data-testid="kitchen-tv-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ChefHat size={32} className="text-orange-500" />
          <h1 className="font-oswald text-3xl font-bold tracking-wider">COCINA</h1>
          <span className="ml-4 px-3 py-1 rounded-full bg-orange-600 text-white font-oswald text-lg font-bold animate-pulse">
            {orders.length} ORDENES
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-2xl text-gray-400">
            {time.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>

      {/* Orders Grid */}
      {orders.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 120px)' }}>
          <div className="text-center">
            <ChefHat size={80} className="mx-auto mb-4 text-gray-700" />
            <p className="font-oswald text-3xl text-gray-600">SIN ORDENES PENDIENTES</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4" data-testid="kitchen-tv-grid">
          {orders.map(order => (
            <div
              key={order.order_id}
              data-testid={`tv-order-${order.order_id}`}
              className={`rounded-2xl overflow-hidden border-2 transition-all ${
                order.is_critical ? 'border-red-500 animate-pulse shadow-[0_0_30px_rgba(255,0,0,0.5)]' :
                order.is_urgent ? 'border-yellow-500 shadow-[0_0_20px_rgba(255,200,0,0.3)]' :
                'border-gray-700'
              }`}
            >
              {/* Order Header */}
              <div className={`px-4 py-3 flex items-center justify-between ${
                order.is_critical ? 'bg-red-900' : order.is_urgent ? 'bg-yellow-900' : 'bg-gray-900'
              }`}>
                <span className="font-oswald text-3xl font-bold">
                  {order.table_number}
                </span>
                <div className="text-right">
                  <div className={`flex items-center gap-1 text-sm font-mono ${
                    order.is_critical ? 'text-red-400' : order.is_urgent ? 'text-yellow-400' : 'text-gray-400'
                  }`}>
                    <Clock size={14} />
                    <span className="font-bold">{Math.floor(order.elapsed_minutes)} min</span>
                  </div>
                  <p className="text-xs text-gray-500">{order.waiter_name}</p>
                </div>
              </div>

              {/* Items */}
              <div className="bg-gray-950 p-3 space-y-2">
                {order.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => advanceItem(order.order_id, item.id, item.status)}
                    data-testid={`tv-item-${item.id}`}
                    className={`w-full text-left p-3 rounded-xl transition-all active:scale-[0.97] ${statusBg[item.status]} bg-opacity-20 border border-current/20`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className="font-oswald text-xl font-bold mr-2">{item.quantity}x</span>
                        <span className="text-lg font-semibold">{item.product_name}</span>
                        {item.modifiers.length > 0 && (
                          <div className="mt-1">
                            {item.modifiers.map((m, i) => (
                              <span key={i} className="text-xs bg-white/10 px-2 py-0.5 rounded mr-1">{m}</span>
                            ))}
                          </div>
                        )}
                        {item.notes && <p className="text-xs italic opacity-70 mt-1">{item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold uppercase ${statusBg[item.status]}`}>
                          {statusLabels[item.status]}
                        </span>
                        {statusFlow[item.status] && <ArrowRight size={16} className="opacity-50" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
