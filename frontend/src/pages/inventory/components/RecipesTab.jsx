import { useState, useMemo } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../../../components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../../../components/ui/command';
import { toast } from 'sonner';
import { 
  FileText, Plus, Pencil, Trash2, Save, X, TrendingUp, DollarSign, 
  AlertTriangle, Check, BarChart3, List, ArrowUpDown, Filter, Search,
  UtensilsCrossed, Coffee, Beer, Cigarette, Soup, Package, History
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { recipesAPI, formatMoney } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import RecipeHistoryDialog from './RecipeHistoryDialog';

// Searchable ingredient selector using Shadcn Combobox pattern
function IngredientSearchSelect({ ingredients, value, onChange, testId }) {
  const [open, setOpen] = useState(false);
  const selected = ingredients.find(i => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          data-testid={testId}
          className="flex-1 text-left px-2 py-1 bg-card border border-border rounded text-sm truncate"
        >
          {selected ? selected.name : <span className="text-muted-foreground">Buscar insumo...</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar insumo..." />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {ingredients.map(i => (
                <CommandItem
                  key={i.id}
                  value={i.name}
                  onSelect={() => { onChange(i.id); setOpen(false); }}
                  data-testid={`ingredient-option-${i.id}`}
                >
                  {i.name}
                  <span className="ml-auto text-[10px] text-muted-foreground">{i.unit}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Menu category configuration
const MENU_CATEGORIES = [
  { id: 'all', label: 'Todas', icon: Package, color: 'bg-muted' },
  { id: 'entradas', label: 'Entradas', icon: Soup, color: 'bg-amber-600' },
  { id: 'platos_fuertes', label: 'Platos Fuertes', icon: UtensilsCrossed, color: 'bg-red-600' },
  { id: 'bebidas', label: 'Bebidas', icon: Coffee, color: 'bg-blue-600' },
  { id: 'licores', label: 'Licores', icon: Beer, color: 'bg-purple-600' },
  { id: 'cigarros', label: 'Cigarros', icon: Cigarette, color: 'bg-gray-600' },
];

// Health filter configuration
const HEALTH_FILTERS = [
  { id: 'all', label: 'Todos', color: 'bg-muted', textColor: '' },
  { id: 'critical', label: 'Críticos', color: 'bg-red-600', textColor: 'text-red-500' },
  { id: 'warning', label: 'Advertencia', color: 'bg-amber-600', textColor: 'text-amber-500' },
  { id: 'ok', label: 'Saludables', color: 'bg-green-600', textColor: 'text-green-500' },
];

export default function RecipesTab({ 
  recipes, 
  products,
  ingredients,
  calculateRecipeCost,
  onRefreshAll 
}) {
  const [recipeDialog, setRecipeDialog] = useState({ open: false, data: null });
  const [marginMode, setMarginMode] = useState('price');
  const [targetMargin, setTargetMargin] = useState(30);
  const [customPrice, setCustomPrice] = useState(0);
  const [historyDialog, setHistoryDialog] = useState({ open: false, recipeId: null, recipeName: '' });
  
  // View state
  const [viewMode, setViewMode] = useState('list');
  const [marginFilter, setMarginFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('asc');
  
  // NEW: Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');

  // Margin threshold configuration
  const MARGIN_CRITICAL = 15;
  const MARGIN_WARNING = 30;

  // Get product category mapping (based on product's category)
  const getRecipeCategory = (recipe) => {
    const product = products.find(p => p.id === recipe.product_id);
    if (!product) return 'otros';
    
    // Map product category names to our filter categories
    const categoryName = product.category_name?.toLowerCase() || '';
    if (categoryName.includes('entrada') || categoryName.includes('aperitivo')) return 'entradas';
    if (categoryName.includes('plato') || categoryName.includes('principal') || categoryName.includes('carne') || categoryName.includes('pollo') || categoryName.includes('pescado') || categoryName.includes('marisco')) return 'platos_fuertes';
    if (categoryName.includes('bebida') || categoryName.includes('refresco') || categoryName.includes('jugo') || categoryName.includes('café') || categoryName.includes('te')) return 'bebidas';
    if (categoryName.includes('licor') || categoryName.includes('cerveza') || categoryName.includes('vino') || categoryName.includes('whisky') || categoryName.includes('ron') || categoryName.includes('trago') || categoryName.includes('cocktail') || categoryName.includes('coctel')) return 'licores';
    if (categoryName.includes('cigarro') || categoryName.includes('tabaco')) return 'cigarros';
    return 'otros';
  };

  // Enhanced margin report with search and filters
  // IMPORTANT: Filter out sub-recipe definitions - those are managed in ProductionTab
  const marginReport = useMemo(() => {
    const data = recipes.filter(rec => !rec.is_subrecipe).map(rec => {
      const cost = calculateRecipeCost(rec);
      const product = products.find(p => p.id === rec.product_id);
      const price = product?.price_a || product?.price || 0;
      const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
      const profit = price - cost;
      
      let status = 'ok';
      if (margin < MARGIN_CRITICAL) status = 'critical';
      else if (margin < MARGIN_WARNING) status = 'warning';
      
      // Get ingredient names for search
      const ingredientNames = rec.ingredients?.map(ing => 
        ing.ingredient_name || ingredients.find(i => i.id === ing.ingredient_id)?.name || ''
      ).join(' ').toLowerCase() || '';
      
      return {
        ...rec,
        cost,
        price,
        margin: Math.round(margin * 10) / 10,
        profit,
        status,
        product,
        category: getRecipeCategory(rec),
        ingredientNames
      };
    });
    
    // Apply filters
    let filtered = data;
    
    // Search filter (name or ingredient)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(r => 
        r.product_name?.toLowerCase().includes(query) ||
        r.ingredientNames.includes(query)
      );
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(r => r.category === categoryFilter);
    }
    
    // Health filter (margin status)
    if (healthFilter !== 'all') {
      filtered = filtered.filter(r => r.status === healthFilter);
    }
    
    // Legacy margin filter (for report view compatibility)
    if (marginFilter !== 'all' && healthFilter === 'all') {
      filtered = filtered.filter(r => r.status === marginFilter);
    }
    
    // Sort by margin
    filtered.sort((a, b) => sortOrder === 'asc' ? a.margin - b.margin : b.margin - a.margin);
    
    // Summary stats (from full data, not filtered)
    const critical = data.filter(r => r.status === 'critical').length;
    const warning = data.filter(r => r.status === 'warning').length;
    const ok = data.filter(r => r.status === 'ok').length;
    const avgMargin = data.length > 0 ? data.reduce((sum, r) => sum + r.margin, 0) / data.length : 0;
    const totalProfit = data.reduce((sum, r) => sum + r.profit, 0);
    
    return {
      items: filtered,
      allItems: data,
      summary: {
        total: data.length,
        filtered: filtered.length,
        critical,
        warning,
        ok,
        avgMargin: Math.round(avgMargin * 10) / 10,
        totalProfit
      }
    };
  }, [recipes, products, ingredients, calculateRecipeCost, searchQuery, categoryFilter, healthFilter, marginFilter, sortOrder]);

  // Calculate dynamic margin data for current recipe
  const marginData = useMemo(() => {
    if (!recipeDialog.data?.product_id) return null;
    
    const product = products.find(p => p.id === recipeDialog.data.product_id);
    if (!product) return null;

    const cost = calculateRecipeCost(recipeDialog.data);
    const currentPrice = customPrice || product.price_a || product.price || 0;
    const currentMargin = currentPrice > 0 ? ((currentPrice - cost) / currentPrice) * 100 : 0;
    const suggestedPrice = targetMargin < 100 ? cost / (1 - targetMargin / 100) : cost;
    
    let status = 'ok';
    let statusColor = 'text-green-500';
    let bgColor = 'bg-green-500/10 border-green-500/30';
    if (currentMargin < MARGIN_CRITICAL) {
      status = 'critical';
      statusColor = 'text-red-500';
      bgColor = 'bg-red-500/10 border-red-500/30';
    } else if (currentMargin < MARGIN_WARNING) {
      status = 'warning';
      statusColor = 'text-amber-500';
      bgColor = 'bg-amber-500/10 border-amber-500/30';
    }

    return {
      cost,
      currentPrice,
      currentMargin: Math.round(currentMargin * 10) / 10,
      suggestedPrice: Math.round(suggestedPrice * 100) / 100,
      status,
      statusColor,
      bgColor,
      profit: currentPrice - cost
    };
  }, [recipeDialog.data, products, calculateRecipeCost, customPrice, targetMargin]);

  // Handle applying suggested price
  const handleApplySuggestedPrice = async () => {
    if (!marginData || !recipeDialog.data?.product_id) return;
    
    try {
      const product = products.find(p => p.id === recipeDialog.data.product_id);
      if (!product) return;

      const API_URL = process.env.REACT_APP_BACKEND_URL || '';
      await fetch(`${API_URL}/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, price_a: marginData.suggestedPrice, price: marginData.suggestedPrice })
      });
      
      setCustomPrice(marginData.suggestedPrice);
      toast.success(`Precio actualizado a ${formatMoney(marginData.suggestedPrice)}`);
      onRefreshAll?.();
    } catch (e) {
      toast.error('Error al actualizar precio');
    }
  };

  // Initialize customPrice when opening dialog
  const openRecipeDialog = (data) => {
    const product = products.find(p => p.id === data?.product_id);
    setCustomPrice(product?.price_a || product?.price || 0);
    setRecipeDialog({ open: true, data });
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setHealthFilter('all');
  };

  // Check if any filter is active
  const hasActiveFilters = searchQuery.trim() || categoryFilter !== 'all' || healthFilter !== 'all';

  // ─── RECIPE HANDLERS ───
  const handleSaveRecipe = async () => {
    const d = recipeDialog.data;
    if (!d?.product_id) { 
      toast.error('Selecciona un producto'); 
      return; 
    }
    if (!d?.ingredients?.length) { 
      toast.error('Agrega al menos un ingrediente'); 
      return; 
    }
    try {
      if (d.id) {
        await recipesAPI.update(d.id, d);
        toast.success('Receta actualizada');
      } else {
        await recipesAPI.create(d);
        toast.success('Receta creada');
      }
      setRecipeDialog({ open: false, data: null });
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (!window.confirm('¿Eliminar receta?')) return;
    try {
      await recipesAPI.delete(id);
      toast.success('Receta eliminada');
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div data-testid="recipes-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-oswald text-lg font-bold">Recetas</h2>
          <p className="text-xs text-muted-foreground">Vincula productos con ingredientes y controla tus márgenes</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="h-8 px-3"
              data-testid="view-list-btn"
            >
              <List size={14} className="mr-1" /> Lista
            </Button>
            <Button
              variant={viewMode === 'report' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('report')}
              className="h-8 px-3"
              data-testid="view-report-btn"
            >
              <BarChart3 size={14} className="mr-1" /> Reporte
            </Button>
          </div>
          <Button 
            onClick={() => openRecipeDialog({ product_id: '', product_name: '', ingredients: [], yield_quantity: 1, notes: '' })}
            className="bg-primary text-primary-foreground font-oswald"
            data-testid="add-recipe-btn"
          >
            <Plus size={16} className="mr-1" /> Nueva Receta
          </Button>
        </div>
      </div>

      {/* ─── SEARCH AND FILTERS BAR ─── */}
      <div className="space-y-3 mb-4">
        {/* Search Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por plato o ingrediente (ej: Churrasco, Camarones)..."
              className="w-full pl-9 pr-9 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              data-testid="recipe-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="clear-search-btn"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Health Filter Buttons */}
          <div className="flex items-center gap-1">
            {HEALTH_FILTERS.map(filter => {
              const isActive = healthFilter === filter.id;
              const count = filter.id === 'all' 
                ? marginReport.summary.total 
                : marginReport.summary[filter.id] || 0;
              
              return (
                <Button
                  key={filter.id}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHealthFilter(healthFilter === filter.id ? 'all' : filter.id)}
                  className={`font-oswald text-xs ${isActive ? filter.color + ' text-white border-transparent' : ''}`}
                  data-testid={`health-filter-${filter.id}`}
                >
                  {filter.id === 'critical' && <AlertTriangle size={12} className="mr-1" />}
                  {filter.id === 'ok' && <Check size={12} className="mr-1" />}
                  {filter.label}
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {MENU_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isActive = categoryFilter === cat.id;
            return (
              <Button
                key={cat.id}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'all' : cat.id)}
                className={`font-oswald text-xs ${isActive ? cat.color + ' text-white border-transparent' : ''}`}
                data-testid={`category-filter-${cat.id}`}
              >
                <Icon size={14} className="mr-1.5" />
                {cat.label}
              </Button>
            );
          })}

          {/* Results counter and clear button */}
          <div className="ml-auto flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground"
                data-testid="clear-all-filters-btn"
              >
                <X size={12} className="mr-1" /> Limpiar filtros
              </Button>
            )}
            <Badge variant="outline" className="font-oswald text-xs">
              {marginReport.summary.filtered} de {marginReport.summary.total} recetas
            </Badge>
          </div>
        </div>
      </div>

      {/* ─── MARGIN REPORT VIEW ─── */}
      {viewMode === 'report' && (
        <div className="space-y-4" data-testid="margin-report">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl bg-card border border-border text-center">
              <div className="text-2xl font-bold font-mono">{marginReport.summary.total}</div>
              <div className="text-xs text-muted-foreground">Total Recetas</div>
            </div>
            <div 
              className={`p-4 rounded-xl text-center cursor-pointer transition-all ${marginFilter === 'critical' ? 'ring-2 ring-red-500' : ''} bg-red-500/10 border border-red-500/30`}
              onClick={() => setMarginFilter(marginFilter === 'critical' ? 'all' : 'critical')}
            >
              <div className="text-2xl font-bold font-mono text-red-500">{marginReport.summary.critical}</div>
              <div className="text-xs text-red-400">Críticas (&lt;{MARGIN_CRITICAL}%)</div>
            </div>
            <div 
              className={`p-4 rounded-xl text-center cursor-pointer transition-all ${marginFilter === 'warning' ? 'ring-2 ring-amber-500' : ''} bg-amber-500/10 border border-amber-500/30`}
              onClick={() => setMarginFilter(marginFilter === 'warning' ? 'all' : 'warning')}
            >
              <div className="text-2xl font-bold font-mono text-amber-500">{marginReport.summary.warning}</div>
              <div className="text-xs text-amber-400">Advertencia (&lt;{MARGIN_WARNING}%)</div>
            </div>
            <div 
              className={`p-4 rounded-xl text-center cursor-pointer transition-all ${marginFilter === 'ok' ? 'ring-2 ring-green-500' : ''} bg-green-500/10 border border-green-500/30`}
              onClick={() => setMarginFilter(marginFilter === 'ok' ? 'all' : 'ok')}
            >
              <div className="text-2xl font-bold font-mono text-green-500">{marginReport.summary.ok}</div>
              <div className="text-xs text-green-400">Saludables (≥{MARGIN_WARNING}%)</div>
            </div>
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-center">
              <div className="text-2xl font-bold font-mono text-cyan-400">{marginReport.summary.avgMargin}%</div>
              <div className="text-xs text-cyan-400">Margen Promedio</div>
            </div>
          </div>

          {/* Filter indicator */}
          {marginFilter !== 'all' && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Filter size={10} className="mr-1" />
                Filtro: {marginFilter === 'critical' ? 'Críticas' : marginFilter === 'warning' ? 'Advertencias' : 'Saludables'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setMarginFilter('all')} className="h-6 px-2 text-xs">
                <X size={12} className="mr-1" /> Limpiar
              </Button>
            </div>
          )}

          {/* Margin Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Producto</th>
                  <th className="text-right p-3 font-medium">Costo</th>
                  <th className="text-right p-3 font-medium">PVP</th>
                  <th 
                    className="text-right p-3 font-medium cursor-pointer hover:text-primary flex items-center justify-end gap-1"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Margen %
                    <ArrowUpDown size={12} />
                  </th>
                  <th className="text-right p-3 font-medium">Ganancia</th>
                  <th className="text-center p-3 font-medium">Estado</th>
                  <th className="text-center p-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {marginReport.items.map((item) => (
                  <tr 
                    key={item.id} 
                    className={`border-t border-border hover:bg-muted/30 transition-colors ${
                      item.status === 'critical' ? 'bg-red-500/5' : 
                      item.status === 'warning' ? 'bg-amber-500/5' : ''
                    }`}
                    data-testid={`margin-row-${item.id}`}
                  >
                    <td className="p-3">
                      <div className="font-medium">{item.product_name}</div>
                      <div className="text-xs text-muted-foreground">{item.ingredients?.length || 0} ingredientes</div>
                    </td>
                    <td className="p-3 text-right font-mono">{formatMoney(item.cost)}</td>
                    <td className="p-3 text-right font-mono">{formatMoney(item.price)}</td>
                    <td className={`p-3 text-right font-mono font-bold ${
                      item.status === 'critical' ? 'text-red-500' :
                      item.status === 'warning' ? 'text-amber-500' : 'text-green-500'
                    }`}>
                      {item.margin}%
                    </td>
                    <td className={`p-3 text-right font-mono ${item.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatMoney(item.profit)}
                    </td>
                    <td className="p-3 text-center">
                      {item.status === 'critical' && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          <AlertTriangle size={10} className="mr-1" /> Crítico
                        </Badge>
                      )}
                      {item.status === 'warning' && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <AlertTriangle size={10} className="mr-1" /> Bajo
                        </Badge>
                      )}
                      {item.status === 'ok' && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          <Check size={10} className="mr-1" /> OK
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRecipeDialog({ ...item })}
                        className="h-7 px-2 text-xs"
                        data-testid={`adjust-price-${item.id}`}
                      >
                        <Pencil size={12} className="mr-1" /> Ajustar
                      </Button>
                    </td>
                  </tr>
                ))}
                {marginReport.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {hasActiveFilters ? (
                        <div>
                          <Search size={32} className="mx-auto mb-2 opacity-30" />
                          <p>No hay recetas con estos filtros</p>
                          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2">
                            Limpiar filtros
                          </Button>
                        </div>
                      ) : (
                        'No hay recetas creadas'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              Crítico: &lt;{MARGIN_CRITICAL}% margen
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              Advertencia: {MARGIN_CRITICAL}-{MARGIN_WARNING}% margen
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              Saludable: ≥{MARGIN_WARNING}% margen
            </span>
          </div>
        </div>
      )}

      {/* ─── LIST VIEW ─── */}
      {viewMode === 'list' && (
        <>
          {/* Recipes List */}
          <div className="space-y-3">
            {marginReport.items.map(rec => {
              const catConfig = MENU_CATEGORIES.find(c => c.id === rec.category) || MENU_CATEGORIES[0];
              const CatIcon = catConfig.icon;
              
              // Determine margin status
              let marginBadgeClass = 'bg-green-500/20 text-green-400 border-green-500/30';
              if (rec.status === 'critical') {
                marginBadgeClass = 'bg-red-500/20 text-red-400 border-red-500/30';
              } else if (rec.status === 'warning') {
                marginBadgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
              }
              
              return (
                <div 
                  key={rec.id} 
                  className={`p-4 rounded-xl border bg-card ${
                    rec.status === 'critical' ? 'border-red-500/50' : 
                    rec.status === 'warning' ? 'border-amber-500/50' : 'border-border'
                  }`}
                  data-testid={`recipe-${rec.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      {/* Category Icon */}
                      <div className={`w-10 h-10 rounded-lg ${catConfig.color} flex items-center justify-center shrink-0`}>
                        <CatIcon size={18} className="text-white" />
                      </div>
                      <div>
                        <h3 className="font-oswald font-bold text-lg flex items-center gap-2 flex-wrap">
                          {rec.product_name}
                          <Badge className={`text-xs ${marginBadgeClass}`}>
                            {rec.margin}% margen
                          </Badge>
                        </h3>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>Rinde: {rec.yield_quantity} {rec.yield_unit || 'unidades'}</span>
                          <span>•</span>
                          <span>Costo: {formatMoney(rec.cost)}</span>
                          <span>•</span>
                          <span>PVP: {formatMoney(rec.price)}</span>
                          <span>•</span>
                          <span className={rec.status === 'critical' ? 'text-red-400' : rec.status === 'warning' ? 'text-amber-400' : 'text-green-400'}>
                            Ganancia: {formatMoney(rec.profit)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => openRecipeDialog({ ...rec })}
                        data-testid={`edit-recipe-${rec.id}`}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDeleteRecipe(rec.id)}
                        data-testid={`delete-recipe-${rec.id}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {rec.ingredients?.map((ing, idx) => {
                      const ingredient = ingredients.find(i => i.id === ing.ingredient_id);
                      // Highlight if matches search
                      const isHighlighted = searchQuery.trim() && 
                        (ing.ingredient_name || ingredient?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
                      
                      return (
                        <div 
                          key={idx} 
                          className={`px-3 py-2 rounded-lg border text-sm ${
                            isHighlighted 
                              ? 'bg-primary/10 border-primary/50' 
                              : 'bg-background border-border/50'
                          }`}
                        >
                          <span className={`font-medium ${isHighlighted ? 'text-primary' : ''}`}>
                            {ing.ingredient_name || ingredient?.name || '?'}
                          </span>
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
            {marginReport.items.length === 0 && (
              <div className="text-center py-12 text-muted-foreground" data-testid="no-recipes">
                {hasActiveFilters ? (
                  <>
                    <Search size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No se encontraron recetas</p>
                    <p className="text-sm mt-1">Intenta con otro término de búsqueda o filtro</p>
                    <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                      Limpiar filtros
                    </Button>
                  </>
                ) : (
                  <>
                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay recetas</p>
                    <p className="text-sm">Vincula productos de venta con sus ingredientes</p>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── RECIPE DIALOG ─── */}
      <Dialog open={recipeDialog.open} onOpenChange={(o) => !o && setRecipeDialog({ open: false, data: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{recipeDialog.data?.id ? 'Editar' : 'Nueva'} Receta</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {recipeDialog.data?.id ? 'Modifica los ingredientes y controla el margen' : 'Vincula un producto con sus ingredientes'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Producto *</label>
              <select
                value={recipeDialog.data?.product_id || ''}
                onChange={e => {
                  const prod = products.find(p => p.id === e.target.value);
                  setCustomPrice(prod?.price_a || prod?.price || 0);
                  setRecipeDialog(p => ({ ...p, data: { ...p.data, product_id: e.target.value, product_name: prod?.name || '' } }));
                }}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="recipe-product-select"
              >
                <option value="">Seleccionar producto...</option>
                {products.filter(p => p.active !== false).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Rendimiento (en unidad de despacho, ej: Onzas)</label>
              <input
                type="number"
                value={recipeDialog.data?.yield_quantity || 1}
                onChange={e => setRecipeDialog(p => ({ ...p, data: { ...p.data, yield_quantity: parseFloat(e.target.value) || 1 } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="recipe-yield-input"
              />
            </div>

            {/* ─── MARGIN CALCULATOR SECTION ─── */}
            {marginData && (
              <div className={`p-4 rounded-xl border ${marginData.bgColor}`} data-testid="margin-calculator">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={18} className={marginData.statusColor} />
                  <h4 className="font-oswald font-medium">Calculadora de Margen</h4>
                  {marginData.status === 'critical' && (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                      <AlertTriangle size={10} className="mr-1" /> Crítico
                    </Badge>
                  )}
                  {marginData.status === 'warning' && (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                      <AlertTriangle size={10} className="mr-1" /> Bajo
                    </Badge>
                  )}
                  {marginData.status === 'ok' && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                      <Check size={10} className="mr-1" /> Saludable
                    </Badge>
                  )}
                </div>

                {/* Cost display */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-2 rounded-lg bg-background/50">
                    <div className="text-xs text-muted-foreground">Costo</div>
                    <div className="font-mono font-bold text-lg">{formatMoney(marginData.cost)}</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-background/50">
                    <div className="text-xs text-muted-foreground">Precio Venta</div>
                    <div className={`font-mono font-bold text-lg ${marginData.statusColor}`}>{formatMoney(marginData.currentPrice)}</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-background/50">
                    <div className="text-xs text-muted-foreground">Ganancia</div>
                    <div className={`font-mono font-bold text-lg ${marginData.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatMoney(marginData.profit)}
                    </div>
                  </div>
                </div>

                {/* Margin controls */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Target Margin Input */}
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp size={12} /> % Margen Deseado
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        value={targetMargin}
                        onChange={e => setTargetMargin(parseFloat(e.target.value) || 0)}
                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-center font-mono"
                        min="0"
                        max="99"
                        step="1"
                        data-testid="target-margin-input"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Precio sugerido: <span className="font-mono text-cyan-400">{formatMoney(marginData.suggestedPrice)}</span>
                    </div>
                  </div>

                  {/* Custom Price Input */}
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign size={12} /> Precio de Venta
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-muted-foreground">RD$</span>
                      <input
                        type="number"
                        value={customPrice}
                        onChange={e => setCustomPrice(parseFloat(e.target.value) || 0)}
                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-center font-mono"
                        min="0"
                        step="0.01"
                        data-testid="custom-price-input"
                      />
                    </div>
                    <div className={`mt-1 text-xs ${marginData.statusColor}`}>
                      Margen actual: <span className="font-mono font-bold">{marginData.currentMargin}%</span>
                    </div>
                  </div>
                </div>

                {/* Apply suggested price button */}
                {Math.abs(marginData.suggestedPrice - marginData.currentPrice) > 0.01 && (
                  <Button
                    onClick={handleApplySuggestedPrice}
                    className="w-full mt-4 bg-cyan-600 hover:bg-cyan-700 text-white font-oswald"
                    data-testid="apply-suggested-price-btn"
                  >
                    <Check size={14} className="mr-1" />
                    Usar precio recomendado ({formatMoney(marginData.suggestedPrice)})
                  </Button>
                )}

                {/* Margin thresholds legend */}
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-muted-foreground">&lt;{MARGIN_CRITICAL}% Crítico</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="text-muted-foreground">&lt;{MARGIN_WARNING}% Advertencia</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-muted-foreground">≥{MARGIN_WARNING}% Saludable</span>
                  </span>
                </div>
              </div>
            )}

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
                  data-testid="add-ingredient-btn"
                >
                  <Plus size={14} className="mr-1" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {(recipeDialog.data?.ingredients || []).map((ing, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border" data-testid={`recipe-ingredient-${idx}`}>
                    <IngredientSearchSelect
                      ingredients={ingredients}
                      value={ing.ingredient_id}
                      onChange={(ingredientId) => {
                        const ingredient = ingredients.find(i => i.id === ingredientId);
                        setRecipeDialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            ingredients: p.data.ingredients.map((i, j) => j === idx ? { 
                              ...i, 
                              ingredient_id: ingredientId,
                              ingredient_name: ingredient?.name || '',
                              unit: ingredient?.unit || i.unit
                            } : i)
                          }
                        }));
                      }}
                      testId={`ingredient-search-${idx}`}
                    />
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
                data-testid="recipe-notes-input"
              />
            </div>

            <Button onClick={handleSaveRecipe} className="w-full bg-primary text-primary-foreground font-oswald" data-testid="save-recipe-btn">
              <Save size={16} className="mr-1" /> Guardar Receta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
