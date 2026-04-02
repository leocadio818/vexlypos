import { useState, useEffect } from 'react';
import { 
  DollarSign, Package, Warehouse, RefreshCw, Download, Filter, Search, PieChart, TrendingDown,
  TrendingUp, LineChart, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { reportsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { notify } from '@/lib/notify';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

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

// Colors for pie chart categories
const CATEGORY_COLORS = {
  carnes: '#ef4444',      // red
  licores: '#8b5cf6',     // violet
  lacteos: '#3b82f6',     // blue
  vegetales: '#22c55e',   // green
  frutas: '#f97316',      // orange
  bebidas: '#06b6d4',     // cyan
  condimentos: '#eab308', // yellow
  empaque: '#6b7280',     // gray
  limpieza: '#ec4899',    // pink
  general: '#64748b',     // slate
};

const getCategoryLabel = (category) => {
  const cat = INGREDIENT_CATEGORIES.find(c => c.value === category);
  return cat ? cat.label : category;
};

export default function ValuationTab({ warehouses }) {
  const [valuationData, setValuationData] = useState(null);
  const [valuationFilters, setValuationFilters] = useState({ warehouse_id: '', category: '' });
  const [loadingValuation, setLoadingValuation] = useState(false);
  
  // Trends state
  const [trendsData, setTrendsData] = useState(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState('30d');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

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
      notify.error('Error al cargar valorización de inventario');
    }
    setLoadingValuation(false);
  };

  // Fetch trends data
  const fetchTrendsData = async () => {
    setLoadingTrends(true);
    try {
      const params = { period: trendPeriod };
      if (trendPeriod === 'year') {
        params.year = fiscalYear;
      }
      const res = await reportsAPI.valuationTrends(params);
      setTrendsData(res.data);
    } catch (e) {
      notify.error('Error al cargar tendencias');
    }
    setLoadingTrends(false);
  };

  // Export to Excel
  const exportValuationToExcel = () => {
    if (!valuationData || valuationData.items.length === 0) {
      notify.error('No hay datos para exportar');
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
      
      // Trends sheet (if available)
      if (trendsData && trendsData.daily_valuations) {
        const trendsExport = trendsData.daily_valuations.map(d => ({
          'Fecha': d.date,
          'Valor Total': d.total_value
        }));
        const wsTrends = XLSX.utils.json_to_sheet(trendsExport);
        XLSX.utils.book_append_sheet(wb, wsTrends, 'Tendencias');
      }
      
      XLSX.writeFile(wb, `valorizacion_inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
      notify.success('Valorización exportada a Excel');
    });
  };

  // Custom tooltip for line chart
  const CustomLineTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-emerald-500/30 rounded-lg p-3 shadow-xl">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-oswald font-bold text-emerald-400">
            {formatMoney(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for pie chart
  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-emerald-500/30 rounded-lg p-3 shadow-xl">
          <p className="font-medium">{data.label}</p>
          <p className="text-lg font-oswald font-bold text-emerald-400">
            {formatMoney(data.value)}
          </p>
          <p className="text-sm text-muted-foreground">{data.percentage}%</p>
        </div>
      );
    }
    return null;
  };

  // Load data on mount and when period changes
  useEffect(() => {
    fetchValuationData();
    fetchTrendsData();
  }, []);

  useEffect(() => {
    fetchTrendsData();
  }, [trendPeriod, fiscalYear]);

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
              onClick={() => { fetchValuationData(valuationFilters); fetchTrendsData(); }}
              className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
              disabled={loadingValuation || loadingTrends}
            >
              <RefreshCw size={14} className={`mr-1 ${(loadingValuation || loadingTrends) ? 'animate-spin' : ''}`} /> Actualizar
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
            <div className="flex items-center justify-between">
              <div>
                <div className="text-emerald-300/80 text-sm">Valor Total del Inventario</div>
                <div className="text-4xl font-oswald font-bold text-emerald-100 mt-1">
                  {formatMoney(valuationData.total_value)}
                </div>
                <div className="flex gap-6 mt-2 text-sm text-emerald-200/60">
                  <span>{valuationData.total_items} registros</span>
                  <span>{valuationData.total_ingredients} ingredientes</span>
                </div>
              </div>
              {/* Trend indicator */}
              {trendsData && trendsData.trend && (
                <div className={`text-right ${trendsData.trend.direction === 'up' ? 'text-emerald-400' : trendsData.trend.direction === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                  <div className="flex items-center gap-2 justify-end">
                    {trendsData.trend.direction === 'up' ? <TrendingUp size={24} /> : 
                     trendsData.trend.direction === 'down' ? <TrendingDown size={24} /> : null}
                    <span className="text-2xl font-oswald font-bold">
                      {trendsData.trend.change_pct > 0 ? '+' : ''}{trendsData.trend.change_pct}%
                    </span>
                  </div>
                  <div className="text-sm opacity-70">
                    {trendsData.trend.direction === 'up' ? 'Aumento' : trendsData.trend.direction === 'down' ? 'Disminución' : 'Estable'} vs período anterior
                  </div>
                  <div className="text-xs opacity-50 mt-1">
                    {trendsData.trend.change > 0 ? '+' : ''}{formatMoney(trendsData.trend.change)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      {/* TRENDS SECTION - NEW */}
      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LineChart size={20} className="text-emerald-500" />
            <h3 className="font-oswald font-bold text-lg">Tendencias de Valorización</h3>
          </div>
          
          {/* Period Filter */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-muted-foreground" />
            <div className="flex bg-background border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setTrendPeriod('7d')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  trendPeriod === '7d' 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                data-testid="trend-period-7d"
              >
                7 días
              </button>
              <button
                onClick={() => setTrendPeriod('30d')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-x border-border ${
                  trendPeriod === '30d' 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                data-testid="trend-period-30d"
              >
                30 días
              </button>
              <button
                onClick={() => setTrendPeriod('year')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  trendPeriod === 'year' 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                data-testid="trend-period-year"
              >
                Año Fiscal
              </button>
            </div>
            
            {/* Year selector for fiscal year */}
            {trendPeriod === 'year' && (
              <select
                value={fiscalYear}
                onChange={(e) => setFiscalYear(parseInt(e.target.value))}
                className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                data-testid="fiscal-year-select"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            )}
          </div>
        </div>

        {loadingTrends ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={32} className="animate-spin text-emerald-500" />
          </div>
        ) : trendsData ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Line Chart - Evolución Temporal */}
            <div className="bg-background/50 border border-border/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-emerald-500" />
                <span className="font-oswald font-medium text-sm">Evolución del Capital</span>
              </div>
              <div className="h-[300px] overflow-hidden" data-testid="valuation-line-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart 
                    data={trendsData.daily_valuations}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return trendPeriod === 'year' 
                          ? date.toLocaleDateString('es-DO', { month: 'short' })
                          : date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
                      }}
                      interval={trendPeriod === '7d' ? 0 : trendPeriod === '30d' ? 4 : 'preserveStartEnd'}
                    />
                    <YAxis 
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      width={50}
                    />
                    <Tooltip content={<CustomLineTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="total_value" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      dot={trendPeriod === '7d' ? { fill: '#10b981', strokeWidth: 2, r: 4 } : false}
                      activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
              {trendsData.daily_valuations && trendsData.daily_valuations.length > 0 && (
                <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                  <span>
                    Desde: {new Date(trendsData.start_date).toLocaleDateString('es-DO')}
                  </span>
                  <span>
                    Hasta: {new Date(trendsData.end_date).toLocaleDateString('es-DO')}
                  </span>
                </div>
              )}
            </div>

            {/* Pie Chart - Distribución por Categoría */}
            <div className="bg-background/50 border border-border/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <PieChart size={16} className="text-emerald-500" />
                <span className="font-oswald font-medium text-sm">Distribución por Categoría</span>
              </div>
              <div className="h-[300px]" data-testid="valuation-pie-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={trendsData.category_distribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="label"
                    >
                      {trendsData.category_distribution.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={CATEGORY_COLORS[entry.category] || '#64748b'}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value, entry) => (
                        <span className="text-xs text-muted-foreground">{value}</span>
                      )}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              {/* Category summary below pie */}
              <div className="mt-2 grid grid-cols-2 gap-1">
                {trendsData.category_distribution.slice(0, 4).map((cat) => (
                  <div key={cat.category} className="flex items-center gap-2 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: CATEGORY_COLORS[cat.category] || '#64748b' }}
                    />
                    <span className="text-muted-foreground truncate">{cat.label}</span>
                    <span className="font-medium ml-auto">{cat.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <LineChart size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay datos de tendencias disponibles</p>
          </div>
        )}
      </div>
      {/* ═══════════════════════════════════════════════════════════════════════════════ */}

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-emerald-500" />
          <span className="font-oswald font-medium text-sm">Filtros de Detalle</span>
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
          {/* Desglose por Categoría y Almacén (bars) */}
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
                            className="h-full rounded-full"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: CATEGORY_COLORS[cat] || '#64748b'
                            }}
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
              <table className="w-full text-sm min-w-[700px]" data-testid="valuation-table">
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
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                              Stock Muerto
                            </Badge>
                          )}
                          {item.is_low_stock && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
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
