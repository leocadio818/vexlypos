/**
 * TicketDemo - Página de demostración del ticket térmico
 * Permite visualizar y probar el formato del ticket
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Eye, RefreshCw, Settings, Cloud, CloudOff } from 'lucide-react';
import ThermalTicket, { printTicket, useBusinessConfig } from '../components/ThermalTicket';
import { notify } from '@/lib/notify';

// Datos de ejemplo para demostración
const DEMO_BILL = {
  id: 'demo-001',
  ncf: 'B0200012345',
  table_number: 5,
  label: 'Mesa 5',
  sale_type: 'dine_in',
  sale_type_name: 'Para comer aquí',
  cashier_name: 'Juan Pérez',
  created_at: new Date().toISOString(),
  paid_at: new Date().toISOString(),
  status: 'paid',
  payment_method: 'cash',
  payment_method_name: 'Efectivo RD$',
  items: [
    {
      product_name: 'Mofongo con Camarones',
      quantity: 2,
      unit_price: 650,
      total: 1300,
      modifiers: [
        { name: 'Extra salsa', price: 50 }
      ]
    },
    {
      product_name: 'Sancocho Dominicano',
      quantity: 1,
      unit_price: 450,
      total: 450,
      modifiers: []
    },
    {
      product_name: 'Jugo de Chinola',
      quantity: 3,
      unit_price: 120,
      total: 360,
      modifiers: []
    },
    {
      product_name: 'Arroz con Pollo',
      quantity: 1,
      unit_price: 380,
      total: 380,
      modifiers: []
    }
  ],
  subtotal: 2490,
  itbis: 448.20,
  itbis_rate: 18,
  propina_legal: 249,
  propina_percentage: 10,
  total: 3187.20,
  tax_breakdown: [
    { tax_id: 'ITBIS', description: 'ITBIS', rate: 18, amount: 448.20, is_tip: false },
    { tax_id: 'PROPINA', description: 'Propina Legal', rate: 10, amount: 249, is_tip: true }
  ],
  customer_name: 'María García',
  customer_rnc: '001-1234567-8',
  points_earned: 32,
  amount_received: 3500
};

// Configuración personalizable del negocio
const DEFAULT_CONFIG = {
  name: 'RESTAURANTE DEMO',
  legal_name: 'RESTAURANTE DEMO SRL',
  rnc: '1-31-12345-6',
  address: 'Av. Winston Churchill #123',
  address2: 'Ens. Piantini, Santo Domingo',
  phone: '809-555-1234',
  email: 'info@restaurantedemo.com',
  ncf_expiry: '31/12/2025',
  footer_message: '¡Gracias por su visita!',
  dgii_message: 'Conserve este documento para fines de DGII'
};

export default function TicketDemo() {
  const navigate = useNavigate();
  const ticketRef = useRef(null);
  const [bill, setBill] = useState(DEMO_BILL);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [isCopy, setIsCopy] = useState(false);
  const [isVoid, setIsVoid] = useState(false);
  const [showBarcode, setShowBarcode] = useState(true);
  const [ncfType, setNcfType] = useState('B02');
  const [usingServerConfig, setUsingServerConfig] = useState(false);

  // Load business config from server
  const { config: serverConfig, loading: configLoading } = useBusinessConfig();

  // Use server config as initial values when loaded
  useEffect(() => {
    if (!configLoading && serverConfig) {
      const isConfigured = serverConfig.name !== 'RESTAURANTE DEMO' || 
                           serverConfig.rnc !== '1-31-12345-6' ||
                           serverConfig.address !== 'Av. Winston Churchill #123';
      if (isConfigured) {
        setConfig(serverConfig);
        setUsingServerConfig(true);
        notify.success('Configuración cargada desde el servidor');
      }
    }
  }, [configLoading, serverConfig]);

  const loadServerConfig = () => {
    if (serverConfig) {
      setConfig(serverConfig);
      setUsingServerConfig(true);
      notify.success('Configuración del servidor aplicada');
    }
  };

  const resetToDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    setUsingServerConfig(false);
    notify.info('Usando configuración de demostración');
  };

  const handlePrint = () => {
    printTicket(ticketRef);
    notify.success('Enviando a impresora...');
  };

  const updateNCF = (type) => {
    setNcfType(type);
    const newNcf = `${type}00012345`;
    setBill(prev => ({ ...prev, ncf: newNcf }));
  };

  const randomizeData = () => {
    const products = [
      { name: 'Bandeja Paisa', price: 520 },
      { name: 'Churrasco Argentino', price: 890 },
      { name: 'Paella Valenciana', price: 750 },
      { name: 'Lasaña Boloñesa', price: 380 },
      { name: 'Pizza Margherita', price: 420 },
      { name: 'Ensalada César', price: 280 },
      { name: 'Filete de Salmón', price: 720 },
      { name: 'Hamburguesa Gourmet', price: 350 }
    ];
    
    const numItems = Math.floor(Math.random() * 4) + 2;
    const items = [];
    let subtotal = 0;
    
    for (let i = 0; i < numItems; i++) {
      const product = products[Math.floor(Math.random() * products.length)];
      const qty = Math.floor(Math.random() * 3) + 1;
      const total = product.price * qty;
      items.push({
        product_name: product.name,
        quantity: qty,
        unit_price: product.price,
        total: total,
        modifiers: []
      });
      subtotal += total;
    }
    
    const itbis = Math.round(subtotal * 0.18 * 100) / 100;
    const propina = Math.round(subtotal * 0.10 * 100) / 100;
    
    setBill(prev => ({
      ...prev,
      items,
      subtotal,
      itbis,
      propina_legal: propina,
      total: Math.round((subtotal + itbis + propina) * 100) / 100,
      table_number: Math.floor(Math.random() * 20) + 1
    }));
    
    notify.success('Datos de ejemplo actualizados');
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="px-4 py-3 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <ArrowLeft size={18} className="text-white/70" />
          </button>
          <div>
            <h1 className="font-oswald text-xl font-bold text-white">TICKET TÉRMICO 80MM</h1>
            <p className="text-xs text-white/50 flex items-center gap-2">
              Vista previa y configuración
              {usingServerConfig ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs">
                  <Cloud size={10} /> Servidor
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">
                  <CloudOff size={10} /> Demo
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Server/Demo Config */}
          <button
            onClick={usingServerConfig ? resetToDefaults : loadServerConfig}
            className={`p-2.5 rounded-xl border transition-all ${
              usingServerConfig 
                ? 'bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30' 
                : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30'
            }`}
            title={usingServerConfig ? 'Usar config demo' : 'Cargar config del servidor'}
          >
            {usingServerConfig ? <CloudOff size={18} /> : <Cloud size={18} />}
          </button>
          <button
            onClick={randomizeData}
            className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-all"
            title="Datos aleatorios"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-all"
            title="Configuración"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-oswald font-bold flex items-center gap-2 hover:from-green-400 hover:to-emerald-500 transition-all"
          >
            <Printer size={18} />
            IMPRIMIR
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panel de controles */}
        <div className="w-80 border-r border-white/10 p-4 overflow-auto">
          <h3 className="font-oswald text-sm font-bold text-white/50 mb-3 uppercase tracking-wider">
            Opciones de Ticket
          </h3>
          
          {/* Tipo de NCF */}
          <div className="mb-4">
            <label className="text-xs text-white/60 mb-2 block">Tipo de NCF</label>
            <div className="grid grid-cols-4 gap-2">
              {['B01', 'B02', 'B14', 'B15'].map(type => (
                <button
                  key={type}
                  onClick={() => updateNCF(type)}
                  className={`p-2 rounded-lg text-xs font-bold transition-all ${
                    ncfType === type 
                      ? 'bg-cyan-500/30 border border-cyan-400 text-cyan-300'
                      : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          
          {/* Tipo de servicio */}
          <div className="mb-4">
            <label className="text-xs text-white/60 mb-2 block">Tipo de Servicio</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { code: 'dine_in', label: 'Local' },
                { code: 'takeout', label: 'Llevar' },
                { code: 'delivery', label: 'Delivery' }
              ].map(st => (
                <button
                  key={st.code}
                  onClick={() => setBill(prev => ({ 
                    ...prev, 
                    sale_type: st.code,
                    sale_type_name: st.code === 'dine_in' ? 'Para comer aquí' : 
                                    st.code === 'takeout' ? 'Para llevar' : 'Delivery',
                    propina_legal: st.code === 'dine_in' ? Math.round(prev.subtotal * 0.10 * 100) / 100 : 0,
                    total: st.code === 'dine_in' 
                      ? Math.round((prev.subtotal + prev.itbis + prev.subtotal * 0.10) * 100) / 100
                      : Math.round((prev.subtotal + prev.itbis) * 100) / 100
                  }))}
                  className={`p-2 rounded-lg text-xs font-bold transition-all ${
                    bill.sale_type === st.code 
                      ? 'bg-orange-500/30 border border-orange-400 text-orange-300'
                      : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Toggles */}
          <div className="space-y-3 mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isCopy} 
                onChange={e => setIsCopy(e.target.checked)}
                className="w-5 h-5 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500/30"
              />
              <span className="text-sm text-white/70">Marcar como COPIA</span>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isVoid} 
                onChange={e => setIsVoid(e.target.checked)}
                className="w-5 h-5 rounded border-white/20 bg-white/5 text-red-500 focus:ring-red-500/30"
              />
              <span className="text-sm text-white/70">Marcar como ANULADO</span>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showBarcode} 
                onChange={e => setShowBarcode(e.target.checked)}
                className="w-5 h-5 rounded border-white/20 bg-white/5 text-green-500 focus:ring-green-500/30"
              />
              <span className="text-sm text-white/70">Mostrar código de barras</span>
            </label>
          </div>
          
          {/* Configuración del negocio */}
          {showConfig && (
            <div className="space-y-3 pt-4 border-t border-white/10">
              <h4 className="text-xs text-white/50 font-bold uppercase">Datos del Negocio</h4>
              
              <div>
                <label className="text-xs text-white/40 block mb-1">Nombre</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-400/50 outline-none"
                />
              </div>
              
              <div>
                <label className="text-xs text-white/40 block mb-1">RNC</label>
                <input
                  type="text"
                  value={config.rnc}
                  onChange={e => setConfig(prev => ({ ...prev, rnc: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-400/50 outline-none"
                />
              </div>
              
              <div>
                <label className="text-xs text-white/40 block mb-1">Dirección</label>
                <input
                  type="text"
                  value={config.address}
                  onChange={e => setConfig(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-400/50 outline-none"
                />
              </div>
              
              <div>
                <label className="text-xs text-white/40 block mb-1">Teléfono</label>
                <input
                  type="text"
                  value={config.phone}
                  onChange={e => setConfig(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-400/50 outline-none"
                />
              </div>
              
              <div>
                <label className="text-xs text-white/40 block mb-1">Mensaje final</label>
                <input
                  type="text"
                  value={config.footer_message}
                  onChange={e => setConfig(prev => ({ ...prev, footer_message: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-400/50 outline-none"
                />
              </div>
            </div>
          )}
          
          {/* Resumen del ticket */}
          <div className="mt-6 p-3 rounded-xl bg-white/5 border border-white/10">
            <h4 className="text-xs text-white/50 font-bold uppercase mb-2">Resumen</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-white/60">
                <span>Subtotal</span>
                <span className="font-mono">RD$ {bill.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>ITBIS (18%)</span>
                <span className="font-mono">RD$ {bill.itbis.toLocaleString()}</span>
              </div>
              {bill.propina_legal > 0 && (
                <div className="flex justify-between text-white/60">
                  <span>Propina (10%)</span>
                  <span className="font-mono">RD$ {bill.propina_legal.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-white font-bold pt-2 border-t border-white/10">
                <span>TOTAL</span>
                <span className="font-mono text-cyan-400">RD$ {bill.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Vista previa del ticket */}
        <div className="flex-1 p-8 overflow-auto flex items-start justify-center bg-gray-100">
          <div className="shadow-2xl">
            <ThermalTicket 
              ref={ticketRef}
              bill={bill} 
              config={config}
              isCopy={isCopy}
              isVoid={isVoid}
              showBarcode={showBarcode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
