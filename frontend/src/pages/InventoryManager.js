import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  ingredientsAPI, stockAPI, stockMovementsAPI, warehousesAPI, 
  suppliersAPI, recipesAPI, purchaseOrdersAPI, productsAPI, stockAlertsAPI, productionAPI 
} from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { toast } from 'sonner';
import { 
  Package, Warehouse, Truck, FileText, ArrowLeftRight, AlertTriangle,
  Plus, Pencil, Trash2, Search, X, Check, ChevronRight, ChevronDown,
  ArrowLeft, Save, RefreshCw, Filter, Download, Upload, Mail, Bell, Send,
  Factory, Play, History
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';

const INGREDIENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'carnes', label: 'Carnes' },
  { value: 'lacteos', label: 'Lácteos' },
  { value: 'vegetales', label: 'Vegetales' },
  { value: 'frutas', label: 'Frutas' },
  { value: 'bebidas', label: 'Bebidas' },
  { value: 'licores', label: 'Licores' },
  { value: 'condimentos', label: 'Condimentos' },
  { value: 'empaque', label: 'Empaque' },
  { value: 'limpieza', label: 'Limpieza' },
];

const UNITS = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo (kg)' },
  { value: 'g', label: 'Gramo (g)' },
  { value: 'lb', label: 'Libra (lb)' },
  { value: 'oz', label: 'Onza (oz)' },
  { value: 'lt', label: 'Litro (lt)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'gal', label: 'Galón' },
  { value: 'botella', label: 'Botella' },
  { value: 'caja', label: 'Caja' },
  { value: 'paquete', label: 'Paquete' },
];

const PO_STATUS = {
  draft: { label: 'Borrador', color: 'bg-gray-500' },
  pending: { label: 'Pendiente', color: 'bg-yellow-500' },
  partial: { label: 'Parcial', color: 'bg-blue-500' },
  received: { label: 'Recibida', color: 'bg-green-500' },
  cancelled: { label: 'Cancelada', color: 'bg-red-500' },
};

export default function InventoryManager() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'ingredients';
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [ingredients, setIngredients] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [stock, setStock] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [products, setProducts] = useState([]);
  
  // Alert states
  const [alertConfig, setAlertConfig] = useState({ enabled: false, emails: [], frequency: 'daily' });
  const [alertDialog, setAlertDialog] = useState({ open: false });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState({ active: false, next_run: null });
  
  // Search/filter states
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ingredientCategory, setIngredientCategory] = useState('');
  const [poStatusFilter, setPOStatusFilter] = useState('');
  
  // Dialog states
  const [ingredientDialog, setIngredientDialog] = useState({ open: false, data: null });
  const [warehouseDialog, setWarehouseDialog] = useState({ open: false, data: null });
  const [supplierDialog, setSupplierDialog] = useState({ open: false, data: null });
  const [recipeDialog, setRecipeDialog] = useState({ open: false, data: null });
  const [poDialog, setPODialog] = useState({ open: false, data: null });
  const [receiveDialog, setReceiveDialog] = useState({ open: false, po: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, data: null });
  const [adjustDialog, setAdjustDialog] = useState({ open: false, data: null });
  const [productionDialog, setProductionDialog] = useState({ open: false, data: null });
  const [productionHistory, setProductionHistory] = useState([]);
  const [producingItem, setProducingItem] = useState(false);

  // Fetch all data
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ingRes, whRes, supRes, recRes, poRes, stockRes, movRes, prodRes, alertRes, schedRes] = await Promise.all([
        ingredientsAPI.list(),
        warehousesAPI.list(),
        suppliersAPI.list(),
        recipesAPI.list(),
        purchaseOrdersAPI.list(),
        stockAPI.list(),
        stockMovementsAPI.list({ limit: 100 }),
        productsAPI.list(),
        stockAlertsAPI.getConfig(),
        stockAlertsAPI.getSchedulerStatus(),
      ]);
      setIngredients(ingRes.data);
      setWarehouses(whRes.data);
      setSuppliers(supRes.data);
      setRecipes(recRes.data);
      setPurchaseOrders(poRes.data);
      setStock(stockRes.data);
      setStockMovements(movRes.data);
      setProducts(prodRes.data);
      setAlertConfig(alertRes.data || { enabled: false, emails: [], frequency: 'daily', schedule_time: '08:00' });
      setSchedulerStatus(schedRes.data || { active: false, next_run: null });
    } catch (e) {
      toast.error('Error al cargar datos');
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // ─── INGREDIENTS HANDLERS ───
  const handleSaveIngredient = async () => {
    const d = ingredientDialog.data;
    if (!d?.name?.trim()) { toast.error('Nombre requerido'); return; }
    try {
      if (d.id) {
        await ingredientsAPI.update(d.id, d);
        toast.success('Ingrediente actualizado');
      } else {
        await ingredientsAPI.create(d);
        toast.success('Ingrediente creado');
      }
      setIngredientDialog({ open: false, data: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteIngredient = async (id) => {
    if (!window.confirm('¿Eliminar ingrediente?')) return;
    try {
      await ingredientsAPI.delete(id);
      toast.success('Ingrediente eliminado');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── WAREHOUSE HANDLERS ───
  const handleSaveWarehouse = async () => {
    const d = warehouseDialog.data;
    if (!d?.name?.trim()) { toast.error('Nombre requerido'); return; }
    try {
      if (d.id) {
        await warehousesAPI.update(d.id, d);
        toast.success('Almacén actualizado');
      } else {
        await warehousesAPI.create(d);
        toast.success('Almacén creado');
      }
      setWarehouseDialog({ open: false, data: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteWarehouse = async (id) => {
    if (!window.confirm('¿Eliminar almacén?')) return;
    try {
      await warehousesAPI.delete(id);
      toast.success('Almacén eliminado');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── SUPPLIER HANDLERS ───
  const handleSaveSupplier = async () => {
    const d = supplierDialog.data;
    if (!d?.name?.trim()) { toast.error('Nombre requerido'); return; }
    try {
      if (d.id) {
        await suppliersAPI.update(d.id, d);
        toast.success('Proveedor actualizado');
      } else {
        await suppliersAPI.create(d);
        toast.success('Proveedor creado');
      }
      setSupplierDialog({ open: false, data: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('¿Eliminar proveedor?')) return;
    try {
      await suppliersAPI.delete(id);
      toast.success('Proveedor eliminado');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── RECIPE HANDLERS ───
  const handleSaveRecipe = async () => {
    const d = recipeDialog.data;
    if (!d?.product_id) { toast.error('Producto requerido'); return; }
    if (!d?.ingredients?.length) { toast.error('Agrega ingredientes'); return; }
    try {
      await recipesAPI.create({
        product_id: d.product_id,
        product_name: d.product_name,
        ingredients: d.ingredients,
        yield_quantity: d.yield_quantity || 1,
        notes: d.notes || '',
      });
      toast.success('Receta guardada');
      setRecipeDialog({ open: false, data: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (!window.confirm('¿Eliminar receta?')) return;
    try {
      await recipesAPI.delete(id);
      toast.success('Receta eliminada');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── PURCHASE ORDER HANDLERS ───
  const handleSavePO = async () => {
    const d = poDialog.data;
    if (!d?.supplier_id) { toast.error('Proveedor requerido'); return; }
    if (!d?.warehouse_id) { toast.error('Almacén requerido'); return; }
    if (!d?.items?.length) { toast.error('Agrega items'); return; }
    try {
      if (d.id) {
        await purchaseOrdersAPI.update(d.id, d);
        toast.success('Orden actualizada');
      } else {
        await purchaseOrdersAPI.create(d);
        toast.success('Orden creada');
      }
      setPODialog({ open: false, data: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleReceivePO = async () => {
    const po = receiveDialog.po;
    const items = receiveDialog.items || [];
    if (!items.some(i => i.received_quantity > 0)) {
      toast.error('Ingresa cantidades recibidas');
      return;
    }
    try {
      await purchaseOrdersAPI.receive(po.id, {
        warehouse_id: po.warehouse_id,
        items: items.filter(i => i.received_quantity > 0).map(i => ({
          ingredient_id: i.ingredient_id,
          received_quantity: parseFloat(i.received_quantity) || 0,
          actual_unit_price: parseFloat(i.actual_unit_price) || 0,
        })),
        notes: receiveDialog.notes || '',
      });
      toast.success('Mercancía recibida');
      setReceiveDialog({ open: false, po: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleUpdatePOStatus = async (poId, status) => {
    try {
      await purchaseOrdersAPI.updateStatus(poId, status);
      toast.success('Estado actualizado');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeletePO = async (id) => {
    if (!window.confirm('¿Eliminar orden?')) return;
    try {
      await purchaseOrdersAPI.delete(id);
      toast.success('Orden eliminada');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── STOCK HANDLERS ───
  const handleTransfer = async () => {
    const d = transferDialog.data;
    if (!d?.ingredient_id || !d?.from_warehouse_id || !d?.to_warehouse_id || !d?.quantity) {
      toast.error('Completa todos los campos');
      return;
    }
    if (d.from_warehouse_id === d.to_warehouse_id) {
      toast.error('Los almacenes deben ser diferentes');
      return;
    }
    try {
      await stockAPI.transfer(d);
      toast.success('Transferencia realizada');
      setTransferDialog({ open: false, data: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleAdjust = async () => {
    const d = adjustDialog.data;
    if (!d?.ingredient_id || !d?.warehouse_id || d?.quantity === undefined) {
      toast.error('Completa todos los campos');
      return;
    }
    try {
      await stockAPI.adjust(d);
      toast.success('Ajuste realizado');
      setAdjustDialog({ open: false, data: null });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── ALERT HANDLERS ───
  const handleCheckAlerts = async () => {
    try {
      const res = await stockAlertsAPI.check(false);
      setLowStockItems(res.data.items || []);
      if (res.data.items?.length === 0) {
        toast.success('No hay items con stock bajo');
      }
    } catch (e) {
      toast.error('Error al verificar alertas');
    }
  };

  const handleSendAlert = async () => {
    if (!alertConfig.emails?.length) {
      toast.error('Configura al menos un email');
      return;
    }
    setSendingAlert(true);
    try {
      const res = await stockAlertsAPI.check(true);
      if (res.data.email_sent) {
        toast.success(`Alerta enviada a ${res.data.sent_to?.length} destinatario(s)`);
      } else {
        toast.error(res.data.reason || 'No se pudo enviar');
      }
    } catch (e) {
      toast.error('Error al enviar alerta');
    }
    setSendingAlert(false);
  };

  const handleSaveAlertConfig = async () => {
    try {
      await stockAlertsAPI.updateConfig(alertConfig);
      toast.success('Configuración guardada');
      setAlertDialog({ open: false });
    } catch (e) {
      toast.error('Error al guardar');
    }
  };

  const addAlertEmail = () => {
    const email = alertDialog.newEmail?.trim();
    if (!email || !email.includes('@')) {
      toast.error('Email inválido');
      return;
    }
    if (alertConfig.emails?.includes(email)) {
      toast.error('Email ya existe');
      return;
    }
    setAlertConfig(prev => ({
      ...prev,
      emails: [...(prev.emails || []), email]
    }));
    setAlertDialog(prev => ({ ...prev, newEmail: '' }));
  };

  const removeAlertEmail = (email) => {
    setAlertConfig(prev => ({
      ...prev,
      emails: prev.emails?.filter(e => e !== email) || []
    }));
  };

  // ─── PRODUCTION HANDLERS ───
  const handleOpenProduction = async (ingredient) => {
    // Get production check
    const defaultWarehouse = warehouses[0]?.id || '';
    setProductionDialog({ 
      open: true, 
      data: { 
        ingredient_id: ingredient.id,
        ingredient_name: ingredient.name,
        unit: ingredient.unit,
        warehouse_id: defaultWarehouse,
        quantity: 1,
        notes: ''
      },
      checking: false,
      checkResult: null
    });
  };

  const handleCheckProduction = async () => {
    const d = productionDialog.data;
    if (!d?.warehouse_id || !d?.quantity) {
      toast.error('Completa todos los campos');
      return;
    }
    setProductionDialog(p => ({ ...p, checking: true }));
    try {
      const res = await productionAPI.checkProduction({
        ingredient_id: d.ingredient_id,
        warehouse_id: d.warehouse_id,
        quantity: parseFloat(d.quantity) || 1
      });
      setProductionDialog(p => ({ ...p, checking: false, checkResult: res.data }));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al verificar');
      setProductionDialog(p => ({ ...p, checking: false }));
    }
  };

  const handleProduce = async () => {
    const d = productionDialog.data;
    const check = productionDialog.checkResult;
    if (!check?.can_produce) {
      toast.error('Verifica la disponibilidad primero');
      return;
    }
    setProducingItem(true);
    try {
      const res = await productionAPI.produce({
        ingredient_id: d.ingredient_id,
        warehouse_id: d.warehouse_id,
        quantity: parseFloat(d.quantity) || 1,
        notes: d.notes || ''
      });
      if (res.data.ok) {
        toast.success(`Producido: ${res.data.quantity_produced} ${res.data.unit} de ${res.data.ingredient_name}`);
        setProductionDialog({ open: false, data: null });
        fetchAll();
      } else {
        toast.error(res.data.error || 'Error en producción');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al producir');
    }
    setProducingItem(false);
  };

  const loadProductionHistory = async () => {
    try {
      const res = await productionAPI.getHistory({ limit: 50 });
      setProductionHistory(res.data);
    } catch (e) {
      console.error('Error loading production history', e);
    }
  };

  // Filter ingredients
  const filteredIngredients = ingredients.filter(ing => {
    const matchSearch = !ingredientSearch || 
      ing.name.toLowerCase().includes(ingredientSearch.toLowerCase());
    const matchCategory = !ingredientCategory || ing.category === ingredientCategory;
    return matchSearch && matchCategory;
  });

  // Filter POs
  const filteredPOs = purchaseOrders.filter(po => {
    return !poStatusFilter || po.status === poStatusFilter;
  });

  // Get stock for ingredient
  const getIngredientStock = (ingredientId) => {
    return stock.filter(s => s.ingredient_id === ingredientId);
  };

  // Get total stock for ingredient
  const getTotalStock = (ingredientId) => {
    return stock.filter(s => s.ingredient_id === ingredientId)
      .reduce((sum, s) => sum + (s.current_stock || 0), 0);
  };

  // Calculate recipe cost
  const calculateRecipeCost = (recipe) => {
    return recipe.ingredients?.reduce((sum, ing) => {
      const ingredient = ingredients.find(i => i.id === ing.ingredient_id);
      const cost = (ingredient?.avg_cost || 0) * (ing.quantity || 0);
      const waste = cost * ((ing.waste_percentage || 0) / 100);
      return sum + cost + waste;
    }, 0) || 0;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="inventory-manager">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <a href="/settings?tab=inventario" className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </a>
          <Package size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">INVENTARIO MAESTRO</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchAll}>
          <RefreshCw size={18} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 py-2 border-b border-border bg-background/50">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="ingredients" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <Package size={14} className="mr-1" /> Insumos
            </TabsTrigger>
            <TabsTrigger value="warehouses" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <Warehouse size={14} className="mr-1" /> Almacenes
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <Truck size={14} className="mr-1" /> Proveedores
            </TabsTrigger>
            <TabsTrigger value="recipes" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <FileText size={14} className="mr-1" /> Recetas
            </TabsTrigger>
            <TabsTrigger value="stock" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <ArrowLeftRight size={14} className="mr-1" /> Stock
            </TabsTrigger>
            <TabsTrigger value="purchases" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <FileText size={14} className="mr-1" /> Compras
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 max-w-6xl mx-auto">
            {/* ─── INGREDIENTS TAB ─── */}
            <TabsContent value="ingredients" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-oswald text-lg font-bold">Insumos / Ingredientes</h2>
                <Button 
                  onClick={() => setIngredientDialog({ open: true, data: { name: '', unit: 'unidad', category: 'general', min_stock: 0, avg_cost: 0 } })}
                  className="bg-primary text-primary-foreground font-oswald"
                  data-testid="add-ingredient-btn"
                >
                  <Plus size={16} className="mr-1" /> Nuevo Insumo
                </Button>
              </div>

              {/* Search and filter */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={ingredientSearch}
                    onChange={e => setIngredientSearch(e.target.value)}
                    placeholder="Buscar insumo..."
                    className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm"
                    data-testid="ingredient-search"
                  />
                </div>
                <select
                  value={ingredientCategory}
                  onChange={e => setIngredientCategory(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  <option value="">Todas las categorías</option>
                  {INGREDIENT_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Ingredients list */}
              <div className="space-y-2">
                {filteredIngredients.map(ing => {
                  const totalStock = getTotalStock(ing.id);
                  const isLow = totalStock <= ing.min_stock;
                  return (
                    <div 
                      key={ing.id} 
                      className={`flex items-center justify-between p-3 rounded-xl border ${isLow ? 'border-red-500/50 bg-red-500/10' : ing.is_subrecipe ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-card'}`}
                      data-testid={`ingredient-${ing.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${ing.is_subrecipe ? 'bg-blue-500/20' : 'bg-primary/10'}`}>
                          {ing.is_subrecipe ? (
                            <FileText size={18} className="text-blue-500" />
                          ) : (
                            <Package size={18} className="text-primary" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{ing.name}</span>
                            <Badge variant="secondary" className="text-[9px]">{ing.unit}</Badge>
                            {ing.is_subrecipe && <Badge className="text-[9px] bg-blue-500">Sub-receta</Badge>}
                            {isLow && <Badge variant="destructive" className="text-[9px]">Stock bajo</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{INGREDIENT_CATEGORIES.find(c => c.value === ing.category)?.label}</span>
                            <span>•</span>
                            <span>Costo: {formatMoney(ing.avg_cost)}</span>
                            {ing.is_subrecipe && ing.cost_updated_at && (
                              <>
                                <span>•</span>
                                <span className="text-blue-400 text-[10px]">Actualizado: {new Date(ing.cost_updated_at).toLocaleDateString()}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>Min: {ing.min_stock} {ing.unit}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className={`font-oswald text-lg font-bold ${isLow ? 'text-red-500' : 'text-primary'}`}>
                            {totalStock.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{ing.unit}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setIngredientDialog({ open: true, data: { ...ing } })}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDeleteIngredient(ing.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredIngredients.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay insumos</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── WAREHOUSES TAB ─── */}
            <TabsContent value="warehouses" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-oswald text-lg font-bold">Almacenes</h2>
                <Button 
                  onClick={() => setWarehouseDialog({ open: true, data: { name: '', location: '' } })}
                  className="bg-primary text-primary-foreground font-oswald"
                  data-testid="add-warehouse-btn"
                >
                  <Plus size={16} className="mr-1" /> Nuevo Almacén
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {warehouses.map(wh => {
                  const whStock = stock.filter(s => s.warehouse_id === wh.id);
                  const itemCount = whStock.length;
                  const lowStockCount = whStock.filter(s => {
                    const ing = ingredients.find(i => i.id === s.ingredient_id);
                    return ing && s.current_stock <= ing.min_stock;
                  }).length;
                  return (
                    <div 
                      key={wh.id} 
                      className="p-4 rounded-xl border border-border bg-card"
                      data-testid={`warehouse-${wh.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Warehouse size={18} className="text-primary" />
                          </div>
                          <div>
                            <h3 className="font-oswald font-bold">{wh.name}</h3>
                            {wh.location && <p className="text-xs text-muted-foreground">{wh.location}</p>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7"
                            onClick={() => setWarehouseDialog({ open: true, data: { ...wh } })}
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteWarehouse(wh.id)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{itemCount} items</span>
                        {lowStockCount > 0 && (
                          <Badge variant="destructive" className="text-[9px]">
                            <AlertTriangle size={10} className="mr-1" /> {lowStockCount} bajo stock
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
                {warehouses.length === 0 && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <Warehouse size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay almacenes</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── SUPPLIERS TAB ─── */}
            <TabsContent value="suppliers" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-oswald text-lg font-bold">Proveedores</h2>
                <Button 
                  onClick={() => setSupplierDialog({ open: true, data: { name: '', contact_name: '', phone: '', email: '', address: '', rnc: '' } })}
                  className="bg-primary text-primary-foreground font-oswald"
                  data-testid="add-supplier-btn"
                >
                  <Plus size={16} className="mr-1" /> Nuevo Proveedor
                </Button>
              </div>

              <div className="space-y-2">
                {suppliers.filter(s => s.active !== false).map(sup => (
                  <div 
                    key={sup.id} 
                    className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
                    data-testid={`supplier-${sup.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Truck size={20} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{sup.name}</h3>
                        <div className="text-xs text-muted-foreground space-x-2">
                          {sup.contact_name && <span>{sup.contact_name}</span>}
                          {sup.phone && <span>• {sup.phone}</span>}
                          {sup.rnc && <span>• RNC: {sup.rnc}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => setSupplierDialog({ open: true, data: { ...sup } })}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDeleteSupplier(sup.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
                {suppliers.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Truck size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay proveedores</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── RECIPES TAB ─── */}
            <TabsContent value="recipes" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-oswald text-lg font-bold">Recetas</h2>
                <Button 
                  onClick={() => setRecipeDialog({ open: true, data: { product_id: '', product_name: '', ingredients: [], yield_quantity: 1, notes: '' } })}
                  className="bg-primary text-primary-foreground font-oswald"
                  data-testid="add-recipe-btn"
                >
                  <Plus size={16} className="mr-1" /> Nueva Receta
                </Button>
              </div>

              <div className="space-y-3">
                {recipes.map(rec => {
                  const cost = calculateRecipeCost(rec);
                  const product = products.find(p => p.id === rec.product_id);
                  return (
                    <div 
                      key={rec.id} 
                      className="p-4 rounded-xl border border-border bg-card"
                      data-testid={`recipe-${rec.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-oswald font-bold text-lg">{rec.product_name}</h3>
                          <div className="text-xs text-muted-foreground">
                            Rinde: {rec.yield_quantity} porción(es) • Costo: {formatMoney(cost)}
                            {product && <span> • PVP: {formatMoney(product.price_a || product.price)}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setRecipeDialog({ open: true, data: { ...rec } })}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDeleteRecipe(rec.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {rec.ingredients?.map((ing, idx) => {
                          const ingredient = ingredients.find(i => i.id === ing.ingredient_id);
                          return (
                            <div key={idx} className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm">
                              <span className="font-medium">{ing.ingredient_name || ingredient?.name || '?'}</span>
                              <div className="text-xs text-muted-foreground">
                                {ing.quantity} {ing.unit}
                                {ing.waste_percentage > 0 && <span className="text-red-400"> +{ing.waste_percentage}% merma</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {recipes.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay recetas</p>
                    <p className="text-sm">Vincula productos de venta con sus ingredientes</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── STOCK TAB ─── */}
            <TabsContent value="stock" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-oswald text-lg font-bold">Stock & Movimientos</h2>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => setAlertDialog({ open: true, newEmail: '' })}
                    data-testid="alert-config-btn"
                  >
                    <Bell size={16} className="mr-1" /> Alertas
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setTransferDialog({ open: true, data: { ingredient_id: '', from_warehouse_id: '', to_warehouse_id: '', quantity: 0, notes: '' } })}
                    data-testid="transfer-btn"
                  >
                    <ArrowLeftRight size={16} className="mr-1" /> Transferir
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setAdjustDialog({ open: true, data: { ingredient_id: '', warehouse_id: '', quantity: 0, reason: 'Ajuste manual' } })}
                    data-testid="adjust-btn"
                  >
                    <Package size={16} className="mr-1" /> Ajustar
                  </Button>
                </div>
              </div>

              {/* Low Stock Alert Banner */}
              {ingredients.filter(ing => getTotalStock(ing.id) <= ing.min_stock).length > 0 && (
                <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-red-500" size={24} />
                    <div>
                      <span className="font-oswald font-bold text-red-500">
                        {ingredients.filter(ing => getTotalStock(ing.id) <= ing.min_stock).length} insumos con stock bajo
                      </span>
                      <p className="text-xs text-muted-foreground">Revisa los items marcados en rojo</p>
                    </div>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleSendAlert}
                    disabled={sendingAlert || !alertConfig.emails?.length}
                    data-testid="send-alert-btn"
                  >
                    {sendingAlert ? <RefreshCw size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
                    Enviar Alerta
                  </Button>
                </div>
              )}

              {/* Stock by warehouse */}
              {warehouses.map(wh => {
                const whStock = stock.filter(s => s.warehouse_id === wh.id);
                if (whStock.length === 0) return null;
                return (
                  <div key={wh.id} className="mb-6">
                    <h3 className="font-oswald text-sm font-bold text-muted-foreground mb-2 flex items-center gap-2">
                      <Warehouse size={14} /> {wh.name}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {whStock.map(s => {
                        const ing = ingredients.find(i => i.id === s.ingredient_id);
                        const isLow = ing && s.current_stock <= ing.min_stock;
                        return (
                          <div 
                            key={s.id || `${s.ingredient_id}-${s.warehouse_id}`}
                            className={`p-3 rounded-lg border ${isLow ? 'border-red-500/50 bg-red-500/10' : 'border-border bg-card'}`}
                          >
                            <div className="font-medium text-sm truncate">{ing?.name || '?'}</div>
                            <div className="flex items-baseline gap-1">
                              <span className={`font-oswald text-xl font-bold ${isLow ? 'text-red-500' : 'text-primary'}`}>
                                {s.current_stock?.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground">{ing?.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Recent movements */}
              <div className="mt-8">
                <h3 className="font-oswald text-sm font-bold text-muted-foreground mb-2">Movimientos Recientes</h3>
                <div className="space-y-1">
                  {stockMovements.slice(0, 20).map(mov => {
                    const ing = ingredients.find(i => i.id === mov.ingredient_id);
                    const wh = warehouses.find(w => w.id === mov.warehouse_id);
                    return (
                      <div key={mov.id} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-border/50 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant={mov.quantity > 0 ? 'default' : 'destructive'} className="text-[9px]">
                            {mov.movement_type}
                          </Badge>
                          <span>{ing?.name || '?'}</span>
                          <span className="text-muted-foreground">@ {wh?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-oswald font-bold ${mov.quantity > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(mov.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* ─── PURCHASES TAB ─── */}
            <TabsContent value="purchases" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-oswald text-lg font-bold">Órdenes de Compra</h2>
                <Button 
                  onClick={() => setPODialog({ open: true, data: { supplier_id: '', warehouse_id: '', items: [], notes: '', expected_date: '' } })}
                  className="bg-primary text-primary-foreground font-oswald"
                  data-testid="add-po-btn"
                >
                  <Plus size={16} className="mr-1" /> Nueva Orden
                </Button>
              </div>

              {/* Filter */}
              <div className="flex gap-2 mb-4">
                <select
                  value={poStatusFilter}
                  onChange={e => setPOStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  <option value="">Todos los estados</option>
                  {Object.entries(PO_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              {/* PO list */}
              <div className="space-y-3">
                {filteredPOs.map(po => {
                  const status = PO_STATUS[po.status] || PO_STATUS.draft;
                  return (
                    <div 
                      key={po.id} 
                      className="p-4 rounded-xl border border-border bg-card"
                      data-testid={`po-${po.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-oswald font-bold">{po.supplier_name}</h3>
                            <Badge className={`${status.color} text-white text-[9px]`}>{status.label}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(po.created_at).toLocaleDateString()} • {po.items?.length} items • 
                            Total: {formatMoney(po.total)}
                            {po.actual_total && po.actual_total !== po.total && (
                              <span className="text-primary ml-1">Real: {formatMoney(po.actual_total)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {po.status === 'draft' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleUpdatePOStatus(po.id, 'pending')}
                            >
                              Enviar
                            </Button>
                          )}
                          {['pending', 'partial'].includes(po.status) && (
                            <Button 
                              variant="default" 
                              size="sm"
                              onClick={() => setReceiveDialog({ 
                                open: true, 
                                po, 
                                items: po.items.map(i => ({ 
                                  ...i, 
                                  received_quantity: 0,
                                  actual_unit_price: i.unit_price 
                                })),
                                notes: ''
                              })}
                            >
                              Recibir
                            </Button>
                          )}
                          {po.status === 'draft' && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => setPODialog({ open: true, data: { ...po } })}
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDeletePO(po.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Items */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {po.items?.map((item, idx) => (
                          <div key={idx} className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm">
                            <div className="font-medium truncate">{item.ingredient_name}</div>
                            <div className="text-xs text-muted-foreground flex justify-between">
                              <span>{item.quantity} × {formatMoney(item.unit_price)}</span>
                              {item.received_quantity > 0 && (
                                <span className="text-green-500">✓ {item.received_quantity}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {filteredPOs.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay órdenes de compra</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      {/* ─── DIALOGS ─── */}
      
      {/* Ingredient Dialog */}
      <Dialog open={ingredientDialog.open} onOpenChange={(o) => !o && setIngredientDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{ingredientDialog.data?.id ? 'Editar' : 'Nuevo'} Insumo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={ingredientDialog.data?.name || ''}
                onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="ingredient-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Unidad</label>
                <select
                  value={ingredientDialog.data?.unit || 'unidad'}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, unit: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Categoría</label>
                <select
                  value={ingredientDialog.data?.category || 'general'}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, category: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  {INGREDIENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Stock Mínimo</label>
                <input
                  type="number"
                  value={ingredientDialog.data?.min_stock || 0}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, min_stock: parseFloat(e.target.value) || 0 } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Costo Promedio</label>
                <input
                  type="number"
                  step="0.01"
                  value={ingredientDialog.data?.avg_cost || 0}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, avg_cost: parseFloat(e.target.value) || 0 } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  disabled={ingredientDialog.data?.is_subrecipe}
                />
                {ingredientDialog.data?.is_subrecipe && (
                  <p className="text-[10px] text-muted-foreground mt-1">Costo calculado desde sub-receta</p>
                )}
              </div>
            </div>
            
            {/* Sub-recipe toggle */}
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">Es Sub-receta</span>
                  <p className="text-xs text-muted-foreground">Este insumo se produce a partir de otros ingredientes</p>
                </div>
                <Switch
                  checked={ingredientDialog.data?.is_subrecipe || false}
                  onCheckedChange={(checked) => setIngredientDialog(p => ({ 
                    ...p, 
                    data: { ...p.data, is_subrecipe: checked, recipe_id: checked ? p.data?.recipe_id : '' } 
                  }))}
                />
              </div>
              {ingredientDialog.data?.is_subrecipe && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-primary">
                    Después de guardar, crea una receta en la pestaña "Recetas" que produzca este ingrediente.
                  </p>
                </div>
              )}
            </div>

            <Button onClick={handleSaveIngredient} className="w-full bg-primary text-primary-foreground font-oswald">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warehouse Dialog */}
      <Dialog open={warehouseDialog.open} onOpenChange={(o) => !o && setWarehouseDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{warehouseDialog.data?.id ? 'Editar' : 'Nuevo'} Almacén</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={warehouseDialog.data?.name || ''}
                onChange={e => setWarehouseDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="warehouse-name-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Ubicación</label>
              <input
                type="text"
                value={warehouseDialog.data?.location || ''}
                onChange={e => setWarehouseDialog(p => ({ ...p, data: { ...p.data, location: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>
            <Button onClick={handleSaveWarehouse} className="w-full bg-primary text-primary-foreground font-oswald">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={supplierDialog.open} onOpenChange={(o) => !o && setSupplierDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{supplierDialog.data?.id ? 'Editar' : 'Nuevo'} Proveedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={supplierDialog.data?.name || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="supplier-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Contacto</label>
                <input
                  type="text"
                  value={supplierDialog.data?.contact_name || ''}
                  onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, contact_name: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Teléfono</label>
                <input
                  type="text"
                  value={supplierDialog.data?.phone || ''}
                  onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, phone: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={supplierDialog.data?.email || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, email: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium">RNC</label>
              <input
                type="text"
                value={supplierDialog.data?.rnc || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, rnc: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Dirección</label>
              <textarea
                value={supplierDialog.data?.address || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, address: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
              />
            </div>
            <Button onClick={handleSaveSupplier} className="w-full bg-primary text-primary-foreground font-oswald">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recipe Dialog */}
      <Dialog open={recipeDialog.open} onOpenChange={(o) => !o && setRecipeDialog({ open: false, data: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{recipeDialog.data?.id ? 'Editar' : 'Nueva'} Receta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Producto *</label>
              <select
                value={recipeDialog.data?.product_id || ''}
                onChange={e => {
                  const prod = products.find(p => p.id === e.target.value);
                  setRecipeDialog(p => ({ ...p, data: { ...p.data, product_id: e.target.value, product_name: prod?.name || '' } }));
                }}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="">Seleccionar producto...</option>
                {products.filter(p => p.active !== false).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Rinde (porciones)</label>
              <input
                type="number"
                value={recipeDialog.data?.yield_quantity || 1}
                onChange={e => setRecipeDialog(p => ({ ...p, data: { ...p.data, yield_quantity: parseFloat(e.target.value) || 1 } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>

            {/* Ingredients list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Ingredientes</label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setRecipeDialog(p => ({
                      ...p,
                      data: {
                        ...p.data,
                        ingredients: [...(p.data?.ingredients || []), { ingredient_id: '', ingredient_name: '', quantity: 1, unit: 'unidad', waste_percentage: 0 }]
                      }
                    }));
                  }}
                >
                  <Plus size={14} className="mr-1" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {(recipeDialog.data?.ingredients || []).map((ing, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
                    <select
                      value={ing.ingredient_id}
                      onChange={e => {
                        const ingredient = ingredients.find(i => i.id === e.target.value);
                        setRecipeDialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            ingredients: p.data.ingredients.map((i, j) => j === idx ? { 
                              ...i, 
                              ingredient_id: e.target.value,
                              ingredient_name: ingredient?.name || '',
                              unit: ingredient?.unit || i.unit
                            } : i)
                          }
                        }));
                      }}
                      className="flex-1 px-2 py-1 bg-card border border-border rounded text-sm"
                    >
                      <option value="">Seleccionar...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <input
                      type="number"
                      value={ing.quantity}
                      onChange={e => {
                        setRecipeDialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            ingredients: p.data.ingredients.map((i, j) => j === idx ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i)
                          }
                        }));
                      }}
                      className="w-20 px-2 py-1 bg-card border border-border rounded text-sm"
                      placeholder="Cant."
                    />
                    <span className="text-xs text-muted-foreground w-16">{ing.unit}</span>
                    <input
                      type="number"
                      value={ing.waste_percentage}
                      onChange={e => {
                        setRecipeDialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            ingredients: p.data.ingredients.map((i, j) => j === idx ? { ...i, waste_percentage: parseFloat(e.target.value) || 0 } : i)
                          }
                        }));
                      }}
                      className="w-16 px-2 py-1 bg-card border border-border rounded text-sm"
                      placeholder="%"
                    />
                    <span className="text-[10px] text-muted-foreground">% merma</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        setRecipeDialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            ingredients: p.data.ingredients.filter((_, j) => j !== idx)
                          }
                        }));
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Notas</label>
              <textarea
                value={recipeDialog.data?.notes || ''}
                onChange={e => setRecipeDialog(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
              />
            </div>

            <Button onClick={handleSaveRecipe} className="w-full bg-primary text-primary-foreground font-oswald">
              <Save size={16} className="mr-1" /> Guardar Receta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Order Dialog */}
      <Dialog open={poDialog.open} onOpenChange={(o) => !o && setPODialog({ open: false, data: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{poDialog.data?.id ? 'Editar' : 'Nueva'} Orden de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Proveedor *</label>
                <select
                  value={poDialog.data?.supplier_id || ''}
                  onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, supplier_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="">Seleccionar...</option>
                  {suppliers.filter(s => s.active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Almacén destino *</label>
                <select
                  value={poDialog.data?.warehouse_id || ''}
                  onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, warehouse_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Items</label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setPODialog(p => ({
                      ...p,
                      data: {
                        ...p.data,
                        items: [...(p.data?.items || []), { ingredient_id: '', ingredient_name: '', quantity: 1, unit_price: 0 }]
                      }
                    }));
                  }}
                >
                  <Plus size={14} className="mr-1" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {(poDialog.data?.items || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
                    <select
                      value={item.ingredient_id}
                      onChange={e => {
                        const ing = ingredients.find(i => i.id === e.target.value);
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.map((i, j) => j === idx ? { 
                              ...i, 
                              ingredient_id: e.target.value,
                              ingredient_name: ing?.name || '',
                              unit_price: ing?.avg_cost || i.unit_price
                            } : i)
                          }
                        }));
                      }}
                      className="flex-1 px-2 py-1 bg-card border border-border rounded text-sm"
                    >
                      <option value="">Seleccionar insumo...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => {
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.map((i, j) => j === idx ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i)
                          }
                        }));
                      }}
                      className="w-20 px-2 py-1 bg-card border border-border rounded text-sm"
                      placeholder="Cant."
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => {
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.map((i, j) => j === idx ? { ...i, unit_price: parseFloat(e.target.value) || 0 } : i)
                          }
                        }));
                      }}
                      className="w-24 px-2 py-1 bg-card border border-border rounded text-sm"
                      placeholder="Precio"
                    />
                    <span className="text-xs text-muted-foreground w-20">
                      {formatMoney((item.quantity || 0) * (item.unit_price || 0))}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.filter((_, j) => j !== idx)
                          }
                        }));
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
              {poDialog.data?.items?.length > 0 && (
                <div className="text-right mt-2 font-oswald font-bold">
                  Total: {formatMoney((poDialog.data?.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Notas</label>
              <textarea
                value={poDialog.data?.notes || ''}
                onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
              />
            </div>

            <Button onClick={handleSavePO} className="w-full bg-primary text-primary-foreground font-oswald">
              <Save size={16} className="mr-1" /> Guardar Orden
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive PO Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(o) => !o && setReceiveDialog({ open: false, po: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">Recibir Mercancía</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="font-semibold">{receiveDialog.po?.supplier_name}</div>
              <div className="text-sm text-muted-foreground">
                Almacén: {warehouses.find(w => w.id === receiveDialog.po?.warehouse_id)?.name}
              </div>
            </div>

            <div className="space-y-2">
              {(receiveDialog.items || []).map((item, idx) => {
                const pending = item.quantity - (item.received_quantity || 0);
                return (
                  <div key={idx} className="p-3 rounded-lg bg-background border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{item.ingredient_name}</span>
                      <span className="text-xs text-muted-foreground">
                        Pedido: {item.quantity} | Pendiente: {pending}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Cantidad recibida</label>
                        <input
                          type="number"
                          value={receiveDialog.items[idx]?.received_quantity || ''}
                          onChange={e => {
                            const items = [...receiveDialog.items];
                            items[idx] = { ...items[idx], received_quantity: parseFloat(e.target.value) || 0 };
                            setReceiveDialog(p => ({ ...p, items }));
                          }}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                          placeholder={`Max: ${pending}`}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Precio real</label>
                        <input
                          type="number"
                          step="0.01"
                          value={receiveDialog.items[idx]?.actual_unit_price || ''}
                          onChange={e => {
                            const items = [...receiveDialog.items];
                            items[idx] = { ...items[idx], actual_unit_price: parseFloat(e.target.value) || 0 };
                            setReceiveDialog(p => ({ ...p, items }));
                          }}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                          placeholder={item.unit_price}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="text-sm font-medium">Notas de recepción</label>
              <textarea
                value={receiveDialog.notes || ''}
                onChange={e => setReceiveDialog(p => ({ ...p, notes: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
                placeholder="Observaciones..."
              />
            </div>

            <Button onClick={handleReceivePO} className="w-full bg-green-600 hover:bg-green-700 text-white font-oswald">
              <Check size={16} className="mr-1" /> Confirmar Recepción
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialog.open} onOpenChange={(o) => !o && setTransferDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">Transferir Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Insumo *</label>
              <select
                value={transferDialog.data?.ingredient_id || ''}
                onChange={e => setTransferDialog(p => ({ ...p, data: { ...p.data, ingredient_id: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="">Seleccionar...</option>
                {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Desde *</label>
                <select
                  value={transferDialog.data?.from_warehouse_id || ''}
                  onChange={e => setTransferDialog(p => ({ ...p, data: { ...p.data, from_warehouse_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Hacia *</label>
                <select
                  value={transferDialog.data?.to_warehouse_id || ''}
                  onChange={e => setTransferDialog(p => ({ ...p, data: { ...p.data, to_warehouse_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Cantidad *</label>
              <input
                type="number"
                value={transferDialog.data?.quantity || ''}
                onChange={e => setTransferDialog(p => ({ ...p, data: { ...p.data, quantity: parseFloat(e.target.value) || 0 } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notas</label>
              <input
                type="text"
                value={transferDialog.data?.notes || ''}
                onChange={e => setTransferDialog(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>
            <Button onClick={handleTransfer} className="w-full bg-primary text-primary-foreground font-oswald">
              <ArrowLeftRight size={16} className="mr-1" /> Transferir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={(o) => !o && setAdjustDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">Ajustar Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Insumo *</label>
              <select
                value={adjustDialog.data?.ingredient_id || ''}
                onChange={e => setAdjustDialog(p => ({ ...p, data: { ...p.data, ingredient_id: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="">Seleccionar...</option>
                {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Almacén *</label>
              <select
                value={adjustDialog.data?.warehouse_id || ''}
                onChange={e => setAdjustDialog(p => ({ ...p, data: { ...p.data, warehouse_id: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="">Seleccionar...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Cantidad (+ agregar, - quitar) *</label>
              <input
                type="number"
                value={adjustDialog.data?.quantity || ''}
                onChange={e => setAdjustDialog(p => ({ ...p, data: { ...p.data, quantity: parseFloat(e.target.value) || 0 } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="Ej: 10 o -5"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Razón *</label>
              <select
                value={adjustDialog.data?.reason || 'Ajuste manual'}
                onChange={e => setAdjustDialog(p => ({ ...p, data: { ...p.data, reason: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="Ajuste manual">Ajuste manual</option>
                <option value="Conteo físico">Conteo físico</option>
                <option value="Merma">Merma / Pérdida</option>
                <option value="Vencimiento">Vencimiento</option>
                <option value="Daño">Daño</option>
                <option value="Corrección">Corrección de error</option>
              </select>
            </div>
            <Button onClick={handleAdjust} className="w-full bg-primary text-primary-foreground font-oswald">
              <Check size={16} className="mr-1" /> Aplicar Ajuste
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Alert Config Dialog */}
      <Dialog open={alertDialog.open} onOpenChange={(o) => !o && setAlertDialog({ open: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Bell size={20} className="text-primary" /> Configuración de Alertas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-sm">
                Recibe alertas por email cuando un insumo llegue a su stock mínimo.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Emails para alertas</label>
              <div className="mt-2 space-y-2">
                {(alertConfig.emails || []).map((email, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-muted-foreground" />
                      <span className="text-sm">{email}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeAlertEmail(email)}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                ))}
                {alertConfig.emails?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No hay emails configurados</p>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <input
                  type="email"
                  value={alertDialog.newEmail || ''}
                  onChange={e => setAlertDialog(p => ({ ...p, newEmail: e.target.value }))}
                  placeholder="nuevo@email.com"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                  onKeyPress={e => e.key === 'Enter' && addAlertEmail()}
                />
                <Button variant="outline" onClick={addAlertEmail}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>

            {/* Schedule Time */}
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium">Alertas programadas</span>
                  <p className="text-xs text-muted-foreground">Enviar reporte diario automático</p>
                </div>
                <Switch
                  checked={alertConfig.enabled}
                  onCheckedChange={(checked) => setAlertConfig(p => ({ ...p, enabled: checked }))}
                />
              </div>
              {alertConfig.enabled && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-3">
                    <label className="text-sm">Hora de envío:</label>
                    <input
                      type="time"
                      value={alertConfig.schedule_time || '08:00'}
                      onChange={e => setAlertConfig(p => ({ ...p, schedule_time: e.target.value }))}
                      className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                    />
                  </div>
                  {schedulerStatus.active && schedulerStatus.next_run && (
                    <p className="text-xs text-green-500 mt-2">
                      ✓ Próximo envío: {new Date(schedulerStatus.next_run).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleCheckAlerts}
              >
                <AlertTriangle size={14} className="mr-1" /> Verificar Ahora
              </Button>
              <Button 
                onClick={handleSaveAlertConfig} 
                className="flex-1 bg-primary text-primary-foreground font-oswald"
              >
                <Save size={14} className="mr-1" /> Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
