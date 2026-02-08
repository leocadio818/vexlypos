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
  const [payDialog, setPayDialog] = useState({ open: false, billId: null });
  const [tipPct, setTipPct] = useState(0);
  const [printHtml, setPrintHtml] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);

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

  const handlePayBill = async (billId, method) => {
    try {
      const res = await billsAPI.pay(billId, { payment_method: method, tip_percentage: tipPct, additional_tip: 0, customer_id: selectedCustomer });
      const pts = res.data?.points_earned;
      if (pts > 0) {
        toast.success(`Pago procesado | +${pts} puntos fidelidad`);
      } else {
        toast.success('Pago procesado');
      }
      setPayDialog({ open: false, billId: null });
      setSelectedCustomer('');
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
          <Button onClick={() => setSplitDialog(true)} variant="outline" size="sm" data-testid="split-bill-btn"
            className="text-xs border-primary/50 text-primary">
            <SplitSquareHorizontal size={14} className="mr-1" /> Dividir
          </Button>
          <Button onClick={handleCreateFullBill} size="sm" data-testid="full-bill-btn"
            className="text-xs bg-primary text-primary-foreground">
            <Receipt size={14} className="mr-1" /> Facturar Todo
          </Button>
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
                      <div className="flex justify-between text-xs">
                        <span>ITBIS ({bill.itbis_rate}%)</span>
                        <span className="font-oswald">{formatMoney(bill.itbis)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Propina Legal ({bill.propina_percentage}%)</span>
                        <span className="font-oswald">{formatMoney(bill.propina_legal)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold border-t border-gray-300 pt-2 mt-2">
                        <span>TOTAL</span>
                        <span className="font-oswald text-lg">{formatMoney(bill.total)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    {bill.status === 'open' && (
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => setPayDialog({ open: true, billId: bill.id })}
                          data-testid={`pay-bill-${bill.id}`}
                          className="flex-1 h-11 rounded-lg bg-green-600 text-white font-oswald font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
                          <Check size={16} /> COBRAR
                        </button>
                        <button onClick={async () => {
                          try { const r = await fetch(`${API_BASE}/api/print/receipt/${bill.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
                            const d = await r.json(); setPrintHtml(d.html); setPrintOpen(true); } catch { toast.error('Error'); }
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
                          try { const r = await fetch(`${API_BASE}/api/print/receipt/${bill.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
                            const d = await r.json(); setPrintHtml(d.html); setPrintOpen(true); } catch { toast.error('Error'); }
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
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">Propina %</label>
              <div className="flex gap-2">
                {[0, 5, 10, 15, 18, 20].map(p => (
                  <button key={p} onClick={() => setTipPct(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-oswald font-bold transition-colors ${
                      tipPct === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}>{p}%</button>
                ))}
              </div>
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
      <Dialog open={payDialog.open} onOpenChange={(open) => !open && setPayDialog({ open: false, billId: null })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="pay-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald">Cobrar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Customer for loyalty */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cliente (fidelidad)</label>
              <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="pay-customer-select">
                <option value="">Sin cliente</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.points} pts)</option>)}
              </select>
            </div>
            {/* Tip */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Propina % (opcional)</label>
              <div className="flex gap-1 flex-wrap">
                {[0, 5, 10, 15, 18, 20].map(p => (
                  <button key={p} onClick={() => setTipPct(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-oswald font-bold transition-colors ${
                      tipPct === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}>{p}%</button>
                ))}
              </div>
            </div>
            {/* All Payment Methods */}
            <div className="space-y-1.5">
              {paymentMethods.filter(m => m.active).map(method => (
                <button key={method.id} onClick={() => handlePayBill(payDialog.billId, method.name)}
                  data-testid={`pay-method-${method.id}`}
                  className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground font-oswald font-bold text-sm flex items-center justify-between px-4 hover:bg-primary/10 hover:border-primary/50 transition-all active:scale-95">
                  <span>{method.name}</span>
                  {method.currency !== 'DOP' && method.exchange_rate > 1 && (
                    <span className="text-xs text-muted-foreground font-mono">1 {method.currency} = RD$ {method.exchange_rate}</span>
                  )}
                </button>
              ))}
            </div>
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
