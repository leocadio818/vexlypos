import { useState, useEffect, useCallback } from 'react';
import { formatMoney } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Truck, ShoppingCart, Plus, Check, Package, Clock } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { NumericInput } from '@/components/NumericKeypad';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierDialog, setSupplierDialog] = useState({ open: false, name: '', contact_name: '', phone: '', email: '', address: '', rnc: '' });
  const [poDialog, setPoDialog] = useState({ open: false, supplier_id: '', warehouse_id: '', items: [{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }], notes: '' });
  const [receiveDialog, setReceiveDialog] = useState({ open: false, po: null, warehouse_id: '', items: [] });

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, oRes, wRes, pRes] = await Promise.all([
        axios.get(`${API}/suppliers`, { headers: headers() }),
        axios.get(`${API}/purchase-orders`, { headers: headers() }),
        axios.get(`${API}/warehouses`, { headers: headers() }),
        axios.get(`${API}/products`, { headers: headers() }),
      ]);
      setSuppliers(sRes.data);
      setOrders(oRes.data);
      setWarehouses(wRes.data);
      setProducts(pRes.data);
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAddSupplier = async () => {
    if (!supplierDialog.name) return;
    try {
      await axios.post(`${API}/suppliers`, supplierDialog, { headers: headers() });
      toast.success('Proveedor creado');
      setSupplierDialog({ open: false, name: '', contact_name: '', phone: '', email: '', address: '', rnc: '' });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleCreatePO = async () => {
    if (!poDialog.supplier_id || poDialog.items.length === 0) return;
    try {
      await axios.post(`${API}/purchase-orders`, {
        supplier_id: poDialog.supplier_id, warehouse_id: poDialog.warehouse_id || warehouses[0]?.id,
        items: poDialog.items.filter(i => i.product_id), notes: poDialog.notes
      }, { headers: headers() });
      toast.success('Orden de compra creada');
      setPoDialog({ open: false, supplier_id: '', warehouse_id: '', items: [{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }], notes: '' });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleReceive = async () => {
    if (!receiveDialog.po) return;
    try {
      await axios.post(`${API}/purchase-orders/${receiveDialog.po.id}/receive`, {
        warehouse_id: receiveDialog.warehouse_id || warehouses[0]?.id,
        items: receiveDialog.items.filter(i => i.received_quantity > 0)
      }, { headers: headers() });
      toast.success('Mercancia recibida');
      setReceiveDialog({ open: false, po: null, warehouse_id: '', items: [] });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const openReceive = (po) => {
    setReceiveDialog({
      open: true, po, warehouse_id: po.warehouse_id || warehouses[0]?.id,
      items: po.items.map(i => ({ product_id: i.product_id, received_quantity: i.quantity - (i.received_quantity || 0) }))
    });
  };

  const statusColors = { draft: 'bg-muted', sent: 'bg-blue-600', partial: 'bg-yellow-600', received: 'bg-green-600', cancelled: 'bg-destructive' };
  const statusLabels = { draft: 'Borrador', sent: 'Enviada', partial: 'Parcial', received: 'Recibida', cancelled: 'Cancelada' };

  return (
    <div className="h-full flex flex-col" data-testid="suppliers-page">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <Truck size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">PROVEEDORES & COMPRAS</h1>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <Tabs defaultValue="suppliers" className="max-w-5xl mx-auto">
          <TabsList className="bg-card border border-border mb-4">
            <TabsTrigger value="suppliers" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-suppliers">
              <Truck size={14} className="mr-1" /> Proveedores
            </TabsTrigger>
            <TabsTrigger value="orders" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-purchase-orders">
              <ShoppingCart size={14} className="mr-1" /> Ordenes de Compra
            </TabsTrigger>
          </TabsList>

          <TabsContent value="suppliers">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Proveedores</h2>
              <Button onClick={() => setSupplierDialog({ open: true, name: '', contact_name: '', phone: '', email: '', address: '', rnc: '' })}
                size="sm" className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-supplier-btn">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {suppliers.map(s => (
                <div key={s.id} className="p-3 rounded-lg bg-card border border-border" data-testid={`supplier-${s.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{s.name}</span>
                      {s.rnc && <Badge variant="secondary" className="ml-2 text-[9px]">RNC: {s.rnc}</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">{s.phone}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{s.contact_name} | {s.email} | {s.address}</div>
                </div>
              ))}
              {suppliers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay proveedores</p>}
            </div>
          </TabsContent>

          <TabsContent value="orders">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Ordenes de Compra</h2>
              <Button onClick={() => setPoDialog({ open: true, supplier_id: suppliers[0]?.id || '', warehouse_id: warehouses[0]?.id || '',
                items: [{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }], notes: '' })}
                size="sm" className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="create-po-btn">
                <Plus size={14} className="mr-1" /> Nueva Orden
              </Button>
            </div>
            <div className="space-y-2">
              {orders.map(po => (
                <div key={po.id} className="p-3 rounded-lg bg-card border border-border" data-testid={`po-${po.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{po.supplier_name}</span>
                      <Badge className={statusColors[po.status]}>{statusLabels[po.status]}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-oswald text-primary font-bold">{formatMoney(po.total)}</span>
                      {['draft', 'sent', 'partial'].includes(po.status) && (
                        <Button size="sm" variant="outline" onClick={() => openReceive(po)}
                          className="text-xs border-green-600/50 text-green-400" data-testid={`receive-po-${po.id}`}>
                          <Check size={12} className="mr-1" /> Recibir
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {po.items?.map((item, i) => (
                      <span key={i} className="inline-block mr-3">{item.quantity}x {item.product_name} ({item.received_quantity || 0} recibidos)</span>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-1 font-mono flex items-center gap-1">
                    <Clock size={10} /> {new Date(po.created_at).toLocaleString('es-DO')} | Por: {po.created_by}
                  </div>
                </div>
              ))}
              {orders.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay ordenes de compra</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Supplier Dialog */}
      <Dialog open={supplierDialog.open} onOpenChange={(o) => !o && setSupplierDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-supplier-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nuevo Proveedor</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {['name', 'contact_name', 'phone', 'email', 'address', 'rnc'].map(field => (
              <input key={field} value={supplierDialog[field]} onChange={e => setSupplierDialog(p => ({ ...p, [field]: e.target.value }))}
                placeholder={{ name: 'Nombre empresa', contact_name: 'Contacto', phone: 'Telefono', email: 'Email', address: 'Direccion', rnc: 'RNC' }[field]}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid={`supplier-${field}-input`} />
            ))}
            <Button onClick={handleAddSupplier} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-add-supplier">CREAR PROVEEDOR</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create PO Dialog */}
      <Dialog open={poDialog.open} onOpenChange={(o) => !o && setPoDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="create-po-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Orden de Compra</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select value={poDialog.supplier_id} onChange={e => setPoDialog(p => ({ ...p, supplier_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="po-supplier-select">
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={poDialog.warehouse_id} onChange={e => setPoDialog(p => ({ ...p, warehouse_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <ScrollArea className="max-h-48">
              {poDialog.items.map((item, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select value={item.product_id} onChange={e => {
                    const p = products.find(pr => pr.id === e.target.value);
                    const newItems = [...poDialog.items];
                    newItems[i] = { ...newItems[i], product_id: e.target.value, product_name: p?.name || '', unit_price: p?.price || 0 };
                    setPoDialog(prev => ({ ...prev, items: newItems }));
                  }} className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs">
                    <option value="">Producto...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <NumericInput label="Valor" value={item.quantity} onChange={e => {
                    const newItems = [...poDialog.items]; newItems[i].quantity = parseFloat(e.target.value) || 0;
                    setPoDialog(prev => ({ ...prev, items: newItems }));
                  }}  placeholder="Cant" className="w-16 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-oswald" />
                  <NumericInput label="Valor" value={item.unit_price} onChange={e => {
                    const newItems = [...poDialog.items]; newItems[i].unit_price = parseFloat(e.target.value) || 0;
                    setPoDialog(prev => ({ ...prev, items: newItems }));
                  }}  placeholder="RD$" className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-oswald" />
                </div>
              ))}
            </ScrollArea>
            <Button variant="outline" size="sm" onClick={() => setPoDialog(p => ({
              ...p, items: [...p.items, { product_id: '', product_name: '', quantity: 1, unit_price: 0 }]
            }))}><Plus size={14} className="mr-1" /> Item</Button>
            <input value={poDialog.notes} onChange={e => setPoDialog(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={handleCreatePO} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-create-po">CREAR ORDEN</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive PO Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(o) => !o && setReceiveDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="receive-po-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Recibir Mercancia</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select value={receiveDialog.warehouse_id} onChange={e => setReceiveDialog(p => ({ ...p, warehouse_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {receiveDialog.po?.items?.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                <div><span className="text-sm font-medium">{item.product_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">Pedido: {item.quantity} | Recibido: {item.received_quantity || 0}</span></div>
                <NumericInput label="Valor" value={receiveDialog.items[i]?.received_quantity || 0} onChange={e => {
                  const newItems = [...receiveDialog.items]; newItems[i].received_quantity = parseFloat(e.target.value) || 0;
                  setReceiveDialog(p => ({ ...p, items: newItems }));
                }}  className="w-20 bg-card border border-border rounded-lg px-2 py-1.5 text-xs font-oswald text-center" />
              </div>
            ))}
            <Button onClick={handleReceive} className="w-full h-11 bg-green-600 text-white font-oswald font-bold active:scale-95" data-testid="confirm-receive">
              <Package size={16} className="mr-2" /> RECIBIR MERCANCIA
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
