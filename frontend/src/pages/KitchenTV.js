import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, ChefHat, ArrowRight, Maximize, Minimize, Settings, Keyboard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
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
  const [authReady, setAuthReady] = useState(!!localStorage.getItem('pos_token'));
  const [searchParams] = useSearchParams();

  // Auto-login from URL ?pin=XXXX
  useEffect(() => {
    if (authReady) return;
    const pin = searchParams.get('pin');
    if (pin) {
      axios.post(`${API}/auth/auto-login`, { pin }).then(res => {
        localStorage.setItem('pos_token', res.data.token);
        setAuthReady(true);
      }).catch(() => {});
    }
  }, [searchParams, authReady]);

  const fetchOrders = useCallback(async () => {
    if (!authReady) return;
    try {
      const res = await axios.get(`${API}/kitchen/tv`, { headers: hdrs() });
      const newOrders = res.data.orders || [];
      // Play sound if new orders arrived
      if (newOrders.length > orders.length && orders.length > 0) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 800; gain.gain.value = 0.3;
          osc.start(); osc.stop(ctx.currentTime + 0.3);
          setTimeout(() => { const o2 = ctx.createOscillator(); o2.connect(gain); o2.frequency.value = 1000; o2.start(); o2.stop(ctx.currentTime + 0.2); }, 350);
        } catch {}
      }
      setOrders(newOrders);
      if (res.data.config) setConfig(prev => ({ ...prev, ...res.data.config }));
    } catch {}
  }, [authReady, orders.length]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 4000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const advanceItem = useCallback(async (orderId, itemId, currentStatus) => {
    const next = statusFlow[currentStatus];
    if (!next) return;
    try {
      await axios.put(`${API}/kitchen/items/${orderId}/${itemId}`, { status: next }, { headers: hdrs() });
      fetchOrders();
    } catch {}
  }, [fetchOrders]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (settingsOpen || helpOpen) return;
      const key = e.key;
      if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key) - 1;
        if (idx < orders.length) { setSelectedOrder(idx); setSelectedItem(0); }
        e.preventDefault(); return;
      }
      if (key === 'ArrowDown' || key === 'ArrowRight') {
        e.preventDefault();
        const order = orders[selectedOrder];
        if (order) setSelectedItem(prev => Math.min(prev + 1, order.items.length - 1));
        return;
      }
      if (key === 'ArrowUp' || key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedItem(prev => Math.max(prev - 1, 0));
        return;
      }
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        const order = orders[selectedOrder];
        if (order?.items[selectedItem]) advanceItem(order.order_id, order.items[selectedItem].id, order.items[selectedItem].status);
        return;
      }
      if (key === '0') {
        e.preventDefault();
        const order = orders[selectedOrder];
        if (order) order.items.forEach(item => { if (statusFlow[item.status]) advanceItem(order.order_id, item.id, item.status); });
        return;
      }
      if (key === 'F11') { e.preventDefault(); toggleFullscreen(); }
      if (key === 'F1') { e.preventDefault(); setHelpOpen(true); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, selectedOrder, selectedItem, advanceItem, settingsOpen, helpOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); setFullscreen(true); }
    else { document.exitFullscreen(); setFullscreen(false); }
  };

  const handleSaveConfig = async () => {
    try {
      await axios.put(`${API}/kitchen/config`, config, { headers: hdrs() });
      notify.success('Configuracion guardada');
      setSettingsOpen(false);
    } catch { notify.error('Error'); }
  };

  // Auth loading/prompt screen
  if (!authReady) {
    const pin = searchParams.get('pin');
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <ChefHat size={64} className="mx-auto mb-4 text-orange-500" />
          <h1 className="font-oswald text-3xl mb-2">KITCHEN TV</h1>
          {pin ? (
            <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mt-4" />
          ) : (
            <div>
              <p className="text-gray-400 mb-4">Agrega ?pin=XXXX a la URL para inicio automatico</p>
              <p className="text-gray-600 text-sm font-mono">Ejemplo: /kitchen-tv?pin=9999</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white select-none" data-testid="kitchen-tv-page">
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

      {/* Key indicators */}
      {orders.length > 0 && (
        <div className="flex gap-1 px-4 pb-2 items-center">
          {orders.slice(0, 9).map((_, i) => (
            <span key={i} className={`px-2 py-0.5 rounded text-xs font-mono ${selectedOrder === i ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>{i + 1}</span>
          ))}
          <span className="text-gray-600 text-xs ml-2">NUMPAD: seleccionar | FLECHAS: navegar | ENTER: avanzar | 0: avanzar todo</span>
        </div>
      )}

      {/* Orders Grid */}
      {orders.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 90px)' }}>
          <div className="text-center">
            <ChefHat size={80} className="mx-auto mb-4 text-gray-700" />
            <p className="font-oswald text-3xl text-gray-600">SIN ORDENES PENDIENTES</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 px-4 pb-4" data-testid="kitchen-tv-grid">
          {orders.map((order, orderIdx) => (
            <div key={order.order_id} data-testid={`tv-order-${order.order_id}`}
              className={`rounded-2xl overflow-hidden transition-all ${
                selectedOrder === orderIdx ? 'ring-2 ring-orange-500 shadow-[0_0_20px_rgba(255,102,0,0.4)]' : ''
              } ${order.is_critical ? 'border-2 border-red-500 animate-pulse' : order.is_urgent ? 'border-2 border-yellow-500' : order.is_warning ? 'border border-orange-500/50' : 'border border-gray-700'}`}>
              <div className={`px-3 py-2 flex items-center justify-between ${
                order.is_critical ? 'bg-red-900' : order.is_urgent ? 'bg-yellow-900' : 'bg-gray-900'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-white/10 px-1 rounded text-gray-400">{orderIdx + 1}</span>
                  <span className="font-oswald text-2xl font-bold">{order.table_number}</span>
                </div>
                <div className="text-right">
                  <span className={`font-mono text-sm font-bold ${order.is_critical ? 'text-red-400' : order.is_urgent ? 'text-yellow-400' : 'text-gray-400'}`}>
                    <Clock size={12} className="inline mr-1" />{Math.floor(order.elapsed_minutes)}m
                  </span>
                  <p className="text-[11px] text-gray-500">{order.waiter_name}</p>
                </div>
              </div>
              <div className="bg-gray-950 p-2 space-y-1">
                {order.items.map((item, itemIdx) => (
                  <div key={item.id} data-testid={`tv-item-${item.id}`}
                    onClick={() => advanceItem(order.order_id, item.id, item.status)}
                    className={`p-2 rounded-xl border cursor-pointer transition-all ${statusBg[item.status]} ${
                      selectedOrder === orderIdx && selectedItem === itemIdx ? 'ring-2 ring-white' : ''
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className="font-oswald text-lg font-bold mr-1">{item.quantity}x</span>
                        <span className="font-semibold">{item.product_name}</span>
                        {item.modifiers.length > 0 && (
                          <div className="mt-0.5">{item.modifiers.map((m, i) => <span key={i} className="text-[11px] bg-white/10 px-1 rounded mr-0.5">{m}</span>)}</div>
                        )}
                        {item.notes && <p className="text-[11px] italic opacity-70">{item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          item.status === 'sent' ? 'bg-red-600 text-white' : item.status === 'preparing' ? 'bg-yellow-500 text-black' : 'bg-green-600 text-white'
                        }`}>{statusLabels[item.status]}</span>
                        {statusFlow[item.status] && <ArrowRight size={12} className="opacity-40" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm bg-gray-900 border-gray-700 text-white" data-testid="kitchen-config-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white">Tiempos de Alerta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {[
              { key: 'warning_minutes', label: 'Alerta naranja (min)', color: 'text-orange-400' },
              { key: 'urgent_minutes', label: 'Alerta amarilla (min)', color: 'text-yellow-400' },
              { key: 'critical_minutes', label: 'Alerta roja/critica (min)', color: 'text-red-400' },
            ].map(({ key, label, color }) => (
              <div key={key}>
                <label className={`text-sm ${color} mb-1 block`}>{label}</label>
                <input type="number" value={config[key]} onChange={e => setConfig(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                  className={`w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-lg font-oswald ${color}`} />
              </div>
            ))}
            <Button onClick={handleSaveConfig} className="w-full h-12 bg-orange-600 text-white font-oswald font-bold active:scale-95">GUARDAR</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-white" data-testid="kitchen-help-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white flex items-center gap-2">
            <Keyboard size={20} className="text-orange-500" /> Control por Teclado Numerico
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              {[
                { label: 'Seleccionar orden', keys: '1-9' },
                { label: 'Navegar items', keys: 'Flechas' },
                { label: 'Avanzar item', keys: 'ENTER' },
                { label: 'Avanzar TODA la orden', keys: '0' },
                { label: 'Pantalla completa', keys: 'F11' },
                { label: 'Ayuda', keys: 'F1' },
              ].map(({ label, keys }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">{label}</span>
                  <span className="px-2 py-1 rounded bg-gray-700 text-xs font-mono font-bold">{keys}</span>
                </div>
              ))}
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <h4 className="font-oswald text-sm font-bold text-orange-500 mb-2">INICIO AUTOMATICO (Modo Kiosco)</h4>
              <p className="text-xs text-gray-400 mb-2">Para iniciar automaticamente al encender PC:</p>
              <div className="bg-black rounded-lg p-3 font-mono text-xs text-green-400 space-y-1">
                <p className="text-gray-500">Windows - Acceso directo en shell:startup:</p>
                <p className="break-all">"chrome.exe" --kiosk "{window.location.origin}/kitchen-tv?pin=9999"</p>
                <p className="text-gray-500 mt-2">Linux:</p>
                <p className="break-all">chromium --kiosk "{window.location.origin}/kitchen-tv?pin=9999"</p>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Reemplaza 9999 con el PIN de cocina.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
