import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, billsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, Receipt, CreditCard, Banknote, SplitSquareHorizontal, Check, Tag, Plus, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function Billing() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [bills, setBills] = useState([]);
  const [splitDialog, setSplitDialog] = useState(false);
  const [splitLabel, setSplitLabel] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [payDialog, setPayDialog] = useState({ open: false, billId: null, billTotal: 0 });
  const [tipPct, setTipPct] = useState(0);
  const [printHtml, setPrintHtml] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [payAmounts, setPayAmounts] = useState({}); // {methodName: amount}
  const [payStep, setPayStep] = useState('method'); // 'method' | 'amount'
  const [activePayMethod, setActivePayMethod] = useState(null); // Currently focused payment method

  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  const fetchData = useCallback(async () => {
    try {
      const [orderRes, billsRes, custRes] = await Promise.all([
        ordersAPI.get(orderId),
        billsAPI.list({ order_id: orderId }),
        fetch(`${API_BASE}/api/customers`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json())
      ]);
      setOrder(orderRes.data);
      setBills(billsRes.data);
      setCustomers(custRes);
      // Fetch payment methods
      try {
        const pmRes = await fetch(`${API_BASE}/api/payment-methods`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
        setPaymentMethods(await pmRes.json());
      } catch {}
    } catch {
      toast.error('Error cargando datos');
    }
  }, [orderId, API_BASE]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeItems = order?.items?.filter(i => i.status !== 'cancelled') || [];
  const billedItemIds = bills.filter(b => b.status !== 'cancelled').flatMap(b => b.items.map(i => i.item_id));
  const unbilledItems = activeItems.filter(i => !billedItemIds.includes(i.id));

  const handleCreateBill = async (itemIds, label) => {
    try {
      await billsAPI.create({
        order_id: orderId,
        table_id: order.table_id,
        label: label || `Mesa ${order.table_number}`,
        item_ids: itemIds,
        tip_percentage: 0,
        payment_method: 'cash'
      });
      toast.success('Factura creada');
      setSplitDialog(false);
      setSplitLabel('');
      setSelectedItems([]);
      fetchData();
    } catch {
      toast.error('Error creando factura');
    }
  };

  const handleCreateFullBill = () => {
    if (unbilledItems.length === 0) { toast.info('Todos los items ya estan facturados'); return; }
    handleCreateBill(unbilledItems.map(i => i.id), `Mesa ${order?.table_number}`);
  };

  const handlePayBill = async () => {
    const billId = payDialog.billId;
    // Determine primary payment method (the one with highest amount)
    const entries = Object.entries(payAmounts).filter(([_, v]) => v > 0);
    const mainMethod = entries.length > 0 ? entries.sort((a, b) => b[1] - a[1])[0][0] : 'Efectivo RD$';
    try {
      const res = await billsAPI.pay(billId, { payment_method: mainMethod, tip_percentage: tipPct, additional_tip: 0, customer_id: selectedCustomer });
      const pts = res.data?.points_earned;
      const totalPaid = Object.values(payAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const change = totalPaid - payDialog.billTotal;
      let msg = 'Pago procesado';
      if (change > 0) msg += ` | Cambio: ${formatMoney(change)}`;
      if (pts > 0) msg += ` | +${pts} pts`;
      toast.success(msg);
      setPayDialog({ open: false, billId: null, billTotal: 0 });
      setPayAmounts({});
      setSelectedCustomer('');
      setPayStep('method');
      fetchData();
    } catch {
      toast.error('Error procesando pago');
    }
  };

  const handleCancelBill = async (billId) => {
    try {
      await billsAPI.cancel(billId);
      toast.success('Factura anulada');
      fetchData();
    } catch {
      toast.error('Error anulando factura');
    }
  };

  const toggleItem = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  return (
    <div className="h-full flex flex-col" data-testid="billing-page">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/order/${order?.table_id}`)} className="h-10 w-10" data-testid="back-to-order">
            <ArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="font-oswald text-xl font-bold tracking-wide">FACTURACION</h1>
            <p className="text-xs text-muted-foreground">Mesa {order?.table_number} - Orden #{orderId?.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Hide buttons if all bills are paid */}
          {bills.filter(b => b.status === 'pending').length > 0 || bills.length === 0 ? (
            <>
              <Button onClick={() => setSplitDialog(true)} variant="outline" size="sm" data-testid="split-bill-btn"
                className="text-xs border-primary/50 text-primary">
                <SplitSquareHorizontal size={14} className="mr-1" /> Dividir
              </Button>
              <Button onClick={handleCreateFullBill} size="sm" data-testid="full-bill-btn"
                className="text-xs bg-primary text-primary-foreground">
                <Receipt size={14} className="mr-1" /> Facturar Todo
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Bills List */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {bills.filter(b => b.status !== 'cancelled').length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-oswald">No hay facturas aun</p>
                <p className="text-xs">Usa "Facturar Todo" o "Dividir" para crear facturas</p>
              </div>
            ) : (
              bills.filter(b => b.status !== 'cancelled').map(bill => (
                <div key={bill.id} data-testid={`bill-${bill.id}`}
                  className="receipt-paper ticket-edge relative rounded-t-lg overflow-hidden max-w-lg">
                  {/* Bill Header */}
                  <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-primary" />
                      <span className="font-oswald text-base font-bold text-white">{bill.label}</span>
                    </div>
                    <Badge className={bill.status === 'paid' ? 'bg-green-600' : 'bg-yellow-600'}>
                      {bill.status === 'paid' ? 'Pagada' : 'Abierta'}
                    </Badge>
                  </div>

                  <div className="p-4 text-gray-800">
                    {/* NCF */}
                    <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-3">
                      <p className="font-mono text-xs text-gray-500">NCF: {bill.ncf}</p>
                      <p className="font-mono text-[10px] text-gray-400">RNC: 000-000000-0</p>
                    </div>

                    {/* Items */}
                    <div className="space-y-1 mb-3">
                      {bill.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="flex-1">
                            <span className="font-oswald font-bold">{item.quantity}x</span> {item.product_name}
                            {item.modifiers?.length > 0 && (
                              <span className="text-gray-400 ml-1">({item.modifiers.map(m => m.name).join(', ')})</span>
                            )}
                          </span>
                          <span className="font-oswald font-bold ml-2">{formatMoney(item.total)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Subtotal</span>
                        <span className="font-oswald">{formatMoney(bill.subtotal)}</span>
                      </div>
                      {bill.tax_breakdown ? bill.tax_breakdown.map((tax, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span>{tax.description} ({tax.rate}%)</span>
                          <span className="font-oswald">{formatMoney(tax.amount)}</span>
                        </div>
                      )) : (
                        <>
                          <div className="flex justify-between text-xs">
                            <span>ITBIS ({bill.itbis_rate}%)</span>
                            <span className="font-oswald">{formatMoney(bill.itbis)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Propina Legal ({bill.propina_percentage}%)</span>
                            <span className="font-oswald">{formatMoney(bill.propina_legal)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-sm font-bold border-t border-gray-300 pt-2 mt-2">
                        <span>TOTAL</span>
                        <span className="font-oswald text-lg">{formatMoney(bill.total)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    {bill.status === 'open' && (
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => navigate(`/payment/${bill.id}`)}
                          data-testid={`pay-bill-${bill.id}`}
                          className="flex-1 h-11 rounded-lg bg-green-600 text-white font-oswald font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
                          <Check size={16} /> COBRAR
                        </button>
                        <button onClick={async () => {
                          try { 
                            const r = await fetch(`${API_BASE}/api/print/receipt/${bill.id}?send_to_queue=true`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
                            const d = await r.json(); 
                            setPrintHtml(d.html); 
                            setPrintOpen(true); 
                            if (d.queued) toast.success('Enviado a impresora');
                          } catch { toast.error('Error'); }
                        }} data-testid={`print-bill-${bill.id}`}
                          className="h-11 px-3 rounded-lg bg-muted text-foreground font-bold text-xs border border-border active:scale-95 flex items-center gap-1">
                          <Printer size={14} /> Imprimir
                        </button>
                        <button onClick={() => handleCancelBill(bill.id)}
                          data-testid={`cancel-bill-${bill.id}`}
                          className="h-11 px-3 rounded-lg bg-red-600/10 text-red-600 font-bold text-xs border border-red-600/30 active:scale-95">
                          Anular
                        </button>
                      </div>
                    )}
                    {bill.status === 'paid' && (
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400 font-mono">
                          Pagado: {new Date(bill.paid_at).toLocaleString('es-DO')} | {bill.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'}
                        </span>
                        <button onClick={async () => {
                          try { 
                            const r = await fetch(`${API_BASE}/api/print/receipt/${bill.id}?send_to_queue=true`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
                            const d = await r.json(); 
                            setPrintHtml(d.html); 
                            setPrintOpen(true); 
                            if (d.queued) toast.success('Enviado a impresora');
                          } catch { toast.error('Error'); }
                        }} className="text-gray-500 hover:text-gray-800 transition-colors">
                          <Printer size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Unbilled items sidebar */}
        {unbilledItems.length > 0 && (
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border p-4 bg-card/30">
            <h3 className="font-oswald text-sm font-bold mb-3 text-muted-foreground">ITEMS SIN FACTURAR</h3>
            <div className="space-y-1">
              {unbilledItems.map(item => (
                <div key={item.id} className="flex justify-between text-xs p-2 rounded bg-background/50 border border-border/50">
                  <span><span className="font-oswald font-bold text-primary">{item.quantity}x</span> {item.product_name}</span>
                  <span className="font-oswald">{formatMoney(item.unit_price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Split Dialog */}
      <Dialog open={splitDialog} onOpenChange={setSplitDialog}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="split-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald">Dividir Cuenta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">Nombre de la cuenta</label>
              <input
                value={splitLabel}
                onChange={e => setSplitLabel(e.target.value)}
                placeholder="Ej: Juan, Mesa VIP..."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                data-testid="split-label-input"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-2 block">
                Selecciona items ({selectedItems.length} seleccionados)
              </label>
              <ScrollArea className="max-h-60">
                <div className="space-y-1">
                  {unbilledItems.map(item => (
                    <button key={item.id} onClick={() => toggleItem(item.id)}
                      data-testid={`split-item-${item.id}`}
                      className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                        selectedItems.includes(item.id)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background'
                      }`}>
                      <span><span className="font-oswald font-bold">{item.quantity}x</span> {item.product_name}</span>
                      <span className="font-oswald">{formatMoney(item.unit_price * item.quantity)}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <Button
              onClick={() => handleCreateBill(selectedItems, splitLabel)}
              disabled={selectedItems.length === 0}
              data-testid="confirm-split-btn"
              className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
              CREAR FACTURA
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={payDialog.open} onOpenChange={(open) => { if (!open) { setPayDialog({ open: false, billId: null, billTotal: 0 }); setPayAmounts({}); setPayStep('method'); setActivePayMethod(null); } }}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="pay-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center justify-between">
              <span>Cobrar</span>
              <span className="text-primary text-xl">{formatMoney(payDialog.billTotal)}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Customer */}
            <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs" data-testid="pay-customer-select">
              <option value="">Cliente (fidelidad)</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.points} pts)</option>)}
            </select>

            {/* Tip */}
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground mr-1">Propina:</span>
              {[0, 5, 10, 15, 18].map(p => (
                <button key={p} onClick={() => setTipPct(p)}
                  className={`px-2 py-1 rounded text-[10px] font-oswald font-bold ${tipPct === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>{p}%</button>
              ))}
            </div>

            {/* Payment amounts per method */}
            <div className="space-y-1.5">
              {paymentMethods.filter(m => m.active).map(method => {
                const amt = payAmounts[method.name] || '';
                const rate = method.exchange_rate || 1;
                const inDOP = (parseFloat(amt) || 0) * rate;
                const isActive = activePayMethod === method.name;
                return (
                  <div key={method.id} className={`flex items-center gap-2 p-1.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10 ring-1 ring-primary/50' : ''}`}>
                    <span className={`text-xs w-28 truncate ${isActive ? 'text-primary font-bold' : ''}`}>{method.name}</span>
                    <input 
                      value={amt} 
                      onChange={e => setPayAmounts(p => ({ ...p, [method.name]: e.target.value }))}
                      onFocus={() => setActivePayMethod(method.name)}
                      type="number" 
                      step="0.01" 
                      placeholder="0.00"
                      className={`flex-1 bg-background border rounded-lg px-2 py-1.5 text-sm font-oswald text-right ${isActive ? 'border-primary' : 'border-border'}`}
                      data-testid={`pay-amount-${method.id}`} />
                    {method.currency !== 'DOP' && rate > 1 && parseFloat(amt) > 0 && (
                      <span className="text-[9px] text-muted-foreground w-20 text-right">= {formatMoney(inDOP)}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            {(() => {
              const totalPaidDOP = paymentMethods.filter(m => m.active).reduce((sum, m) => {
                const amt = parseFloat(payAmounts[m.name]) || 0;
                return sum + amt * (m.exchange_rate || 1);
              }, 0);
              const billTotal = payDialog.billTotal || 0;
              const change = totalPaidDOP - billTotal;
              const isEnough = totalPaidDOP >= billTotal;

              return (
                <div className="bg-background rounded-xl p-3 border border-border space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total a cobrar</span>
                    <span className="font-oswald font-bold">{formatMoney(billTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total recibido</span>
                    <span className={`font-oswald font-bold ${isEnough ? 'text-green-400' : 'text-destructive'}`}>{formatMoney(totalPaidDOP)}</span>
                  </div>
                  {change > 0 && (
                    <div className="flex justify-between text-sm border-t border-border pt-1 mt-1">
                      <span className="font-bold text-green-400">CAMBIO</span>
                      <span className="font-oswald text-xl font-bold text-green-400">{formatMoney(change)}</span>
                    </div>
                  )}
                  {change < 0 && (
                    <div className="flex justify-between text-xs border-t border-border pt-1 mt-1">
                      <span className="text-destructive">Falta</span>
                      <span className="font-oswald font-bold text-destructive">{formatMoney(Math.abs(change))}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Quick amounts for fastest payment */}
            <div className="flex gap-1 flex-wrap">
              {[100, 200, 500, 1000, 2000, 5000].map(amt => (
                <button key={amt} onClick={() => {
                  // Use active method if set, otherwise use first active DOP method
                  const targetMethod = activePayMethod || (paymentMethods.find(m => m.active && m.currency === 'DOP') || paymentMethods.find(m => m.active))?.name;
                  if (targetMethod) setPayAmounts(p => ({ ...p, [targetMethod]: String(amt) }));
                }} className="px-2 py-1 rounded bg-muted text-[10px] font-oswald hover:bg-primary/20 transition-colors">
                  {amt}
                </button>
              ))}
              <button onClick={() => {
                // Use active method if set, otherwise use first active DOP method
                const targetMethod = activePayMethod || (paymentMethods.find(m => m.active && m.currency === 'DOP') || paymentMethods.find(m => m.active))?.name;
                if (targetMethod) setPayAmounts(p => ({ ...p, [targetMethod]: String(payDialog.billTotal) }));
              }} className="px-2 py-1 rounded bg-primary/20 text-primary text-[10px] font-oswald font-bold">
                EXACTO
              </button>
            </div>

            <Button onClick={handlePayBill}
              disabled={paymentMethods.filter(m => m.active).reduce((sum, m) => sum + (parseFloat(payAmounts[m.name]) || 0) * (m.exchange_rate || 1), 0) < (payDialog.billTotal || 0)}
              data-testid="confirm-pay-btn"
              className="w-full h-12 bg-green-600 text-white font-oswald font-bold text-base tracking-wider active:scale-95 disabled:opacity-40">
              PROCESAR PAGO
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-sm bg-white text-black" data-testid="print-preview-dialog">
          <DialogHeader><DialogTitle className="text-black font-oswald">Vista Previa de Recibo</DialogTitle></DialogHeader>
          <div className="receipt-paper p-2" dangerouslySetInnerHTML={{ __html: printHtml }} />
          <Button onClick={() => {
            const w = window.open('', '_blank', 'width=320,height=600');
            w.document.write(`<html><body style="margin:0;padding:0;">${printHtml}</body></html>`);
            w.document.close();
            w.print();
          }} className="w-full h-11 bg-gray-900 text-white font-oswald font-bold active:scale-95" data-testid="print-receipt-btn">
            <Printer size={16} className="mr-2" /> IMPRIMIR
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
