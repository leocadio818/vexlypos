import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, categoriesAPI, productsAPI, modifiersAPI, reasonsAPI, tablesAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, Send, Trash2, Minus, Plus, X, ChefHat, AlertTriangle } from 'lucide-react';
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

  // Modal states
  const [modDialog, setModDialog] = useState({ open: false, product: null, selectedMods: {}, qty: 1, notes: '' });
  const [cancelDialog, setCancelDialog] = useState({ open: false, itemId: null });
  const [qtyDialog, setQtyDialog] = useState({ open: false, value: '' });

  const fetchOrder = useCallback(async () => {
    try {
      const tableRes = await tablesAPI.list();
      const t = tableRes.data.find(tb => tb.id === tableId);
      setTable(t);
      if (t?.active_order_id) {
        const orderRes = await ordersAPI.get(t.active_order_id);
        setOrder(orderRes.data);
      }
    } catch {}
  }, [tableId]);

  useEffect(() => {
    const fetchAll = async () => {
      const [catRes, prodRes, modRes, reasonRes] = await Promise.all([
        categoriesAPI.list(), productsAPI.list(), modifiersAPI.list(), reasonsAPI.list()
      ]);
      setCategories(catRes.data);
      setProducts(prodRes.data);
      setModifierGroups(modRes.data);
      setCancelReasons(reasonRes.data);
      if (catRes.data.length > 0) setActiveCat(catRes.data[0].id);
    };
    fetchAll();
    fetchOrder();
  }, [fetchOrder]);

  const filteredProducts = products.filter(p => p.category_id === activeCat);

  const handleProductClick = (product) => {
    const productModGroups = modifierGroups.filter(mg => product.modifier_group_ids?.includes(mg.id));
    if (productModGroups.length > 0) {
      setModDialog({ open: true, product, selectedMods: {}, qty: 1, notes: '' });
    } else {
      addItemToOrder(product, 1, [], '');
    }
  };

  const addItemToOrder = async (product, qty, mods, notes) => {
    const item = {
      product_id: product.id, product_name: product.name,
      quantity: qty, unit_price: product.price, modifiers: mods, notes
    };
    try {
      if (!order) {
        const res = await ordersAPI.create({ table_id: tableId, items: [item] });
        setOrder(res.data);
        toast.success(`${product.name} agregado`);
      } else {
        const res = await ordersAPI.addItems(order.id, [item]);
        setOrder(res.data);
        toast.success(`${product.name} agregado`);
      }
    } catch (err) {
      toast.error('Error agregando item');
    }
  };

  const handleConfirmModifiers = () => {
    const { product, selectedMods, qty, notes } = modDialog;
    const mods = Object.values(selectedMods).flat().filter(Boolean);
    addItemToOrder(product, parseFloat(qty) || 1, mods, notes);
    setModDialog({ open: false, product: null, selectedMods: {}, qty: 1, notes: '' });
  };

  const handleSendToKitchen = async () => {
    if (!order) return;
    const pendingItems = order.items.filter(i => i.status === 'pending');
    if (pendingItems.length === 0) { toast.info('No hay items pendientes'); return; }
    try {
      const res = await ordersAPI.sendToKitchen(order.id);
      setOrder(res.data);
      toast.success('Comanda enviada a cocina');
    } catch {
      toast.error('Error enviando a cocina');
    }
  };

  const handleCancelItem = async (reasonId) => {
    const { itemId } = cancelDialog;
    const reason = cancelReasons.find(r => r.id === reasonId);
    try {
      const res = await ordersAPI.cancelItem(order.id, itemId, {
        reason_id: reasonId, return_to_inventory: reason?.return_to_inventory || false
      });
      setOrder(res.data);
      toast.success('Item anulado');
      setCancelDialog({ open: false, itemId: null });
    } catch {
      toast.error('Error anulando item');
    }
  };

  const activeItems = order?.items?.filter(i => i.status !== 'cancelled') || [];
  const subtotal = activeItems.reduce((sum, i) => {
    const modTotal = (i.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
    return sum + (i.unit_price + modTotal) * i.quantity;
  }, 0);

  const handleQtyInput = (val) => {
    setQtyDialog(prev => ({ ...prev, value: prev.value + val }));
  };

  return (
    <div className="h-full flex flex-col lg:flex-row" data-testid="order-screen">
      {/* Left: Order Summary */}
      <div className="w-full lg:w-80 xl:w-96 border-b lg:border-b-0 lg:border-r border-border flex flex-col bg-card/50 shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/tables')} data-testid="back-to-tables" className="h-10 w-10">
              <ArrowLeft size={18} />
            </Button>
            <div>
              <h2 className="font-oswald text-lg font-bold">Mesa {table?.number || '?'}</h2>
              <p className="text-xs text-muted-foreground">{order ? `Orden activa` : 'Nueva orden'}</p>
            </div>
          </div>
          {order && (
            <Button
              onClick={() => navigate(`/billing/${order.id}`)}
              variant="outline"
              size="sm"
              data-testid="go-to-billing"
              className="text-xs border-primary/50 text-primary"
            >
              Facturar
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 max-h-[35vh] lg:max-h-none">
          <div className="p-3 space-y-1">
            {activeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Selecciona productos del menu</p>
            ) : (
              activeItems.map(item => (
                <div key={item.id} data-testid={`order-item-${item.id}`}
                  className="flex items-start gap-2 p-2 rounded-lg bg-background/50 border border-border/50 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-oswald text-sm font-bold text-primary">{item.quantity}x</span>
                      <span className="text-sm font-medium truncate">{item.product_name}</span>
                    </div>
                    {item.modifiers?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.modifiers.map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] h-5">{m.name}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      {item.status === 'pending' && <Badge variant="outline" className="text-[9px] h-4 border-yellow-600 text-yellow-500">Pendiente</Badge>}
                      {item.status === 'sent' && <Badge variant="outline" className="text-[9px] h-4 border-blue-500 text-blue-400">Enviado</Badge>}
                      {item.status === 'preparing' && <Badge variant="outline" className="text-[9px] h-4 border-orange-500 text-orange-400">Preparando</Badge>}
                      {item.status === 'ready' && <Badge variant="outline" className="text-[9px] h-4 border-green-500 text-green-400">Listo</Badge>}
                      {item.status === 'served' && <Badge variant="outline" className="text-[9px] h-4 border-green-700 text-green-600">Servido</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-oswald text-sm">{formatMoney(item.unit_price * item.quantity)}</span>
                    {item.status === 'pending' && (
                      <button
                        onClick={() => setCancelDialog({ open: true, itemId: item.id })}
                        className="block ml-auto mt-1 text-destructive/60 hover:text-destructive transition-colors"
                        data-testid={`cancel-item-${item.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border space-y-2">
          <div className="flex justify-between font-oswald text-lg">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-bold">{formatMoney(subtotal)}</span>
          </div>
          <Button
            onClick={handleSendToKitchen}
            disabled={!order || activeItems.filter(i => i.status === 'pending').length === 0}
            data-testid="send-to-kitchen-btn"
            className="w-full h-14 bg-primary text-primary-foreground font-oswald font-bold text-base tracking-widest uppercase shadow-[0_4px_14px_0_rgba(255,100,0,0.39)] active:scale-95 transition-transform"
          >
            <Send size={18} className="mr-2" />
            ENVIAR A COCINA
          </Button>
        </div>
      </div>

      {/* Right: Product Selection */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Category Tabs */}
        <div className="flex gap-1 p-3 overflow-x-auto border-b border-border shrink-0" data-testid="category-tabs">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              data-testid={`cat-${cat.name.toLowerCase().replace(/\s/g, '-')}`}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all btn-press ${
                activeCat === cat.id
                  ? 'text-white shadow-lg'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
              style={activeCat === cat.id ? { backgroundColor: cat.color } : {}}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <ScrollArea className="flex-1">
          <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="product-grid">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => handleProductClick(product)}
                data-testid={`product-${product.id}`}
                className="group relative overflow-hidden bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.97] rounded-xl flex flex-col justify-between p-4 h-28 text-left"
              >
                <span className="text-sm font-semibold leading-tight line-clamp-2">{product.name}</span>
                <span className="font-oswald text-lg font-bold text-primary">{formatMoney(product.price)}</span>
                {product.modifier_group_ids?.length > 0 && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary/60" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Modifier Dialog */}
      <Dialog open={modDialog.open} onOpenChange={(open) => !open && setModDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="modifier-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald">{modDialog.product?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Quantity Input */}
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-2 block">Cantidad</label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-10 w-10"
                  onClick={() => setModDialog(p => ({ ...p, qty: Math.max(0.25, (parseFloat(p.qty) || 1) - 0.25) }))}>
                  <Minus size={16} />
                </Button>
                <button
                  onClick={() => setQtyDialog({ open: true, value: String(modDialog.qty) })}
                  className="font-oswald text-2xl font-bold text-primary w-20 text-center bg-background rounded-lg py-1 border border-border"
                  data-testid="qty-display"
                >
                  {modDialog.qty}
                </button>
                <Button variant="outline" size="icon" className="h-10 w-10"
                  onClick={() => setModDialog(p => ({ ...p, qty: (parseFloat(p.qty) || 1) + 0.25 }))}>
                  <Plus size={16} />
                </Button>
              </div>
              <div className="flex gap-1 mt-2">
                {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5].map(q => (
                  <button key={q} onClick={() => setModDialog(p => ({ ...p, qty: q }))}
                    className={`px-2 py-1 rounded text-xs font-oswald transition-colors ${
                      modDialog.qty === q ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Modifier Groups */}
            {modifierGroups.filter(mg => modDialog.product?.modifier_group_ids?.includes(mg.id)).map(group => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold">{group.name}</span>
                  {group.required && <Badge variant="destructive" className="text-[9px] h-4">Requerido</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.options.map(opt => {
                    const isSelected = (modDialog.selectedMods[group.id] || []).some(m => m.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setModDialog(prev => {
                            const current = prev.selectedMods[group.id] || [];
                            let updated;
                            if (group.max_selections === 1) {
                              updated = isSelected ? [] : [opt];
                            } else {
                              updated = isSelected ? current.filter(m => m.id !== opt.id) : [...current, opt];
                            }
                            return { ...prev, selectedMods: { ...prev.selectedMods, [group.id]: updated } };
                          });
                        }}
                        className={`p-2 rounded-lg text-left text-xs transition-all border ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-foreground hover:border-primary/30'
                        }`}
                      >
                        <span className="block font-medium">{opt.name}</span>
                        {opt.price > 0 && <span className="text-primary font-oswald">+{formatMoney(opt.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Notes */}
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">Notas</label>
              <input
                value={modDialog.notes}
                onChange={e => setModDialog(p => ({ ...p, notes: e.target.value }))}
                placeholder="Instrucciones especiales..."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                data-testid="item-notes-input"
              />
            </div>
          </div>
          <Button onClick={handleConfirmModifiers} data-testid="confirm-modifiers-btn"
            className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold tracking-wider active:scale-95">
            AGREGAR ({formatMoney((modDialog.product?.price || 0) * (parseFloat(modDialog.qty) || 1))})
          </Button>
        </DialogContent>
      </Dialog>

      {/* Cancel Item Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => !open && setCancelDialog({ open: false, itemId: null })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <AlertTriangle size={18} className="text-destructive" />
              Razon de Anulacion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {cancelReasons.map(reason => (
              <button
                key={reason.id}
                onClick={() => handleCancelItem(reason.id)}
                data-testid={`cancel-reason-${reason.id}`}
                className="w-full p-3 rounded-lg border border-border bg-background hover:border-destructive/50 text-left transition-colors active:scale-[0.98]"
              >
                <span className="text-sm font-medium">{reason.name}</span>
                <span className={`block text-[10px] mt-0.5 ${reason.return_to_inventory ? 'text-table-free' : 'text-destructive'}`}>
                  {reason.return_to_inventory ? 'Retorna al inventario' : 'No retorna al inventario'}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quantity Keypad Dialog */}
      <Dialog open={qtyDialog.open} onOpenChange={(open) => {
        if (!open) {
          const val = parseFloat(qtyDialog.value);
          if (val > 0) setModDialog(p => ({ ...p, qty: val }));
          setQtyDialog({ open: false, value: '' });
        }
      }}>
        <DialogContent className="max-w-xs bg-card border-border" data-testid="qty-keypad-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Cantidad</DialogTitle></DialogHeader>
          <div className="text-center mb-4">
            <span className="font-oswald text-4xl font-bold text-primary">{qtyDialog.value || '0'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6,7,8,9].map(d => (
              <button key={d} onClick={() => handleQtyInput(String(d))}
                className="h-14 rounded-xl text-xl font-oswald font-bold bg-background border border-border hover:bg-primary hover:text-white transition-colors active:scale-95">
                {d}
              </button>
            ))}
            <button onClick={() => handleQtyInput('.')}
              className="h-14 rounded-xl text-xl font-oswald font-bold bg-background border border-border hover:bg-primary hover:text-white transition-colors active:scale-95">.</button>
            <button onClick={() => handleQtyInput('0')}
              className="h-14 rounded-xl text-xl font-oswald font-bold bg-background border border-border hover:bg-primary hover:text-white transition-colors active:scale-95">0</button>
            <button onClick={() => setQtyDialog(p => ({ ...p, value: p.value.slice(0, -1) }))}
              className="h-14 rounded-xl text-sm font-bold bg-destructive/20 border border-destructive/30 text-destructive hover:bg-destructive hover:text-white transition-colors active:scale-95">DEL</button>
          </div>
          <Button onClick={() => {
            const val = parseFloat(qtyDialog.value);
            if (val > 0) setModDialog(p => ({ ...p, qty: val }));
            setQtyDialog({ open: false, value: '' });
          }} className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold mt-2 active:scale-95">
            CONFIRMAR
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
