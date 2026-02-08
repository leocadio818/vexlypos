import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, categoriesAPI, productsAPI, modifiersAPI, reasonsAPI, tablesAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, Send, Trash2, X, AlertTriangle, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function OrderScreen() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const [table, setTable] = useState(null);
  const [order, setOrder] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [cancelReasons, setCancelReasons] = useState([]);
  const [modDialog, setModDialog] = useState({ open: false, product: null, selectedMods: {}, qty: '1', notes: '' });
  const [cancelDialog, setCancelDialog] = useState({ open: false, itemId: null });
  const [qtyPadOpen, setQtyPadOpen] = useState(false);
  const orderRef = useRef(null);

  const fetchOrder = useCallback(async () => {
    try {
      const tableRes = await tablesAPI.list();
      const t = tableRes.data.find(tb => tb.id === tableId);
      setTable(t);
      if (t?.active_order_id) {
        const orderRes = await ordersAPI.get(t.active_order_id);
        setOrder(orderRes.data);
        orderRef.current = orderRes.data;
      }
    } catch {}
  }, [tableId]);

  useEffect(() => {
    const fetchAll = async () => {
      const [catRes, prodRes, modRes, reasonRes] = await Promise.all([
        categoriesAPI.list(), productsAPI.list(), modifiersAPI.list(), reasonsAPI.list()
      ]);
      setCategories(catRes.data); setProducts(prodRes.data);
      setModifierGroups(modRes.data); setCancelReasons(reasonRes.data);
      if (catRes.data.length > 0) setActiveCat(catRes.data[0].id);
    };
    fetchAll(); fetchOrder();
  }, [fetchOrder]);

  // Keep ref in sync
  useEffect(() => { orderRef.current = order; }, [order]);

  // Auto-send to kitchen when leaving (back button)
  const handleBack = async () => {
    const currentOrder = orderRef.current;
    if (currentOrder) {
      const pending = currentOrder.items?.filter(i => i.status === 'pending') || [];
      if (pending.length > 0) {
        try {
          await ordersAPI.sendToKitchen(currentOrder.id);
          toast.success('Comanda enviada automaticamente');
        } catch {}
      }
    }
    navigate('/tables');
  };

  const filteredProducts = products.filter(p => p.category_id === activeCat);

  const handleProductClick = (product) => {
    const productModGroups = modifierGroups.filter(mg => product.modifier_group_ids?.includes(mg.id));
    if (productModGroups.length > 0) {
      setModDialog({ open: true, product, selectedMods: {}, qty: '1', notes: '' });
    } else {
      // No modifiers - show quick qty pad
      setModDialog({ open: true, product, selectedMods: {}, qty: '1', notes: '' });
    }
  };

  const addItemToOrder = async (product, qty, mods, notes) => {
    const item = { product_id: product.id, product_name: product.name, quantity: qty, unit_price: product.price, modifiers: mods, notes };
    try {
      if (!order) {
        const res = await ordersAPI.create({ table_id: tableId, items: [item] });
        setOrder(res.data); toast.success(`${product.name} agregado`);
      } else {
        const res = await ordersAPI.addItems(order.id, [item]);
        setOrder(res.data); toast.success(`${product.name} agregado`);
      }
    } catch { toast.error('Error agregando item'); }
  };

  const handleConfirmModifiers = () => {
    const { product, selectedMods, qty, notes } = modDialog;
    const mods = Object.values(selectedMods).flat().filter(Boolean);
    addItemToOrder(product, parseFloat(qty) || 1, mods, notes);
    setModDialog({ open: false, product: null, selectedMods: {}, qty: '1', notes: '' });
  };

  const handleSendToKitchen = async () => {
    if (!order) return;
    const pendingItems = order.items.filter(i => i.status === 'pending');
    if (pendingItems.length === 0) { toast.info('No hay items pendientes'); return; }
    try {
      const res = await ordersAPI.sendToKitchen(order.id);
      setOrder(res.data); toast.success('Comanda enviada a cocina');
    } catch { toast.error('Error enviando a cocina'); }
  };

  const handleCancelItem = async (reasonId) => {
    const { itemId } = cancelDialog;
    const reason = cancelReasons.find(r => r.id === reasonId);
    try {
      const res = await ordersAPI.cancelItem(order.id, itemId, { reason_id: reasonId, return_to_inventory: reason?.return_to_inventory || false });
      setOrder(res.data); toast.success('Item anulado');
      setCancelDialog({ open: false, itemId: null });
    } catch { toast.error('Error anulando item'); }
  };

  const activeItems = order?.items?.filter(i => i.status !== 'cancelled') || [];
  const pendingCount = activeItems.filter(i => i.status === 'pending').length;
  const subtotal = activeItems.reduce((sum, i) => {
    const modTotal = (i.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
    return sum + (i.unit_price + modTotal) * i.quantity;
  }, 0);

  // Numpad quantity handler
  const handleQtyKey = (key) => {
    setModDialog(prev => {
      let val = prev.qty;
      if (key === 'C') val = '0';
      else if (key === 'DEL') val = val.length > 1 ? val.slice(0, -1) : '0';
      else if (key === '.') { if (!val.includes('.')) val += '.'; }
      else val = val === '0' ? key : val + key;
      return { ...prev, qty: val };
    });
  };

  return (
    <div className="h-full flex flex-col lg:flex-row" data-testid="order-screen">
      {/* Left: Order Summary */}
      <div className="w-full lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-border flex flex-col bg-card/50 shrink-0">
        {/* Header - compact */}
        <div className="px-2 py-2 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={handleBack} data-testid="back-to-tables" className="h-9 w-9">
              <ArrowLeft size={16} />
            </Button>
            <h2 className="font-oswald text-base font-bold">Mesa {table?.number || '?'}</h2>
          </div>
          <div className="flex items-center gap-1">
            {pendingCount > 0 && (
              <Button onClick={handleSendToKitchen} size="sm" data-testid="send-to-kitchen-btn"
                className="h-8 bg-primary text-primary-foreground font-oswald text-xs font-bold active:scale-95 shadow-[0_2px_10px_0_rgba(255,100,0,0.3)]">
                <Send size={12} className="mr-1" /> ENVIAR ({pendingCount})
              </Button>
            )}
            {order && (
              <Button onClick={() => navigate(`/billing/${order.id}`)} variant="outline" size="sm" data-testid="go-to-billing" className="h-8 text-xs border-primary/50 text-primary">
                <Receipt size={12} className="mr-1" /> Facturar
              </Button>
            )}
          </div>
        </div>

        {/* Order Items */}
        <ScrollArea className="flex-1 max-h-[30vh] lg:max-h-none">
          <div className="p-2 space-y-1">
            {activeItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Selecciona productos del menu</p>
            ) : (
              activeItems.map(item => (
                <div key={item.id} data-testid={`order-item-${item.id}`}
                  className="flex items-start gap-1.5 p-1.5 rounded-lg bg-background/50 border border-border/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-oswald text-xs font-bold text-primary">{item.quantity}x</span>
                      <span className="text-xs font-medium truncate">{item.product_name}</span>
                    </div>
                    {item.modifiers?.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {item.modifiers.map((m, i) => <Badge key={i} variant="secondary" className="text-[8px] h-4 px-1">{m.name}</Badge>)}
                      </div>
                    )}
                    <div className="mt-0.5">
                      {item.status === 'pending' && <Badge variant="outline" className="text-[8px] h-3.5 border-yellow-600 text-yellow-500">Pendiente</Badge>}
                      {item.status === 'sent' && <Badge variant="outline" className="text-[8px] h-3.5 border-blue-500 text-blue-400">Enviado</Badge>}
                      {item.status === 'preparing' && <Badge variant="outline" className="text-[8px] h-3.5 border-orange-500 text-orange-400">Preparando</Badge>}
                      {item.status === 'ready' && <Badge variant="outline" className="text-[8px] h-3.5 border-green-500 text-green-400">Listo</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-oswald text-xs">{formatMoney(item.unit_price * item.quantity)}</span>
                    {item.status === 'pending' && (
                      <button onClick={() => setCancelDialog({ open: true, itemId: item.id })}
                        className="block ml-auto mt-0.5 text-destructive/50 hover:text-destructive" data-testid={`cancel-item-${item.id}`}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Subtotal - compact */}
        <div className="px-3 py-2 border-t border-border flex justify-between items-center font-oswald">
          <span className="text-muted-foreground text-sm">Subtotal</span>
          <span className="text-lg font-bold">{formatMoney(subtotal)}</span>
        </div>
      </div>

      {/* Right: Product Selection */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex gap-1 p-2 overflow-x-auto border-b border-border shrink-0" data-testid="category-tabs">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCat(cat.id)}
              data-testid={`cat-${cat.name.toLowerCase().replace(/\s/g, '-')}`}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all btn-press ${
                activeCat === cat.id ? 'text-white shadow-lg' : 'bg-card text-muted-foreground hover:bg-muted'
              }`} style={activeCat === cat.id ? { backgroundColor: cat.color } : {}}>
              {cat.name}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2" data-testid="product-grid">
            {filteredProducts.map(product => (
              <button key={product.id} onClick={() => handleProductClick(product)}
                data-testid={`product-${product.id}`}
                className="group relative overflow-hidden bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.97] rounded-xl flex flex-col justify-between p-3 h-24 text-left">
                <span className="text-xs font-semibold leading-tight line-clamp-2">{product.name}</span>
                <span className="font-oswald text-base font-bold text-primary">{formatMoney(product.price)}</span>
                {product.modifier_group_ids?.length > 0 && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary/60" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Product Dialog with Numpad Quantity */}
      <Dialog open={modDialog.open} onOpenChange={(open) => !open && setModDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border p-4" data-testid="modifier-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-base">{modDialog.product?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto">
            {/* Numpad Quantity - compact */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Cantidad</label>
              <div className="bg-background rounded-xl border border-border p-2">
                <div className="text-center mb-2">
                  <span className="font-oswald text-3xl font-bold text-primary" data-testid="qty-display">{modDialog.qty}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {['1','2','3','C','4','5','6','DEL','7','8','9','.','','0',''].map((k, i) => {
                    if (k === '') return <div key={i} />;
                    const isAction = k === 'C' || k === 'DEL';
                    return (
                      <button key={i} onClick={() => handleQtyKey(k)} data-testid={`qty-key-${k}`}
                        className={`h-10 rounded-lg font-oswald font-bold text-base transition-colors active:scale-95 ${
                          isAction ? 'bg-destructive/20 text-destructive text-xs' : 'bg-muted hover:bg-primary hover:text-white'
                        }`}>{k}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modifier Groups */}
            {modifierGroups.filter(mg => modDialog.product?.modifier_group_ids?.includes(mg.id)).map(group => (
              <div key={group.id}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-semibold">{group.name}</span>
                  {group.required && <Badge variant="destructive" className="text-[8px] h-3.5">Requerido</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {group.options.map(opt => {
                    const isSelected = (modDialog.selectedMods[group.id] || []).some(m => m.id === opt.id);
                    return (
                      <button key={opt.id} onClick={() => {
                        setModDialog(prev => {
                          const current = prev.selectedMods[group.id] || [];
                          const updated = group.max_selections === 1 ? (isSelected ? [] : [opt]) : (isSelected ? current.filter(m => m.id !== opt.id) : [...current, opt]);
                          return { ...prev, selectedMods: { ...prev.selectedMods, [group.id]: updated } };
                        });
                      }} className={`p-1.5 rounded-lg text-left text-[11px] transition-all border ${
                        isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:border-primary/30'
                      }`}>
                        <span className="block font-medium">{opt.name}</span>
                        {opt.price > 0 && <span className="text-primary font-oswald text-[10px]">+{formatMoney(opt.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Notes */}
            <input value={modDialog.notes} onChange={e => setModDialog(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas especiales..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs" data-testid="item-notes-input" />
          </div>

          <Button onClick={handleConfirmModifiers} data-testid="confirm-modifiers-btn"
            className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold tracking-wider active:scale-95 mt-2">
            AGREGAR ({formatMoney((modDialog.product?.price || 0) * (parseFloat(modDialog.qty) || 1))})
          </Button>
        </DialogContent>
      </Dialog>

      {/* Cancel Item Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => !open && setCancelDialog({ open: false, itemId: null })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" /> Razon de Anulacion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {cancelReasons.map(reason => (
              <button key={reason.id} onClick={() => handleCancelItem(reason.id)} data-testid={`cancel-reason-${reason.id}`}
                className="w-full p-2.5 rounded-lg border border-border bg-background hover:border-destructive/50 text-left transition-colors active:scale-[0.98]">
                <span className="text-xs font-medium">{reason.name}</span>
                <span className={`block text-[9px] mt-0.5 ${reason.return_to_inventory ? 'text-table-free' : 'text-destructive'}`}>
                  {reason.return_to_inventory ? 'Retorna al inventario' : 'No retorna al inventario'}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
