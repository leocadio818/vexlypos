import { useState } from 'react';
import { toast } from 'sonner';
import { 
  Factory, AlertTriangle, Check, History, Play, Search, X, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { productionAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';

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
        setProductionDialog({ open: false, data: null, checking: false, checkResult: null });
        onRefreshAll?.();
        loadProductionHistory();
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

  // Calculate sub-recipes needing production
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
                  data-testid={`produce-urgent-${sr.id}`}
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
                  <Badge variant="secondary" className="text-[10px] bg-green-500/20 text-green-500">OK</Badge>
                </div>
                
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOpenProduction(sr)}
                  data-testid={`produce-ok-${sr.id}`}
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
                  <div className="text-[10px] text-muted-foreground">
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
    </div>
  );
}
