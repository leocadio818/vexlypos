import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { billsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, User, Search, CreditCard, Banknote, Building2, DollarSign, Euro, Smartphone, X, Check, Wallet, Coins, CircleDollarSign, BadgeDollarSign, ChevronUp, ChevronDown, Receipt, Sparkles, Heart } from 'lucide-react';
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

// SVG icons para procesadores de pago
const BrandIcons = {
  visa: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#1565C0" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <path fill="#FFF" d="M15.186 19l-2.626 7.832c0 0-.598-3.053-.724-3.719-.42-1.181-.937-2.009-2.126-2.009H7v.105c1.441.356 2.808 1.077 3.812 1.897l3.074 8.894h3.3L21.5 19H15.186zM17.556 30l3.594-11h3.6l-3.594 11H17.556zM38.95 19h-3.26l-5.04 11h3.36l.62-1.54h4.12l.34 1.54H42L38.95 19zM35.27 25.54l1.68-4.42 .96 4.42H35.27zM28.75 22.32l.4-2.32c0 0-1.87-.68-3.14-.68-1.4 0-4.71.62-4.71 3.61 0 2.78 3.88 2.81 3.88 4.27s-3.48 1.2-4.64.28l-.42 2.42c0 0 1.89.91 3.81.91 1.92 0 5.07-1 5.07-3.73 0-2.82-3.91-3.06-3.91-4.27S27.46 22.04 28.75 22.32z"/>
    </svg>
  ),
  mastercard: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#3F51B5" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <circle cx="18" cy="24" r="9" fill="#E53935"/>
      <circle cx="30" cy="24" r="9" fill="#FF9800"/>
      <path fill="#FF5722" d="M24,17c1.958,1.626,3.211,4.087,3.211,6.833c0,2.933-1.407,5.536-3.578,7.167c-2.171-1.631-3.578-4.234-3.578-7.167C20.056,21.087,21.309,18.626,24,17z"/>
    </svg>
  ),
  amex: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#1976D2" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <path fill="#FFF" d="M22.255 20l-2.113 4.683L18.029 20h-2.502l3.286 7.159H20.1l3.286-7.159H22.255zM25.752 27.159h5.502v-1.431h-3.97v-1.493h3.876v-1.426h-3.876v-1.378h3.97V20h-5.502V27.159zM7 20l2.252 7.159h2.084L13.589 20h-2.084l-1.347 5.026L8.812 20H7zM34.152 22.425c0-1.461-1.007-2.425-2.503-2.425h-4.006v7.159h1.532v-2.318h1.505l1.535 2.318h1.876l-1.752-2.493C33.377 24.359 34.152 23.534 34.152 22.425zM31.175 23.659h-2v-2.227h2c.558 0 .971.395.971.969C32.146 23.234 31.733 23.659 31.175 23.659z"/>
    </svg>
  ),
  discover: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#E64A19" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <circle cx="30" cy="24" r="5" fill="#FF6F00"/>
      <path fill="#FFF" d="M7.5,19h2.7c1.9,0,3,1,3,2.5c0,1.6-1.2,2.5-3,2.5H9v3h-1.5V19z M9,22.6h1c1,0,1.5-0.4,1.5-1.1s-0.5-1.1-1.5-1.1H9V22.6z"/>
    </svg>
  ),
  paypal: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#1565C0" d="M18.7,13.767l0.005,0.002C18.809,13.326,19.187,13,19.66,13h13.472c5.538,0,9.43,3.967,8.657,9.067c-0.798,5.267-5.593,9.067-11.134,9.067H26.33c-0.473,0-0.851,0.326-0.955,0.769l-1.522,6.229l-0.061,0.251h-5.77l1.406-5.749L18.7,13.767z"/>
      <path fill="#039BE5" d="M33.132,13c5.538,0,9.43,3.967,8.657,9.067c-0.798,5.267-5.593,9.067-11.134,9.067H26.33c-0.473,0-0.851,0.326-0.955,0.769l-1.522,6.229l-0.061,0.251H17.39l-0.018,0.073c-0.135,0.552,0.285,1.077,0.862,1.077h5.549c0.412,0,0.762-0.284,0.846-0.682l0.549-2.248l0.896-3.671c0.104-0.443,0.482-0.769,0.955-0.769h4.325c5.541,0,10.336-3.8,11.134-9.067C43.263,18.033,40.346,14.583,35.94,13.316C35.024,13.104,34.094,13,33.132,13"/>
    </svg>
  ),
  cash: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <rect x="4" y="12" width="40" height="24" rx="3" fill="#16a34a"/>
      <circle cx="24" cy="24" r="7" fill="none" stroke="#22c55e" strokeWidth="2"/>
      <text x="24" y="28" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">$</text>
    </svg>
  ),
  bank: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#0891b2" d="M24,6L4,16v4h40v-4L24,6z"/>
      <rect x="8" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="16" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="28" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="36" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="4" y="36" width="40" height="6" fill="#0891b2"/>
    </svg>
  ),
  dollar: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <circle cx="24" cy="24" r="20" fill="#059669"/>
      <text x="24" y="30" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold">$</text>
    </svg>
  ),
  euro: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <circle cx="24" cy="24" r="20" fill="#d97706"/>
      <text x="24" y="30" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold">€</text>
    </svg>
  ),
};

export { BrandIcons };

// Glassmorphism styles
const glassStyles = {
  card: "backdrop-blur-xl bg-white/10 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
  cardHover: "hover:bg-white/15 hover:border-white/30 hover:shadow-[0_8px_40px_rgba(255,255,255,0.1)]",
  cardActive: "bg-white/20 border-white/40 shadow-[0_8px_40px_rgba(255,255,255,0.2)]",
  button: "backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20",
  input: "backdrop-blur-md bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10",
};

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
  const [showDetails, setShowDetails] = useState(false);
  
  // New state for smart payment flow
  const [pendingAmount, setPendingAmount] = useState(null); // Amount waiting for method selection
  const [methodSelectorOpen, setMethodSelectorOpen] = useState(false);

  const API_BASE = process.env.REACT_APP_BACKEND_URL;
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

  const totalPaidDOP = paymentMethods.reduce((sum, m) => {
    const amt = parseFloat(payAmounts[m.name]) || 0;
    return sum + amt * (m.exchange_rate || 1);
  }, 0);
  const billTotal = bill?.total || 0;
  const overpaid = totalPaidDOP - billTotal;
  const isEnough = totalPaidDOP >= billTotal;

  // Determine if overpayment is change (cash) or tip (card)
  // Check which methods have amounts and if any are non-cash (cards)
  const hasNonCashPayment = paymentMethods.some(m => {
    const amt = parseFloat(payAmounts[m.name]) || 0;
    return amt > 0 && m.is_cash === false;
  });
  
  // If any payment is with card/non-cash, overpayment becomes tip
  const isTip = overpaid > 0 && hasNonCashPayment;
  const change = isTip ? 0 : overpaid;
  const cardTip = isTip ? overpaid : 0;

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
        additional_tip: cardTip, // Add card tip as additional tip
        customer_id: selectedCustomer?.id || '' 
      });
      
      const pts = res.data?.points_earned;
      let msg = '✓ Pago procesado';
      if (change > 0) msg += ` | Cambio: ${formatMoney(change)}`;
      if (cardTip > 0) msg += ` | Propina: ${formatMoney(cardTip)}`;
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

  const renderPaymentIcon = (method, size = 'normal') => {
    const iconSize = size === 'small' ? (isMobile ? 20 : 24) : (isMobile ? 28 : largeMode ? 36 : 32);
    if (method.icon_type === 'brand' && method.brand_icon && BrandIcons[method.brand_icon]) {
      const BrandIcon = BrandIcons[method.brand_icon];
      return (
        <div className={`${size === 'small' ? 'w-10 h-7' : isMobile ? 'w-12 h-9' : largeMode ? 'w-16 h-12' : 'w-14 h-10'}`}>
          <BrandIcon />
        </div>
      );
    }
    const LucideIcon = lucideIcons[method.icon] || lucideIcons.default;
    return <LucideIcon size={iconSize} className="drop-shadow-lg" />;
  };

  if (!bill) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="relative">
          <div className="animate-spin w-12 h-12 border-4 border-white/20 border-t-white rounded-full" />
          <div className="absolute inset-0 animate-ping w-12 h-12 border-2 border-white/20 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-full flex flex-col overflow-hidden relative"
      data-testid="payment-screen"
      style={{
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 25%, #2d1b4e 50%, #1e3a5f 75%, #0f2027 100%)',
      }}
    >
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-purple-500/30 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute top-1/2 -right-20 w-60 h-60 bg-blue-500/20 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 bg-cyan-500/20 rounded-full blur-[90px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-20 right-1/4 w-40 h-40 bg-pink-500/20 rounded-full blur-[60px] animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      {/* Glass Header */}
      <div className={`relative z-10 px-4 ${isMobile ? 'py-3' : largeMode ? 'py-4' : 'py-3'} ${glassStyles.card} border-t-0 border-x-0 rounded-none`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-2xl ${glassStyles.button} flex items-center justify-center transition-all duration-300 active:scale-95`}
            >
              <ArrowLeft size={isMobile ? 18 : 22} className="text-white/80" />
            </button>
            <div>
              <h1 className={`font-oswald font-bold tracking-wide text-white ${isMobile ? 'text-lg' : largeMode ? 'text-2xl' : 'text-xl'}`}>
                PROCESAR PAGO
              </h1>
              <p className={`text-white/50 ${isMobile ? 'text-xs' : 'text-sm'}`}>{bill.label}</p>
            </div>
          </div>
          <div className={`${glassStyles.card} rounded-2xl px-4 py-2`}>
            <p className={`font-oswald font-bold bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200 bg-clip-text text-transparent ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              {formatMoney(billTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex relative z-10 ${isMobile || (isTablet && !isLandscape) ? 'flex-col overflow-auto' : 'flex-row overflow-hidden'}`}>
        
        {/* Left Panel - Bill Details */}
        <div className={`${isMobile ? 'w-full shrink-0' : isTablet && !isLandscape ? 'w-full' : 'w-80 lg:w-96'} ${!isMobile && (isTablet && isLandscape || !isTablet) ? 'border-r border-white/10' : 'border-b border-white/10'} flex flex-col`}>
          
          {/* Customer Selection - Glass Card */}
          <div className="p-4">
            <button
              onClick={() => setCustomerDialog(true)}
              className={`w-full ${isMobile ? 'h-14' : 'h-16'} rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} transition-all duration-300 flex items-center justify-center gap-3 group`}
              data-testid="customer-fidelity-btn"
            >
              <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <User size={isMobile ? 20 : 24} className="text-white/80" />
              </div>
              <div className="text-left flex-1">
                {selectedCustomer ? (
                  <>
                    <p className={`font-bold text-white ${isMobile ? 'text-sm' : 'text-base'}`}>{selectedCustomer.name}</p>
                    <p className={`text-purple-300 ${isMobile ? 'text-xs' : 'text-sm'}`}>{selectedCustomer.points} puntos</p>
                  </>
                ) : (
                  <>
                    <p className={`font-semibold text-white/70 ${isMobile ? 'text-sm' : 'text-base'}`}>Cliente Fidelidad</p>
                    <p className={`text-white/40 ${isMobile ? 'text-xs' : 'text-sm'}`}>Toca para buscar</p>
                  </>
                )}
              </div>
              {selectedCustomer && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); }}
                  className="p-2 rounded-full hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
              <Sparkles size={16} className="text-purple-400/50 group-hover:text-purple-300 transition-colors" />
            </button>
          </div>

          {/* Bill Details - Collapsible on mobile */}
          {isMobile && (
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className={`mx-4 mb-2 px-4 py-2 rounded-xl ${glassStyles.button} flex items-center justify-between`}
            >
              <span className="text-white/60 text-sm flex items-center gap-2">
                <Receipt size={14} />
                Ver detalle ({bill.items?.length || 0} artículos)
              </span>
              {showDetails ? <ChevronUp size={16} className="text-white/60" /> : <ChevronDown size={16} className="text-white/60" />}
            </button>
          )}

          {(!isMobile || showDetails) && (
            <ScrollArea className={`flex-1 px-4 ${isMobile ? 'max-h-40' : ''}`}>
              <div className={`${glassStyles.card} rounded-2xl p-4 mb-4`}>
                <h3 className={`font-oswald font-bold text-white/60 mb-3 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  DETALLE DE FACTURA
                </h3>
                <div className="space-y-2">
                  {bill.items?.map((item, i) => (
                    <div key={i} className={`flex justify-between items-center ${isMobile ? 'text-xs' : 'text-sm'}`}>
                      <span className="text-white/70 flex-1">
                        <span className="font-oswald font-bold text-cyan-400">{item.quantity}x</span> {item.product_name}
                      </span>
                      <span className="font-oswald font-bold text-white/90 ml-2">{formatMoney(item.total)}</span>
                    </div>
                  ))}
                </div>
                
                <div className={`mt-4 pt-4 border-t border-white/10 space-y-1 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  <div className="flex justify-between text-white/50">
                    <span>Subtotal</span>
                    <span className="font-oswald">{formatMoney(bill.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-white/50">
                    <span>ITBIS ({bill.itbis_rate}%)</span>
                    <span className="font-oswald">{formatMoney(bill.itbis)}</span>
                  </div>
                  <div className="flex justify-between text-white/50">
                    <span>Propina ({bill.propina_percentage}%)</span>
                    <span className="font-oswald">{formatMoney(bill.propina_legal)}</span>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right Panel - Payment Methods */}
        <div className={`flex-1 flex flex-col p-4 ${isMobile ? 'shrink-0' : 'overflow-auto'}`}>
          
          {/* Payment Methods Grid */}
          <h3 className={`font-oswald font-bold text-white/70 mb-3 ${isMobile ? 'text-sm' : 'text-base'}`}>
            FORMAS DE PAGO
          </h3>
          
          <div className={`grid ${isMobile ? 'grid-cols-2 gap-3' : isTablet ? 'grid-cols-3 gap-3' : 'grid-cols-3 gap-4'} mb-4`}>
            {paymentMethods.map((method, index) => {
              const amount = payAmounts[method.name];
              const hasAmount = amount && parseFloat(amount) > 0;
              
              // Calculate equivalent amount in foreign currency
              const isForeignCurrency = method.currency !== 'DOP';
              const equivalentInForeign = isForeignCurrency && method.exchange_rate 
                ? (billTotal / method.exchange_rate).toFixed(2) 
                : null;
              const currencySymbol = method.currency === 'USD' ? '$' : method.currency === 'EUR' ? '€' : '';
              
              return (
                <button
                  key={method.id}
                  onClick={() => {
                    setKeypadValue(amount || '');
                    setKeypadDialog({ open: true, method: method.name });
                  }}
                  className={`group relative rounded-3xl transition-all duration-500 flex flex-col items-center justify-center overflow-hidden
                    ${isMobile ? 'h-24 p-3' : largeMode ? 'h-36 p-4' : 'h-28 p-3'}
                    ${hasAmount ? glassStyles.cardActive : glassStyles.card}
                    ${glassStyles.cardHover}
                    active:scale-95 transform
                  `}
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                  data-testid={`payment-method-${method.id}`}
                >
                  {/* Liquid gradient background */}
                  <div 
                    className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(135deg, ${method.bg_color || '#6b7280'}40 0%, transparent 50%, ${method.bg_color || '#6b7280'}20 100%)`,
                    }}
                  />
                  
                  {/* Shine effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <div 
                      className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                      }}
                    />
                  </div>
                  
                  {/* Icon with glow */}
                  <div className="relative z-10 transform group-hover:scale-110 transition-transform duration-300">
                    <div 
                      className="absolute inset-0 blur-xl opacity-50"
                      style={{ backgroundColor: method.bg_color || '#6b7280' }}
                    />
                    <div className="relative" style={{ color: method.text_color || '#ffffff' }}>
                      {renderPaymentIcon(method)}
                    </div>
                  </div>
                  
                  {/* Name */}
                  <span className={`relative z-10 font-oswald font-bold text-center leading-tight text-white/90 mt-1 drop-shadow-lg ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    {method.name}
                  </span>
                  
                  {/* Foreign currency equivalent - Shows how much to receive in USD/EUR */}
                  {isForeignCurrency && equivalentInForeign && !hasAmount && (
                    <span className={`relative z-10 font-oswald font-bold text-center text-yellow-300 drop-shadow-lg ${isMobile ? 'text-sm' : 'text-base'}`}>
                      {currencySymbol}{equivalentInForeign}
                    </span>
                  )}
                  
                  {/* Exchange rate badge */}
                  {isForeignCurrency && (
                    <span className={`absolute bottom-1.5 right-2 ${glassStyles.card} px-1.5 py-0.5 rounded-full font-oswald text-white/60 ${isMobile ? 'text-[7px]' : 'text-[9px]'}`}>
                      1 = {method.exchange_rate}
                    </span>
                  )}
                  
                  {/* Amount badge - Liquid glass effect */}
                  {hasAmount && (
                    <div className={`absolute -top-1 -right-1 backdrop-blur-xl bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-full px-3 py-1 font-oswald font-bold shadow-lg shadow-green-500/30 animate-pulse ${isMobile ? 'text-xs' : 'text-sm'}`}>
                      {formatMoney(parseFloat(amount) * (method.exchange_rate || 1))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Amounts - Glass pills */}
          <h3 className={`font-oswald font-bold text-white/70 mb-3 ${isMobile ? 'text-sm' : 'text-base'}`}>
            MONTOS RÁPIDOS
          </h3>
          
          <div className={`grid ${isMobile ? 'grid-cols-3 gap-2' : 'grid-cols-6 gap-2'} mb-4`}>
            {quickAmounts.map((amount, index) => (
              <button
                key={amount}
                onClick={() => handleQuickAmount(amount)}
                className={`${isMobile ? 'h-12' : 'h-14'} rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} font-oswald font-bold text-white/80 transition-all duration-300 active:scale-95`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {amount >= 1000 ? `${amount / 1000}K` : amount}
              </button>
            ))}
          </div>
          
          <button
            onClick={handleExact}
            className={`w-full ${isMobile ? 'h-12' : 'h-14'} rounded-2xl backdrop-blur-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 hover:border-purple-400/50 font-oswald font-bold text-purple-200 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2`}
          >
            <Sparkles size={18} className="text-purple-400" />
            MONTO EXACTO ({formatMoney(billTotal)})
          </button>

          {/* Payment Summary - Glass card (NO fixed positioning on mobile) */}
          <div className="mt-auto pt-4">
            <div className={`${glassStyles.card} rounded-3xl p-4 mb-4 transition-all duration-500 ${
              isEnough ? 'border-green-400/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]' : ''
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-white/60 font-medium">Total Recibido</span>
                <span className={`font-oswald font-bold ${isMobile ? 'text-xl' : 'text-3xl'} ${
                  isEnough 
                    ? 'bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent' 
                    : 'text-red-400'
                }`}>
                  {formatMoney(totalPaidDOP)}
                </span>
              </div>
              
              {/* Cash change */}
              {change > 0 && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-green-400/20">
                  <span className="font-bold text-green-400 flex items-center gap-2">
                    <Coins size={isMobile ? 16 : 20} className="animate-bounce" />
                    CAMBIO
                  </span>
                  <span className={`font-oswald font-bold bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                    {formatMoney(change)}
                  </span>
                </div>
              )}
              
              {/* Card tip (not cash) */}
              {cardTip > 0 && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-purple-400/20">
                  <span className="font-bold text-purple-400 flex items-center gap-2">
                    <Heart size={isMobile ? 16 : 20} className="animate-pulse" />
                    PROPINA
                  </span>
                  <span className={`font-oswald font-bold bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                    {formatMoney(cardTip)}
                  </span>
                </div>
              )}
              
              {/* Amount remaining */}
              {overpaid < 0 && (
                <div className="flex justify-between items-center mt-2 text-sm">
                  <span className="text-red-400/80">Falta</span>
                  <span className="font-oswald font-bold text-red-400">{formatMoney(Math.abs(overpaid))}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => navigate(-1)}
                className={`flex-1 ${isMobile ? 'h-12' : 'h-16'} rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} font-oswald font-bold text-white/70 transition-all duration-300 active:scale-95`}
              >
                CANCELAR
              </button>
              <button
                onClick={handlePayment}
                disabled={!isEnough || processing}
                className={`flex-[2] ${isMobile ? 'h-12' : 'h-16'} rounded-2xl font-oswald font-bold transition-all duration-300 active:scale-95 flex items-center justify-center gap-2
                  ${isEnough 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg shadow-green-500/30' 
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }
                `}
                data-testid="confirm-payment-btn"
              >
                {processing ? (
                  <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Check size={isMobile ? 18 : 24} />
                    <span className={isMobile ? 'text-sm' : 'text-lg'}>CONFIRMAR PAGO</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Search Dialog - Glass effect */}
      <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
        <DialogContent className={`${isMobile ? 'max-w-[95vw]' : 'max-w-md'} ${glassStyles.card} border-white/20 bg-slate-900/80`}>
          <DialogHeader>
            <DialogTitle className="font-oswald text-white text-lg">Buscar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono..."
                className={`w-full ${glassStyles.input} rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 outline-none`}
                autoFocus
              />
            </div>

            <ScrollArea className="h-64">
              <div className="space-y-2">
                {filteredCustomers.length === 0 ? (
                  <p className="text-center text-white/40 py-8">No se encontraron clientes</p>
                ) : (
                  filteredCustomers.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerDialog(false);
                        setCustomerSearch('');
                      }}
                      className={`w-full p-3 rounded-xl ${glassStyles.card} ${glassStyles.cardHover} text-left flex items-center gap-3 transition-all duration-300`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-white font-bold">
                        {customer.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-white text-sm">{customer.name}</p>
                        <p className="text-white/50 text-xs">{customer.phone || customer.email || 'Sin contacto'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-oswald font-bold text-purple-300">{customer.points}</p>
                        <p className="text-white/40 text-[10px]">puntos</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keypad Dialog - Glass effect */}
      <Dialog open={keypadDialog.open} onOpenChange={(open) => { if (!open) { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); } }}>
        <DialogContent className={`${isMobile ? 'max-w-[90vw]' : 'max-w-xs'} ${glassStyles.card} border-white/20 bg-slate-900/80 p-4`}>
          <DialogHeader>
            <DialogTitle className="font-oswald text-center text-white text-lg">
              {keypadDialog.method}
            </DialogTitle>
          </DialogHeader>
          
          {/* Display */}
          <div className={`${glassStyles.card} rounded-2xl p-4 text-center mb-4`}>
            <span className={`font-oswald font-bold bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent ${isMobile ? 'text-4xl' : 'text-5xl'}`}>
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
                className={`${isMobile ? 'h-14' : 'h-16'} rounded-2xl font-oswald font-bold text-xl transition-all duration-200 active:scale-95 ${
                  key === 'DEL' 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                    : `${glassStyles.card} ${glassStyles.cardHover} text-white`
                }`}
              >
                {key === 'DEL' ? '⌫' : key}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); }}
              className={`h-12 rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} font-oswald font-bold text-white/70 transition-all duration-300`}
            >
              Cancelar
            </button>
            <button
              onClick={handleKeypadConfirm}
              className="h-12 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 font-oswald font-bold text-white transition-all duration-300 active:scale-95"
            >
              Confirmar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
