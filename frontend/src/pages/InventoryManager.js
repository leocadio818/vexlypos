import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  ingredientsAPI, stockAPI, stockMovementsAPI, warehousesAPI, 
  suppliersAPI, recipesAPI, purchaseOrdersAPI, productsAPI, stockAlertsAPI,
  unitDefinitionsAPI
} from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { toast } from 'sonner';
import { 
  Package, Warehouse, Truck, FileText, ArrowLeftRight, AlertTriangle,
  ChevronRight, ArrowLeft, RefreshCw, Mail, Bell, Check, Plus, Save, X,
  Factory, History, Calculator, Info, DollarSign, TrendingDown, Cog
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
import ConfigTab from './inventory/components/ConfigTab';

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

// Helper for category labels (used in Conversion Analysis Dialog)
const getCategoryLabel = (category) => {
  const cat = INGREDIENT_CATEGORIES.find(c => c.value === category);
  return cat ? cat.label : category;
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

  // ─── PURCHASE ORDER HANDLERS (Moved to PurchasesTab component) ───
  // handleSavePO, handleReceivePO, handleUpdatePOStatus, handleDeletePO moved to PurchasesTab

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
            <TabsTrigger value="config" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs">
              <Package size={14} className="mr-1" /> Config
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
              <PurchasesTab
                purchaseOrders={purchaseOrders}
                suppliers={suppliers}
                warehouses={warehouses}
                ingredients={ingredients}
                onRefreshAll={fetchAll}
              />
            </TabsContent>

            {/* ─── VALUATION TAB ─── */}
            <TabsContent value="valuation" className="mt-0">
              <ValuationTab warehouses={warehouses} />
            </TabsContent>

            {/* ─── AUDIT TAB ─── */}
            <TabsContent value="audit" className="mt-0">
              <AuditTab />
            </TabsContent>

            {/* ─── CONFIG TAB ─── */}
            <TabsContent value="config" className="mt-0">
              <ConfigTab />
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

      {/* Purchase Order and Receive PO Dialogs moved to PurchasesTab component */}

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
