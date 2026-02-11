import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { billsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, User, Search, CreditCard, Banknote, Building2, DollarSign, Euro, Smartphone, QrCode, X, Check, Wallet, Coins, CircleDollarSign, BadgeDollarSign, ChevronUp, ChevronDown, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

// Iconos de Lucide para métodos de pago
const lucideIcons = {
  'banknote': Banknote,
  'credit-card': CreditCard,
  'smartphone': Smartphone,
  'building2': Building2,
  'dollar-sign': DollarSign,
  'euro': Euro,
  'wallet': Wallet,
  'coins': Coins,
  'circle-dollar-sign': CircleDollarSign,
  'badge-dollar-sign': BadgeDollarSign,
  'default': Banknote
};

// SVG icons para procesadores de pago (Visa, Mastercard, etc.)
const BrandIcons = {
  visa: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path fill="#1565C0" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <path fill="#FFF" d="M15.186 19l-2.626 7.832c0 0-.598-3.053-.724-3.719-.42-1.181-.937-2.009-2.126-2.009H7v.105c1.441.356 2.808 1.077 3.812 1.897l3.074 8.894h3.3L21.5 19H15.186zM17.556 30l3.594-11h3.6l-3.594 11H17.556zM38.95 19h-3.26l-5.04 11h3.36l.62-1.54h4.12l.34 1.54H42L38.95 19zM35.27 25.54l1.68-4.42 .96 4.42H35.27zM28.75 22.32l.4-2.32c0 0-1.87-.68-3.14-.68-1.4 0-4.71.62-4.71 3.61 0 2.78 3.88 2.81 3.88 4.27s-3.48 1.2-4.64.28l-.42 2.42c0 0 1.89.91 3.81.91 1.92 0 5.07-1 5.07-3.73 0-2.82-3.91-3.06-3.91-4.27S27.46 22.04 28.75 22.32z"/>
    </svg>
  ),
  mastercard: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path fill="#3F51B5" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <circle cx="18" cy="24" r="9" fill="#E53935"/>
      <circle cx="30" cy="24" r="9" fill="#FF9800"/>
      <path fill="#FF5722" d="M24,17c1.958,1.626,3.211,4.087,3.211,6.833c0,2.933-1.407,5.536-3.578,7.167c-2.171-1.631-3.578-4.234-3.578-7.167C20.056,21.087,21.309,18.626,24,17z"/>
    </svg>
  ),
  amex: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path fill="#1976D2" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <path fill="#FFF" d="M22.255 20l-2.113 4.683L18.029 20h-2.502l3.286 7.159H20.1l3.286-7.159H22.255zM25.752 27.159h5.502v-1.431h-3.97v-1.493h3.876v-1.426h-3.876v-1.378h3.97V20h-5.502V27.159zM7 20l2.252 7.159h2.084L13.589 20h-2.084l-1.347 5.026L8.812 20H7zM34.152 22.425c0-1.461-1.007-2.425-2.503-2.425h-4.006v7.159h1.532v-2.318h1.505l1.535 2.318h1.876l-1.752-2.493C33.377 24.359 34.152 23.534 34.152 22.425zM31.175 23.659h-2v-2.227h2c.558 0 .971.395.971.969C32.146 23.234 31.733 23.659 31.175 23.659z"/>
      <path fill="#FFF" d="M14.5 27.159h1.531V20H14.5V27.159zM37.5 20l-2.252 7.159h2.084L39.589 20H37.5z"/>
    </svg>
  ),
  discover: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path fill="#E64A19" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <path fill="#FFF" d="M7.5,19h2.7c1.9,0,3,1,3,2.5c0,1.6-1.2,2.5-3,2.5H9v3h-1.5V19z M9,22.6h1c1,0,1.5-0.4,1.5-1.1s-0.5-1.1-1.5-1.1H9V22.6z"/>
      <circle cx="30" cy="24" r="5" fill="#FF6F00"/>
      <path fill="#FFF" d="M14.5,19h1.5v8h-1.5V19z M17.5,24.6c0.3,0.7,1,1.1,1.7,1.1c0.8,0,1.3-0.4,1.3-1s-0.3-0.8-1.2-1.1l-0.8-0.2c-1.3-0.4-1.8-1.1-1.8-2.1c0-1.3,1-2.3,2.6-2.3c1.2,0,2.1,0.5,2.6,1.4l-1.1,0.8c-0.3-0.5-0.8-0.8-1.5-0.8c-0.7,0-1.1,0.4-1.1,0.9c0,0.5,0.3,0.7,1.1,1l0.8,0.2c1.4,0.4,1.9,1.1,1.9,2.1c0,1.4-1.1,2.4-2.8,2.4c-1.3,0-2.4-0.6-2.9-1.5L17.5,24.6z"/>
      <path fill="#FFF" d="M37.4,21.6h-0.6v1.1h0.6c0.4,0,0.6-0.2,0.6-0.6S37.8,21.6,37.4,21.6z M38.5,25.3l-1.1-1.6h-0.6v1.6h-1v-4.5h1.7c1,0,1.6,0.6,1.6,1.5c0,0.7-0.4,1.2-1,1.4l1.2,1.6H38.5z"/>
    </svg>
  ),
  paypal: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path fill="#1565C0" d="M18.7,13.767l0.005,0.002C18.809,13.326,19.187,13,19.66,13h13.472c5.538,0,9.43,3.967,8.657,9.067c-0.798,5.267-5.593,9.067-11.134,9.067H26.33c-0.473,0-0.851,0.326-0.955,0.769l-1.522,6.229l-0.061,0.251h-5.77l1.406-5.749L18.7,13.767z"/>
      <path fill="#039BE5" d="M33.132,13c5.538,0,9.43,3.967,8.657,9.067c-0.798,5.267-5.593,9.067-11.134,9.067H26.33c-0.473,0-0.851,0.326-0.955,0.769l-1.522,6.229l-0.061,0.251H17.39l-0.018,0.073c-0.135,0.552,0.285,1.077,0.862,1.077h5.549c0.412,0,0.762-0.284,0.846-0.682l0.549-2.248l0.896-3.671c0.104-0.443,0.482-0.769,0.955-0.769h4.325c5.541,0,10.336-3.8,11.134-9.067C43.263,18.033,40.346,14.583,35.94,13.316C35.024,13.104,34.094,13,33.132,13"/>
      <path fill="#283593" d="M19.66,13c-0.473,0-0.851,0.326-0.955,0.769l-0.006,0.002l-2.547,10.418c-0.135,0.552,0.285,1.077,0.862,1.077h6.803l1.703-6.97l0.547-2.24c0.104-0.443,0.482-0.769,0.955-0.769h4.325c0.962,0,1.892,0.104,2.808,0.316C33.168,14.214,31.167,13,27.79,13H19.66z"/>
    </svg>
  ),
  cash: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <rect x="4" y="12" width="40" height="24" rx="3" fill="#16a34a"/>
      <circle cx="24" cy="24" r="7" fill="none" stroke="#22c55e" strokeWidth="2"/>
      <text x="24" y="28" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">$</text>
      <circle cx="10" cy="18" r="2" fill="#22c55e"/>
      <circle cx="38" cy="18" r="2" fill="#22c55e"/>
      <circle cx="10" cy="30" r="2" fill="#22c55e"/>
      <circle cx="38" cy="30" r="2" fill="#22c55e"/>
    </svg>
  ),
  bank: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path fill="#0891b2" d="M24,6L4,16v4h40v-4L24,6z"/>
      <rect x="8" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="16" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="28" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="36" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="4" y="36" width="40" height="6" fill="#0891b2"/>
      <polygon points="24,8 12,14 36,14" fill="#22d3ee"/>
    </svg>
  ),
  dollar: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <circle cx="24" cy="24" r="20" fill="#059669"/>
      <circle cx="24" cy="24" r="16" fill="none" stroke="#10b981" strokeWidth="2"/>
      <text x="24" y="30" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold">$</text>
    </svg>
  ),
  euro: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <circle cx="24" cy="24" r="20" fill="#d97706"/>
      <circle cx="24" cy="24" r="16" fill="none" stroke="#f59e0b" strokeWidth="2"/>
      <text x="24" y="30" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold">€</text>
    </svg>
  ),
};

// Lista de iconos de marcas disponibles
const BRAND_ICONS_LIST = [
  { id: 'visa', name: 'Visa' },
  { id: 'mastercard', name: 'Mastercard' },
  { id: 'amex', name: 'American Express' },
  { id: 'discover', name: 'Discover' },
  { id: 'paypal', name: 'PayPal' },
  { id: 'cash', name: 'Efectivo' },
  { id: 'bank', name: 'Banco/Transferencia' },
  { id: 'dollar', name: 'Dólar' },
  { id: 'euro', name: 'Euro' },
];

export { BRAND_ICONS_LIST, BrandIcons };

export default function PaymentScreen() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { largeMode, device } = useAuth();
  const [bill, setBill] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [payAmounts, setPayAmounts] = useState({});
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [keypadDialog, setKeypadDialog] = useState({ open: false, method: null });
  const [keypadValue, setKeypadValue] = useState('');
  const [quickAmounts, setQuickAmounts] = useState([100, 200, 500, 1000, 2000, 5000]);
  const [processing, setProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false); // For mobile collapsible details

  const API_BASE = process.env.REACT_APP_BACKEND_URL;
  
  // Responsive helpers
  const isMobile = device?.isMobile;
  const isTablet = device?.isTablet;
  const isLandscape = device?.isLandscape;

  const fetchData = useCallback(async () => {
    try {
      const [billRes, pmRes, custRes] = await Promise.all([
        billsAPI.get(billId),
        fetch(`${API_BASE}/api/payment-methods`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json()),
        fetch(`${API_BASE}/api/customers`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json())
      ]);
      setBill(billRes.data);
      const sortedMethods = pmRes.filter(m => m.active).sort((a, b) => (a.order || 0) - (b.order || 0));
      setPaymentMethods(sortedMethods);
      setCustomers(custRes);
      try {
        const configRes = await fetch(`${API_BASE}/api/system/config`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
        const config = await configRes.json();
        if (config.quick_amounts) setQuickAmounts(config.quick_amounts);
      } catch {}
    } catch {
      toast.error('Error cargando datos');
    }
  }, [billId, API_BASE]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calculate totals
  const totalPaidDOP = paymentMethods.reduce((sum, m) => {
    const amt = parseFloat(payAmounts[m.name]) || 0;
    return sum + amt * (m.exchange_rate || 1);
  }, 0);
  const billTotal = bill?.total || 0;
  const change = totalPaidDOP - billTotal;
  const isEnough = totalPaidDOP >= billTotal;

  const handlePayment = async () => {
    if (!isEnough) {
      toast.error('Monto insuficiente');
      return;
    }
    setProcessing(true);
    try {
      const entries = Object.entries(payAmounts).filter(([_, v]) => parseFloat(v) > 0);
      const mainMethod = entries.length > 0 ? entries.sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))[0][0] : 'Efectivo RD$';
      
      const res = await billsAPI.pay(billId, { 
        payment_method: mainMethod, 
        tip_percentage: 0, 
        additional_tip: 0, 
        customer_id: selectedCustomer?.id || '' 
      });
      
      const pts = res.data?.points_earned;
      let msg = '✓ Pago procesado';
      if (change > 0) msg += ` | Cambio: ${formatMoney(change)}`;
      if (pts > 0) msg += ` | +${pts} pts fidelidad`;
      toast.success(msg);
      
      navigate(-1);
    } catch {
      toast.error('Error procesando pago');
    } finally {
      setProcessing(false);
    }
  };

  const handleKeypadConfirm = () => {
    if (keypadDialog.method && keypadValue) {
      setPayAmounts(p => ({ ...p, [keypadDialog.method]: keypadValue }));
    }
    setKeypadDialog({ open: false, method: null });
    setKeypadValue('');
  };

  const handleQuickAmount = (amount) => {
    const targetMethod = paymentMethods.find(m => m.currency === 'DOP')?.name || paymentMethods[0]?.name;
    if (targetMethod) {
      setPayAmounts(p => ({ ...p, [targetMethod]: String(amount) }));
    }
  };

  const handleExact = () => {
    const targetMethod = paymentMethods.find(m => m.currency === 'DOP')?.name || paymentMethods[0]?.name;
    if (targetMethod) {
      setPayAmounts(p => ({ ...p, [targetMethod]: String(billTotal) }));
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch) ||
    c.email?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  // Render payment method icon
  const renderPaymentIcon = (method, size = 'normal') => {
    const iconSize = size === 'small' ? (isMobile ? 20 : 24) : (isMobile ? 24 : largeMode ? 32 : 28);
    if (method.icon_type === 'brand' && method.brand_icon && BrandIcons[method.brand_icon]) {
      const BrandIcon = BrandIcons[method.brand_icon];
      return (
        <div className={`${size === 'small' ? 'w-8 h-6' : isMobile ? 'w-10 h-7' : largeMode ? 'w-14 h-10' : 'w-12 h-8'}`}>
          <BrandIcon />
        </div>
      );
    }
    const LucideIcon = lucideIcons[method.icon] || lucideIcons.default;
    return <LucideIcon size={iconSize} />;
  };

  // Grid columns based on device
  const getMethodGridCols = () => {
    if (isMobile) return 'grid-cols-2';
    if (isTablet && !isLandscape) return 'grid-cols-2';
    if (isTablet && isLandscape) return 'grid-cols-3';
    return largeMode ? 'grid-cols-2' : 'grid-cols-3';
  };

  // Quick amounts layout
  const getQuickAmountsLayout = () => {
    if (isMobile) return 'grid grid-cols-3 gap-2';
    if (isTablet && !isLandscape) return 'grid grid-cols-3 gap-2';
    return 'flex flex-col gap-2';
  };

  if (!bill) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // =====================
  // MOBILE LAYOUT
  // =====================
  if (isMobile) {
    return (
      <div className="h-full flex flex-col bg-background" data-testid="payment-screen">
        {/* Mobile Header - Compact */}
        <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-card/50">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-10 w-10">
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="font-oswald font-bold text-lg">COBRAR</h1>
              <p className="text-xs text-muted-foreground">{bill.label}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-oswald font-bold text-xl text-primary">{formatMoney(billTotal)}</p>
          </div>
        </div>

        {/* Collapsible Bill Details */}
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="px-3 py-2 border-b border-border flex items-center justify-between bg-card/30"
        >
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <Receipt size={16} />
            Ver detalle ({bill.items?.length || 0} artículos)
          </span>
          {showDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        
        {showDetails && (
          <div className="px-3 py-2 border-b border-border bg-card/20 max-h-40 overflow-y-auto">
            {bill.items?.map((item, i) => (
              <div key={i} className="flex justify-between text-xs py-1">
                <span><span className="font-oswald text-primary">{item.quantity}x</span> {item.product_name}</span>
                <span className="font-oswald">{formatMoney(item.total)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Customer Button */}
          <button
            onClick={() => setCustomerDialog(true)}
            className={`w-full h-12 mb-3 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 ${
              selectedCustomer 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border text-muted-foreground'
            }`}
            data-testid="customer-fidelity-btn"
          >
            <User size={20} />
            <span className="text-sm font-medium">
              {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.points} pts)` : 'Cliente Fidelidad'}
            </span>
            {selectedCustomer && (
              <button 
                onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); }}
                className="ml-auto p-1 rounded-full hover:bg-destructive/20 text-destructive"
              >
                <X size={14} />
              </button>
            )}
          </button>

          {/* Payment Methods Grid - 2 columns on mobile */}
          <h3 className="font-oswald font-bold text-sm mb-2">FORMAS DE PAGO</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {paymentMethods.map(method => {
              const amount = payAmounts[method.name];
              const hasAmount = amount && parseFloat(amount) > 0;
              const bgColor = method.bg_color || '#6b7280';
              const textColor = method.text_color || '#ffffff';
              
              return (
                <button
                  key={method.id}
                  onClick={() => {
                    setKeypadValue(amount || '');
                    setKeypadDialog({ open: true, method: method.name });
                  }}
                  className={`relative rounded-xl transition-all active:scale-95 flex flex-col items-center justify-center gap-1 h-20 overflow-hidden ${
                    hasAmount ? 'ring-2 ring-white/40 shadow-lg' : ''
                  }`}
                  style={{ backgroundColor: bgColor, color: textColor }}
                  data-testid={`payment-method-${method.id}`}
                >
                  {renderPaymentIcon(method, 'small')}
                  <span className="font-oswald font-bold text-xs text-center leading-tight px-1">
                    {method.name}
                  </span>
                  {method.currency !== 'DOP' && (
                    <span className="absolute bottom-1 right-1 bg-black/30 px-1 rounded text-[8px]">
                      1={method.exchange_rate}
                    </span>
                  )}
                  {hasAmount && (
                    <div className="absolute -top-1 -right-1 bg-white text-gray-900 rounded-full px-2 py-0.5 font-oswald font-bold text-[10px] shadow-lg">
                      {formatMoney(parseFloat(amount) * (method.exchange_rate || 1))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Amounts - 3 columns on mobile */}
          <h3 className="font-oswald font-bold text-sm mb-2">MONTOS RÁPIDOS</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {quickAmounts.slice(0, 6).map(amount => (
              <button
                key={amount}
                onClick={() => handleQuickAmount(amount)}
                className="h-12 rounded-lg bg-muted hover:bg-primary/20 hover:text-primary transition-all active:scale-95 font-oswald font-bold text-sm"
              >
                {amount >= 1000 ? `${amount / 1000}K` : amount}
              </button>
            ))}
          </div>
          
          <button
            onClick={handleExact}
            className="w-full h-12 rounded-lg bg-gradient-to-r from-primary/30 to-primary/10 text-primary border border-primary/30 font-oswald font-bold text-sm mb-4"
          >
            MONTO EXACTO ({formatMoney(billTotal)})
          </button>
        </div>

        {/* Fixed Bottom - Summary & Actions */}
        <div className="border-t border-border bg-card p-3 space-y-2">
          {/* Payment Summary */}
          <div className={`p-3 rounded-xl ${isEnough ? 'bg-green-500/10 border border-green-500/30' : 'bg-card border border-border'}`}>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Recibido</span>
              <span className={`font-oswald font-bold text-lg ${isEnough ? 'text-green-500' : 'text-destructive'}`}>
                {formatMoney(totalPaidDOP)}
              </span>
            </div>
            {change > 0 && (
              <div className="flex justify-between items-center mt-1 pt-1 border-t border-green-500/30">
                <span className="font-bold text-green-500 flex items-center gap-1 text-sm">
                  <Coins size={16} /> CAMBIO
                </span>
                <span className="font-oswald font-bold text-green-500 text-xl">
                  {formatMoney(change)}
                </span>
              </div>
            )}
            {change < 0 && (
              <div className="flex justify-between items-center mt-1 text-xs">
                <span className="text-destructive">Falta</span>
                <span className="font-oswald font-bold text-destructive">{formatMoney(Math.abs(change))}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)} className="flex-1 h-14 font-oswald font-bold">
              CANCELAR
            </Button>
            <Button
              onClick={handlePayment}
              disabled={!isEnough || processing}
              className="flex-[2] h-14 font-oswald font-bold bg-gradient-to-r from-green-600 to-green-500 disabled:from-muted disabled:to-muted text-lg"
              data-testid="confirm-payment-btn"
            >
              {processing ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <Check size={22} className="mr-1" />
                  COBRAR
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Dialogs */}
        {renderCustomerDialog()}
        {renderKeypadDialog()}
      </div>
    );
  }

  // =====================
  // TABLET/DESKTOP LAYOUT
  // =====================
  return (
    <div className="h-full flex flex-col bg-background" data-testid="payment-screen">
      {/* Header */}
      <div className={`px-4 ${isTablet ? 'py-2' : largeMode ? 'py-4' : 'py-3'} border-b border-border flex items-center justify-between bg-card/50`}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className={`${isTablet ? 'h-10 w-10' : largeMode ? 'h-12 w-12' : 'h-10 w-10'}`}>
            <ArrowLeft size={isTablet ? 18 : largeMode ? 22 : 18} />
          </Button>
          <div>
            <h1 className={`font-oswald font-bold tracking-wide ${isTablet ? 'text-lg' : largeMode ? 'text-2xl' : 'text-xl'}`}>PROCESAR PAGO</h1>
            <p className={`text-muted-foreground ${isTablet ? 'text-xs' : largeMode ? 'text-sm' : 'text-xs'}`}>{bill.label} - Factura #{billId?.slice(0, 8)}</p>
          </div>
        </div>
      </div>

      <div className={`flex-1 flex overflow-hidden ${isTablet && !isLandscape ? 'flex-col' : 'flex-row'}`}>
        {/* Left Panel - Bill Details & Customer */}
        <div className={`${isTablet && !isLandscape ? 'w-full border-b' : isTablet ? 'w-72' : largeMode ? 'w-96' : 'w-80'} border-r border-border flex flex-col bg-card/30`}>
          {/* Customer Fidelity Button */}
          <div className={`p-3 ${isTablet ? 'p-2' : 'p-4'} border-b border-border`}>
            <button
              onClick={() => setCustomerDialog(true)}
              className={`w-full ${isTablet ? 'h-12' : largeMode ? 'h-16' : 'h-14'} rounded-2xl border-2 border-dashed transition-all flex items-center justify-center gap-3 ${
                selectedCustomer 
                  ? 'border-primary bg-primary/10 text-primary' 
                  : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
              }`}
              data-testid="customer-fidelity-btn"
            >
              <User size={isTablet ? 20 : largeMode ? 28 : 24} />
              <div className="text-left">
                {selectedCustomer ? (
                  <>
                    <p className={`font-bold ${isTablet ? 'text-sm' : largeMode ? 'text-base' : 'text-sm'}`}>{selectedCustomer.name}</p>
                    <p className={`${isTablet ? 'text-xs' : largeMode ? 'text-sm' : 'text-xs'} opacity-70`}>{selectedCustomer.points} puntos</p>
                  </>
                ) : (
                  <>
                    <p className={`font-semibold ${isTablet ? 'text-sm' : largeMode ? 'text-base' : 'text-sm'}`}>Cliente Fidelidad</p>
                    <p className={`${isTablet ? 'text-xs' : largeMode ? 'text-sm' : 'text-xs'} opacity-70`}>Toca para buscar</p>
                  </>
                )}
              </div>
              {selectedCustomer && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); }}
                  className="ml-auto p-1 rounded-full hover:bg-destructive/20 text-destructive"
                >
                  <X size={16} />
                </button>
              )}
            </button>
          </div>

          {/* Bill Items Summary - Collapsible on tablet portrait */}
          {isTablet && !isLandscape ? (
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className="px-3 py-2 flex items-center justify-between"
            >
              <span className="text-xs text-muted-foreground">Ver detalle ({bill.items?.length} artículos)</span>
              {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : null}
          
          {((!isTablet || isLandscape) || showDetails) && (
            <ScrollArea className={`flex-1 ${isTablet ? 'p-2' : 'p-4'} ${isTablet && !isLandscape ? 'max-h-32' : ''}`}>
              <h3 className={`font-oswald font-bold mb-2 text-muted-foreground ${isTablet ? 'text-xs' : largeMode ? 'text-base' : 'text-sm'}`}>DETALLE DE FACTURA</h3>
              <div className="space-y-1">
                {bill.items?.map((item, i) => (
                  <div key={i} className={`flex justify-between ${isTablet ? 'text-[10px]' : largeMode ? 'text-sm' : 'text-xs'}`}>
                    <span className="flex-1">
                      <span className="font-oswald font-bold text-primary">{item.quantity}x</span> {item.product_name}
                    </span>
                    <span className="font-oswald font-bold ml-2">{formatMoney(item.total)}</span>
                  </div>
                ))}
              </div>
              
              {/* Totals */}
              <div className={`mt-3 pt-3 border-t border-border space-y-1 ${isTablet ? 'text-[10px]' : largeMode ? 'text-sm' : 'text-xs'}`}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-oswald">{formatMoney(bill.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ITBIS ({bill.itbis_rate}%)</span>
                  <span className="font-oswald">{formatMoney(bill.itbis)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Propina ({bill.propina_percentage}%)</span>
                  <span className="font-oswald">{formatMoney(bill.propina_legal)}</span>
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Total to Pay */}
          <div className={`${isTablet ? 'p-2' : 'p-4'} border-t border-border bg-card`}>
            <div className="flex justify-between items-center">
              <span className={`font-bold ${isTablet ? 'text-sm' : largeMode ? 'text-lg' : 'text-base'}`}>TOTAL</span>
              <span className={`font-oswald font-bold text-primary ${isTablet ? 'text-xl' : largeMode ? 'text-3xl' : 'text-2xl'}`}>{formatMoney(billTotal)}</span>
            </div>
          </div>
        </div>

        {/* Right Panel - Payment Methods & Amounts */}
        <div className={`flex-1 flex flex-col ${isTablet ? 'p-3' : 'p-6'} overflow-hidden`}>
          <div className={`flex-1 flex ${isTablet && !isLandscape ? 'flex-col' : 'flex-row'} gap-4`}>
            {/* Payment Methods Grid */}
            <div className="flex-1 flex flex-col">
              <h3 className={`font-oswald font-bold mb-3 ${isTablet ? 'text-sm' : largeMode ? 'text-lg' : 'text-base'}`}>FORMAS DE PAGO</h3>
              <div className={`grid ${getMethodGridCols()} gap-2 ${isTablet ? 'gap-2' : 'gap-3'}`}>
                {paymentMethods.map(method => {
                  const amount = payAmounts[method.name];
                  const hasAmount = amount && parseFloat(amount) > 0;
                  const bgColor = method.bg_color || '#6b7280';
                  const textColor = method.text_color || '#ffffff';
                  
                  return (
                    <button
                      key={method.id}
                      onClick={() => {
                        setKeypadValue(amount || '');
                        setKeypadDialog({ open: true, method: method.name });
                      }}
                      className={`group relative rounded-2xl transition-all duration-300 active:scale-95 flex flex-col items-center justify-center gap-1 overflow-hidden ${
                        isTablet ? 'h-20 p-2' : largeMode ? 'h-36 p-4' : 'h-28 p-3'
                      } ${hasAmount ? 'ring-4 ring-white/40 shadow-lg shadow-white/20' : 'hover:shadow-xl hover:-translate-y-1'}`}
                      style={{ backgroundColor: bgColor, color: textColor }}
                      data-testid={`payment-method-${method.id}`}
                    >
                      {/* Glassmorphism overlay effect */}
                      <div 
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)`,
                        }}
                      />
                      
                      {/* Icon */}
                      <div className="relative z-10 transform group-hover:scale-110 transition-transform duration-300">
                        {renderPaymentIcon(method)}
                      </div>
                      
                      {/* Name */}
                      <span className={`relative z-10 font-oswald font-bold text-center leading-tight drop-shadow-md ${isTablet ? 'text-[10px]' : largeMode ? 'text-sm' : 'text-xs'}`}>
                        {method.name}
                      </span>
                      
                      {/* Exchange rate badge */}
                      {method.currency !== 'DOP' && (
                        <span className={`absolute bottom-1 right-1 bg-black/30 backdrop-blur-sm px-1.5 py-0.5 rounded-full font-oswald ${isTablet ? 'text-[8px]' : largeMode ? 'text-xs' : 'text-[10px]'}`}>
                          1 = {method.exchange_rate}
                        </span>
                      )}
                      
                      {/* Amount badge */}
                      {hasAmount && (
                        <div className={`absolute -top-1 -right-1 bg-white text-gray-900 rounded-full px-2 py-0.5 font-oswald font-bold shadow-lg animate-pulse ${isTablet ? 'text-[10px]' : largeMode ? 'text-sm' : 'text-xs'}`}>
                          {formatMoney(parseFloat(amount) * (method.exchange_rate || 1))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Payment Summary */}
              <div className={`mt-4 ${isTablet ? 'p-3' : 'p-5'} rounded-2xl backdrop-blur-sm border-2 transition-all duration-300 ${
                isEnough 
                  ? 'bg-green-500/10 border-green-500/50 shadow-lg shadow-green-500/10' 
                  : 'bg-card border-border'
              }`}>
                <div className={`flex justify-between items-center ${isTablet ? 'text-sm' : largeMode ? 'text-base' : 'text-sm'}`}>
                  <span className="text-muted-foreground">Total Recibido</span>
                  <span className={`font-oswald font-bold ${isTablet ? 'text-lg' : largeMode ? 'text-2xl' : 'text-xl'} ${isEnough ? 'text-green-500' : 'text-destructive'}`}>
                    {formatMoney(totalPaidDOP)}
                  </span>
                </div>
                {change > 0 && (
                  <div className={`flex justify-between items-center mt-2 pt-2 border-t border-green-500/30 ${isTablet ? 'text-sm' : largeMode ? 'text-lg' : 'text-base'}`}>
                    <span className="font-bold text-green-500 flex items-center gap-2">
                      <Coins size={isTablet ? 16 : 20} className="animate-bounce" />
                      CAMBIO
                    </span>
                    <span className={`font-oswald font-bold text-green-500 ${isTablet ? 'text-xl' : largeMode ? 'text-3xl' : 'text-2xl'}`}>
                      {formatMoney(change)}
                    </span>
                  </div>
                )}
                {change < 0 && (
                  <div className={`flex justify-between items-center mt-2 pt-2 border-t border-border ${isTablet ? 'text-xs' : largeMode ? 'text-sm' : 'text-xs'}`}>
                    <span className="text-destructive">Falta</span>
                    <span className="font-oswald font-bold text-destructive">{formatMoney(Math.abs(change))}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Amounts */}
            <div className={`${isTablet && !isLandscape ? 'w-full' : isTablet ? 'w-32' : largeMode ? 'w-48' : 'w-40'} flex flex-col`}>
              <h3 className={`font-oswald font-bold mb-3 ${isTablet ? 'text-sm' : largeMode ? 'text-lg' : 'text-base'}`}>MONTOS RÁPIDOS</h3>
              <div className={getQuickAmountsLayout()}>
                {quickAmounts.map(amount => (
                  <button
                    key={amount}
                    onClick={() => handleQuickAmount(amount)}
                    className={`${isTablet && !isLandscape ? 'h-10' : 'flex-1'} rounded-xl bg-muted hover:bg-primary/20 hover:text-primary transition-all active:scale-95 font-oswald font-bold border border-transparent hover:border-primary/30 ${
                      isTablet ? 'text-sm' : largeMode ? 'text-lg' : 'text-base'
                    }`}
                  >
                    {amount.toLocaleString()}
                  </button>
                ))}
                <button
                  onClick={handleExact}
                  className={`${isTablet && !isLandscape ? 'h-10 col-span-3' : 'flex-1'} rounded-xl bg-gradient-to-r from-primary/30 to-primary/10 hover:from-primary/40 hover:to-primary/20 text-primary border border-primary/30 transition-all active:scale-95 font-oswald font-bold ${
                    isTablet ? 'text-sm' : largeMode ? 'text-lg' : 'text-base'
                  }`}
                >
                  EXACTO
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`flex gap-3 ${isTablet ? 'mt-3' : 'mt-6'}`}>
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className={`flex-1 ${isTablet ? 'h-12 text-sm' : largeMode ? 'h-16 text-lg' : 'h-14 text-base'} font-oswald font-bold`}
            >
              CANCELAR
            </Button>
            <Button
              onClick={handlePayment}
              disabled={!isEnough || processing}
              className={`flex-[2] ${isTablet ? 'h-12 text-base' : largeMode ? 'h-16 text-xl' : 'h-14 text-lg'} font-oswald font-bold bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-muted disabled:to-muted disabled:text-muted-foreground shadow-lg shadow-green-500/30 transition-all`}
              data-testid="confirm-payment-btn"
            >
              {processing ? (
                <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <Check size={isTablet ? 20 : largeMode ? 28 : 24} className="mr-2" />
                  CONFIRMAR PAGO
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {renderCustomerDialog()}
      {renderKeypadDialog()}
    </div>
  );

  // =====================
  // SHARED DIALOGS
  // =====================
  function renderCustomerDialog() {
    return (
      <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
        <DialogContent className={`${isMobile ? 'max-w-[95vw]' : isTablet ? 'max-w-md' : largeMode ? 'max-w-lg' : 'max-w-md'} bg-card border-border`}>
          <DialogHeader>
            <DialogTitle className={`font-oswald ${isMobile ? 'text-lg' : largeMode ? 'text-xl' : 'text-lg'}`}>Buscar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono..."
                className={`w-full bg-background border border-border rounded-xl pl-10 pr-4 ${isMobile ? 'py-3 text-base' : largeMode ? 'py-4 text-base' : 'py-3 text-sm'}`}
                autoFocus
              />
            </div>

            {/* Customer List */}
            <ScrollArea className={`${isMobile ? 'h-52' : 'h-64'}`}>
              <div className="space-y-2">
                {filteredCustomers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No se encontraron clientes</p>
                ) : (
                  filteredCustomers.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerDialog(false);
                        setCustomerSearch('');
                      }}
                      className={`w-full ${isMobile ? 'p-3' : largeMode ? 'p-4' : 'p-3'} rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left flex items-center gap-3`}
                    >
                      <div className={`${isMobile ? 'w-10 h-10' : largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold`}>
                        {customer.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold ${isMobile ? 'text-sm' : largeMode ? 'text-base' : 'text-sm'}`}>{customer.name}</p>
                        <p className={`text-muted-foreground ${isMobile ? 'text-xs' : largeMode ? 'text-sm' : 'text-xs'}`}>
                          {customer.phone || customer.email || 'Sin contacto'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-oswald font-bold text-primary ${isMobile ? 'text-base' : largeMode ? 'text-lg' : 'text-base'}`}>{customer.points}</p>
                        <p className={`text-muted-foreground ${isMobile ? 'text-[10px]' : largeMode ? 'text-xs' : 'text-[10px]'}`}>puntos</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function renderKeypadDialog() {
    return (
      <Dialog open={keypadDialog.open} onOpenChange={(open) => { if (!open) { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); } }}>
        <DialogContent className={`${isMobile ? 'max-w-[90vw]' : 'max-w-xs'} bg-card border-border p-4`}>
          <DialogHeader>
            <DialogTitle className={`font-oswald text-center ${isMobile ? 'text-lg' : largeMode ? 'text-xl' : 'text-lg'}`}>
              {keypadDialog.method}
            </DialogTitle>
          </DialogHeader>
          
          {/* Display */}
          <div className={`bg-background rounded-xl border border-border ${isMobile ? 'p-3' : 'p-4'} text-center mb-3`}>
            <span className={`font-oswald font-bold text-primary ${isMobile ? 'text-3xl' : largeMode ? 'text-4xl' : 'text-3xl'}`}>
              {keypadValue || '0'}
            </span>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'DEL'].map(key => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'DEL') {
                    setKeypadValue(prev => prev.slice(0, -1));
                  } else if (key === '.') {
                    if (!keypadValue.includes('.')) {
                      setKeypadValue(prev => prev + '.');
                    }
                  } else {
                    setKeypadValue(prev => prev + key);
                  }
                }}
                className={`${isMobile ? 'h-14 text-xl' : largeMode ? 'h-16 text-2xl' : 'h-14 text-xl'} rounded-xl font-oswald font-bold transition-all active:scale-95 ${
                  key === 'DEL' 
                    ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                    : 'bg-muted hover:bg-primary/20'
                }`}
              >
                {key === 'DEL' ? '⌫' : key}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button
              variant="outline"
              onClick={() => { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); }}
              className={`${isMobile ? 'h-12' : largeMode ? 'h-14' : 'h-12'} font-oswald font-bold`}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleKeypadConfirm}
              className={`${isMobile ? 'h-12' : largeMode ? 'h-14' : 'h-12'} font-oswald font-bold bg-primary`}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}
