import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  ingredientsAPI, stockAPI, stockMovementsAPI, warehousesAPI, 
  suppliersAPI, recipesAPI, purchaseOrdersAPI, productsAPI, stockAlertsAPI, productionAPI,
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
  
  // Search/filter states (ingredients states moved to IngredientsTab)
  const [poStatusFilter, setPOStatusFilter] = useState('');
  
  // Dialog states (ingredientDialog, unitDialog moved to IngredientsTab)
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
  
  // Custom units state (customUnits remains for passing to child, others moved to IngredientsTab)
  const [customUnits, setCustomUnits] = useState([]);
  
  // Audit tab state
  const [allAuditLogs, setAllAuditLogs] = useState([]);
  const [auditStats, setAuditStats] = useState({ total_changes: 0, unique_ingredients: 0, changes_by_field: {} });
  const [auditFilters, setAuditFilters] = useState({ ingredient_name: '', start_date: '', end_date: '', field_changed: '' });
  const [loadingAudit, setLoadingAudit] = useState(false);
  
  // Valuation tab state
  const [valuationData, setValuationData] = useState(null);
  const [valuationFilters, setValuationFilters] = useState({ warehouse_id: '', category: '' });
  const [loadingValuation, setLoadingValuation] = useState(false);
  
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

  // ─── AUDIT HANDLERS ───
  const fetchAuditLogs = async (filters = auditFilters) => {
    setLoadingAudit(true);
    try {
      const params = {};
      if (filters.ingredient_name) params.ingredient_name = filters.ingredient_name;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.field_changed) params.field_changed = filters.field_changed;
      
      const res = await ingredientsAPI.getAllAuditLogs(params);
      setAllAuditLogs(res.data.logs || []);
      setAuditStats(res.data.stats || { total_changes: 0, unique_ingredients: 0, changes_by_field: {} });
    } catch (e) {
      toast.error('Error al cargar historial de auditoría');
    }
    setLoadingAudit(false);
  };

  const exportAuditToExcel = () => {
    if (allAuditLogs.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    
    // Dynamic import xlsx
    import('xlsx').then(XLSX => {
      const exportData = allAuditLogs.map(log => ({
        'Fecha y Hora': new Date(log.timestamp).toLocaleString('es-DO'),
        'Usuario': log.changed_by_name || 'Sistema',
        'ID Usuario': log.changed_by_id || '-',
        'Insumo': log.ingredient_name,
        'Campo Editado': getFieldLabel(log.field_changed),
        'Valor Anterior': log.old_value,
        'Valor Nuevo': log.new_value,
      }));
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Historial de Auditoría');
      
      // Add stats sheet
      const statsData = [
        { 'Métrica': 'Total de Cambios', 'Valor': auditStats.total_changes },
        { 'Métrica': 'Insumos Únicos Afectados', 'Valor': auditStats.unique_ingredients },
        ...Object.entries(auditStats.changes_by_field || {}).map(([field, count]) => ({
          'Métrica': `Cambios en ${getFieldLabel(field)}`,
          'Valor': count
        }))
      ];
      const wsStats = XLSX.utils.json_to_sheet(statsData);
      XLSX.utils.book_append_sheet(wb, wsStats, 'Resumen');
      
      XLSX.writeFile(wb, `auditoria_insumos_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Historial exportado a Excel');
    });
  };

  const getFieldLabel = (field) => {
    const labels = {
      'unit': 'Unidad de Medida',
      'purchase_unit': 'Unidad de Compra',
      'conversion_factor': 'Factor de Conversión',
      'purchase_quantity': 'Cantidad de Compra',
      'dispatch_quantity': 'Equivalencia en Despacho',
      'avg_cost': 'Costo Promedio',
      'name': 'Nombre',
      'category': 'Categoría',
      'min_stock': 'Stock Mínimo',
    };
    return labels[field] || field;
  };

  // Load audit logs when tab changes to audit
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  // ─── VALUATION HANDLERS ───
  const fetchValuationData = async (filters = valuationFilters) => {
    setLoadingValuation(true);
    try {
      const params = {};
      if (filters.warehouse_id) params.warehouse_id = filters.warehouse_id;
      if (filters.category) params.category = filters.category;
      
      const res = await reportsAPI.inventoryValuation(params);
      setValuationData(res.data);
    } catch (e) {
      toast.error('Error al cargar valorización de inventario');
    }
    setLoadingValuation(false);
  };

  const exportValuationToExcel = () => {
    if (!valuationData || valuationData.items.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    
    import('xlsx').then(XLSX => {
      // Main data sheet
      const exportData = valuationData.items.map(item => ({
        'Insumo': item.name,
        'Categoría': getCategoryLabel(item.category),
        'Almacén': item.warehouse_name,
        'Stock Actual': item.current_stock,
        'Unidad': item.unit,
        'Costo Unitario': item.unit_cost,
        'Valor en Stock': item.stock_value,
        'Movimiento (30d)': item.recent_movement,
        'Stock Muerto': item.is_dead_stock ? 'Sí' : 'No',
        'Stock Bajo': item.is_low_stock ? 'Sí' : 'No',
      }));
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Valorización');
      
      // Summary sheet
      const summaryData = [
        { 'Métrica': 'Valor Total del Inventario', 'Valor': formatMoney(valuationData.total_value) },
        { 'Métrica': 'Total de Items', 'Valor': valuationData.total_items },
        { 'Métrica': 'Ingredientes Únicos', 'Valor': valuationData.total_ingredients },
        { 'Métrica': 'Valor Stock Muerto', 'Valor': formatMoney(valuationData.dead_stock?.total_value || 0) },
        { 'Métrica': 'Items Stock Muerto', 'Valor': valuationData.dead_stock?.count || 0 },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');
      
      // By category sheet
      const categoryData = Object.entries(valuationData.by_category || {}).map(([cat, data]) => ({
        'Categoría': getCategoryLabel(cat),
        'Valor': formatMoney(data.value),
        'Items': data.items,
        'Unidades': data.stock_units,
      }));
      const wsCategory = XLSX.utils.json_to_sheet(categoryData);
      XLSX.utils.book_append_sheet(wb, wsCategory, 'Por Categoría');
      
      XLSX.writeFile(wb, `valorizacion_inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Valorización exportada a Excel');
    });
  };

  const getCategoryLabel = (category) => {
    const cat = INGREDIENT_CATEGORIES.find(c => c.value === category);
    return cat ? cat.label : category;
  };

  // Load valuation when tab changes
  useEffect(() => {
    if (activeTab === 'valuation') {
      fetchValuationData();
    }
  }, [activeTab]);

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
        quantity: ingredient.suggested || 1,
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
                onOpenProduction={handleOpenProduction}
                onLoadConversionAnalysis={loadConversionAnalysis}
              />
            </TabsContent>

            {/* ─── PRODUCTION DASHBOARD TAB ─── */}
            <TabsContent value="production" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-oswald text-lg font-bold">Dashboard de Producción</h2>
                  <p className="text-xs text-muted-foreground">Sub-recetas que necesitan ser producidas</p>
                </div>
                <Button variant="outline" onClick={loadProductionHistory}>
                  <History size={16} className="mr-1" /> Ver Historial
                </Button>
              </div>

              {/* Sub-recipes needing production */}
              {(() => {
                const subrecipesNeedingProduction = ingredients
                  .filter(ing => ing.is_subrecipe)
                  .map(ing => {
                    const totalStock = getTotalStock(ing.id);
                    const isLow = totalStock <= ing.min_stock;
                    const deficit = ing.min_stock - totalStock;
                    const suggestedProduction = Math.max(0, Math.ceil(deficit));
                    return { ...ing, totalStock, isLow, deficit, suggestedProduction };
                  })
                  .sort((a, b) => b.deficit - a.deficit);

                const urgentItems = subrecipesNeedingProduction.filter(s => s.isLow);
                const okItems = subrecipesNeedingProduction.filter(s => !s.isLow);

                return (
                  <>
                    {/* Urgent Production Needed */}
                    {urgentItems.length > 0 && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle className="text-red-500" size={18} />
                          <h3 className="font-oswald text-sm font-bold text-red-500">PRODUCCIÓN URGENTE ({urgentItems.length})</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {urgentItems.map(sr => (
                            <div key={sr.id} className="p-4 rounded-xl border-2 border-red-500/50 bg-red-500/10">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                                    <Factory size={20} className="text-red-500" />
                                  </div>
                                  <div>
                                    <h4 className="font-oswald font-bold">{sr.name}</h4>
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                      <span className="text-red-500 font-bold">{sr.totalStock.toFixed(1)}</span>
                                      <span>/</span>
                                      <span>{sr.min_stock} {sr.unit}</span>
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="destructive" className="text-[10px]">Urgente</Badge>
                              </div>
                              
                              <div className="flex items-center justify-between mb-3">
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Producir: </span>
                                  <span className="font-oswald font-bold text-primary">{sr.suggestedProduction} {sr.unit}</span>
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Costo aprox: </span>
                                  <span className="font-oswald font-bold">{formatMoney(sr.avg_cost * sr.suggestedProduction)}</span>
                                </div>
                              </div>
                              
                              <Button 
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-oswald"
                                onClick={() => handleOpenProduction({ ...sr, suggested: sr.suggestedProduction })}
                              >
                                <Play size={14} className="mr-1" /> Producir Ahora
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* OK Items (optional production) */}
                    {okItems.length > 0 && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <Check className="text-green-500" size={18} />
                          <h3 className="font-oswald text-sm font-bold text-green-500">STOCK ADECUADO ({okItems.length})</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {okItems.map(sr => (
                            <div key={sr.id} className="p-4 rounded-xl border border-border bg-card">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                                    <Factory size={20} className="text-green-500" />
                                  </div>
                                  <div>
                                    <h4 className="font-oswald font-bold">{sr.name}</h4>
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                      <span className="text-green-500 font-bold">{sr.totalStock.toFixed(1)}</span>
                                      <span>/</span>
                                      <span>{sr.min_stock} {sr.unit}</span>
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="text-[10px] bg-green-500/20 text-green-500">OK</Badge>
                              </div>
                              
                              <Button 
                                variant="outline"
                                className="w-full"
                                onClick={() => handleOpenProduction(sr)}
                              >
                                <Factory size={14} className="mr-1" /> Producir Más
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No sub-recipes */}
                    {subrecipesNeedingProduction.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Factory size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="font-medium mb-2">No hay sub-recetas configuradas</p>
                        <p className="text-sm">Crea ingredientes de tipo "Sub-receta" en la pestaña Insumos</p>
                      </div>
                    )}

                    {/* Production History */}
                    {productionHistory.length > 0 && (
                      <div className="mt-8">
                        <h3 className="font-oswald text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
                          <History size={14} /> Historial de Producción Reciente
                        </h3>
                        <div className="space-y-2">
                          {productionHistory.slice(0, 10).map(prod => (
                            <div key={prod.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center">
                                  <Factory size={14} className="text-blue-500" />
                                </div>
                                <div>
                                  <span className="font-medium">{prod.ingredient_name}</span>
                                  <div className="text-xs text-muted-foreground">
                                    {prod.quantity_produced} {prod.unit} • {prod.produced_by}
                                    {prod.notes && <span className="ml-1">• {prod.notes}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-oswald font-bold text-primary">{formatMoney(prod.total_cost)}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {new Date(prod.produced_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
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
                <h2 className="font-oswald text-lg font-bold">Stock Multinivel & Diferencias</h2>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => fetchMultilevelStock()}
                    disabled={loadingMultilevel}
                  >
                    <RefreshCw size={16} className={`mr-1 ${loadingMultilevel ? 'animate-spin' : ''}`} /> Actualizar
                  </Button>
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
              {multilevelStock.filter(s => s.is_low_stock).length > 0 && (
                <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-red-500" size={24} />
                    <div>
                      <span className="font-oswald font-bold text-red-500">
                        {multilevelStock.filter(s => s.is_low_stock).length} insumos con stock bajo
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

              {/* Multilevel Stock Table */}
              {loadingMultilevel ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={32} className="animate-spin text-primary" />
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
                  <table className="w-full text-sm" data-testid="multilevel-stock-table">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left font-oswald font-medium">Insumo</th>
                        <th className="px-4 py-3 text-left font-oswald font-medium">Almacén</th>
                        <th className="px-4 py-3 text-left font-oswald font-medium">Stock Detallado</th>
                        <th className="px-4 py-3 text-right font-oswald font-medium">Stock Base</th>
                        <th className="px-4 py-3 text-right font-oswald font-medium">Valor</th>
                        <th className="px-4 py-3 text-center font-oswald font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {multilevelStock.map((item, idx) => (
                        <tr 
                          key={item.id || idx} 
                          className={`hover:bg-muted/30 transition-colors ${item.is_low_stock ? 'bg-red-500/5' : ''}`}
                          data-testid={`stock-row-${idx}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.ingredient_name}</span>
                              {item.is_low_stock && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                                  Stock Bajo
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getCategoryLabel(item.category)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {item.warehouse_name}
                          </td>
                          <td className="px-4 py-3">
                            {/* Multi-level Stock Breakdown */}
                            <div className="flex items-center gap-1">
                              {item.stock_in_purchase_units > 0 && (
                                <>
                                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-oswald font-bold text-sm">
                                    {item.stock_in_purchase_units}
                                  </span>
                                  <span className="text-xs text-blue-400">{item.purchase_unit}</span>
                                  {item.stock_remainder_dispatch > 0 && (
                                    <ChevronRight size={14} className="text-muted-foreground" />
                                  )}
                                </>
                              )}
                              {(item.stock_remainder_dispatch > 0 || item.stock_in_purchase_units === 0) && (
                                <>
                                  <span className={`px-2 py-0.5 rounded font-oswald font-bold text-sm ${item.is_low_stock ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                    {item.stock_remainder_dispatch > 0 ? item.stock_remainder_dispatch.toFixed(2).replace(/\.?0+$/, '') : item.current_stock.toFixed(2).replace(/\.?0+$/, '')}
                                  </span>
                                  <span className={`text-xs ${item.is_low_stock ? 'text-red-400' : 'text-emerald-400'}`}>{item.dispatch_unit}</span>
                                </>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              1 {item.purchase_unit} = {item.conversion_factor} {item.dispatch_unit}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono ${item.is_low_stock ? 'text-red-400' : ''}`}>
                              {item.current_stock.toFixed(2)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">{item.dispatch_unit}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-oswald font-bold text-emerald-400">
                              {formatMoney(item.stock_value)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                              onClick={() => setDifferenceDialog({
                                open: true,
                                data: {
                                  ingredient_id: item.ingredient_id,
                                  ingredient_name: item.ingredient_name,
                                  warehouse_id: item.warehouse_id,
                                  warehouse_name: item.warehouse_name,
                                  purchase_unit: item.purchase_unit,
                                  dispatch_unit: item.dispatch_unit,
                                  conversion_factor: item.conversion_factor,
                                  dispatch_unit_cost: item.dispatch_unit_cost,
                                  current_stock: item.current_stock,
                                  stock_detailed: item.stock_detailed,
                                  quantity: 0,
                                  input_unit: item.dispatch_unit,
                                  difference_type: 'faltante',
                                  reason: '',
                                  observations: ''
                                }
                              })}
                              title="Registrar Diferencia"
                              data-testid={`difference-btn-${idx}`}
                            >
                              <AlertTriangle size={14} className="mr-1" /> Diferencia
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {multilevelStock.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Package size={40} className="mx-auto mb-3 opacity-30" />
                      <p>No hay registros de stock</p>
                    </div>
                  )}
                </div>
              )}

              {/* Recent movements */}
              <div className="mt-8">
                <h3 className="font-oswald text-sm font-bold text-muted-foreground mb-2">Movimientos Recientes</h3>
                <div className="space-y-1">
                  {stockMovements.slice(0, 20).map(mov => {
                    const ing = ingredients.find(i => i.id === mov.ingredient_id);
                    const wh = warehouses.find(w => w.id === mov.warehouse_id);
                    const movType = mov.movement_type === 'waste' ? 'diferencia' : mov.movement_type;
                    return (
                      <div key={mov.id} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-border/50 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant={mov.quantity > 0 ? 'default' : 'destructive'} className="text-[9px]">
                            {movType}
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

      {/* Production Dialog */}
      <Dialog open={productionDialog.open} onOpenChange={(o) => !o && setProductionDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Factory size={20} className="text-blue-500" /> Producir Sub-receta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Sub-recipe info */}
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Factory size={24} className="text-blue-500" />
                </div>
                <div>
                  <h3 className="font-oswald font-bold text-lg">{productionDialog.data?.ingredient_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Stock actual: {getTotalStock(productionDialog.data?.ingredient_id || '').toFixed(2)} {productionDialog.data?.unit}
                  </p>
                </div>
              </div>
            </div>

            {/* Production form */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Cantidad a producir *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={productionDialog.data?.quantity || 1}
                  onChange={e => setProductionDialog(p => ({ 
                    ...p, 
                    data: { ...p.data, quantity: e.target.value },
                    checkResult: null
                  }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Almacén *</label>
                <select
                  value={productionDialog.data?.warehouse_id || ''}
                  onChange={e => setProductionDialog(p => ({ 
                    ...p, 
                    data: { ...p.data, warehouse_id: e.target.value },
                    checkResult: null
                  }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Notas (opcional)</label>
              <input
                type="text"
                value={productionDialog.data?.notes || ''}
                onChange={e => setProductionDialog(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="Ej: Lote #123"
              />
            </div>

            {/* Check result */}
            {productionDialog.checkResult && (
              <div className={`p-3 rounded-lg border ${productionDialog.checkResult.can_produce ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                {productionDialog.checkResult.can_produce ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Check size={16} className="text-green-500" />
                      <span className="font-medium text-green-500">Disponible para producir</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p>Cantidad: <strong>{productionDialog.checkResult.quantity_to_produce} {productionDialog.checkResult.unit}</strong></p>
                      <p>Costo de producción: <strong className="text-primary">{formatMoney(productionDialog.checkResult.production_cost)}</strong></p>
                      <p className="text-xs text-muted-foreground">({formatMoney(productionDialog.checkResult.cost_per_unit)} por {productionDialog.checkResult.unit})</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <X size={16} className="text-red-500" />
                      <span className="font-medium text-red-500">Ingredientes insuficientes</span>
                    </div>
                    <ul className="text-sm space-y-1">
                      {productionDialog.checkResult.missing_ingredients?.map((m, idx) => (
                        <li key={idx} className="text-red-400">
                          • {m.name}: necesita {m.required?.toFixed(2)}, tiene {m.available?.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleCheckProduction}
                disabled={productionDialog.checking}
              >
                {productionDialog.checking ? (
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                ) : (
                  <Search size={14} className="mr-1" />
                )}
                Verificar
              </Button>
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-oswald"
                onClick={handleProduce}
                disabled={!productionDialog.checkResult?.can_produce || producingItem}
              >
                {producingItem ? (
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                ) : (
                  <Play size={14} className="mr-1" />
                )}
                Producir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog - Moved to AssistantTab component */}
    </div>
  );
}
