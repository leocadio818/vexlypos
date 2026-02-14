import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  ingredientsAPI, stockAPI, stockMovementsAPI, warehousesAPI, 
  suppliersAPI, recipesAPI, purchaseOrdersAPI, productsAPI, stockAlertsAPI,
  unitDefinitionsAPI, reportsAPI
} from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { toast } from 'sonner';
import { 
  Package, Warehouse, Truck, FileText, ArrowLeftRight, AlertTriangle,
  Plus, Pencil, Trash2, Search, X, Check, ChevronRight,
  ArrowLeft, Save, RefreshCw, Filter, Download, Mail, Bell, Send,
  Factory, Play, History, Calculator, Info, DollarSign, TrendingDown, PieChart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import AssistantTab from './inventory/components/AssistantTab';
import IngredientsTab from './inventory/components/IngredientsTab';
import ProductionTab from './inventory/components/ProductionTab';
import WarehousesTab from './inventory/components/WarehousesTab';
import SuppliersTab from './inventory/components/SuppliersTab';
import RecipesTab from './inventory/components/RecipesTab';
import StockTab from './inventory/components/StockTab';
import PurchasesTab from './inventory/components/PurchasesTab';
import ValuationTab from './inventory/components/ValuationTab';
import AuditTab from './inventory/components/AuditTab';

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
  
  // Dialog states (ingredientDialog, unitDialog moved to IngredientsTab)
  // (poDialog, receiveDialog moved to PurchasesTab)
  const [transferDialog, setTransferDialog] = useState({ open: false, data: null });
  const [adjustDialog, setAdjustDialog] = useState({ open: false, data: null });
  
  // Custom units state (customUnits remains for passing to child, others moved to IngredientsTab)
  const [customUnits, setCustomUnits] = useState([]);
  
  // Valuation and Audit tab states moved to their respective components (ValuationTab, AuditTab)
  
  // Conversion Analysis Dialog state
  const [conversionAnalysis, setConversionAnalysis] = useState({ open: false, data: null, loading: false });
  
  // Multilevel Stock state
  const [multilevelStock, setMultilevelStock] = useState([]);
  const [loadingMultilevel, setLoadingMultilevel] = useState(false);
  const [differenceDialog, setDifferenceDialog] = useState({ open: false, data: null });
  
  // Shopping Assistant state - Now managed by AssistantTab component
  // States removed: purchaseSuggestions, assistantFilters, loadingAssistant, selectedSuggestions, 
  //                 priceAlerts, marginResults, loadingMargins, priceHistoryDialog, assistantView

  // Fetch all data
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ingRes, whRes, supRes, recRes, poRes, stockRes, movRes, prodRes, alertRes, schedRes, unitsRes] = await Promise.all([
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
        unitDefinitionsAPI.list().catch(() => ({ data: [] })),
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
      setCustomUnits(unitsRes.data || []);
    } catch (e) {
      toast.error('Error al cargar datos');
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // ─── INGREDIENTS HANDLERS (Moved to IngredientsTab component) ───
  // handleSaveIngredient, handleDeleteIngredient, checkAffectedRecipes, loadAuditHistory, 
  // handleSaveUnit, handleDeleteUnit are now in IngredientsTab
  
  // Load conversion analysis for ingredient - kept here as it's passed to child
  const loadConversionAnalysis = async (ingredientId) => {
    if (!ingredientId) return;
    setConversionAnalysis({ open: true, data: null, loading: true });
    try {
      const res = await ingredientsAPI.getConversionAnalysis(ingredientId);
      setConversionAnalysis({ open: true, data: res.data, loading: false });
    } catch (e) {
      toast.error('Error al cargar análisis de conversión');
      setConversionAnalysis({ open: false, data: null, loading: false });
    }
  };

  // ─── AUDIT & VALUATION HANDLERS (Moved to AuditTab and ValuationTab components) ───
  // fetchAuditLogs, exportAuditToExcel, getFieldLabel moved to AuditTab
  // fetchValuationData, exportValuationToExcel, getCategoryLabel moved to ValuationTab

  // ─── MULTILEVEL STOCK HANDLERS ───
  const fetchMultilevelStock = async (warehouseId = '') => {
    setLoadingMultilevel(true);
    try {
      const params = warehouseId ? { warehouse_id: warehouseId } : {};
      const res = await stockAPI.listMultilevel(params);
      setMultilevelStock(res.data || []);
    } catch (e) {
      toast.error('Error al cargar stock multinivel');
    }
    setLoadingMultilevel(false);
  };

  const handleRegisterDifference = async () => {
    const d = differenceDialog.data;
    if (!d?.quantity || d.quantity <= 0) {
      toast.error('Cantidad requerida');
      return;
    }
    if (!d?.reason?.trim()) {
      toast.error('Razón de la diferencia requerida');
      return;
    }
    
    try {
      const res = await stockAPI.difference({
        ingredient_id: d.ingredient_id,
        warehouse_id: d.warehouse_id,
        quantity: parseFloat(d.quantity),
        input_unit: d.input_unit,
        difference_type: d.difference_type,
        reason: d.reason,
        observations: d.observations || ''
      });
      
      toast.success(`Diferencia registrada: ${formatMoney(res.data.monetary_value)} ${d.difference_type === 'faltante' ? 'perdido' : 'ganado'}`);
      setDifferenceDialog({ open: false, data: null });
      fetchMultilevelStock();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al registrar diferencia');
    }
  };

  // Load multilevel stock when stock tab is active
  useEffect(() => {
    if (activeTab === 'stock') {
      fetchMultilevelStock();
    }
  }, [activeTab]);

  // ─── SHOPPING ASSISTANT HANDLERS ───
  // All shopping assistant handlers have been moved to AssistantTab component
  // Including: fetchPurchaseSuggestions, fetchPriceAlerts, fetchMarginAnalysis,
  //            loadPriceHistory, handleGeneratePO, toggleSuggestionSelection,
  //            selectAllSuggestions, deselectAllSuggestions

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
            <TabsTrigger value="production" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white font-oswald text-xs">
              <Factory size={14} className="mr-1" /> Producción
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
            <TabsTrigger value="valuation" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-oswald text-xs">
              <DollarSign size={14} className="mr-1" /> Valorización
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white font-oswald text-xs">
              <History size={14} className="mr-1" /> Auditoría
            </TabsTrigger>
            <TabsTrigger value="assistant" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white font-oswald text-xs">
              <TrendingDown size={14} className="mr-1" /> Asistente
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 max-w-6xl mx-auto">
            {/* ─── INGREDIENTS TAB ─── */}
            <TabsContent value="ingredients" className="mt-0">
              <IngredientsTab
                ingredients={ingredients}
                suppliers={suppliers}
                customUnits={customUnits}
                getTotalStock={getTotalStock}
                onRefreshAll={fetchAll}
                onNavigateToProduction={() => setActiveTab('production')}
                onLoadConversionAnalysis={loadConversionAnalysis}
              />
            </TabsContent>

            {/* ─── PRODUCTION DASHBOARD TAB ─── */}
            <TabsContent value="production" className="mt-0">
              <ProductionTab
                ingredients={ingredients}
                warehouses={warehouses}
                getTotalStock={getTotalStock}
                onRefreshAll={fetchAll}
              />
            </TabsContent>

            {/* ─── WAREHOUSES TAB ─── */}
            <TabsContent value="warehouses" className="mt-0">
              <WarehousesTab
                warehouses={warehouses}
                stock={stock}
                ingredients={ingredients}
                onRefreshAll={fetchAll}
              />
            </TabsContent>

            {/* ─── SUPPLIERS TAB ─── */}
            <TabsContent value="suppliers" className="mt-0">
              <SuppliersTab
                suppliers={suppliers}
                onRefreshAll={fetchAll}
              />
            </TabsContent>

            {/* ─── RECIPES TAB ─── */}
            <TabsContent value="recipes" className="mt-0">
              <RecipesTab
                recipes={recipes}
                products={products}
                ingredients={ingredients}
                calculateRecipeCost={calculateRecipeCost}
                onRefreshAll={fetchAll}
              />
            </TabsContent>

            {/* ─── STOCK TAB ─── */}
            <TabsContent value="stock" className="mt-0">
              <StockTab
                multilevelStock={multilevelStock}
                stockMovements={stockMovements}
                ingredients={ingredients}
                warehouses={warehouses}
                loadingMultilevel={loadingMultilevel}
                sendingAlert={sendingAlert}
                alertConfig={alertConfig}
                onFetchMultilevelStock={fetchMultilevelStock}
                onSendAlert={handleSendAlert}
                onOpenAlertDialog={() => setAlertDialog({ open: true, newEmail: '' })}
                onOpenTransferDialog={() => setTransferDialog({ open: true, data: { ingredient_id: '', from_warehouse_id: '', to_warehouse_id: '', quantity: 0, notes: '' } })}
                onOpenAdjustDialog={() => setAdjustDialog({ open: true, data: { ingredient_id: '', warehouse_id: '', quantity: 0, reason: 'Ajuste manual' } })}
                onOpenDifferenceDialog={(data) => setDifferenceDialog({ open: true, data })}
              />
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

            {/* ─── VALUATION TAB ─── */}
            <TabsContent value="valuation" className="mt-0">
              {/* Header con estilo esmeralda financiero */}
              <div className="bg-gradient-to-r from-emerald-900/40 via-emerald-800/30 to-emerald-900/40 border border-emerald-500/30 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <DollarSign size={28} className="text-white" />
                    </div>
                    <div>
                      <h2 className="font-oswald text-2xl font-bold text-emerald-50">Valorización de Inventario</h2>
                      <p className="text-emerald-200/70 text-sm">Análisis financiero del stock actual</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => fetchValuationData(valuationFilters)}
                      className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                      disabled={loadingValuation}
                    >
                      <RefreshCw size={14} className={`mr-1 ${loadingValuation ? 'animate-spin' : ''}`} /> Actualizar
                    </Button>
                    <Button 
                      onClick={exportValuationToExcel}
                      className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-oswald"
                      disabled={!valuationData || valuationData.items.length === 0}
                      data-testid="export-valuation-btn"
                    >
                      <Download size={16} className="mr-2" /> Exportar a Excel
                    </Button>
                  </div>
                </div>
                
                {/* Total Value Card - Prominente */}
                {valuationData && (
                  <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-400/30">
                    <div className="text-emerald-300/80 text-sm">Valor Total del Inventario</div>
                    <div className="text-4xl font-oswald font-bold text-emerald-100 mt-1">
                      {formatMoney(valuationData.total_value)}
                    </div>
                    <div className="flex gap-6 mt-2 text-sm text-emerald-200/60">
                      <span>{valuationData.total_items} registros</span>
                      <span>{valuationData.total_ingredients} ingredientes</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Filtros */}
              <div className="bg-card border border-border rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter size={16} className="text-emerald-500" />
                  <span className="font-oswald font-medium text-sm">Filtros</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Almacén</label>
                    <select
                      value={valuationFilters.warehouse_id}
                      onChange={e => setValuationFilters(p => ({ ...p, warehouse_id: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      data-testid="valuation-filter-warehouse"
                    >
                      <option value="">Todos los almacenes</option>
                      {warehouses.map(wh => (
                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Categoría</label>
                    <select
                      value={valuationFilters.category}
                      onChange={e => setValuationFilters(p => ({ ...p, category: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      data-testid="valuation-filter-category"
                    >
                      <option value="">Todas las categorías</option>
                      {INGREDIENT_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button 
                      onClick={() => fetchValuationData(valuationFilters)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <Search size={14} className="mr-1" /> Aplicar Filtros
                    </Button>
                  </div>
                </div>
              </div>

              {loadingValuation ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw size={32} className="animate-spin text-emerald-500" />
                </div>
              ) : valuationData ? (
                <>
                  {/* Desglose por Categoría */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    <div className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <PieChart size={16} className="text-emerald-500" />
                        <span className="font-oswald font-medium">Desglose por Categoría</span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(valuationData.by_category || {}).sort((a, b) => b[1].value - a[1].value).map(([cat, data]) => {
                          const percentage = valuationData.total_value > 0 ? (data.value / valuationData.total_value * 100) : 0;
                          return (
                            <div key={cat} className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium">{getCategoryLabel(cat)}</span>
                                  <span className="text-emerald-400 font-oswald">{formatMoney(data.value)}</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground w-12 text-right">{percentage.toFixed(1)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Warehouse size={16} className="text-emerald-500" />
                        <span className="font-oswald font-medium">Desglose por Almacén</span>
                      </div>
                      <div className="space-y-2">
                        {(valuationData.by_warehouse || []).sort((a, b) => b.value - a.value).map(wh => {
                          const percentage = valuationData.total_value > 0 ? (wh.value / valuationData.total_value * 100) : 0;
                          return (
                            <div key={wh.name} className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium">{wh.name}</span>
                                  <span className="text-emerald-400 font-oswald">{formatMoney(wh.value)}</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground w-12 text-right">{percentage.toFixed(1)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Dead Stock Warning */}
                  {valuationData.dead_stock && valuationData.dead_stock.count > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                          <TrendingDown size={20} className="text-red-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-oswald font-bold text-red-300">Stock Muerto Detectado</h3>
                          <p className="text-sm text-red-200/70">
                            {valuationData.dead_stock.count} producto(s) con alto valor y poca rotación 
                            ({formatMoney(valuationData.dead_stock.total_value)} inmovilizado)
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {valuationData.dead_stock.items.slice(0, 6).map(item => (
                          <div key={item.ingredient_id} className="flex items-center justify-between p-2 bg-red-950/30 rounded-lg text-sm">
                            <span className="text-red-200">{item.name}</span>
                            <span className="text-red-400 font-oswald">{formatMoney(item.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tabla de Valorización */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="valuation-table">
                        <thead className="bg-gradient-to-r from-emerald-900/50 to-emerald-800/50 text-emerald-100">
                          <tr>
                            <th className="px-4 py-3 text-left font-oswald font-medium">Insumo</th>
                            <th className="px-4 py-3 text-left font-oswald font-medium">Categoría</th>
                            <th className="px-4 py-3 text-left font-oswald font-medium">Almacén</th>
                            <th className="px-4 py-3 text-right font-oswald font-medium">Stock</th>
                            <th className="px-4 py-3 text-right font-oswald font-medium">Costo Unit.</th>
                            <th className="px-4 py-3 text-right font-oswald font-medium">Valor Stock</th>
                            <th className="px-4 py-3 text-right font-oswald font-medium">Mov. 30d</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {valuationData.items.map((item, idx) => (
                            <tr 
                              key={`${item.ingredient_id}-${item.warehouse_id}`} 
                              className={`hover:bg-emerald-500/5 transition-colors ${item.is_dead_stock ? 'bg-red-500/5' : ''}`}
                              data-testid={`valuation-row-${idx}`}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{item.name}</span>
                                  {item.is_dead_stock && (
                                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                                      Stock Muerto
                                    </Badge>
                                  )}
                                  {item.is_low_stock && (
                                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                      Stock Bajo
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs">
                                  {getCategoryLabel(item.category)}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{item.warehouse_name}</td>
                              <td className="px-4 py-3 text-right font-mono">
                                {item.current_stock} <span className="text-muted-foreground text-xs">{item.unit}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                {formatMoney(item.unit_cost)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-oswald font-bold ${item.is_dead_stock ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {formatMoney(item.stock_value)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                {item.recent_movement}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {valuationData.items.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Package size={40} className="mx-auto mb-3 opacity-30" />
                      <p>No hay datos de inventario para mostrar</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
                  <p>Cargando datos de valorización...</p>
                </div>
              )}
            </TabsContent>

            {/* ─── AUDIT TAB ─── */}
            <TabsContent value="audit" className="mt-0">
              {/* Header con estilo Keep Money (Dorado y Oscuro) */}
              <div className="bg-gradient-to-r from-amber-900/30 via-amber-800/20 to-amber-900/30 border border-amber-600/30 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
                      <History size={24} className="text-white" />
                    </div>
                    <div>
                      <h2 className="font-oswald text-xl font-bold text-amber-100">Historial de Auditoría de Insumos</h2>
                      <p className="text-amber-200/70 text-sm">Registro cronológico de todos los cambios realizados</p>
                    </div>
                  </div>
                  <Button 
                    onClick={exportAuditToExcel}
                    className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-oswald"
                    disabled={allAuditLogs.length === 0}
                    data-testid="export-audit-btn"
                  >
                    <Download size={16} className="mr-2" /> Exportar Historial
                  </Button>
                </div>
                
                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="bg-amber-950/50 rounded-lg p-3 border border-amber-700/30">
                    <div className="text-amber-400 text-2xl font-oswald font-bold">{auditStats.total_changes}</div>
                    <div className="text-amber-200/60 text-xs">Total de Cambios</div>
                  </div>
                  <div className="bg-amber-950/50 rounded-lg p-3 border border-amber-700/30">
                    <div className="text-amber-400 text-2xl font-oswald font-bold">{auditStats.unique_ingredients}</div>
                    <div className="text-amber-200/60 text-xs">Insumos Afectados</div>
                  </div>
                  <div className="bg-amber-950/50 rounded-lg p-3 border border-amber-700/30">
                    <div className="text-amber-400 text-2xl font-oswald font-bold">
                      {Object.keys(auditStats.changes_by_field || {}).length}
                    </div>
                    <div className="text-amber-200/60 text-xs">Tipos de Campo</div>
                  </div>
                </div>
              </div>

              {/* Filtros de búsqueda */}
              <div className="bg-card border border-border rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter size={16} className="text-amber-500" />
                  <span className="font-oswald font-medium text-sm">Filtros de Búsqueda</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Nombre del Insumo</label>
                    <div className="relative mt-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={auditFilters.ingredient_name}
                        onChange={e => setAuditFilters(p => ({ ...p, ingredient_name: e.target.value }))}
                        placeholder="Buscar insumo..."
                        className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm"
                        data-testid="audit-filter-ingredient"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Fecha Inicio</label>
                    <input
                      type="date"
                      value={auditFilters.start_date}
                      onChange={e => setAuditFilters(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      data-testid="audit-filter-start-date"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Fecha Fin</label>
                    <input
                      type="date"
                      value={auditFilters.end_date}
                      onChange={e => setAuditFilters(p => ({ ...p, end_date: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      data-testid="audit-filter-end-date"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Campo Editado</label>
                    <select
                      value={auditFilters.field_changed}
                      onChange={e => setAuditFilters(p => ({ ...p, field_changed: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      data-testid="audit-filter-field"
                    >
                      <option value="">Todos los campos</option>
                      <option value="unit">Unidad de Medida</option>
                      <option value="purchase_unit">Unidad de Compra</option>
                      <option value="conversion_factor">Factor de Conversión</option>
                      <option value="purchase_quantity">Cantidad de Compra</option>
                      <option value="dispatch_quantity">Equivalencia en Despacho</option>
                      <option value="avg_cost">Costo Promedio</option>
                      <option value="name">Nombre</option>
                      <option value="category">Categoría</option>
                      <option value="min_stock">Stock Mínimo</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setAuditFilters({ ingredient_name: '', start_date: '', end_date: '', field_changed: '' });
                      fetchAuditLogs({ ingredient_name: '', start_date: '', end_date: '', field_changed: '' });
                    }}
                  >
                    <X size={14} className="mr-1" /> Limpiar
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => fetchAuditLogs(auditFilters)}
                    className="bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    <Search size={14} className="mr-1" /> Buscar
                  </Button>
                </div>
              </div>

              {/* Tabla de Auditoría */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {loadingAudit ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw size={24} className="animate-spin text-amber-500" />
                  </div>
                ) : allAuditLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <History size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay registros de auditoría</p>
                    <p className="text-xs mt-1">Los cambios en insumos aparecerán aquí</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="audit-table">
                      <thead className="bg-gradient-to-r from-amber-900/50 to-amber-800/50 text-amber-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-oswald font-medium">Fecha y Hora</th>
                          <th className="px-4 py-3 text-left font-oswald font-medium">Usuario</th>
                          <th className="px-4 py-3 text-left font-oswald font-medium">Insumo</th>
                          <th className="px-4 py-3 text-left font-oswald font-medium">Campo Editado</th>
                          <th className="px-4 py-3 text-left font-oswald font-medium">Valor Anterior</th>
                          <th className="px-4 py-3 text-left font-oswald font-medium">Valor Nuevo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {allAuditLogs.map((log, idx) => (
                          <tr key={log.id || idx} className="hover:bg-amber-500/5 transition-colors" data-testid={`audit-row-${idx}`}>
                            <td className="px-4 py-3">
                              <div className="text-sm">{new Date(log.timestamp).toLocaleDateString('es-DO')}</div>
                              <div className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString('es-DO')}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-amber-600/20 flex items-center justify-center text-amber-500 text-xs font-bold">
                                  {(log.changed_by_name || 'S')[0].toUpperCase()}
                                </div>
                                <span className="font-medium">{log.changed_by_name || 'Sistema'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium">{log.ingredient_name}</td>
                            <td className="px-4 py-3">
                              <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">
                                {getFieldLabel(log.field_changed)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs font-mono">
                                {log.old_value || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded bg-green-500/10 text-green-400 text-xs font-mono">
                                {log.new_value || '-'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer info */}
              {allAuditLogs.length > 0 && (
                <div className="mt-4 text-center text-xs text-muted-foreground">
                  Mostrando {allAuditLogs.length} registro(s) de auditoría
                </div>
              )}
            </TabsContent>

            {/* ─── SHOPPING ASSISTANT TAB ─── */}
            <TabsContent value="assistant" className="mt-0">
              <AssistantTab 
                suppliers={suppliers}
                warehouses={warehouses}
                onRefreshAll={fetchAll}
                onChangeTab={setActiveTab}
              />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
      {/* ─── DIALOGS ─── */}
      
      {/* Ingredient Dialog and Unit Definition Dialog moved to IngredientsTab component */}

      {/* Conversion Analysis Dialog */}
      <Dialog open={conversionAnalysis.open} onOpenChange={(o) => !o && setConversionAnalysis({ open: false, data: null, loading: false })}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Calculator size={20} className="text-emerald-500" />
              Análisis de Conversión Universal
            </DialogTitle>
          </DialogHeader>
          
          {conversionAnalysis.loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={32} className="animate-spin text-emerald-500" />
            </div>
          ) : conversionAnalysis.data ? (
            <div className="space-y-4">
              {/* Ingredient Info Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 border border-emerald-500/30">
                <h3 className="font-oswald text-xl font-bold text-emerald-100 mb-3">
                  {conversionAnalysis.data.ingredient?.name}
                </h3>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 mb-3">
                  {getCategoryLabel(conversionAnalysis.data.ingredient?.category)}
                </Badge>
                
                {/* Conversion Flow Visual */}
                <div className="mt-4 p-4 rounded-lg bg-background/50 border border-border">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Lógica de Conversión</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                      <div className="text-xs text-blue-400 mb-1">Unidad de Compra</div>
                      <div className="font-oswald font-bold text-lg text-blue-300">
                        {conversionAnalysis.data.ingredient?.purchase_quantity} {conversionAnalysis.data.ingredient?.purchase_unit}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatMoney(conversionAnalysis.data.ingredient?.purchase_cost)}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center">
                      <ChevronRight size={24} className="text-emerald-500" />
                      <div className="text-[10px] text-emerald-400 font-mono">
                        ×{conversionAnalysis.data.ingredient?.conversion_factor}
                      </div>
                    </div>
                    
                    <div className="text-center p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <div className="text-xs text-emerald-400 mb-1">Unidad de Despacho (Base)</div>
                      <div className="font-oswald font-bold text-lg text-emerald-300">
                        {conversionAnalysis.data.ingredient?.dispatch_quantity} {conversionAnalysis.data.ingredient?.dispatch_unit}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatMoney(conversionAnalysis.data.ingredient?.dispatch_unit_cost)} c/u
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-2 rounded bg-muted/50 text-xs text-center text-muted-foreground">
                    <strong className="text-foreground">{conversionAnalysis.data.ingredient?.conversion_explanation}</strong>
                  </div>
                </div>
              </div>
              
              {/* Linked Products Section */}
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-oswald font-bold flex items-center gap-2">
                    <FileText size={16} className="text-primary" />
                    Productos Vinculados ({conversionAnalysis.data.linked_products_count})
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    Impacto Total: {formatMoney(conversionAnalysis.data.total_cost_impact)}
                  </Badge>
                </div>
                
                {conversionAnalysis.data.linked_recipes?.length > 0 ? (
                  <div className="space-y-2">
                    {conversionAnalysis.data.linked_recipes.map((recipe, idx) => (
                      <div 
                        key={recipe.recipe_id || idx}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
                      >
                        <div className="flex-1">
                          <div className="font-medium">{recipe.product_name}</div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Package size={10} />
                              {recipe.quantity_used} {recipe.unit}
                            </span>
                            {recipe.waste_percentage > 0 && (
                              <span className="text-amber-500">
                                +{recipe.waste_percentage}% merma
                              </span>
                            )}
                            <span className="text-muted-foreground/60">
                              PVP: {formatMoney(recipe.product_price)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-oswald font-bold text-emerald-400">
                            {formatMoney(recipe.cost_with_waste)}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {formatMoney(recipe.cost_per_unit)} × {recipe.quantity_used}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Este insumo no está vinculado a ninguna receta</p>
                    <p className="text-xs mt-1">Ve a la pestaña "Recetas" para crear un vínculo</p>
                  </div>
                )}
              </div>
              
              {/* Cost Formula Explanation */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-amber-400 mb-1">Fórmula de Costo Dinámico:</p>
                    <p className="text-muted-foreground font-mono">
                      Costo = (Costo Compra ÷ Factor) × Cantidad en Receta × (1 + Merma%)
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Ejemplo: ({formatMoney(conversionAnalysis.data.ingredient?.purchase_cost)} ÷ {conversionAnalysis.data.ingredient?.conversion_factor}) × Cantidad × (1 + Merma%)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay datos disponibles</p>
            </div>
          )}
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

      {/* Difference Dialog */}
      <Dialog open={differenceDialog.open} onOpenChange={(o) => !o && setDifferenceDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" /> Registrar Diferencia de Inventario
            </DialogTitle>
          </DialogHeader>
          {differenceDialog.data && (
            <div className="space-y-4">
              {/* Ingredient Info */}
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="font-medium">{differenceDialog.data.ingredient_name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {differenceDialog.data.warehouse_name} • Stock actual: {differenceDialog.data.stock_detailed}
                </div>
              </div>
              
              {/* Difference Type */}
              <div>
                <label className="text-sm font-medium">Tipo de Diferencia</label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={differenceDialog.data.difference_type === 'faltante' ? 'default' : 'outline'}
                    className={differenceDialog.data.difference_type === 'faltante' ? 'bg-red-600 hover:bg-red-500' : ''}
                    onClick={() => setDifferenceDialog(p => ({ ...p, data: { ...p.data, difference_type: 'faltante' } }))}
                  >
                    <TrendingDown size={14} className="mr-1" /> Faltante
                  </Button>
                  <Button
                    variant={differenceDialog.data.difference_type === 'sobrante' ? 'default' : 'outline'}
                    className={differenceDialog.data.difference_type === 'sobrante' ? 'bg-green-600 hover:bg-green-500' : ''}
                    onClick={() => setDifferenceDialog(p => ({ ...p, data: { ...p.data, difference_type: 'sobrante' } }))}
                  >
                    <ChevronRight size={14} className="mr-1" /> Sobrante
                  </Button>
                </div>
              </div>
              
              {/* Quantity and Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Cantidad</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={differenceDialog.data.quantity || ''}
                    onChange={e => setDifferenceDialog(p => ({ ...p, data: { ...p.data, quantity: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    placeholder="Ej: 2"
                    data-testid="difference-quantity-input"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Unidad de Entrada</label>
                  <select
                    value={differenceDialog.data.input_unit}
                    onChange={e => setDifferenceDialog(p => ({ ...p, data: { ...p.data, input_unit: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    data-testid="difference-unit-select"
                  >
                    <option value={differenceDialog.data.dispatch_unit}>
                      {differenceDialog.data.dispatch_unit} (Despacho)
                    </option>
                    {differenceDialog.data.purchase_unit !== differenceDialog.data.dispatch_unit && (
                      <option value={differenceDialog.data.purchase_unit}>
                        {differenceDialog.data.purchase_unit} (Compra)
                      </option>
                    )}
                  </select>
                </div>
              </div>
              
              {/* Auto-calculated monetary value */}
              {differenceDialog.data.quantity > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-amber-400">Valor Monetario Estimado:</span>
                    <span className="font-oswald font-bold text-amber-300">
                      {formatMoney(
                        (differenceDialog.data.input_unit === differenceDialog.data.purchase_unit
                          ? differenceDialog.data.quantity * differenceDialog.data.conversion_factor
                          : differenceDialog.data.quantity
                        ) * differenceDialog.data.dispatch_unit_cost
                      )}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    = {differenceDialog.data.quantity} {differenceDialog.data.input_unit} 
                    {differenceDialog.data.input_unit === differenceDialog.data.purchase_unit && 
                      ` × ${differenceDialog.data.conversion_factor} = ${(differenceDialog.data.quantity * differenceDialog.data.conversion_factor).toFixed(2)} ${differenceDialog.data.dispatch_unit}`
                    }
                    {' '}× {formatMoney(differenceDialog.data.dispatch_unit_cost)}/u
                  </div>
                </div>
              )}
              
              {/* Reason */}
              <div>
                <label className="text-sm font-medium">Razón de la Diferencia *</label>
                <select
                  value={differenceDialog.data.reason}
                  onChange={e => setDifferenceDialog(p => ({ ...p, data: { ...p.data, reason: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="difference-reason-select"
                >
                  <option value="">Seleccionar razón...</option>
                  <option value="Conteo físico">Conteo físico</option>
                  <option value="Error de registro">Error de registro</option>
                  <option value="Producto dañado">Producto dañado</option>
                  <option value="Vencimiento">Vencimiento</option>
                  <option value="Pérdida desconocida">Pérdida desconocida</option>
                  <option value="Robo/Sustracción">Robo/Sustracción</option>
                  <option value="Excedente encontrado">Excedente encontrado</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              
              {/* Observations */}
              <div>
                <label className="text-sm font-medium">Observaciones</label>
                <textarea
                  value={differenceDialog.data.observations || ''}
                  onChange={e => setDifferenceDialog(p => ({ ...p, data: { ...p.data, observations: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  rows={2}
                  placeholder="Detalles adicionales..."
                  data-testid="difference-observations-input"
                />
              </div>
              
              {/* Info about audit */}
              <div className="p-2 rounded bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
                <Info size={12} className="inline mr-1" />
                Esta diferencia quedará registrada con tu nombre ({user?.name}) como Administrador que autoriza.
              </div>
              
              <Button 
                onClick={handleRegisterDifference} 
                className={`w-full font-oswald ${differenceDialog.data.difference_type === 'faltante' ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}
              >
                <Check size={16} className="mr-1" /> Registrar Diferencia
              </Button>
            </div>
          )}
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

      {/* Price History Dialog - Moved to AssistantTab component */}
    </div>
  );
}
