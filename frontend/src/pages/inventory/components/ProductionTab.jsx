import { useState, useMemo, useEffect } from 'react';
import { notify } from '@/lib/notify';
import { 
  Factory, AlertTriangle, Check, History, Play, Search, X, RefreshCw, BookOpen, Plus, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { productionAPI, recipesAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import RecipeHistoryDialog from './RecipeHistoryDialog';
import { NumericInput } from '@/components/NumericKeypad';

// Searchable ingredient selector for sub-recipe recipes
function SubrecipeIngredientSelect({ ingredients, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = ingredients.find(i => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex-1 text-left px-2 py-1 bg-card border border-border rounded text-sm truncate min-w-0"
        >
          {selected ? selected.name : <span className="text-muted-foreground">Buscar insumo...</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
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
                >
                  {i.name}
                  <span className="ml-auto text-xs text-muted-foreground">{i.unit}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ProductionTab({ 
  ingredients, 
  warehouses,
  getTotalStock,
  onRefreshAll
}) {
  // Production dialog state
  const [productionDialog, setProductionDialog] = useState({ open: false, data: null, checking: false, checkResult: null });
  const [productionHistory, setProductionHistory] = useState([]);
  const [producingItem, setProducingItem] = useState(false);
  
  // Sub-recipe recipe dialog state
  const [recipeDialog, setRecipeDialog] = useState({ open: false, subrecipeId: null, subrecipeName: '', recipeId: null, ingredients: [], yield_quantity: 1, notes: '' });
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [historyDialog, setHistoryDialog] = useState({ open: false, recipeId: null, recipeName: '' });

  // Get non-sub-recipe ingredients (base ingredients only)
  const baseIngredients = useMemo(() => ingredients.filter(i => !i.is_subrecipe), [ingredients]);

  // ─── SUB-RECIPE RECIPE HANDLERS ───
  const handleOpenRecipeDialog = async (subrecipe) => {
    setLoadingRecipe(true);
    try {
      // Check if a recipe already exists for this sub-recipe
      const allRecipes = await recipesAPI.list();
      const existing = allRecipes.data.find(r => r.produces_ingredient_id === subrecipe.id);
      
      if (existing) {
        setRecipeDialog({
          open: true,
          subrecipeId: subrecipe.id,
          subrecipeName: subrecipe.name,
          recipeId: existing.id,
          ingredients: existing.ingredients || [],
          yield_quantity: existing.yield_quantity || 1,
          notes: existing.notes || ''
        });
      } else {
        setRecipeDialog({
          open: true,
          subrecipeId: subrecipe.id,
          subrecipeName: subrecipe.name,
          recipeId: null,
          ingredients: [{ ingredient_id: '', ingredient_name: '', quantity: 1, unit: '', waste_percentage: 0 }],
          yield_quantity: 1,
          notes: ''
        });
      }
    } catch (e) {
      notify.error('Error al cargar receta');
    }
    setLoadingRecipe(false);
  };

  const handleSaveSubrecipeRecipe = async () => {
    const validIngredients = recipeDialog.ingredients.filter(i => i.ingredient_id);
    if (validIngredients.length === 0) {
      notify.error('Agrega al menos un ingrediente base');
      return;
    }
    try {
      const payload = {
        product_id: '',
        product_name: recipeDialog.subrecipeName,
        ingredients: validIngredients,
        yield_quantity: parseFloat(recipeDialog.yield_quantity) || 1,
        notes: recipeDialog.notes,
        is_subrecipe: true,
        produces_ingredient_id: recipeDialog.subrecipeId
      };
      
      if (recipeDialog.recipeId) {
        await recipesAPI.update(recipeDialog.recipeId, payload);
        notify.success('Receta de sub-receta actualizada');
      } else {
        await recipesAPI.create(payload);
        notify.success('Receta de sub-receta creada');
      }
      setRecipeDialog({ open: false, subrecipeId: null, subrecipeName: '', recipeId: null, ingredients: [], yield_quantity: 1, notes: '' });
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error al guardar receta');
    }
  };

  // ─── PRODUCTION HANDLERS ───
  const handleOpenProduction = (ingredient) => {
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
      notify.error('Completa todos los campos');
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
      notify.error(e.response?.data?.detail || 'Error al verificar');
      setProductionDialog(p => ({ ...p, checking: false }));
    }
  };

  const handleProduce = async () => {
    const d = productionDialog.data;
    const check = productionDialog.checkResult;
    if (!check?.can_produce) {
      notify.error('Verifica la disponibilidad primero');
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
        notify.success(`Producido: ${res.data.quantity_produced} ${res.data.unit} de ${res.data.ingredient_name}`);
        setProductionDialog({ open: false, data: null, checking: false, checkResult: null });
        onRefreshAll?.();
        loadProductionHistory();
      } else {
        notify.error(res.data.error || 'Error en producción');
      }
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error al producir');
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

  // Calculate sub-recipes needing production
  // Also calculate recipe-based cost if available
  const subrecipesNeedingProduction = useMemo(() => {
    return ingredients
      .filter(ing => ing.is_subrecipe)
      .map(ing => {
        const totalStock = getTotalStock(ing.id);
        const isLow = totalStock < ing.min_stock;
        const deficit = ing.min_stock - totalStock;
        const suggestedProduction = Math.max(0, Math.ceil(deficit));
        return { ...ing, totalStock, isLow, deficit, suggestedProduction };
      })
      .sort((a, b) => b.deficit - a.deficit);
  }, [ingredients, getTotalStock]);

  // Load recipes for sub-recipes to calculate real costs
  const [subrecipeRecipes, setSubrecipeRecipes] = useState({});
  useEffect(() => {
    const loadRecipes = async () => {
      try {
        const res = await recipesAPI.list();
        const recipeMap = {};
        for (const r of res.data) {
          if (r.produces_ingredient_id) {
            // Calculate real cost per unit from recipe using dispatch_unit_cost
            let totalCost = 0;
            for (const ri of (r.ingredients || [])) {
              const baseIng = ingredients.find(i => i.id === ri.ingredient_id);
              if (baseIng) {
                // Use dispatch_unit_cost which already converts purchase→dispatch units
                const unitCost = baseIng.dispatch_unit_cost || (baseIng.avg_cost / (baseIng.conversion_factor || 1));
                totalCost += unitCost * (ri.quantity || 0);
              }
            }
            const costPerUnit = r.yield_quantity > 0 ? totalCost / r.yield_quantity : 0;
            recipeMap[r.produces_ingredient_id] = { ...r, totalCost, costPerUnit };
          }
        }
        setSubrecipeRecipes(recipeMap);
      } catch (e) {
        console.error('Error loading sub-recipe recipes', e);
      }
    };
    if (ingredients.length > 0) loadRecipes();
  }, [ingredients]);

  const getSubrecipeCostEstimate = (sr) => {
    const recipe = subrecipeRecipes[sr.id];
    if (recipe && recipe.costPerUnit > 0) {
      return recipe.costPerUnit * sr.suggestedProduction;
    }
    return sr.avg_cost * sr.suggestedProduction;
  };

  const urgentItems = subrecipesNeedingProduction.filter(s => s.isLow);
  const okItems = subrecipesNeedingProduction.filter(s => !s.isLow);

  return (
    <div data-testid="production-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-oswald text-lg font-bold">Dashboard de Producción</h2>
          <p className="text-xs text-muted-foreground">Sub-recetas que necesitan ser producidas</p>
        </div>
        <Button variant="outline" onClick={loadProductionHistory} data-testid="load-history-btn">
          <History size={16} className="mr-1" /> Ver Historial
        </Button>
      </div>

      {/* Urgent Production Needed */}
      {urgentItems.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-red-500" size={18} />
            <h3 className="font-oswald text-sm font-bold text-red-500">PRODUCCIÓN URGENTE ({urgentItems.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {urgentItems.map(sr => (
              <div key={sr.id} className="p-4 rounded-xl border-2 border-red-500/50 bg-red-500/10" data-testid={`urgent-item-${sr.id}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <Factory size={20} className="text-red-500" />
                    </div>
                    <div>
                      <h4 className="font-oswald font-bold">{sr.name}</h4>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="text-red-500 font-bold">{sr.totalStock.toFixed(1)}</span>
                        <span>/ Mín.</span>
                        <span>{sr.min_stock} {sr.unit}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="destructive" className="text-xs">Urgente</Badge>
                </div>
                
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Producir: </span>
                    <span className="font-oswald font-bold text-primary">{sr.suggestedProduction} {sr.unit}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Costo aprox: </span>
                    <span className="font-oswald font-bold">{formatMoney(getSubrecipeCostEstimate(sr))}</span>
                  </div>
                </div>
                
                <Button 
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-oswald"
                  onClick={() => handleOpenProduction({ ...sr, suggested: sr.suggestedProduction })}
                  data-testid={`produce-urgent-${sr.id}`}
                >
                  <Play size={14} className="mr-1" /> Producir Ahora
                </Button>
                <Button 
                  variant="outline"
                  className="w-full mt-1"
                  onClick={() => handleOpenRecipeDialog(sr)}
                  disabled={loadingRecipe}
                  data-testid={`recipe-urgent-${sr.id}`}
                >
                  <BookOpen size={14} className="mr-1" /> Definir / Editar Receta
                </Button>
                {subrecipeRecipes[sr.id]?.id && (
                  <Button 
                    variant="ghost"
                    className="w-full mt-1 text-cyan-500"
                    onClick={() => setHistoryDialog({ open: true, recipeId: subrecipeRecipes[sr.id].id, recipeName: sr.name })}
                    data-testid={`history-urgent-${sr.id}`}
                  >
                    <History size={14} className="mr-1" /> Historial de Cambios
                  </Button>
                )}
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
              <div key={sr.id} className="p-4 rounded-xl border border-border bg-card" data-testid={`ok-item-${sr.id}`}>
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
                  <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-500">OK</Badge>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleOpenProduction(sr)}
                    data-testid={`produce-ok-${sr.id}`}
                  >
                    <Factory size={14} className="mr-1" /> Producir
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleOpenRecipeDialog(sr)}
                    disabled={loadingRecipe}
                    data-testid={`recipe-ok-${sr.id}`}
                  >
                    <BookOpen size={14} className="mr-1" /> Receta
                  </Button>
                  {subrecipeRecipes[sr.id]?.id && (
                    <Button 
                      variant="ghost"
                      size="icon"
                      className="text-cyan-500"
                      onClick={() => setHistoryDialog({ open: true, recipeId: subrecipeRecipes[sr.id].id, recipeName: sr.name })}
                      data-testid={`history-ok-${sr.id}`}
                      title="Historial"
                    >
                      <History size={14} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No sub-recipes */}
      {subrecipesNeedingProduction.length === 0 && (
        <div className="text-center py-12 text-muted-foreground" data-testid="no-subrecipes">
          <Factory size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium mb-2">No hay sub-recetas configuradas</p>
          <p className="text-sm">Crea ingredientes de tipo "Sub-receta" en la pestaña Insumos</p>
        </div>
      )}

      {/* Production History */}
      {productionHistory.length > 0 && (
        <div className="mt-8" data-testid="production-history">
          <h3 className="font-oswald text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
            <History size={14} /> Historial de Producción Reciente
          </h3>
          <div className="space-y-2">
            {productionHistory.slice(0, 10).map(prod => (
              <div key={prod.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`history-item-${prod.id}`}>
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
                  <div className="text-xs text-muted-foreground">
                    {new Date(prod.produced_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── PRODUCTION DIALOG ─── */}
      <Dialog open={productionDialog.open} onOpenChange={(o) => !o && setProductionDialog({ open: false, data: null, checking: false, checkResult: null })}>
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
                <NumericInput label="Valor"
                 
                 
                  value={productionDialog.data?.quantity || 1}
                  onChange={e => setProductionDialog(p => ({ 
                    ...p, 
                    data: { ...p.data, quantity: e.target.value },
                    checkResult: null
                  }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="production-quantity-input"
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
                  data-testid="production-warehouse-select"
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
                data-testid="production-notes-input"
              />
            </div>

            {/* Check result */}
            {productionDialog.checkResult && (
              <div className={`p-3 rounded-lg border ${productionDialog.checkResult.can_produce ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`} data-testid="production-check-result">
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
                data-testid="check-production-btn"
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
                data-testid="execute-production-btn"
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

      {/* ─── SUB-RECIPE RECIPE DIALOG ─── */}
      <Dialog open={recipeDialog.open} onOpenChange={(o) => !o && setRecipeDialog({ open: false, subrecipeId: null, subrecipeName: '', recipeId: null, ingredients: [], yield_quantity: 1, notes: '' })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <BookOpen size={20} className="text-purple-500" /> 
              Receta de: {recipeDialog.subrecipeName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Define los ingredientes base que se necesitan para producir <strong>{recipeDialog.subrecipeName}</strong>. 
              Al hacer clic en "Producir", el sistema descontará estos ingredientes del almacén.
            </p>

            {/* Yield */}
            <div>
              <label className="text-sm font-medium">Rendimiento (en unidad de despacho, ej: Onzas)</label>
              <NumericInput label="Valor"
               
               
                value={recipeDialog.yield_quantity}
                onChange={e => setRecipeDialog(p => ({ ...p, yield_quantity: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                data-testid="subrecipe-yield-input"
              />
            </div>

            {/* Ingredients */}
            <div>
              <label className="text-sm font-medium mb-2 block">Ingredientes Base</label>
              <div className="space-y-2">
                {recipeDialog.ingredients.map((ing, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border" data-testid={`subrecipe-ing-${idx}`}>
                    <SubrecipeIngredientSelect
                      ingredients={baseIngredients}
                      value={ing.ingredient_id}
                      onChange={(ingredientId) => {
                        const ingredient = baseIngredients.find(i => i.id === ingredientId);
                        setRecipeDialog(p => ({
                          ...p,
                          ingredients: p.ingredients.map((i, j) => j === idx ? {
                            ...i,
                            ingredient_id: ingredientId,
                            ingredient_name: ingredient?.name || '',
                            unit: ingredient?.unit || i.unit
                          } : i)
                        }));
                      }}
                    />
                    <NumericInput label="Valor"
                     
                     
                      value={ing.quantity}
                      onChange={e => setRecipeDialog(p => ({
                        ...p,
                        ingredients: p.ingredients.map((i, j) => j === idx ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i)
                      }))}
                      className="w-20 px-2 py-1 bg-card border border-border rounded text-sm text-center"
                      placeholder="Cant."
                    />
                    <span className="text-xs text-muted-foreground w-14">{ing.unit || '-'}</span>
                    <button
                      type="button"
                      onClick={() => setRecipeDialog(p => ({
                        ...p,
                        ingredients: p.ingredients.filter((_, j) => j !== idx)
                      }))}
                      className="p-1 text-destructive hover:bg-destructive/10 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setRecipeDialog(p => ({
                  ...p,
                  ingredients: [...p.ingredients, { ingredient_id: '', ingredient_name: '', quantity: 1, unit: '', waste_percentage: 0 }]
                }))}
                data-testid="subrecipe-add-ing-btn"
              >
                <Plus size={14} className="mr-1" /> Agregar Ingrediente
              </Button>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium">Notas</label>
              <input
                type="text"
                value={recipeDialog.notes}
                onChange={e => setRecipeDialog(p => ({ ...p, notes: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                placeholder="Notas opcionales..."
              />
            </div>

            <Button 
              className="w-full font-oswald"
              onClick={handleSaveSubrecipeRecipe}
              data-testid="save-subrecipe-recipe-btn"
            >
              {recipeDialog.recipeId ? 'Actualizar Receta' : 'Guardar Receta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── RECIPE HISTORY DIALOG ─── */}
      <RecipeHistoryDialog
        open={historyDialog.open}
        onOpenChange={(o) => !o && setHistoryDialog({ open: false, recipeId: null, recipeName: '' })}
        recipeId={historyDialog.recipeId}
        recipeName={historyDialog.recipeName}
      />
    </div>
  );
}
