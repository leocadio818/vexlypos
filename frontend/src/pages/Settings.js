import { useState, useEffect } from 'react';
import { areasAPI, tablesAPI, reasonsAPI, categoriesAPI, productsAPI } from '@/lib/api';
import { Settings as SettingsIcon, MapPin, Table2, AlertTriangle, Plus, Trash2, Package, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

export default function Settings() {
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  // Dialogs
  const [areaDialog, setAreaDialog] = useState({ open: false, name: '', color: '#FF6600' });
  const [tableDialog, setTableDialog] = useState({ open: false, number: '', area_id: '', capacity: 4, shape: 'round' });
  const [reasonDialog, setReasonDialog] = useState({ open: false, name: '', return_to_inventory: true });
  const [productDialog, setProductDialog] = useState({ open: false, name: '', category_id: '', price: '', track_inventory: false });

  const fetchAll = async () => {
    try {
      const [aRes, tRes, rRes, cRes, pRes] = await Promise.all([
        areasAPI.list(), tablesAPI.list(), reasonsAPI.list(), categoriesAPI.list(), productsAPI.list()
      ]);
      setAreas(aRes.data);
      setTables(tRes.data);
      setReasons(rRes.data);
      setCategories(cRes.data);
      setProducts(pRes.data);
    } catch {}
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAddArea = async () => {
    if (!areaDialog.name.trim()) return;
    try {
      await areasAPI.create({ name: areaDialog.name, color: areaDialog.color });
      toast.success('Area creada');
      setAreaDialog({ open: false, name: '', color: '#FF6600' });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeleteArea = async (id) => {
    try { await areasAPI.delete(id); toast.success('Area eliminada'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  const handleAddTable = async () => {
    if (!tableDialog.number || !tableDialog.area_id) return;
    try {
      await tablesAPI.create({
        number: parseInt(tableDialog.number), area_id: tableDialog.area_id,
        capacity: parseInt(tableDialog.capacity) || 4, shape: tableDialog.shape,
        x: 20 + Math.random() * 60, y: 20 + Math.random() * 60
      });
      toast.success('Mesa creada');
      setTableDialog({ open: false, number: '', area_id: '', capacity: 4, shape: 'round' });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeleteTable = async (id) => {
    try { await tablesAPI.delete(id); toast.success('Mesa eliminada'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  const handleAddReason = async () => {
    if (!reasonDialog.name.trim()) return;
    try {
      await reasonsAPI.create({ name: reasonDialog.name, return_to_inventory: reasonDialog.return_to_inventory });
      toast.success('Razon creada');
      setReasonDialog({ open: false, name: '', return_to_inventory: true });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleToggleReasonInventory = async (reason) => {
    try {
      await reasonsAPI.update(reason.id, { return_to_inventory: !reason.return_to_inventory });
      toast.success('Actualizado');
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleAddProduct = async () => {
    if (!productDialog.name || !productDialog.category_id || !productDialog.price) return;
    try {
      await productsAPI.create({
        name: productDialog.name, category_id: productDialog.category_id,
        price: parseFloat(productDialog.price), track_inventory: productDialog.track_inventory
      });
      toast.success('Producto creado');
      setProductDialog({ open: false, name: '', category_id: '', price: '', track_inventory: false });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  return (
    <div className="h-full flex flex-col" data-testid="settings-page">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-card/50">
        <SettingsIcon size={22} className="text-primary" />
        <h1 className="font-oswald text-xl font-bold tracking-wide">CONFIGURACION</h1>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <Tabs defaultValue="areas" className="max-w-4xl mx-auto">
          <TabsList className="bg-card border border-border mb-4">
            <TabsTrigger value="areas" data-testid="tab-areas" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <MapPin size={14} className="mr-1" /> Areas
            </TabsTrigger>
            <TabsTrigger value="tables" data-testid="tab-tables" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <Table2 size={14} className="mr-1" /> Mesas
            </TabsTrigger>
            <TabsTrigger value="reasons" data-testid="tab-reasons" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <AlertTriangle size={14} className="mr-1" /> Anulaciones
            </TabsTrigger>
            <TabsTrigger value="products" data-testid="tab-products" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <Package size={14} className="mr-1" /> Productos
            </TabsTrigger>
          </TabsList>

          {/* AREAS */}
          <TabsContent value="areas">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Areas del Restaurante</h2>
              <Button onClick={() => setAreaDialog({ open: true, name: '', color: '#FF6600' })} size="sm" data-testid="add-area-btn"
                className="bg-primary text-primary-foreground font-bold active:scale-95">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {areas.map(area => (
                <div key={area.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`area-${area.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: area.color }} />
                    <span className="font-semibold">{area.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{tables.filter(t => t.area_id === area.id).length} mesas</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteArea(area.id)} className="text-destructive/60 hover:text-destructive h-8 w-8">
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TABLES */}
          <TabsContent value="tables">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Mesas</h2>
              <Button onClick={() => setTableDialog({ open: true, number: '', area_id: areas[0]?.id || '', capacity: 4, shape: 'round' })} size="sm"
                data-testid="add-table-btn" className="bg-primary text-primary-foreground font-bold active:scale-95">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {tables.map(table => (
                <div key={table.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`table-setting-${table.id}`}>
                  <div>
                    <span className="font-oswald font-bold text-primary">#{table.number}</span>
                    <span className="text-sm ml-2">{areas.find(a => a.id === table.area_id)?.name || '?'}</span>
                    <span className="text-xs text-muted-foreground ml-2">Cap: {table.capacity} | {table.shape}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteTable(table.id)} className="text-destructive/60 hover:text-destructive h-8 w-8">
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* CANCELLATION REASONS */}
          <TabsContent value="reasons">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Razones de Anulacion</h2>
              <Button onClick={() => setReasonDialog({ open: true, name: '', return_to_inventory: true })} size="sm"
                data-testid="add-reason-btn" className="bg-primary text-primary-foreground font-bold active:scale-95">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {reasons.map(reason => (
                <div key={reason.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`reason-${reason.id}`}>
                  <div>
                    <span className="font-semibold text-sm">{reason.name}</span>
                    <Badge variant={reason.return_to_inventory ? 'default' : 'destructive'} className="ml-2 text-[9px]">
                      {reason.return_to_inventory ? 'Retorna inventario' : 'No retorna'}
                    </Badge>
                  </div>
                  <Switch
                    checked={reason.return_to_inventory}
                    onCheckedChange={() => handleToggleReasonInventory(reason)}
                    data-testid={`reason-toggle-${reason.id}`}
                  />
                </div>
              ))}
            </div>
          </TabsContent>

          {/* PRODUCTS */}
          <TabsContent value="products">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Productos</h2>
              <Button onClick={() => setProductDialog({ open: true, name: '', category_id: categories[0]?.id || '', price: '', track_inventory: false })} size="sm"
                data-testid="add-product-btn" className="bg-primary text-primary-foreground font-bold active:scale-95">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-1">
              {categories.map(cat => (
                <div key={cat.id}>
                  <h3 className="font-oswald text-xs uppercase text-muted-foreground tracking-wider mt-4 mb-2 flex items-center gap-2">
                    <Tag size={12} style={{ color: cat.color }} /> {cat.name}
                  </h3>
                  {products.filter(p => p.category_id === cat.id).map(prod => (
                    <div key={prod.id} className="flex items-center justify-between p-2 rounded bg-card/50 border border-border/50 ml-4 mb-1" data-testid={`product-setting-${prod.id}`}>
                      <span className="text-sm">{prod.name}</span>
                      <span className="font-oswald text-sm text-primary font-bold">RD$ {prod.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Area Dialog */}
      <Dialog open={areaDialog.open} onOpenChange={(open) => !open && setAreaDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-area-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Area</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={areaDialog.name} onChange={e => setAreaDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre del area" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="area-name-input" />
            <div className="flex gap-2">
              {['#FF6600','#4CAF50','#2196F3','#9C27B0','#E91E63','#FFB300'].map(c => (
                <button key={c} onClick={() => setAreaDialog(p => ({ ...p, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 ${areaDialog.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <Button onClick={handleAddArea} data-testid="confirm-add-area"
              className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR AREA</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={tableDialog.open} onOpenChange={(open) => !open && setTableDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-table-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Mesa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={tableDialog.number} onChange={e => setTableDialog(p => ({ ...p, number: e.target.value }))}
              type="number" placeholder="Numero de mesa" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="table-number-input" />
            <select value={tableDialog.area_id} onChange={e => setTableDialog(p => ({ ...p, area_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="table-area-select">
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input value={tableDialog.capacity} onChange={e => setTableDialog(p => ({ ...p, capacity: e.target.value }))}
              type="number" placeholder="Capacidad" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="table-capacity-input" />
            <div className="flex gap-2">
              {['round', 'square', 'rectangle'].map(s => (
                <button key={s} onClick={() => setTableDialog(p => ({ ...p, shape: s }))}
                  className={`flex-1 p-2 rounded-lg text-xs font-medium border transition-all ${
                    tableDialog.shape === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'
                  }`}>{s === 'round' ? 'Redonda' : s === 'square' ? 'Cuadrada' : 'Rectangular'}</button>
              ))}
            </div>
            <Button onClick={handleAddTable} data-testid="confirm-add-table"
              className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR MESA</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Reason Dialog */}
      <Dialog open={reasonDialog.open} onOpenChange={(open) => !open && setReasonDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-reason-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Razon de Anulacion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={reasonDialog.name} onChange={e => setReasonDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre de la razon" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="reason-name-input" />
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
              <span className="text-sm">Retorna al inventario</span>
              <Switch checked={reasonDialog.return_to_inventory}
                onCheckedChange={(v) => setReasonDialog(p => ({ ...p, return_to_inventory: v }))}
                data-testid="reason-inventory-switch" />
            </div>
            <Button onClick={handleAddReason} data-testid="confirm-add-reason"
              className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR RAZON</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={productDialog.open} onOpenChange={(open) => !open && setProductDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-product-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nuevo Producto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={productDialog.name} onChange={e => setProductDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre del producto" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="product-name-input" />
            <select value={productDialog.category_id} onChange={e => setProductDialog(p => ({ ...p, category_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="product-category-select">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={productDialog.price} onChange={e => setProductDialog(p => ({ ...p, price: e.target.value }))}
              type="number" placeholder="Precio (RD$)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" data-testid="product-price-input" />
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
              <span className="text-sm">Controlar inventario</span>
              <Switch checked={productDialog.track_inventory}
                onCheckedChange={(v) => setProductDialog(p => ({ ...p, track_inventory: v }))}
                data-testid="product-inventory-switch" />
            </div>
            <Button onClick={handleAddProduct} data-testid="confirm-add-product"
              className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR PRODUCTO</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
