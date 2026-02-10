import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { billsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, User, Search, CreditCard, Banknote, Building2, DollarSign, Euro, Smartphone, QrCode, X, Check, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const paymentIcons = {
  'Efectivo RD$': Banknote,
  'Tarjeta Crédito': CreditCard,
  'Tarjeta Débito': CreditCard,
  'Transferencia': Building2,
  'USD': DollarSign,
  'EUR': Euro,
  'default': Banknote
};

const paymentColors = {
  'Efectivo RD$': 'bg-green-600 hover:bg-green-700',
  'Tarjeta Crédito': 'bg-blue-600 hover:bg-blue-700',
  'Tarjeta Débito': 'bg-purple-600 hover:bg-purple-700',
  'Transferencia': 'bg-cyan-600 hover:bg-cyan-700',
  'USD': 'bg-emerald-600 hover:bg-emerald-700',
  'EUR': 'bg-amber-600 hover:bg-amber-700',
  'default': 'bg-gray-600 hover:bg-gray-700'
};

export default function PaymentScreen() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { largeMode } = useAuth();
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

  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  const fetchData = useCallback(async () => {
    try {
      const [billRes, pmRes, custRes] = await Promise.all([
        billsAPI.get(billId),
        fetch(`${API_BASE}/api/payment-methods`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json()),
        fetch(`${API_BASE}/api/customers`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json())
      ]);
      setBill(billRes.data);
      setPaymentMethods(pmRes.filter(m => m.active));
      setCustomers(custRes);
      // Load quick amounts from settings
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
      
      // Navigate back to billing
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
    // Find the first active DOP method or just first method
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

  if (!bill) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background" data-testid="payment-screen">
      {/* Header */}
      <div className={`px-4 ${largeMode ? 'py-4' : 'py-3'} border-b border-border flex items-center justify-between bg-card/50`}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className={`${largeMode ? 'h-12 w-12' : 'h-10 w-10'}`}>
            <ArrowLeft size={largeMode ? 22 : 18} />
          </Button>
          <div>
            <h1 className={`font-oswald font-bold tracking-wide ${largeMode ? 'text-2xl' : 'text-xl'}`}>PROCESAR PAGO</h1>
            <p className={`text-muted-foreground ${largeMode ? 'text-sm' : 'text-xs'}`}>{bill.label} - Factura #{billId?.slice(0, 8)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Bill Details & Customer */}
        <div className={`${largeMode ? 'w-96' : 'w-80'} border-r border-border flex flex-col bg-card/30`}>
          {/* Customer Fidelity Button */}
          <div className="p-4 border-b border-border">
            <button
              onClick={() => setCustomerDialog(true)}
              className={`w-full ${largeMode ? 'h-16' : 'h-14'} rounded-2xl border-2 border-dashed transition-all flex items-center justify-center gap-3 ${
                selectedCustomer 
                  ? 'border-primary bg-primary/10 text-primary' 
                  : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
              }`}
              data-testid="customer-fidelity-btn"
            >
              <User size={largeMode ? 28 : 24} />
              <div className="text-left">
                {selectedCustomer ? (
                  <>
                    <p className={`font-bold ${largeMode ? 'text-base' : 'text-sm'}`}>{selectedCustomer.name}</p>
                    <p className={`${largeMode ? 'text-sm' : 'text-xs'} opacity-70`}>{selectedCustomer.points} puntos</p>
                  </>
                ) : (
                  <>
                    <p className={`font-semibold ${largeMode ? 'text-base' : 'text-sm'}`}>Cliente Fidelidad</p>
                    <p className={`${largeMode ? 'text-sm' : 'text-xs'} opacity-70`}>Toca para buscar</p>
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

          {/* Bill Items Summary */}
          <ScrollArea className="flex-1 p-4">
            <h3 className={`font-oswald font-bold mb-3 text-muted-foreground ${largeMode ? 'text-base' : 'text-sm'}`}>DETALLE DE FACTURA</h3>
            <div className="space-y-2">
              {bill.items?.map((item, i) => (
                <div key={i} className={`flex justify-between ${largeMode ? 'text-sm' : 'text-xs'}`}>
                  <span className="flex-1">
                    <span className="font-oswald font-bold text-primary">{item.quantity}x</span> {item.product_name}
                  </span>
                  <span className="font-oswald font-bold ml-2">{formatMoney(item.total)}</span>
                </div>
              ))}
            </div>
            
            {/* Totals */}
            <div className={`mt-4 pt-4 border-t border-border space-y-1 ${largeMode ? 'text-sm' : 'text-xs'}`}>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-oswald">{formatMoney(bill.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ITBIS ({bill.itbis_rate}%)</span>
                <span className="font-oswald">{formatMoney(bill.itbis)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Propina Legal ({bill.propina_percentage}%)</span>
                <span className="font-oswald">{formatMoney(bill.propina_legal)}</span>
              </div>
            </div>
          </ScrollArea>

          {/* Total to Pay */}
          <div className={`p-4 border-t border-border bg-card ${largeMode ? 'space-y-2' : 'space-y-1'}`}>
            <div className="flex justify-between items-center">
              <span className={`font-bold ${largeMode ? 'text-lg' : 'text-base'}`}>TOTAL A COBRAR</span>
              <span className={`font-oswald font-bold text-primary ${largeMode ? 'text-3xl' : 'text-2xl'}`}>{formatMoney(billTotal)}</span>
            </div>
          </div>
        </div>

        {/* Right Panel - Payment Methods & Amounts */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex-1 flex gap-6">
            {/* Payment Methods */}
            <div className="flex-1 flex flex-col">
              <h3 className={`font-oswald font-bold mb-4 ${largeMode ? 'text-lg' : 'text-base'}`}>FORMAS DE PAGO</h3>
              <div className={`grid ${largeMode ? 'grid-cols-2 gap-4' : 'grid-cols-3 gap-3'}`}>
                {paymentMethods.map(method => {
                  const Icon = paymentIcons[method.name] || paymentIcons.default;
                  const colorClass = paymentColors[method.name] || paymentColors.default;
                  const amount = payAmounts[method.name];
                  const hasAmount = amount && parseFloat(amount) > 0;
                  
                  return (
                    <button
                      key={method.id}
                      onClick={() => {
                        setKeypadValue(amount || '');
                        setKeypadDialog({ open: true, method: method.name });
                      }}
                      className={`relative rounded-2xl ${colorClass} text-white transition-all active:scale-95 flex flex-col items-center justify-center gap-2 ${
                        largeMode ? 'h-32 p-4' : 'h-24 p-3'
                      } ${hasAmount ? 'ring-4 ring-white/30' : ''}`}
                      data-testid={`payment-method-${method.id}`}
                    >
                      <Icon size={largeMode ? 32 : 24} />
                      <span className={`font-oswald font-bold text-center leading-tight ${largeMode ? 'text-sm' : 'text-xs'}`}>
                        {method.name}
                      </span>
                      {hasAmount && (
                        <div className={`absolute -top-2 -right-2 bg-white text-gray-900 rounded-full px-2 py-0.5 font-oswald font-bold ${largeMode ? 'text-sm' : 'text-xs'}`}>
                          {formatMoney(parseFloat(amount) * (method.exchange_rate || 1))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Payment Summary */}
              <div className={`mt-6 p-4 rounded-2xl bg-card border-2 ${isEnough ? 'border-green-500/50' : 'border-border'}`}>
                <div className={`flex justify-between items-center ${largeMode ? 'text-base' : 'text-sm'}`}>
                  <span className="text-muted-foreground">Total Recibido</span>
                  <span className={`font-oswald font-bold ${largeMode ? 'text-2xl' : 'text-xl'} ${isEnough ? 'text-green-500' : 'text-destructive'}`}>
                    {formatMoney(totalPaidDOP)}
                  </span>
                </div>
                {change > 0 && (
                  <div className={`flex justify-between items-center mt-2 pt-2 border-t border-border ${largeMode ? 'text-lg' : 'text-base'}`}>
                    <span className="font-bold text-green-500">CAMBIO</span>
                    <span className={`font-oswald font-bold text-green-500 ${largeMode ? 'text-3xl' : 'text-2xl'}`}>
                      {formatMoney(change)}
                    </span>
                  </div>
                )}
                {change < 0 && (
                  <div className={`flex justify-between items-center mt-2 pt-2 border-t border-border ${largeMode ? 'text-sm' : 'text-xs'}`}>
                    <span className="text-destructive">Falta</span>
                    <span className="font-oswald font-bold text-destructive">{formatMoney(Math.abs(change))}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Amounts */}
            <div className={`${largeMode ? 'w-48' : 'w-40'} flex flex-col`}>
              <h3 className={`font-oswald font-bold mb-4 ${largeMode ? 'text-lg' : 'text-base'}`}>MONTOS RÁPIDOS</h3>
              <div className="flex-1 flex flex-col gap-2">
                {quickAmounts.map(amount => (
                  <button
                    key={amount}
                    onClick={() => handleQuickAmount(amount)}
                    className={`flex-1 rounded-xl bg-muted hover:bg-primary/20 transition-all active:scale-95 font-oswald font-bold ${
                      largeMode ? 'text-lg' : 'text-base'
                    }`}
                  >
                    {amount.toLocaleString()}
                  </button>
                ))}
                <button
                  onClick={handleExact}
                  className={`flex-1 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary transition-all active:scale-95 font-oswald font-bold ${
                    largeMode ? 'text-lg' : 'text-base'
                  }`}
                >
                  EXACTO
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className={`flex-1 ${largeMode ? 'h-16 text-lg' : 'h-14 text-base'} font-oswald font-bold`}
            >
              CANCELAR
            </Button>
            <Button
              onClick={handlePayment}
              disabled={!isEnough || processing}
              className={`flex-[2] ${largeMode ? 'h-16 text-xl' : 'h-14 text-lg'} font-oswald font-bold bg-green-600 hover:bg-green-700 disabled:bg-muted disabled:text-muted-foreground`}
              data-testid="confirm-payment-btn"
            >
              {processing ? (
                <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <Check size={largeMode ? 28 : 24} className="mr-2" />
                  CONFIRMAR PAGO
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Customer Search Dialog */}
      <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
        <DialogContent className={`${largeMode ? 'max-w-lg' : 'max-w-md'} bg-card border-border`}>
          <DialogHeader>
            <DialogTitle className={`font-oswald ${largeMode ? 'text-xl' : 'text-lg'}`}>Buscar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono o email..."
                className={`w-full bg-background border border-border rounded-xl pl-10 pr-4 ${largeMode ? 'py-4 text-base' : 'py-3 text-sm'}`}
                autoFocus
              />
            </div>

            {/* Future: QR/Barcode Scanner */}
            <div className="flex gap-2">
              <button className={`flex-1 ${largeMode ? 'h-14' : 'h-12'} rounded-xl border-2 border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors`}>
                <QrCode size={largeMode ? 24 : 20} />
                <span className={largeMode ? 'text-sm' : 'text-xs'}>Escanear QR</span>
              </button>
              <button className={`flex-1 ${largeMode ? 'h-14' : 'h-12'} rounded-xl border-2 border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors`}>
                <Smartphone size={largeMode ? 24 : 20} />
                <span className={largeMode ? 'text-sm' : 'text-xs'}>Código de Barras</span>
              </button>
            </div>

            {/* Customer List */}
            <ScrollArea className="h-64">
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
                      className={`w-full ${largeMode ? 'p-4' : 'p-3'} rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left flex items-center gap-3`}
                    >
                      <div className={`${largeMode ? 'w-12 h-12' : 'w-10 h-10'} rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold`}>
                        {customer.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold ${largeMode ? 'text-base' : 'text-sm'}`}>{customer.name}</p>
                        <p className={`text-muted-foreground ${largeMode ? 'text-sm' : 'text-xs'}`}>
                          {customer.phone || customer.email || 'Sin contacto'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-oswald font-bold text-primary ${largeMode ? 'text-lg' : 'text-base'}`}>{customer.points}</p>
                        <p className={`text-muted-foreground ${largeMode ? 'text-xs' : 'text-[10px]'}`}>puntos</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keypad Dialog for Amount Entry */}
      <Dialog open={keypadDialog.open} onOpenChange={(open) => { if (!open) { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); } }}>
        <DialogContent className="max-w-xs bg-card border-border p-4">
          <DialogHeader>
            <DialogTitle className={`font-oswald text-center ${largeMode ? 'text-xl' : 'text-lg'}`}>
              {keypadDialog.method}
            </DialogTitle>
          </DialogHeader>
          
          {/* Display */}
          <div className="bg-background rounded-xl border border-border p-4 text-center mb-4">
            <span className={`font-oswald font-bold text-primary ${largeMode ? 'text-4xl' : 'text-3xl'}`}>
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
                className={`${largeMode ? 'h-16 text-2xl' : 'h-14 text-xl'} rounded-xl font-oswald font-bold transition-all active:scale-95 ${
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
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); }}
              className={`${largeMode ? 'h-14' : 'h-12'} font-oswald font-bold`}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleKeypadConfirm}
              className={`${largeMode ? 'h-14' : 'h-12'} font-oswald font-bold bg-primary`}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
