import { useState, useEffect } from 'react';
import { notify } from '@/lib/notify';
import { 
  ShoppingCart, TrendingUp, Target, RefreshCw, Search, Check, X, Zap,
  AlertTriangle, ChevronRight, ArrowUpRight, LineChart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { purchasingAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { INGREDIENT_CATEGORIES } from '../constants';

const getCategoryLabel = (value) => {
  const cat = INGREDIENT_CATEGORIES.find(c => c.value === value);
  return cat ? cat.label : value;
};

export default function AssistantTab({ suppliers, warehouses, onRefreshAll, onChangeTab }) {
  // Local state
  const [assistantView, setAssistantView] = useState('suggestions');
  const [loadingAssistant, setLoadingAssistant] = useState(false);
  const [loadingMargins, setLoadingMargins] = useState(false);
  
  // Data states
  const [purchaseSuggestions, setPurchaseSuggestions] = useState({ suggestions: [], summary: {} });
  const [assistantFilters, setAssistantFilters] = useState({ supplier_id: '', warehouse_id: '', include_ok_stock: false });
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const [priceAlerts, setPriceAlerts] = useState({ alerts: [], summary: {} });
  const [marginResults, setMarginResults] = useState({ results: [], summary: {}, critical: [], warning: [] });
  const [priceHistoryDialog, setPriceHistoryDialog] = useState({ open: false, data: null, loading: false });

  // ─── HANDLERS ───
  const fetchPurchaseSuggestions = async (filters = assistantFilters) => {
    setLoadingAssistant(true);
    try {
      const params = {};
      if (filters.supplier_id) params.supplier_id = filters.supplier_id;
      if (filters.warehouse_id) params.warehouse_id = filters.warehouse_id;
      params.include_ok_stock = filters.include_ok_stock;
      
      const res = await purchasingAPI.getSuggestions(params);
      setPurchaseSuggestions(res.data);
      setSelectedSuggestions([]);
    } catch (e) {
      notify.error('Error al cargar sugerencias de compra');
    }
    setLoadingAssistant(false);
  };

  const fetchPriceAlerts = async () => {
    setLoadingAssistant(true);
    try {
      const res = await purchasingAPI.getPriceAlerts();
      setPriceAlerts(res.data);
    } catch (e) {
      notify.error('Error al cargar alertas de precios');
    }
    setLoadingAssistant(false);
  };

  const fetchMarginAnalysis = async () => {
    setLoadingMargins(true);
    try {
      const res = await purchasingAPI.recalculateMargins();
      setMarginResults(res.data);
      notify.success('Márgenes recalculados correctamente');
    } catch (e) {
      notify.error('Error al recalcular márgenes');
    }
    setLoadingMargins(false);
  };

  const loadPriceHistory = async (ingredientId) => {
    setPriceHistoryDialog({ open: true, data: null, loading: true });
    try {
      const res = await purchasingAPI.getIngredientPriceHistory(ingredientId);
      setPriceHistoryDialog({ open: true, data: res.data, loading: false });
    } catch (e) {
      notify.error('Error al cargar historial de precios');
      setPriceHistoryDialog({ open: false, data: null, loading: false });
    }
  };

  const handleGeneratePO = async () => {
    if (selectedSuggestions.length === 0) {
      notify.error('Selecciona al menos un insumo');
      return;
    }
    
    if (!assistantFilters.warehouse_id) {
      notify.error('Selecciona un almacén de destino');
      return;
    }
    
    // Get ONLY selected items
    const selectedItems = purchaseSuggestions.suggestions.filter(s => 
      selectedSuggestions.includes(s.ingredient_id)
    );
    
    // Filter selected items that HAVE a supplier
    const itemsWithSupplier = selectedItems.filter(s => s.default_supplier_id);
    
    if (itemsWithSupplier.length === 0) {
      notify.error('Ninguno de los insumos seleccionados tiene proveedor asignado');
      return;
    }
    
    // Count items without supplier (for warning message later)
    const itemsWithoutSupplier = selectedItems.filter(s => !s.default_supplier_id);
    
    // Group items by supplier_id
    const itemsBySupplier = {};
    itemsWithSupplier.forEach(item => {
      const supplierId = item.default_supplier_id;
      if (!itemsBySupplier[supplierId]) {
        itemsBySupplier[supplierId] = {
          supplier_id: supplierId,
          supplier_name: item.default_supplier_name,
          ingredient_ids: []
        };
      }
      itemsBySupplier[supplierId].ingredient_ids.push(item.ingredient_id);
    });
    
    const supplierGroups = Object.values(itemsBySupplier);
    
    // Generate one PO per supplier
    let successCount = 0;
    let errorCount = 0;
    let totalAmount = 0;
    let totalItems = 0;
    const createdPOs = [];
    
    for (const group of supplierGroups) {
      try {
        const res = await purchasingAPI.generatePO({
          supplier_id: group.supplier_id,
          warehouse_id: assistantFilters.warehouse_id,
          ingredient_ids: group.ingredient_ids,
          notes: 'Generada automáticamente desde Asistente de Compras'
        });
        
        successCount++;
        totalAmount += res.data.total || 0;
        totalItems += res.data.items_count || 0;
        createdPOs.push({
          supplier: group.supplier_name,
          items: res.data.items_count,
          total: res.data.total
        });
      } catch (e) {
        errorCount++;
        console.error(`Error creating PO for supplier ${group.supplier_name}:`, e);
      }
    }
    
    // Build success/error message
    if (successCount > 0) {
      let message = '';
      if (supplierGroups.length === 1) {
        // Single supplier - simple message
        message = `Orden de compra creada con ${totalItems} items por ${formatMoney(totalAmount)}`;
      } else {
        // Multiple suppliers - detailed message
        message = `${successCount} orden(es) de compra creada(s) para ${successCount} proveedor(es) con ${totalItems} items totales por ${formatMoney(totalAmount)}`;
      }
      
      if (itemsWithoutSupplier.length > 0) {
        message += `. ${itemsWithoutSupplier.length} item(s) sin proveedor fueron ignorados.`;
      }
      
      if (errorCount > 0) {
        message += ` ${errorCount} orden(es) fallaron.`;
        notify.warning(message);
      } else {
        notify.success(message);
      }
      
      setSelectedSuggestions([]);
      onRefreshAll?.();
      onChangeTab?.('purchases');
    } else {
      notify.error('No se pudo crear ninguna orden de compra');
    }
  };

  const toggleSuggestionSelection = (ingredientId) => {
    setSelectedSuggestions(prev => 
      prev.includes(ingredientId) 
        ? prev.filter(id => id !== ingredientId)
        : [...prev, ingredientId]
    );
  };

  const selectAllSuggestions = () => {
    const allIds = purchaseSuggestions.suggestions
      .filter(s => s.default_supplier_id === assistantFilters.supplier_id || !assistantFilters.supplier_id)
      .map(s => s.ingredient_id);
    setSelectedSuggestions(allIds);
  };

  const deselectAllSuggestions = () => {
    setSelectedSuggestions([]);
  };

  // Load data on mount
  useEffect(() => {
    fetchPurchaseSuggestions();
    fetchPriceAlerts();
  }, []);

  return (
    <div data-testid="assistant-tab">
      {/* Header with stats */}
      <div className="mb-6 bg-gradient-to-r from-cyan-950/50 via-cyan-900/30 to-cyan-950/50 rounded-xl p-3 sm:p-4 border border-cyan-600/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-oswald text-lg sm:text-xl font-bold text-cyan-400 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" /> Asistente de Compras
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Sugerencias de reorden y control de márgenes
            </p>
          </div>
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            <Button
              variant={assistantView === 'suggestions' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAssistantView('suggestions')}
              className={`text-xs ${assistantView === 'suggestions' ? 'bg-cyan-600 hover:bg-cyan-700' : ''}`}
            >
              <ShoppingCart size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Sugerencias</span>
            </Button>
            <Button
              variant={assistantView === 'alerts' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAssistantView('alerts')}
              className={`text-xs ${assistantView === 'alerts' ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
            >
              <TrendingUp size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Alertas</span>
              {priceAlerts.summary?.total_alerts > 0 && (
                <Badge className="ml-1 bg-red-500 text-white text-xs">{priceAlerts.summary.total_alerts}</Badge>
              )}
            </Button>
            <Button
              variant={assistantView === 'margins' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAssistantView('margins')}
              className={`text-xs ${assistantView === 'margins' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
            >
              <Target size={14} className="mr-1" /> Márgenes
            </Button>
          </div>
        </div>
      </div>

      {/* SUGGESTIONS VIEW */}
      {assistantView === 'suggestions' && (
        <div data-testid="assistant-suggestions-view">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4 p-3 rounded-lg bg-card border border-border">
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground">Proveedor</label>
              <select
                value={assistantFilters.supplier_id}
                onChange={e => setAssistantFilters(f => ({ ...f, supplier_id: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="">Todos proveedores</option>
                {suppliers.filter(s => s.active !== false).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground">Almacén destino</label>
              <select
                value={assistantFilters.warehouse_id}
                onChange={e => setAssistantFilters(f => ({ ...f, warehouse_id: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="">Seleccionar...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col">
                <label className="text-xs text-muted-foreground mb-1">Incluir OK</label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={assistantFilters.include_ok_stock}
                    onCheckedChange={c => setAssistantFilters(f => ({ ...f, include_ok_stock: c }))}
                  />
                  <span className="text-xs">{assistantFilters.include_ok_stock ? 'Sí' : 'No'}</span>
                </div>
              </div>
              <Button
                onClick={() => fetchPurchaseSuggestions(assistantFilters)}
                disabled={loadingAssistant}
                size="sm"
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {loadingAssistant ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Search size={14} className="mr-1" />}
                Buscar
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            <div className="bg-gradient-to-br from-red-950/40 to-red-900/20 rounded-xl p-4 border border-red-600/30">
              <div className="text-2xl font-bold text-red-400">{purchaseSuggestions.summary?.out_of_stock_items || 0}</div>
              <div className="text-xs text-red-300/70">Agotados</div>
            </div>
            <div className="bg-gradient-to-br from-amber-950/40 to-amber-900/20 rounded-xl p-4 border border-amber-600/30">
              <div className="text-2xl font-bold text-amber-400">{purchaseSuggestions.summary?.low_stock_items || 0}</div>
              <div className="text-xs text-amber-300/70">Stock Bajo</div>
            </div>
            <div className="bg-gradient-to-br from-cyan-950/40 to-cyan-900/20 rounded-xl p-4 border border-cyan-600/30">
              <div className="text-2xl font-bold text-cyan-400">{purchaseSuggestions.summary?.total_items || 0}</div>
              <div className="text-xs text-cyan-300/70">Sugerencias</div>
            </div>
            <div className="bg-gradient-to-br from-green-950/40 to-green-900/20 rounded-xl p-4 border border-green-600/30">
              <div className="text-2xl font-bold text-green-400">{formatMoney(purchaseSuggestions.summary?.estimated_total || 0)}</div>
              <div className="text-xs text-green-300/70">Total Estimado</div>
            </div>
          </div>

          {/* Action buttons */}
          {purchaseSuggestions.suggestions?.length > 0 && (() => {
            // Calculate unique suppliers for selected items
            const selectedItems = purchaseSuggestions.suggestions.filter(s => 
              selectedSuggestions.includes(s.ingredient_id)
            );
            const uniqueSuppliers = new Set(
              selectedItems
                .filter(s => s.default_supplier_id)
                .map(s => s.default_supplier_id)
            );
            const supplierCount = uniqueSuppliers.size;
            const itemsWithoutSupplier = selectedItems.filter(s => !s.default_supplier_id).length;
            
            return (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllSuggestions}>
                    <Check size={12} className="mr-1" /> Todo
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAllSuggestions}>
                    <X size={12} className="mr-1" /> Ninguno
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedSuggestions.length > 0 && supplierCount > 1 && (
                    <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-full border border-cyan-500/30">
                      {supplierCount} proveedores = {supplierCount} OCs
                    </span>
                  )}
                  {itemsWithoutSupplier > 0 && (
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/30">
                      {itemsWithoutSupplier} sin proveedor
                    </span>
                  )}
                  <Button
                    onClick={handleGeneratePO}
                    disabled={selectedSuggestions.length === 0 || !assistantFilters.warehouse_id}
                    className="bg-green-600 hover:bg-green-700 text-white font-oswald"
                    data-testid="generate-po-btn"
                  >
                    <Zap size={14} className="mr-1" />
                    Generar OC ({selectedSuggestions.length} items{supplierCount > 1 ? `, ${supplierCount} prov.` : ''})
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Suggestions table */}
          {loadingAssistant ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
              Cargando sugerencias...
            </div>
          ) : purchaseSuggestions.suggestions?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
              No hay sugerencias de compra
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-cyan-900/30">
                  <tr>
                    <th className="px-3 py-2 text-left w-10"></th>
                    <th className="px-3 py-2 text-left font-oswald">Insumo</th>
                    <th className="px-3 py-2 text-left font-oswald">Proveedor</th>
                    <th className="px-3 py-2 text-center font-oswald">Stock</th>
                    <th className="px-3 py-2 text-center font-oswald">Días</th>
                    <th className="px-3 py-2 text-center font-oswald">Sugerido</th>
                    <th className="px-3 py-2 text-right font-oswald">Precio Unit.</th>
                    <th className="px-3 py-2 text-right font-oswald">Total Est.</th>
                    <th className="px-3 py-2 text-center font-oswald">Historial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchaseSuggestions.suggestions.map((s, idx) => (
                    <tr 
                      key={s.ingredient_id} 
                      className={`hover:bg-cyan-500/5 transition-colors ${selectedSuggestions.includes(s.ingredient_id) ? 'bg-cyan-500/10' : ''} ${s.is_out_of_stock ? 'bg-red-500/5' : s.is_low_stock ? 'bg-amber-500/5' : ''}`}
                      data-testid={`suggestion-row-${idx}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedSuggestions.includes(s.ingredient_id)}
                          onChange={() => toggleSuggestionSelection(s.ingredient_id)}
                          className="w-4 h-4 rounded border-border"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{s.ingredient_name}</div>
                        <div className="text-xs text-muted-foreground">{getCategoryLabel(s.category)}</div>
                      </td>
                      <td className="px-3 py-2">
                        {s.default_supplier_name ? (
                          <Badge variant="outline">{s.default_supplier_name}</Badge>
                        ) : (
                          <span className="text-xs text-red-400">Sin proveedor</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className={`font-mono ${s.is_out_of_stock ? 'text-red-500' : s.is_low_stock ? 'text-amber-500' : 'text-green-500'}`}>
                          {s.current_stock.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">{s.dispatch_unit}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={s.days_of_stock < 7 ? 'bg-red-500/20 text-red-400' : s.days_of_stock < 14 ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}>
                          {s.days_of_stock >= 999 ? '∞' : `${s.days_of_stock.toFixed(0)}d`}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="font-bold text-cyan-400">{s.suggested_purchase_units}</div>
                        <div className="text-xs text-muted-foreground">{s.purchase_unit}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(s.last_unit_price)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-cyan-400">{formatMoney(s.estimated_total)}</td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadPriceHistory(s.ingredient_id)}
                          className="text-cyan-400 hover:bg-cyan-500/20"
                        >
                          <LineChart size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PRICE ALERTS VIEW */}
      {assistantView === 'alerts' && (
        <div data-testid="assistant-alerts-view">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-oswald text-lg flex items-center gap-2 text-orange-400">
              <TrendingUp size={20} /> Alertas de Aumento de Precios
            </h3>
            <Button onClick={fetchPriceAlerts} disabled={loadingAssistant} variant="outline" size="sm">
              <RefreshCw size={14} className={`mr-1 ${loadingAssistant ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
          </div>

          {priceAlerts.alerts?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Check size={48} className="mx-auto mb-3 text-green-500" />
              <p className="text-lg font-medium text-green-400">¡No hay alertas de precios!</p>
              <p className="text-sm">Todos los precios están estables</p>
            </div>
          ) : (
            <div className="space-y-3">
              {priceAlerts.alerts.map((alert, idx) => (
                <div 
                  key={alert.ingredient_id}
                  className="p-4 rounded-xl bg-gradient-to-r from-orange-950/30 to-red-950/30 border border-orange-600/30"
                  data-testid={`price-alert-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-600/20 flex items-center justify-center">
                          <ArrowUpRight size={20} className="text-orange-500" />
                        </div>
                        <div>
                          <h4 className="font-medium">{alert.ingredient_name}</h4>
                          <span className="text-xs text-muted-foreground">{getCategoryLabel(alert.category)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-red-400 line-through">{formatMoney(alert.previous_price)}</span>
                        <ChevronRight size={14} className="text-orange-500" />
                        <span className="font-mono font-bold text-orange-400">{formatMoney(alert.latest_price)}</span>
                      </div>
                      <Badge className="mt-1 bg-red-500/20 text-red-400 border-red-600/30">
                        +{alert.change_percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  {alert.recipes_affected > 0 && (
                    <div className="mt-2 pt-2 border-t border-orange-600/20 text-sm text-orange-300/70">
                      <AlertTriangle size={12} className="inline mr-1" />
                      Afecta a <strong>{alert.recipes_affected}</strong> receta(s) - Revisar márgenes
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MARGINS VIEW */}
      {assistantView === 'margins' && (
        <div data-testid="assistant-margins-view">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-oswald text-lg flex items-center gap-2 text-purple-400">
              <Target size={20} /> Análisis de Márgenes
            </h3>
            <Button onClick={fetchMarginAnalysis} disabled={loadingMargins} className="bg-purple-600 hover:bg-purple-700">
              <RefreshCw size={14} className={`mr-1 ${loadingMargins ? 'animate-spin' : ''}`} /> Recalcular Márgenes
            </Button>
          </div>

          {/* Margin summary */}
          {marginResults.summary?.total_recipes > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-gradient-to-br from-red-950/40 to-red-900/20 rounded-xl p-4 border border-red-600/30">
                <div className="text-2xl font-bold text-red-400">{marginResults.summary.critical_count || 0}</div>
                <div className="text-xs text-red-300/70">Críticos</div>
              </div>
              <div className="bg-gradient-to-br from-amber-950/40 to-amber-900/20 rounded-xl p-4 border border-amber-600/30">
                <div className="text-2xl font-bold text-amber-400">{marginResults.summary.warning_count || 0}</div>
                <div className="text-xs text-amber-300/70">Advertencia</div>
              </div>
              <div className="bg-gradient-to-br from-green-950/40 to-green-900/20 rounded-xl p-4 border border-green-600/30">
                <div className="text-2xl font-bold text-green-400">{marginResults.summary.ok_count || 0}</div>
                <div className="text-xs text-green-300/70">OK</div>
              </div>
              <div className="bg-gradient-to-br from-purple-950/40 to-purple-900/20 rounded-xl p-4 border border-purple-600/30">
                <div className="text-2xl font-bold text-purple-400">{marginResults.summary.avg_margin?.toFixed(1) || 0}%</div>
                <div className="text-xs text-purple-300/70">Margen Promedio</div>
              </div>
            </div>
          )}

          {loadingMargins ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
              Recalculando márgenes...
            </div>
          ) : marginResults.results?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target size={48} className="mx-auto mb-3 opacity-50" />
              <p className="text-lg">Presiona "Recalcular Márgenes" para analizar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Critical Section */}
              {marginResults.critical?.length > 0 && (
                <div>
                  <h4 className="font-oswald text-sm text-red-400 mb-2 flex items-center gap-1">
                    <AlertTriangle size={14} /> CRÍTICO - Margen muy bajo
                  </h4>
                  <div className="space-y-2">
                    {marginResults.critical.map((r, idx) => (
                      <div 
                        key={r.recipe_id}
                        className="p-3 rounded-lg bg-red-950/30 border border-red-600/30 flex items-center justify-between"
                        data-testid={`margin-critical-${idx}`}
                      >
                        <div>
                          <span className="font-medium">{r.product_name}</span>
                          <div className="text-xs text-muted-foreground mt-1">
                            Costo: {formatMoney(r.cost_per_unit)} | Precio: {formatMoney(r.selling_price)}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-red-500/20 text-red-400 border-red-600/30">
                            {r.margin_percentage.toFixed(1)}%
                          </Badge>
                          <div className="text-xs text-green-400 mt-1">
                            Sugerido: {formatMoney(r.suggested_price)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warning Section */}
              {marginResults.warning?.length > 0 && (
                <div>
                  <h4 className="font-oswald text-sm text-amber-400 mb-2 flex items-center gap-1">
                    <AlertTriangle size={14} /> ADVERTENCIA - Margen bajo umbral
                  </h4>
                  <div className="space-y-2">
                    {marginResults.warning.map((r, idx) => (
                      <div 
                        key={r.recipe_id}
                        className="p-3 rounded-lg bg-amber-950/30 border border-amber-600/30 flex items-center justify-between"
                        data-testid={`margin-warning-${idx}`}
                      >
                        <div>
                          <span className="font-medium">{r.product_name}</span>
                          <div className="text-xs text-muted-foreground mt-1">
                            Costo: {formatMoney(r.cost_per_unit)} | Precio: {formatMoney(r.selling_price)}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-600/30">
                            {r.margin_percentage.toFixed(1)}%
                          </Badge>
                          <div className="text-xs text-green-400 mt-1">
                            Sugerido: {formatMoney(r.suggested_price)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* OK items (collapsed) */}
              {marginResults.summary?.ok_count > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="text-xs text-green-400 flex items-center gap-1">
                    <Check size={12} /> {marginResults.summary.ok_count} producto(s) con márgenes saludables
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Price History Dialog */}
      {priceHistoryDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPriceHistoryDialog({ open: false, data: null, loading: false })}>
          <div className="bg-card rounded-xl p-6 max-w-md w-full mx-4 border border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-oswald text-lg">Historial de Precios</h3>
              <Button variant="ghost" size="sm" onClick={() => setPriceHistoryDialog({ open: false, data: null, loading: false })}>
                <X size={16} />
              </Button>
            </div>
            {priceHistoryDialog.loading ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto" />
              </div>
            ) : priceHistoryDialog.data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Mínimo</div>
                    <div className="font-mono font-bold text-green-400">{formatMoney(priceHistoryDialog.data.stats?.min_price || 0)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Máximo</div>
                    <div className="font-mono font-bold text-red-400">{formatMoney(priceHistoryDialog.data.stats?.max_price || 0)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Promedio</div>
                    <div className="font-mono font-bold text-cyan-400">{formatMoney(priceHistoryDialog.data.stats?.avg_price || 0)}</div>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {priceHistoryDialog.data.history?.map((h, i) => (
                    <div key={i} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                      <span>{new Date(h.date).toLocaleDateString()}</span>
                      <span className="text-muted-foreground">{h.supplier_name}</span>
                      <span className="font-mono">{formatMoney(h.unit_price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Sin datos de historial</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
