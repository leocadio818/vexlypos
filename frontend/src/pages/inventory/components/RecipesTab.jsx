import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { FileText, Plus, Pencil, Trash2, Save, X, TrendingUp, DollarSign, AlertTriangle, Check, BarChart3, List, ArrowUpDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { recipesAPI, formatMoney } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

export default function RecipesTab({ 
  recipes, 
  products,
  ingredients,
  calculateRecipeCost,
  onRefreshAll 
}) {
  const [recipeDialog, setRecipeDialog] = useState({ open: false, data: null });
  const [marginMode, setMarginMode] = useState('price'); // 'price' or 'margin'
  const [targetMargin, setTargetMargin] = useState(30);
  const [customPrice, setCustomPrice] = useState(0);
  
  // View state: 'list' or 'report'
  const [viewMode, setViewMode] = useState('list');
  const [marginFilter, setMarginFilter] = useState('all'); // 'all', 'critical', 'warning', 'ok'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' = lowest margin first

  // Margin threshold configuration
  const MARGIN_CRITICAL = 15;
  const MARGIN_WARNING = 30;

  // Calculate margin data for all recipes (for report)
  const marginReport = useMemo(() => {
    const data = recipes.map(rec => {
      const cost = calculateRecipeCost(rec);
      const product = products.find(p => p.id === rec.product_id);
      const price = product?.price_a || product?.price || 0;
      const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
      const profit = price - cost;
      
      let status = 'ok';
      if (margin < MARGIN_CRITICAL) status = 'critical';
      else if (margin < MARGIN_WARNING) status = 'warning';
      
      return {
        ...rec,
        cost,
        price,
        margin: Math.round(margin * 10) / 10,
        profit,
        status,
        product
      };
    });
    
    // Filter
    let filtered = data;
    if (marginFilter !== 'all') {
      filtered = data.filter(r => r.status === marginFilter);
    }
    
    // Sort by margin
    filtered.sort((a, b) => sortOrder === 'asc' ? a.margin - b.margin : b.margin - a.margin);
    
    // Summary stats
    const critical = data.filter(r => r.status === 'critical').length;
    const warning = data.filter(r => r.status === 'warning').length;
    const ok = data.filter(r => r.status === 'ok').length;
    const avgMargin = data.length > 0 ? data.reduce((sum, r) => sum + r.margin, 0) / data.length : 0;
    const totalProfit = data.reduce((sum, r) => sum + r.profit, 0);
    
    return {
      items: filtered,
      summary: {
        total: data.length,
        critical,
        warning,
        ok,
        avgMargin: Math.round(avgMargin * 10) / 10,
        totalProfit
      }
    };
  }, [recipes, products, calculateRecipeCost, marginFilter, sortOrder]);

  // Calculate dynamic margin data for current recipe
  const marginData = useMemo(() => {
    if (!recipeDialog.data?.product_id) return null;
    
    const product = products.find(p => p.id === recipeDialog.data.product_id);
    if (!product) return null;

    const cost = calculateRecipeCost(recipeDialog.data);
    const currentPrice = customPrice || product.price_a || product.price || 0;
    
    // Calculate current margin percentage
    const currentMargin = currentPrice > 0 ? ((currentPrice - cost) / currentPrice) * 100 : 0;
    
    // Calculate suggested price based on target margin
    // margin = (price - cost) / price
    // margin * price = price - cost
    // cost = price - margin * price
    // cost = price * (1 - margin)
    // price = cost / (1 - margin)
    const suggestedPrice = targetMargin < 100 ? cost / (1 - targetMargin / 100) : cost;
    
    // Determine color status
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

      // Update product price via API
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
                {marginReport.items.map((item, idx) => (
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
                      No hay recetas {marginFilter !== 'all' ? 'con este filtro' : 'creadas'}
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
        {recipes.map(rec => {
          const cost = calculateRecipeCost(rec);
          const product = products.find(p => p.id === rec.product_id);
          const price = product?.price_a || product?.price || 0;
          const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
          
          // Determine margin status
          let marginStatus = 'ok';
          let marginBadgeClass = 'bg-green-500/20 text-green-400 border-green-500/30';
          if (margin < MARGIN_CRITICAL) {
            marginStatus = 'critical';
            marginBadgeClass = 'bg-red-500/20 text-red-400 border-red-500/30';
          } else if (margin < MARGIN_WARNING) {
            marginStatus = 'warning';
            marginBadgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
          }
          
          return (
            <div 
              key={rec.id} 
              className={`p-4 rounded-xl border bg-card ${marginStatus === 'critical' ? 'border-red-500/50' : marginStatus === 'warning' ? 'border-amber-500/50' : 'border-border'}`}
              data-testid={`recipe-${rec.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-oswald font-bold text-lg flex items-center gap-2">
                    {rec.product_name}
                    <Badge className={`text-xs ${marginBadgeClass}`}>
                      {margin.toFixed(1)}% margen
                    </Badge>
                  </h3>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>Rinde: {rec.yield_quantity} porción(es)</span>
                    <span>•</span>
                    <span>Costo: {formatMoney(cost)}</span>
                    {product && (
                      <>
                        <span>•</span>
                        <span>PVP: {formatMoney(price)}</span>
                        <span>•</span>
                        <span className={margin < MARGIN_CRITICAL ? 'text-red-400' : margin < MARGIN_WARNING ? 'text-amber-400' : 'text-green-400'}>
                          Ganancia: {formatMoney(price - cost)}
                        </span>
                      </>
                    )}
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
          <div className="text-center py-12 text-muted-foreground" data-testid="no-recipes">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay recetas</p>
            <p className="text-sm">Vincula productos de venta con sus ingredientes</p>
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
              <label className="text-sm font-medium">Rinde (porciones)</label>
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
