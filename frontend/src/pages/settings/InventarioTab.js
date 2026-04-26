import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import { categoriesAPI, productsAPI, warehousesAPI, inventorySettingsAPI } from '@/lib/api';
import { Tag, Package, Plus, Trash2, Pencil, Search, X, Sparkles, ListChecks, Receipt, Upload, TrendingUp } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { NumericInput } from '@/components/NumericKeypad';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import axios from 'axios';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import ImportProductsModal from '@/components/ImportProductsModal';
import PromotionsTab from './PromotionsTab';
import CombosTab from './CombosTab';
import MenuTilesSorter from '@/components/MenuTilesSorter';
import { useAuth } from '@/context/AuthContext';

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
  const { categories, products, printChannels, categoryChannels, inventorySettings, setInventorySettings, warehouses, areas, fetchAll } = useSettings();
  const { user: currentUser } = useAuth();
  const canManagePromotions = currentUser?.permissions?.manage_promotions || (currentUser?.role_level || 0) >= 100;
  const [confirmProps, showConfirm] = useConfirmDialog();
  const [inventarioSubTab, setInventarioSubTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('subtab') || 'categorias';
  });
  const [productSearch, setProductSearch] = useState('');
  const [modifierSearch, setModifierSearch] = useState('');
  const [modifierSearchFocused, setModifierSearchFocused] = useState(false);
  const [showInactiveProducts, setShowInactiveProducts] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [taxConfigs, setTaxConfigs] = useState([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  
  // Dialogs
  const [categoryDialog, setCategoryDialog] = useState({ open: false, name: '', color: '#FF6600', text_color: '#FFFFFF', editId: null, print_channel: '', tax_ids: [] });
  const [warehouseDialog, setWarehouseDialog] = useState({ open: false, name: '', location: '', editId: null });

  // Modifier state - uses modifier-groups API (config.py)
  const [modGroups, setModGroups] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [modDialog, setModDialog] = useState({ open: false, editId: null, name: '', prefix: '', selection_type: 'optional', min_selection: 0, max_selection: 0, options: [] });
  const [modProductSearchByIdx, setModProductSearchByIdx] = useState({});

  // Trending category config (Lo más pedido)
  const [trendingConfig, setTrendingConfig] = useState({
    enabled: false,
    name: 'Lo más pedido hoy',
    icon: '⭐',
    period: 'today',
    max_items: 10,
    excluded_categories: [],
  });
  const [trendingPreview, setTrendingPreview] = useState({ products: [] });
  const [trendingLoading, setTrendingLoading] = useState(false);

  const loadTrendingConfig = async () => {
    try {
      const res = await axios.get(`${API}/system/config`, { headers: hdrs() });
      const cfg = res.data?.trending_config || {};
      setTrendingConfig(prev => ({ ...prev, ...cfg }));
    } catch {}
  };

  const loadTrendingPreview = async () => {
    setTrendingLoading(true);
    try {
      const res = await axios.get(`${API}/products/trending`, { headers: hdrs() });
      setTrendingPreview(res.data || { products: [] });
    } catch {
      setTrendingPreview({ products: [] });
    } finally {
      setTrendingLoading(false);
    }
  };

  const saveTrendingConfig = async (next) => {
    setTrendingConfig(next);
    try {
      await axios.put(`${API}/system/config`, { trending_config: next }, { headers: hdrs() });
      await axios.post(`${API}/products/trending/invalidate`, {}, { headers: hdrs() }).catch(() => {});
      await loadTrendingPreview();
      notify.success('Configuración guardada');
    } catch (e) {
      notify.error('Error al guardar');
    }
  };

  const loadModifiers = async () => {
    try {
      const gRes = await axios.get(`${API}/modifier-groups`, { headers: hdrs() });
      setModGroups(gRes.data);
      // Load flat options: get all modifiers that have a group_id
      const mRes = await axios.get(`${API}/modifiers`, { headers: hdrs() });
      // Filter only actual options (those with non-empty group_id)
      const flatOptions = (mRes.data || []).filter(m => m.group_id && m.group_id.trim());
      setModifiers(flatOptions);
    } catch {}
  };

  useEffect(() => { if (inventarioSubTab === 'modificadores') loadModifiers(); }, [inventarioSubTab]);
  useEffect(() => {
    if (inventarioSubTab === 'trending') {
      loadTrendingConfig();
      loadTrendingPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventarioSubTab]);

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

  // Modifier handlers - uses modifier-groups + modifiers (config.py)
  const emptyOption = () => ({ name: '', mode: 'text', price: 0, product_id: null, price_source: 'custom', custom_price: null });
  const openNewModifier = () => setModDialog({ open: true, editId: null, name: '', prefix: '', selection_type: 'optional', min_selection: 0, max_selection: 0, options: [emptyOption()] });
  const openEditModifier = (g) => {
    const groupMods = modifiers.filter(m => m.group_id === g.id);
    setModDialog({
      open: true, editId: g.id, name: g.name,
      prefix: g.prefix || '',
      selection_type: g.selection_type || (g.min_selection > 0 ? 'required' : 'optional'),
      min_selection: g.min_selection || 0, max_selection: g.max_selection || 0,
      options: groupMods.length ? groupMods.map(m => ({
        id: m.id,
        name: m.name,
        mode: m.mode || 'text',
        price: m.price || 0,
        product_id: m.product_id || null,
        price_source: m.price_source || 'custom',
        custom_price: m.custom_price ?? null,
      })) : [emptyOption()]
    });
  };

  const saveModifier = async () => {
    if (!modDialog.name.trim()) { notify.error('Nombre requerido'); return; }
    const validOpts = modDialog.options.filter(o => o.name.trim() || o.product_id);
    if (validOpts.length === 0) { notify.error('Agrega al menos una opcion'); return; }
    try {
      let groupId = modDialog.editId;
      const groupPayload = {
        name: modDialog.name,
        prefix: modDialog.prefix,
        selection_type: modDialog.selection_type,
        min_selection: modDialog.min_selection,
        max_selection: modDialog.max_selection,
      };
      if (groupId) {
        await axios.put(`${API}/modifier-groups/${groupId}`, groupPayload, { headers: hdrs() });
        const oldMods = modifiers.filter(m => m.group_id === groupId);
        await Promise.all(oldMods.map(m => axios.delete(`${API}/modifiers/${m.id}`, { headers: hdrs() })));
      } else {
        const gRes = await axios.post(`${API}/modifier-groups`, groupPayload, { headers: hdrs() });
        groupId = gRes.data.id;
      }
      await Promise.all(validOpts.map(o => {
        const payload = {
          group_id: groupId,
          name: o.name || '',
          mode: o.mode || 'text',
          price: parseFloat(o.price) || 0,
        };
        if (o.mode === 'product') {
          payload.product_id = o.product_id;
          payload.price_source = o.price_source || 'custom';
          if (payload.price_source === 'custom') {
            payload.custom_price = parseFloat(o.custom_price) || 0;
            payload.price = payload.custom_price;
          } else if (payload.price_source === 'included') {
            payload.price = 0;
          } else {
            // price_a/b/c — resolved by backend; store hint
            const p = (products || []).find(x => x.id === o.product_id);
            if (p) {
              const src = payload.price_source;
              payload.price = parseFloat(src === 'price_a' ? (p.price_a ?? p.price) : p[src] ?? 0) || 0;
            }
          }
          if (!o.name && o.product_id) {
            const p = (products || []).find(x => x.id === o.product_id);
            payload.name = p?.name || 'Producto';
          }
        }
        return axios.post(`${API}/modifiers`, payload, { headers: hdrs() });
      }));
      notify.success(modDialog.editId ? 'Modificador actualizado' : 'Modificador creado');
      setModDialog(p => ({ ...p, open: false }));
      loadModifiers();
    } catch { notify.error('Error al guardar'); }
  };

  const deleteModifier = async (id) => {
    { const ok = await showConfirm({ title: 'Confirmar', description: 'Eliminar este modificador y todas sus opciones?' }); if (!ok) return; }
    try {
      await axios.delete(`${API}/modifier-groups/${id}`, { headers: hdrs() });
      notify.success('Modificador eliminado');
      loadModifiers();
    } catch { notify.error('Error al eliminar'); }
  };

  const addModOption = () => setModDialog(p => ({ ...p, options: [...p.options, emptyOption()] }));
  const removeModOption = (idx) => setModDialog(p => ({ ...p, options: p.options.filter((_, i) => i !== idx) }));
  const updateModOption = (idx, field, val) => setModDialog(p => ({ ...p, options: p.options.map((o, i) => i === idx ? { ...o, [field]: val } : o) }));

  // Category handlers
  const handleSaveCategory = async () => {
    if (!categoryDialog.name.trim()) return;
    try {
      const data = { name: categoryDialog.name, color: categoryDialog.color, text_color: categoryDialog.text_color };
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
      
      notify.success(categoryDialog.editId ? 'Categoría actualizada' : 'Categoría creada');
      setCategoryDialog({ open: false, name: '', color: '#FF6600', editId: null, print_channel: '', tax_ids: [] }); 
      fetchAll();
    } catch (e) { 
      notify.error('Error al guardar categoría'); 
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
          text_color: cat.text_color || '#FFFFFF',
          editId: cat.id, 
          print_channel: channel,
          tax_ids: taxRes.data?.tax_ids || []
        });
      } catch {
        setCategoryDialog({ 
          open: true, 
          name: cat.name, 
          color: cat.color || '#FF6600', 
          text_color: cat.text_color || '#FFFFFF',
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
      notify.success('Eliminada'); 
      fetchAll(); 
    } catch { notify.error('Error'); }
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
      notify.success(warehouseDialog.editId ? 'Almacén actualizado' : 'Almacén creado');
      setWarehouseDialog({ open: false, name: '', location: '', editId: null }); 
      fetchAll();
    } catch { notify.error('Error'); }
  };

  const handleSaveInventorySettings = async () => {
    try {
      await inventorySettingsAPI.update(inventorySettings);
      notify.success('Configuración guardada');
    } catch { notify.error('Error'); }
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    let list = products.filter(p => showInactiveProducts ? p.active === false : p.active !== false);
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        categories.find(c => c.id === p.category_id)?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, productSearch, categories, showInactiveProducts]);

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
        {canManagePromotions && (
          <SubTabButton active={inventarioSubTab === 'trending'} onClick={() => setInventarioSubTab('trending')} icon={TrendingUp} label="Lo Más Pedido" />
        )}
        {canManagePromotions && (
          <SubTabButton active={inventarioSubTab === 'promociones'} onClick={() => setInventarioSubTab('promociones')} icon={Sparkles} label="Promociones" />
        )}
        {canManagePromotions && (
          <SubTabButton active={inventarioSubTab === 'combos'} onClick={() => setInventarioSubTab('combos')} icon={Package} label="Combos" />
        )}
      </div>

      {/* PROMOCIONES */}
      {inventarioSubTab === 'promociones' && canManagePromotions && (
        <PromotionsTab categories={categories} products={products} areas={areas} />
      )}

      {/* COMBOS */}
      {inventarioSubTab === 'combos' && canManagePromotions && (
        <CombosTab products={products} categories={categories} />
      )}

      {/* TRENDING — Lo Más Pedido */}
      {inventarioSubTab === 'trending' && canManagePromotions && (
        <div className="space-y-4" data-testid="trending-config-panel">
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="text-3xl" aria-hidden>{trendingConfig.icon || '⭐'}</div>
                <div>
                  <h2 className="font-oswald text-lg font-bold">Categoría Automática — Lo Más Pedido</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aparece como primera categoría del menú con los productos más vendidos del período seleccionado. Se actualiza cada 5 minutos.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{trendingConfig.enabled ? 'Activa' : 'Desactivada'}</span>
                <Switch
                  checked={!!trendingConfig.enabled}
                  onCheckedChange={(v) => saveTrendingConfig({ ...trendingConfig, enabled: v })}
                  data-testid="trending-toggle"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={trendingConfig.name || ''}
                  onChange={(e) => setTrendingConfig({ ...trendingConfig, name: e.target.value })}
                  onBlur={() => saveTrendingConfig(trendingConfig)}
                  maxLength={40}
                  placeholder="Lo más pedido hoy"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  data-testid="trending-name-input"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Ícono</label>
                <div className="flex gap-1.5 flex-wrap" data-testid="trending-icon-picker">
                  {['⭐', '🔥', '📈', '💫', '🏆'].map(ic => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => saveTrendingConfig({ ...trendingConfig, icon: ic })}
                      data-testid={`trending-icon-${ic}`}
                      className={`text-2xl w-11 h-11 rounded-lg border-2 transition-all ${
                        trendingConfig.icon === ic
                          ? 'border-amber-500 bg-amber-500/10 scale-110'
                          : 'border-border hover:border-amber-500/50'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Período</label>
                <select
                  value={trendingConfig.period || 'today'}
                  onChange={(e) => saveTrendingConfig({ ...trendingConfig, period: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  data-testid="trending-period-select"
                >
                  <option value="today">Hoy (jornada actual)</option>
                  <option value="24h">Últimas 24 horas</option>
                  <option value="week">Esta semana (7 días)</option>
                  <option value="month">Este mes (30 días)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">
                  Cantidad máxima ({trendingConfig.max_items || 10})
                </label>
                <input
                  type="range"
                  min={3}
                  max={20}
                  value={trendingConfig.max_items || 10}
                  onChange={(e) => setTrendingConfig({ ...trendingConfig, max_items: Number(e.target.value) })}
                  onMouseUp={() => saveTrendingConfig(trendingConfig)}
                  onTouchEnd={() => saveTrendingConfig(trendingConfig)}
                  className="w-full accent-amber-500"
                  data-testid="trending-max-items"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>3</span><span>10</span><span>20</span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">
                Excluir categorías (opcional)
              </label>
              <div className="flex flex-wrap gap-1.5" data-testid="trending-excluded-categories">
                {categories.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No hay categorías</span>
                ) : categories.map(c => {
                  const excluded = (trendingConfig.excluded_categories || []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        const list = trendingConfig.excluded_categories || [];
                        const next = excluded ? list.filter(id => id !== c.id) : [...list, c.id];
                        saveTrendingConfig({ ...trendingConfig, excluded_categories: next });
                      }}
                      data-testid={`trending-exclude-${c.id}`}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        excluded
                          ? 'border-red-500 bg-red-500/15 text-red-400 line-through'
                          : 'border-border hover:border-amber-500/50'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-card/50 p-5" data-testid="trending-preview">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-oswald text-sm font-bold flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-500" />
                Vista Previa — Productos Trending
              </h3>
              <button
                type="button"
                onClick={loadTrendingPreview}
                className="text-xs px-3 py-1 rounded-lg border border-border hover:border-amber-500/50 transition-colors"
                data-testid="trending-refresh-btn"
              >
                Actualizar
              </button>
            </div>
            {trendingLoading ? (
              <div className="text-center py-6 text-xs text-muted-foreground">Cargando...</div>
            ) : !trendingConfig.enabled ? (
              <div className="text-center py-6 text-xs text-muted-foreground italic">
                Activa la categoría para ver los productos más vendidos.
              </div>
            ) : trendingPreview.products.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground italic" data-testid="trending-empty-preview">
                Sin ventas aún en este período. La categoría aparecerá vacía hasta que existan ventas.
              </div>
            ) : (
              <div className="space-y-1.5">
                {trendingPreview.products.map((p, i) => (
                  <div
                    key={p.id}
                    data-testid={`trending-preview-row-${i}`}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-background/60 border border-border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-oswald font-bold text-amber-500 w-5 text-center">{i + 1}</span>
                      <span className="text-sm truncate">{p.name}</span>
                    </div>
                    <span className="text-xs font-bold bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded-full shrink-0">
                      ×{Math.round(p.times_sold)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORIAS */}
      {inventarioSubTab === 'categorias' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Categorías del Menú</h2>
            <Button onClick={() => openCategoryDialog()} size="sm"
              className="bg-primary text-primary-foreground font-bold" data-testid="add-category-btn">
              <Plus size={14} className="mr-1" /> Nueva Categoría
            </Button>
          </div>
          <MenuTilesSorter
            categories={categories}
            products={products}
            onEditCategory={openCategoryDialog}
            onDeleteCategory={handleDeleteCategory}
          />
        </>
      )}

      {/* PRODUCTOS */}
      {inventarioSubTab === 'productos' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold flex items-center gap-2">
              <Package size={18} className="text-primary" />
              Productos
              <Badge variant="secondary" className="text-xs">{products.length}</Badge>
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setImportModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted border border-border text-auto-foreground text-sm font-bold hover:bg-muted/80 transition-all min-h-[40px]" data-testid="import-products-btn">
                <Upload size={14} /> Importar
              </button>
              <Link to="/product/new?from=products" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold min-h-[40px]" data-testid="add-product-btn">
                <Plus size={14} /> Nuevo Producto
              </Link>
            </div>
          </div>
          
          {/* Active/Inactive Tabs */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setShowInactiveProducts(false)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!showInactiveProducts ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              data-testid="products-active-tab">
              Activos ({products.filter(p => p.active !== false).length})
            </button>
            <button onClick={() => setShowInactiveProducts(true)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${showInactiveProducts ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'}`}
              data-testid="products-inactive-tab">
              Inactivos ({products.filter(p => p.active === false).length})
            </button>
          </div>

          {/* Search */}
          <div className={`relative mb-5 transition-all ${searchFocused ? 'scale-[1.01]' : ''}`}>
            <div className={`relative flex items-center bg-background border-2 rounded-2xl overflow-hidden transition-all ${searchFocused ? 'border-primary shadow-lg' : 'border-border'}`}>
              <div className={`pl-4 ${searchFocused ? 'text-primary' : 'text-muted-foreground'}`}><Search size={20} /></div>
              <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                placeholder="Buscar producto..." className="flex-1 bg-transparent px-3 py-3.5 text-sm outline-none" data-testid="product-search-input" />
              {!productSearch && !searchFocused && (
                <kbd className="hidden sm:inline-flex items-center justify-center mr-3 px-1.5 h-5 min-w-[20px] rounded border border-border bg-muted/60 text-[10px] font-mono text-muted-foreground pointer-events-none" title="Presiona / para enfocar">/</kbd>
              )}
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
                <div className="flex items-center gap-2 mb-2" style={{ backgroundColor: color + '60', padding: '6px 12px', borderRadius: '8px', borderLeft: `4px solid ${color}` }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-oswald font-bold text-sm text-foreground">{catName}</span>
                  <Badge variant="secondary" className="text-[11px]">{prods.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {prods.map(prod => (
                    <Link key={prod.id} to={`/product/${prod.id}?from=products`}
                      className="flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors" data-testid={`product-${prod.id}`}>
                      <div>
                        <span className="font-semibold text-sm">{prod.name}</span>
                        {prod.track_inventory && <Badge variant="outline" className="ml-2 text-[8px]">Stock</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-oswald font-bold text-primary">${(prod.price || prod.price_a || 0).toLocaleString()}</span>
                        <Pencil size={14} className="text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MODIFICADORES */}
      {inventarioSubTab === 'modificadores' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-oswald text-lg font-bold">Modificadores</h2>
              <p className="text-xs text-muted-foreground">Extras, opciones y variantes de productos</p>
            </div>
            <Button onClick={openNewModifier} className="gap-2" data-testid="add-modifier-btn">
              <Plus size={16} /> Nuevo Modificador
            </Button>
          </div>

          {/* Search */}
          {modGroups.length > 0 && (() => {
            const q = modifierSearch.trim().toLowerCase();
            const filtered = q
              ? modGroups.filter(g => {
                  if ((g.name || '').toLowerCase().includes(q)) return true;
                  const opts = modifiers.filter(m => m.group_id === g.id);
                  return opts.some(o => (o.name || '').toLowerCase().includes(q));
                })
              : modGroups;
            return (
              <>
                <div className={`relative transition-all ${modifierSearchFocused ? 'scale-[1.005]' : ''}`} data-testid="modifier-search-wrapper">
                  <div className={`relative flex items-center bg-background border-2 rounded-xl overflow-hidden transition-all ${modifierSearchFocused ? 'border-primary shadow-md' : 'border-border'}`}>
                    <div className={`pl-3 ${modifierSearchFocused ? 'text-primary' : 'text-muted-foreground'}`}><Search size={18} /></div>
                    <input
                      type="text"
                      value={modifierSearch}
                      onChange={(e) => setModifierSearch(e.target.value)}
                      onFocus={() => setModifierSearchFocused(true)}
                      onBlur={() => setModifierSearchFocused(false)}
                      placeholder="Buscar modificador..."
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none text-foreground placeholder:text-muted-foreground"
                      data-testid="modifier-search-input"
                      aria-label="Buscar modificador"
                    />
                    {!modifierSearch && !modifierSearchFocused && (
                      <kbd className="hidden sm:inline-flex items-center justify-center mr-2 px-1.5 h-5 min-w-[20px] rounded border border-border bg-muted/60 text-[10px] font-mono text-muted-foreground pointer-events-none" title="Presiona / para enfocar">/</kbd>
                    )}
                    {modifierSearch && (
                      <button
                        onClick={() => setModifierSearch('')}
                        className="p-1.5 mr-2 rounded-full hover:bg-muted text-muted-foreground"
                        data-testid="modifier-search-clear"
                        aria-label="Limpiar filtro"
                        type="button"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {modifierSearch && (
                    <div className="mt-1.5 px-1 text-[11px] text-muted-foreground" data-testid="modifier-search-results-count">
                      {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
                    </div>
                  )}
                </div>

                {modifierSearch && filtered.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border bg-muted/20" data-testid="modifier-search-empty">
                    <Search size={24} className="mx-auto mb-2 opacity-40" />
                    No se encontraron modificadores
                  </div>
                )}

                <div className="grid gap-3" data-testid="modifiers-list">
                  {filtered.map(g => {
                    const groupMods = modifiers.filter(m => m.group_id === g.id);
                    return (
                      <div key={g.id} className="bg-card border border-border rounded-xl p-4" data-testid={`modifier-card-${g.id}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-oswald font-bold text-sm">{g.name}</span>
                            {g.min_selection > 0 && <Badge variant="destructive" className="text-xs">Min: {g.min_selection}</Badge>}
                            {g.max_selection > 0 && <Badge variant="outline" className="text-xs">Max: {g.max_selection}</Badge>}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditModifier(g)} data-testid={`edit-modifier-${g.id}`}><Pencil size={14} /></Button>
                            <Button variant="ghost" size="icon" className="text-red-400" onClick={() => deleteModifier(g.id)} data-testid={`delete-modifier-${g.id}`}><Trash2 size={14} /></Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {groupMods.map(o => (
                            <span key={o.id} className="text-xs bg-muted px-2 py-1 rounded-full">
                              {o.name} {o.price > 0 ? `+RD$ ${o.price}` : ''}
                            </span>
                          ))}
                          {groupMods.length === 0 && <span className="text-xs text-muted-foreground">Sin opciones</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {modGroups.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="no-modifiers">
              <ListChecks size={40} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No hay modificadores configurados</p>
            </div>
          )}

          {/* Modifier Dialog */}
          <Dialog open={modDialog.open} onOpenChange={(o) => !o && setModDialog(p => ({ ...p, open: false }))}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="modifier-modal">
              <DialogHeader>
                <DialogTitle className="font-oswald">{modDialog.editId ? 'Editar Modificador' : 'Nuevo Modificador'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre del Grupo *</label>
                    <input value={modDialog.name} onChange={e => setModDialog(p => ({ ...p, name: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="Ej: Acompañantes, Extras, Sin"
                      data-testid="modifier-name-input" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Prefijo conversacional</label>
                    <input value={modDialog.prefix} onChange={e => setModDialog(p => ({ ...p, prefix: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="Ej: Acompañante, Agregar, Sin"
                      data-testid="modifier-prefix-input" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de selección</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'required', label: 'Obligatorio', desc: 'elegir exactamente N', min: 1, max: 1 },
                      { id: 'optional', label: 'Opcional', desc: '0 a N', min: 0, max: 3 },
                      { id: 'unlimited', label: 'Múltiple', desc: 'sin límite', min: 0, max: 99 },
                    ].map(t => (
                      <button key={t.id} type="button"
                        onClick={() => setModDialog(p => ({
                          ...p, selection_type: t.id,
                          min_selection: t.id === 'required' ? (p.min_selection || 1) : 0,
                          max_selection: t.id === 'unlimited' ? 99 : (t.id === 'required' ? 1 : (p.max_selection || 3))
                        }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${modDialog.selection_type === t.id ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                        data-testid={`mod-selection-type-${t.id}`}>
                        {t.label} <span className="opacity-60">· {t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Min</label>
                    <NumericInput value={modDialog.min_selection}
                      onChange={e => setModDialog(p => ({ ...p, min_selection: parseInt(e.target.value) || 0 }))}
                      label="Min Selecciones" allowDecimal={false}
                      className="w-16 bg-background border border-border rounded-lg px-2 py-1 text-sm text-center"
                      data-testid="modifier-min-input" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Max (0=sin límite)</label>
                    <NumericInput value={modDialog.max_selection}
                      onChange={e => setModDialog(p => ({ ...p, max_selection: parseInt(e.target.value) || 0 }))}
                      label="Max Selecciones" allowDecimal={false}
                      className="w-16 bg-background border border-border rounded-lg px-2 py-1 text-sm text-center"
                      data-testid="modifier-max-input" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">Opciones</label>
                    <Button variant="outline" size="sm" onClick={addModOption} className="gap-1 h-7 text-xs" data-testid="add-option-btn">
                      <Plus size={12} /> Opción
                    </Button>
                  </div>
                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {modDialog.options.map((opt, idx) => {
                      const linkedProduct = opt.product_id ? (products || []).find(pr => pr.id === opt.product_id) : null;
                      const searchQ = ((modProductSearchByIdx[idx] || '')).toLowerCase();
                      const productMatches = searchQ.length >= 2 && opt.mode === 'product' && !opt.product_id
                        ? (products || []).filter(pr => (pr.name || '').toLowerCase().includes(searchQ) && pr.active !== false).slice(0, 8)
                        : [];
                      return (
                        <div key={idx} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20" data-testid={`mod-option-${idx}`}>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1 rounded-lg bg-background p-0.5 border border-border">
                              <button type="button" onClick={() => updateModOption(idx, 'mode', 'text')}
                                className={`px-2 py-1 rounded text-[11px] font-bold ${opt.mode !== 'product' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}
                                data-testid={`mod-option-mode-text-${idx}`}>Texto</button>
                              <button type="button" onClick={() => updateModOption(idx, 'mode', 'product')}
                                className={`px-2 py-1 rounded text-[11px] font-bold ${opt.mode === 'product' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}
                                data-testid={`mod-option-mode-product-${idx}`}>Producto</button>
                            </div>
                            <input value={opt.name} onChange={e => updateModOption(idx, 'name', e.target.value)}
                              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm" placeholder={opt.mode === 'product' ? 'Nombre visible (se toma del producto si está vacío)' : 'Ej: Sin cebolla'}
                              data-testid={`option-name-${idx}`} />
                            {opt.mode !== 'product' && (
                              <NumericInput value={opt.price} onChange={e => updateModOption(idx, 'price', parseFloat(e.target.value) || 0)}
                                className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 text-sm" placeholder="Precio" label="Precio"
                                data-testid={`option-price-${idx}`} />
                            )}
                            {modDialog.options.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => removeModOption(idx)} data-testid={`remove-option-${idx}`}><X size={14} /></Button>
                            )}
                          </div>

                          {opt.mode === 'product' && (
                            <div className="space-y-2 pl-1">
                              {opt.product_id && linkedProduct ? (
                                <div className="flex items-center gap-2 flex-wrap p-2 rounded bg-primary/5 border border-primary/20" data-testid={`mod-option-linked-${idx}`}>
                                  <Package size={14} className="text-primary" />
                                  <span className="text-sm font-bold">{linkedProduct.name}</span>
                                  <span className="text-[11px] text-muted-foreground">
                                    A: RD${(linkedProduct.price_a ?? linkedProduct.price ?? 0)}
                                    {linkedProduct.price_b ? ` · B: RD$${linkedProduct.price_b}` : ''}
                                    {linkedProduct.price_c ? ` · C: RD$${linkedProduct.price_c}` : ''}
                                  </span>
                                  {linkedProduct.simple_inventory_enabled && (
                                    <Badge variant="outline" className="text-[10px]">Stock: {linkedProduct.simple_inventory_qty ?? 0}</Badge>
                                  )}
                                  <Button variant="ghost" size="sm" className="h-6 text-[11px] ml-auto" onClick={() => { updateModOption(idx, 'product_id', null); updateModOption(idx, 'price_source', 'custom'); }} data-testid={`mod-option-unlink-${idx}`}>Cambiar</Button>
                                </div>
                              ) : (
                                <div>
                                  <input value={modProductSearchByIdx[idx] || ''} onChange={e => setModProductSearchByIdx(p => ({ ...p, [idx]: e.target.value }))}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
                                    placeholder="Buscar producto del menú…"
                                    data-testid={`mod-option-search-${idx}`} />
                                  {productMatches.length > 0 && (
                                    <div className="mt-1 max-h-32 overflow-y-auto border border-border rounded-lg bg-background">
                                      {productMatches.map(pr => (
                                        <button key={pr.id} type="button"
                                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10 flex items-center justify-between"
                                          onClick={() => {
                                            updateModOption(idx, 'product_id', pr.id);
                                            if (!opt.name) updateModOption(idx, 'name', pr.name);
                                            setModProductSearchByIdx(p => ({ ...p, [idx]: '' }));
                                          }}
                                          data-testid={`mod-option-pick-${idx}-${pr.id}`}>
                                          <span>{pr.name}</span>
                                          <span className="text-[11px] text-muted-foreground">RD${pr.price_a ?? pr.price ?? 0}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {opt.product_id && (
                                <div>
                                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Fuente de precio</label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {[
                                      { id: 'price_a', label: `Precio A (RD$${linkedProduct?.price_a ?? linkedProduct?.price ?? 0})` },
                                      { id: 'price_b', label: `Precio B (RD$${linkedProduct?.price_b ?? 0})` },
                                      { id: 'price_c', label: `Precio C (RD$${linkedProduct?.price_c ?? 0})` },
                                      { id: 'included', label: 'Incluido (RD$0)' },
                                      { id: 'custom', label: 'Custom' },
                                    ].map(s => (
                                      <button key={s.id} type="button"
                                        onClick={() => updateModOption(idx, 'price_source', s.id)}
                                        className={`px-2 py-1 rounded text-[11px] font-bold border ${opt.price_source === s.id ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                                        data-testid={`mod-option-price-src-${idx}-${s.id}`}>
                                        {s.label}
                                      </button>
                                    ))}
                                  </div>
                                  {opt.price_source === 'custom' && (
                                    <NumericInput value={opt.custom_price ?? ''}
                                      onChange={e => updateModOption(idx, 'custom_price', parseFloat(e.target.value) || 0)}
                                      className="w-28 mt-2 bg-background border border-border rounded-lg px-2 py-1.5 text-sm" placeholder="Precio custom" label="Precio custom"
                                      data-testid={`mod-option-custom-price-${idx}`} />
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModDialog(p => ({ ...p, open: false }))}>Cancelar</Button>
                <Button onClick={saveModifier} data-testid="save-modifier-btn">
                  {modDialog.editId ? 'Actualizar' : 'Crear Modificador'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Category Dialog */}
      <Dialog open={categoryDialog.open} onOpenChange={(o) => !o && setCategoryDialog({ ...categoryDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto">
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
              <label className="text-sm font-medium mb-2 block">Color de Fondo</label>
              <div className="grid grid-cols-6 gap-2 mb-2">
                {[
                  '#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED', '#DB2777',
                  '#0891B2', '#CA8A04', '#4F46E5', '#E11D48', '#0D9488', '#EA580C',
                  '#1D4ED8', '#9333EA', '#16A34A', '#B91C1C', '#0284C7', '#C026D3',
                ].map(c => (
                  <button key={c} type="button" onClick={() => setCategoryDialog({ ...categoryDialog, color: c })}
                    className={`h-10 rounded-lg transition-all hover:scale-110 active:scale-95 ${categoryDialog.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={categoryDialog.color} onChange={e => setCategoryDialog({ ...categoryDialog, color: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer shrink-0" />
                <span className="text-xs text-muted-foreground">Personalizado</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Color de Texto</label>
              <div className="flex gap-2 mb-2">
                {['#FFFFFF', '#000000', '#1E293B', '#F8FAFC', '#FDE68A'].map(c => (
                  <button key={c} type="button" onClick={() => setCategoryDialog({ ...categoryDialog, text_color: c })}
                    className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 active:scale-95 ${categoryDialog.text_color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'border-border'}`}
                    style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={categoryDialog.text_color} onChange={e => setCategoryDialog({ ...categoryDialog, text_color: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Vista Previa</label>
              <div className="h-14 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg" style={{ backgroundColor: categoryDialog.color, color: categoryDialog.text_color }}>
                {categoryDialog.name || 'Categoría'}
              </div>
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
              <p className="text-xs text-muted-foreground mb-2">
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
                          <span className="text-xs text-muted-foreground ml-2">({tax.rate}%)</span>
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
    <ConfirmDialog {...confirmProps} />
    <ImportProductsModal open={importModalOpen} onClose={() => setImportModalOpen(false)} onComplete={fetchAll} />
    </div>
    );
}
