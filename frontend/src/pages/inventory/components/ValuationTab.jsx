import { useState, useEffect } from 'react';
import { 
  DollarSign, Package, Warehouse, RefreshCw, Download, Filter, Search, PieChart, TrendingDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { reportsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { toast } from 'sonner';

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

const getCategoryLabel = (category) => {
  const cat = INGREDIENT_CATEGORIES.find(c => c.value === category);
  return cat ? cat.label : category;
};

export default function ValuationTab({ warehouses }) {
  const [valuationData, setValuationData] = useState(null);
  const [valuationFilters, setValuationFilters] = useState({ warehouse_id: '', category: '' });
  const [loadingValuation, setLoadingValuation] = useState(false);

  // Fetch valuation data
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

  // Export to Excel
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

  // Load valuation on mount
  useEffect(() => {
    fetchValuationData();
  }, []);

  return (
    <div data-testid="valuation-tab">
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
              data-testid="apply-valuation-filters-btn"
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
    </div>
  );
}
