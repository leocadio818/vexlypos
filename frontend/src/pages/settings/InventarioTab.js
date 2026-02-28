import { useState, useMemo, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import { categoriesAPI, productsAPI, warehousesAPI, inventorySettingsAPI } from '@/lib/api';
import { Tag, Package, Plus, Trash2, Pencil, Search, X, Sparkles, ListChecks, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const SubTabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      active 
        ? 'bg-primary/20 text-primary border border-primary/30' 
        : 'bg-card/50 text-muted-foreground border border-border hover:border-primary/30 hover:text-primary'
    }`}
  >
    <Icon size={14} />
    {label}
  </button>
);

export default function InventarioTab() {
  const { categories, products, printChannels, categoryChannels, inventorySettings, setInventorySettings, warehouses, fetchAll } = useSettings();
  const [inventarioSubTab, setInventarioSubTab] = useState('categorias');
  const [productSearch, setProductSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [taxConfigs, setTaxConfigs] = useState([]);
  
  // Dialogs
  const [categoryDialog, setCategoryDialog] = useState({ open: false, name: '', color: '#FF6600', editId: null, print_channel: '', tax_ids: [] });
  const [warehouseDialog, setWarehouseDialog] = useState({ open: false, name: '', location: '', editId: null });

  // Modifier state
  const [modifiers, setModifiers] = useState([]);
  const [modDialog, setModDialog] = useState({ open: false, editId: null, name: '', required: false, max_selections: 0, options: [] });

  const loadModifiers = async () => {
    try {
      const res = await axios.get(`${API}/modifiers`, { headers: hdrs() });
      setModifiers(res.data);
    } catch {}
  };

  useEffect(() => { if (inventarioSubTab === 'modificadores') loadModifiers(); }, [inventarioSubTab]);

  // Load tax configs
  useEffect(() => {
    const loadTaxConfigs = async () => {
      try {
        const res = await axios.get(`${API}/tax-config`, { headers: hdrs() });
        setTaxConfigs(res.data.filter(t => t.is_active && t.code !== 'EXENTO'));
      } catch (e) {
        console.error('Error loading tax configs:', e);
      }
    };
    loadTaxConfigs();
  }, []);

  // Modifier handlers
  const openNewModifier = () => setModDialog({ open: true, editId: null, name: '', required: false, max_selections: 0, options: [{ id: '', name: '', price: 0 }] });
  const openEditModifier = (m) => setModDialog({ open: true, editId: m.id, name: m.name, required: m.required, max_selections: m.max_selections || 0, options: m.options?.length ? m.options : [{ id: '', name: '', price: 0 }] });

  const saveModifier = async () => {
    if (!modDialog.name.trim()) { toast.error('Nombre requerido'); return; }
    const validOpts = modDialog.options.filter(o => o.name.trim());
    if (validOpts.length === 0) { toast.error('Agrega al menos una opcion'); return; }
    const payload = { name: modDialog.name, required: modDialog.required, max_selections: modDialog.max_selections, options: validOpts };
    try {
      if (modDialog.editId) {
        await axios.put(`${API}/modifiers/${modDialog.editId}`, payload, { headers: hdrs() });
        toast.success('Modificador actualizado');
      } else {
        await axios.post(`${API}/modifiers`, payload, { headers: hdrs() });
        toast.success('Modificador creado');
      }
      setModDialog({ ...modDialog, open: false });
      loadModifiers();
    } catch { toast.error('Error al guardar'); }
  };

  const deleteModifier = async (id) => {
    if (!window.confirm('Eliminar este modificador?')) return;
    try {
      await axios.delete(`${API}/modifiers/${id}`, { headers: hdrs() });
      toast.success('Modificador eliminado');
      loadModifiers();
    } catch { toast.error('Error al eliminar'); }
  };

  const addModOption = () => setModDialog(p => ({ ...p, options: [...p.options, { id: '', name: '', price: 0 }] }));
  const removeModOption = (idx) => setModDialog(p => ({ ...p, options: p.options.filter((_, i) => i !== idx) }));
  const updateModOption = (idx, field, val) => setModDialog(p => ({ ...p, options: p.options.map((o, i) => i === idx ? { ...o, [field]: val } : o) }));

  // Category handlers
  const handleSaveCategory = async () => {
    if (!categoryDialog.name.trim()) return;
    try {
      const data = { name: categoryDialog.name, color: categoryDialog.color };
      let categoryId = categoryDialog.editId;
      
      if (categoryDialog.editId) {
        await categoriesAPI.update(categoryDialog.editId, data);
      } else {
        const res = await categoriesAPI.create(data);
        categoryId = res.data?.id;
      }
      
      // Save channel assignment if specified
      if (categoryDialog.print_channel && categoryId) {
        await axios.post(`${API}/category-channels`, {
          category_id: categoryId,
          channel_code: categoryDialog.print_channel
        }, { headers: hdrs() });
      }
      
      // Save tax configuration for category
      if (categoryId) {
        await axios.post(`${API}/taxes/category/config`, {
          category_id: categoryId,
          tax_ids: categoryDialog.tax_ids || []
        }, { headers: hdrs() });
      }
      
      toast.success(categoryDialog.editId ? 'Categoría actualizada' : 'Categoría creada');
      setCategoryDialog({ open: false, name: '', color: '#FF6600', editId: null, print_channel: '', tax_ids: [] }); 
      fetchAll();
    } catch (e) { 
      toast.error('Error al guardar categoría'); 
      console.error(e);
    }
  };

  // Load category tax config when editing
  const openCategoryDialog = async (cat = null) => {
    if (cat) {
      try {
        const taxRes = await axios.get(`${API}/taxes/category/${cat.id}/config`, { headers: hdrs() });
        const channel = categoryChannels.find(cc => cc.category_id === cat.id)?.channel_code || '';
        setCategoryDialog({ 
          open: true, 
          name: cat.name, 
          color: cat.color || '#FF6600', 
          editId: cat.id, 
          print_channel: channel,
          tax_ids: taxRes.data?.tax_ids || []
        });
      } catch {
        setCategoryDialog({ 
          open: true, 
          name: cat.name, 
          color: cat.color || '#FF6600', 
          editId: cat.id, 
          print_channel: categoryChannels.find(cc => cc.category_id === cat.id)?.channel_code || '',
          tax_ids: []
        });
      }
    } else {
      // New category - default all taxes enabled
      const defaultTaxIds = taxConfigs.map(t => t.id);
      setCategoryDialog({ open: true, name: '', color: '#FF6600', editId: null, print_channel: '', tax_ids: defaultTaxIds });
    }
  };

  const toggleCategoryTax = (taxId) => {
    setCategoryDialog(prev => ({
      ...prev,
      tax_ids: prev.tax_ids.includes(taxId) 
        ? prev.tax_ids.filter(id => id !== taxId)
        : [...prev.tax_ids, taxId]
    }));
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('¿Eliminar categoría?')) return;
    try { 
      await categoriesAPI.delete(id); 
      toast.success('Eliminada'); 
      fetchAll(); 
    } catch { toast.error('Error'); }
  };

  // Warehouse handlers
  const handleSaveWarehouse = async () => {
    if (!warehouseDialog.name.trim()) return;
    try {
      const data = { name: warehouseDialog.name, location: warehouseDialog.location };
      if (warehouseDialog.editId) {
        await warehousesAPI.update(warehouseDialog.editId, data);
      } else {
        await warehousesAPI.create(data);
      }
      toast.success(warehouseDialog.editId ? 'Almacén actualizado' : 'Almacén creado');
      setWarehouseDialog({ open: false, name: '', location: '', editId: null }); 
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleSaveInventorySettings = async () => {
    try {
      await inventorySettingsAPI.update(inventorySettings);
      toast.success('Configuración guardada');
    } catch { toast.error('Error'); }
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    return products.filter(p => 
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      categories.find(c => c.id === p.category_id)?.name.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch, categories]);

  // Group products by category
  const productsByCategory = useMemo(() => {
    const grouped = {};
    filteredProducts.forEach(p => {
      const cat = categories.find(c => c.id === p.category_id);
      const catName = cat?.name || 'Sin categoría';
      if (!grouped[catName]) grouped[catName] = { color: cat?.color || '#666', products: [] };
      grouped[catName].products.push(p);
    });
    return grouped;
  }, [filteredProducts, categories]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SubTabButton active={inventarioSubTab === 'categorias'} onClick={() => setInventarioSubTab('categorias')} icon={Tag} label="Categorías" />
        <SubTabButton active={inventarioSubTab === 'productos'} onClick={() => setInventarioSubTab('productos')} icon={Package} label="Productos" />
        <SubTabButton active={inventarioSubTab === 'modificadores'} onClick={() => setInventarioSubTab('modificadores')} icon={ListChecks} label="Modificadores" />
      </div>

      {/* CATEGORIAS */}
      {inventarioSubTab === 'categorias' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Categorías de Productos</h2>
            <Button onClick={() => openCategoryDialog()} size="sm"
              className="bg-primary text-primary-foreground font-bold" data-testid="add-category-btn">
              <Plus size={14} className="mr-1" /> Nueva Categoría
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-4 rounded-xl border-2"
                style={{ borderColor: cat.color + '50', backgroundColor: cat.color + '10' }} data-testid={`category-${cat.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.color }}>
                    <Tag size={18} className="text-white" />
                  </div>
                  <div>
                    <span className="font-oswald font-bold">{cat.name}</span>
                    <p className="text-[10px] text-muted-foreground">{products.filter(p => p.category_id === cat.id).length} productos</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => openCategoryDialog(cat)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteCategory(cat.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* PRODUCTOS */}
      {inventarioSubTab === 'productos' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold flex items-center gap-2">
              <Package size={18} className="text-primary" />
              Productos
              <Badge variant="secondary" className="text-[10px]">{products.length}</Badge>
            </h2>
            <a href="/product/new?from=products" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold" data-testid="add-product-btn">
              <Plus size={14} /> Nuevo Producto
            </a>
          </div>
          
          {/* Search */}
          <div className={`relative mb-5 transition-all ${searchFocused ? 'scale-[1.01]' : ''}`}>
            <div className={`relative flex items-center bg-background border-2 rounded-2xl overflow-hidden transition-all ${searchFocused ? 'border-primary shadow-lg' : 'border-border'}`}>
              <div className={`pl-4 ${searchFocused ? 'text-primary' : 'text-muted-foreground'}`}><Search size={20} /></div>
              <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                placeholder="Buscar producto..." className="flex-1 bg-transparent px-3 py-3.5 text-sm outline-none" data-testid="product-search-input" />
              {productSearch && (
                <button onClick={() => setProductSearch('')} className="p-2 mr-2 rounded-full hover:bg-muted"><X size={16} /></button>
              )}
            </div>
            {productSearch && (
              <div className="mt-2 px-1 text-xs text-muted-foreground">{filteredProducts.length} productos encontrados</div>
            )}
          </div>

          {/* Products grouped by category */}
          <div className="space-y-4">
            {Object.entries(productsByCategory).map(([catName, { color, products: prods }]) => (
              <div key={catName}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-oswald font-bold text-sm">{catName}</span>
                  <Badge variant="secondary" className="text-[9px]">{prods.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {prods.map(prod => (
                    <a key={prod.id} href={`/product/${prod.id}?from=products`}
                      className="flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors" data-testid={`product-${prod.id}`}>
                      <div>
                        <span className="font-semibold text-sm">{prod.name}</span>
                        {prod.track_inventory && <Badge variant="outline" className="ml-2 text-[8px]">Stock</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-oswald font-bold text-primary">${(prod.price || prod.price_a || 0).toLocaleString()}</span>
                        <Pencil size={14} className="text-muted-foreground" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MODIFICADORES */}
      {inventarioSubTab === 'modificadores' && (
        <div className="text-center py-8">
          <ListChecks size={40} className="mx-auto mb-3 text-primary opacity-50" />
          <h2 className="font-oswald text-lg mb-2">Modificadores</h2>
          <p className="text-sm text-muted-foreground mb-4">Gestiona extras, opciones y variantes de productos</p>
          <a href="/modifiers" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold">
            <ListChecks size={16} /> Abrir Modificadores
          </a>
        </div>
      )}

      {/* Category Dialog */}
      <Dialog open={categoryDialog.open} onOpenChange={(o) => !o && setCategoryDialog({ ...categoryDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald">{categoryDialog.editId ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={categoryDialog.name} onChange={e => setCategoryDialog({ ...categoryDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Bebidas" />
            </div>
            <div>
              <label className="text-sm font-medium">Color</label>
              <input type="color" value={categoryDialog.color} onChange={e => setCategoryDialog({ ...categoryDialog, color: e.target.value })}
                className="w-full h-10 mt-1 rounded-lg border border-border cursor-pointer" />
            </div>
            <div>
              <label className="text-sm font-medium">Canal de Impresión</label>
              <select value={categoryDialog.print_channel} onChange={e => setCategoryDialog({ ...categoryDialog, print_channel: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                <option value="">Sin asignar</option>
                {printChannels.map(ch => <option key={ch.id} value={ch.code || ch.id}>{ch.name}</option>)}
              </select>
            </div>
            
            {/* Tax Configuration */}
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Receipt size={14} className="text-primary" />
                Impuestos Aplicables
              </label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Los productos de esta categoría heredarán estos impuestos (si no tienen configuración propia)
              </p>
              <div className="space-y-2 bg-background rounded-lg p-3 border border-border">
                {taxConfigs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay impuestos configurados</p>
                ) : (
                  taxConfigs.map(tax => (
                    <div 
                      key={tax.id} 
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleCategoryTax(tax.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={categoryDialog.tax_ids?.includes(tax.id)}
                          onCheckedChange={() => toggleCategoryTax(tax.id)}
                        />
                        <div>
                          <span className="text-sm font-medium">{tax.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">({tax.rate}%)</span>
                        </div>
                      </div>
                      {tax.is_dine_in_only && (
                        <Badge variant="outline" className="text-[8px]">Solo local</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCategoryDialog({ ...categoryDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveCategory} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
