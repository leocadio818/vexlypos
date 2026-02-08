import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Clock, ChefHat, ArrowRight, Maximize, Minimize, Settings, Keyboard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const statusFlow = { sent: 'preparing', preparing: 'ready', ready: 'served' };
const statusLabels = { sent: 'NUEVO', preparing: 'PREPARANDO', ready: 'LISTO' };
const statusBg = {
  sent: 'bg-red-600/30 border-red-500', preparing: 'bg-yellow-500/20 border-yellow-500', ready: 'bg-green-600/30 border-green-500',
};

export default function KitchenTV() {
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState({ warning_minutes: 15, urgent_minutes: 25, critical_minutes: 35 });
  const [selectedOrder, setSelectedOrder] = useState(0);
  const [selectedItem, setSelectedItem] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [autoLogged, setAutoLogged] = useState(false);
  const { user, login } = useAuth();
  const [searchParams] = useSearchParams();
  const containerRef = useRef(null);

  // Auto-login from URL ?pin=XXXX
  useEffect(() => {
    const pin = searchParams.get('pin');
    if (pin && !user && !autoLogged) {
      setAutoLogged(true);
      (async () => {
        try {
          const res = await axios.post(`${API}/auth/auto-login`, { pin });
          localStorage.setItem('pos_token', res.data.token);
          window.location.reload();
        } catch {
          console.error('Auto-login failed');
        }
      })();
    }
  }, [searchParams, user, autoLogged]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/kitchen/tv`, { headers: hdrs() });
      setOrders(res.data.orders || []);
      if (res.data.config) setConfig(res.data.config);
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

  // Keyboard handler - NUMPAD for order selection, arrows for items, Enter to advance
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key;

      // Numpad 1-9 or regular 1-9 = select order by position
      if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key) - 1;
        if (idx < orders.length) {
          setSelectedOrder(idx);
          setSelectedItem(0);
          e.preventDefault();
        }
        return;
      }

      // Arrow Up/Down = navigate items within selected order
      if (key === 'ArrowDown' || key === 'ArrowRight') {
        e.preventDefault();
        const order = orders[selectedOrder];
        if (order) {
          setSelectedItem(prev => Math.min(prev + 1, order.items.length - 1));
        }
        return;
      }
      if (key === 'ArrowUp' || key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedItem(prev => Math.max(prev - 1, 0));
        return;
      }

      // Enter or Space = advance selected item
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        const order = orders[selectedOrder];
        if (order && order.items[selectedItem]) {
          advanceItem(order.order_id, order.items[selectedItem].id, order.items[selectedItem].status);
        }
        return;
      }

      // 0 or Numpad 0 = advance ALL items in selected order
      if (key === '0') {
        e.preventDefault();
        const order = orders[selectedOrder];
        if (order) {
          order.items.forEach(item => {
            if (statusFlow[item.status]) advanceItem(order.order_id, item.id, item.status);
          });
        }
        return;
      }

      // F11 = toggle fullscreen
      if (key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      // F1 = help
      if (key === 'F1') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      // Escape = close dialogs
      if (key === 'Escape') {
        setSettingsOpen(false);
        setHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, selectedOrder, selectedItem]);

  const advanceItem = async (orderId, itemId, currentStatus) => {
    const next = statusFlow[currentStatus];
    if (!next) return;
    try {
      await axios.put(`${API}/kitchen/items/${orderId}/${itemId}`, { status: next }, { headers: hdrs() });
      fetchOrders();
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

  const handleSaveConfig = async () => {
    try {
      await axios.put(`${API}/kitchen/config`, config, { headers: hdrs() });
      toast.success('Configuracion guardada');
      setSettingsOpen(false);
    } catch { toast.error('Error'); }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-black text-white select-none" data-testid="kitchen-tv-page">
      <Toaster position="top-center" />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <ChefHat size={28} className="text-orange-500" />
          <h1 className="font-oswald text-2xl font-bold tracking-wider">COCINA</h1>
          <span className="ml-2 px-3 py-1 rounded-full bg-orange-600 text-white font-oswald text-base font-bold animate-pulse">
            {orders.length} ORDENES
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setHelpOpen(true)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" title="Ayuda (F1)">
            <Keyboard size={18} />
          </button>
          <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" title="Config">
            <Settings size={18} />
          </button>
          <span className="font-mono text-xl text-gray-400">
            {time.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {/* Key mapping indicator */}
      <div className="flex gap-1 px-4 pb-2">
        {orders.slice(0, 9).map((_, i) => (
          <span key={i} className={`px-2 py-0.5 rounded text-xs font-mono ${selectedOrder === i ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
            {i + 1}
          </span>
        ))}
        {orders.length > 0 && (
          <span className="text-gray-600 text-xs ml-2 self-center">Tecla {selectedOrder + 1} seleccionada | Flechas: navegar items | Enter: avanzar</span>
        )}
      </div>

      {/* Orders Grid */}
      {orders.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 100px)' }}>
          <div className="text-center">
            <ChefHat size={80} className="mx-auto mb-4 text-gray-700" />
            <p className="font-oswald text-3xl text-gray-600">SIN ORDENES PENDIENTES</p>
            <p className="text-gray-700 text-sm mt-2">Las ordenes apareceran automaticamente</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 px-4 pb-4" data-testid="kitchen-tv-grid">
          {orders.map((order, orderIdx) => (
            <div
              key={order.order_id}
              data-testid={`tv-order-${order.order_id}`}
              className={`rounded-2xl overflow-hidden transition-all ${
                selectedOrder === orderIdx ? 'ring-3 ring-orange-500 shadow-[0_0_30px_rgba(255,102,0,0.4)]' : ''
              } ${
                order.is_critical ? 'border-2 border-red-500 animate-pulse shadow-[0_0_30px_rgba(255,0,0,0.5)]' :
                order.is_urgent ? 'border-2 border-yellow-500 shadow-[0_0_20px_rgba(255,200,0,0.3)]' :
                order.is_warning ? 'border-2 border-orange-500/50' : 'border border-gray-700'
              }`}
            >
              {/* Order Header */}
              <div className={`px-4 py-2 flex items-center justify-between ${
                order.is_critical ? 'bg-red-900' : order.is_urgent ? 'bg-yellow-900' : order.is_warning ? 'bg-orange-900/50' : 'bg-gray-900'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded text-gray-400">{orderIdx + 1}</span>
                  <span className="font-oswald text-3xl font-bold">{order.table_number}</span>
                </div>
                <div className="text-right">
                  <div className={`flex items-center gap-1 text-sm font-mono font-bold ${
                    order.is_critical ? 'text-red-400' : order.is_urgent ? 'text-yellow-400' : order.is_warning ? 'text-orange-400' : 'text-gray-400'
                  }`}>
                    <Clock size={14} />
                    {Math.floor(order.elapsed_minutes)} min
                  </div>
                  <p className="text-[10px] text-gray-500">{order.waiter_name}</p>
                </div>
              </div>

              {/* Items */}
              <div className="bg-gray-950 p-2 space-y-1.5">
                {order.items.map((item, itemIdx) => {
                  const isSelected = selectedOrder === orderIdx && selectedItem === itemIdx;
                  return (
                    <div
                      key={item.id}
                      data-testid={`tv-item-${item.id}`}
                      onClick={() => advanceItem(order.order_id, item.id, item.status)}
                      className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer border ${statusBg[item.status]} ${
                        isSelected ? 'ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className="font-oswald text-lg font-bold mr-2">{item.quantity}x</span>
                          <span className="text-base font-semibold">{item.product_name}</span>
                          {item.modifiers.length > 0 && (
                            <div className="mt-0.5">
                              {item.modifiers.map((m, i) => (
                                <span key={i} className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded mr-1">{m}</span>
                              ))}
                            </div>
                          )}
                          {item.notes && <p className="text-[10px] italic opacity-70 mt-0.5">{item.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                            item.status === 'sent' ? 'bg-red-600 text-white' :
                            item.status === 'preparing' ? 'bg-yellow-500 text-black' : 'bg-green-600 text-white'
                          }`}>
                            {statusLabels[item.status]}
                          </span>
                          {statusFlow[item.status] && <ArrowRight size={14} className="opacity-40" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm bg-gray-900 border-gray-700 text-white" data-testid="kitchen-config-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white">Configuracion de Tiempos</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Alerta amarilla (minutos)</label>
              <input type="number" value={config.warning_minutes}
                onChange={e => setConfig(p => ({ ...p, warning_minutes: parseInt(e.target.value) || 15 }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-lg font-oswald text-orange-400" data-testid="config-warning" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Alerta urgente (minutos)</label>
              <input type="number" value={config.urgent_minutes}
                onChange={e => setConfig(p => ({ ...p, urgent_minutes: parseInt(e.target.value) || 25 }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-lg font-oswald text-yellow-400" data-testid="config-urgent" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Alerta critica (minutos)</label>
              <input type="number" value={config.critical_minutes}
                onChange={e => setConfig(p => ({ ...p, critical_minutes: parseInt(e.target.value) || 35 }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-lg font-oswald text-red-400" data-testid="config-critical" />
            </div>
            <Button onClick={handleSaveConfig} className="w-full h-12 bg-orange-600 text-white font-oswald font-bold active:scale-95" data-testid="save-kitchen-config">
              GUARDAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help/Keyboard Shortcuts Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-white" data-testid="kitchen-help-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white flex items-center gap-2">
            <Keyboard size={20} className="text-orange-500" /> Control por Teclado Numerico
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Seleccionar orden</span>
                <div className="flex gap-1">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <span key={n} className="w-7 h-7 rounded bg-gray-700 flex items-center justify-center text-xs font-bold font-mono">{n}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Navegar items</span>
                <div className="flex gap-1">
                  <span className="px-2 h-7 rounded bg-gray-700 flex items-center justify-center text-xs font-mono">Flechas</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Avanzar item seleccionado</span>
                <span className="px-3 h-7 rounded bg-orange-600 flex items-center justify-center text-xs font-bold font-mono">ENTER</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Avanzar TODA la orden</span>
                <span className="w-7 h-7 rounded bg-orange-600 flex items-center justify-center text-xs font-bold font-mono">0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Pantalla completa</span>
                <span className="px-2 h-7 rounded bg-gray-700 flex items-center justify-center text-xs font-mono">F11</span>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4">
              <h4 className="font-oswald text-sm font-bold text-orange-500 mb-2">INICIO AUTOMATICO (Modo Kiosco)</h4>
              <p className="text-xs text-gray-400 leading-relaxed mb-2">
                Para que la cocina se inicie automaticamente al encender el PC:
              </p>
              <div className="bg-black rounded-lg p-3 font-mono text-[11px] text-green-400 space-y-2">
                <p className="text-gray-500">// Windows - Crear acceso directo en:</p>
                <p>shell:startup</p>
                <p className="text-gray-500">// Con este contenido:</p>
                <p className="break-all">"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required "{window.location.origin}/kitchen-tv?pin=9999"</p>
                <p className="text-gray-500 mt-3">// Linux - Agregar a autostart:</p>
                <p className="break-all">chromium-browser --kiosk --noerrdialogs "{window.location.origin}/kitchen-tv?pin=9999"</p>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                Reemplaza 9999 con el PIN del usuario de cocina. Chrome abrira automaticamente en pantalla completa con la cocina activa.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
