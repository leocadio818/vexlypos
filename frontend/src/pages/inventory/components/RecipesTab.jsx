import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { FileText, Plus, Pencil, Trash2, Save, X, TrendingUp, DollarSign, AlertTriangle, Check } from 'lucide-react';
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

  // Margin threshold configuration
  const MARGIN_CRITICAL = 15;
  const MARGIN_WARNING = 30;

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
        <h2 className="font-oswald text-lg font-bold">Recetas</h2>
        <Button 
          onClick={() => setRecipeDialog({ open: true, data: { product_id: '', product_name: '', ingredients: [], yield_quantity: 1, notes: '' } })}
          className="bg-primary text-primary-foreground font-oswald"
          data-testid="add-recipe-btn"
        >
          <Plus size={16} className="mr-1" /> Nueva Receta
        </Button>
      </div>

      {/* Recipes List */}
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
