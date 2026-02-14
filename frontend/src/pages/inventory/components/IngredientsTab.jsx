import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Package, Plus, Pencil, Trash2, Search, X, Save, Calculator, 
  ArrowLeftRight, AlertTriangle, FileText, History, Factory, Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ingredientsAPI, unitDefinitionsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { INGREDIENT_CATEGORIES, UNITS } from '../constants';

const getCategoryLabel = (value) => {
  const cat = INGREDIENT_CATEGORIES.find(c => c.value === value);
  return cat ? cat.label : value;
};

export default function IngredientsTab({ 
  ingredients, 
  suppliers,
  customUnits,
  getTotalStock,
  onRefreshAll,
  onNavigateToProduction,
  onLoadConversionAnalysis
}) {
  // Search/filter states
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ingredientCategory, setIngredientCategory] = useState('');
  
  // Dialog states
  const [ingredientDialog, setIngredientDialog] = useState({ open: false, data: null });
  const [unitDialog, setUnitDialog] = useState({ open: false, data: null });
  const [showUnitsManager, setShowUnitsManager] = useState(false);
  
  // Validation state - tracks which fields have been touched/attempted to save
  const [validationAttempted, setValidationAttempted] = useState(false);
  
  // Audit states
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [affectedRecipes, setAffectedRecipes] = useState({ count: 0, recipes: [] });

  // Validation helper - checks if all required fields are filled
  const validateIngredient = (data) => {
    const errors = {};
    
    if (!data?.name?.trim()) {
      errors.name = 'El nombre es obligatorio';
    }
    if (!data?.category) {
      errors.category = 'Selecciona una categoría';
    }
    if (!data?.unit) {
      errors.unit = 'Selecciona la unidad de despacho';
    }
    if (!data?.purchase_unit && !data?.unit) {
      errors.purchase_unit = 'Selecciona la unidad de compra';
    }
    if (!data?.dispatch_quantity || data.dispatch_quantity <= 0) {
      errors.dispatch_quantity = 'Completa la equivalencia de conversión';
    }
    if (data?.min_stock === undefined || data?.min_stock === null || data?.min_stock < 0) {
      errors.min_stock = 'Ingresa el stock mínimo';
    }
    if (!data?.avg_cost && data?.avg_cost !== 0 && !data?.is_subrecipe) {
      errors.avg_cost = 'Ingresa el costo promedio de compra';
    }
    if (!data?.default_supplier_id) {
      errors.default_supplier_id = 'Selecciona un proveedor predeterminado';
    }
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  };

  // Get current validation state
  const currentValidation = validateIngredient(ingredientDialog.data);

  // Filter ingredients

  // Filter ingredients
  const filteredIngredients = ingredients.filter(ing => {
    const matchSearch = !ingredientSearch || 
      ing.name.toLowerCase().includes(ingredientSearch.toLowerCase());
    const matchCategory = !ingredientCategory || ing.category === ingredientCategory;
    return matchSearch && matchCategory;
  });

  // Check affected recipes when conversion factor changes
  const checkAffectedRecipes = useCallback(async (ingredientId) => {
    if (!ingredientId) return;
    try {
      const res = await ingredientsAPI.getAffectedRecipes(ingredientId);
      setAffectedRecipes(res.data);
    } catch (e) {
      console.error('Error fetching affected recipes:', e);
    }
  }, []);

  // Load audit history for ingredient
  const loadAuditHistory = async (ingredientId) => {
    if (!ingredientId) return;
    try {
      const res = await ingredientsAPI.getAuditLogs(ingredientId);
      setAuditLogs(res.data || []);
      setShowAuditHistory(true);
    } catch (e) {
      toast.error('Error al cargar historial');
    }
  };

  // ─── INGREDIENT HANDLERS ───
  const handleSaveIngredient = async () => {
    const d = ingredientDialog.data;
    
    // Mark validation as attempted to show errors
    setValidationAttempted(true);
    
    // Validate all fields
    const validation = validateIngredient(d);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError);
      return;
    }
    
    const saveData = {
      ...d,
      purchase_unit: d.purchase_unit || d.unit,
      purchase_quantity: d.purchase_quantity || 1,
      dispatch_quantity: d.dispatch_quantity || 1,
      conversion_factor: d.conversion_factor || 1,
    };
    
    try {
      if (d.id) {
        const res = await ingredientsAPI.update(d.id, saveData);
        toast.success(`Ingrediente actualizado${res.data?.audit_logs_created > 0 ? ' (cambios registrados en auditoría)' : ''}`);
      } else {
        await ingredientsAPI.create(saveData);
        toast.success('Ingrediente creado');
      }
      setIngredientDialog({ open: false, data: null });
      setAffectedRecipes({ count: 0, recipes: [] });
      setShowAuditHistory(false);
      setValidationAttempted(false);
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteIngredient = async (id) => {
    if (!window.confirm('¿Eliminar ingrediente?')) return;
    try {
      await ingredientsAPI.delete(id);
      toast.success('Ingrediente eliminado');
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── CUSTOM UNITS HANDLERS ───
  const handleSaveUnit = async () => {
    const d = unitDialog.data;
    if (!d?.name?.trim()) { toast.error('Nombre requerido'); return; }
    if (!d?.abbreviation?.trim()) { toast.error('Abreviatura requerida'); return; }
    try {
      if (d.id) {
        const res = await unitDefinitionsAPI.update(d.id, d);
        const updated = res.data?.ingredients_updated || 0;
        toast.success(`Unidad actualizada${updated > 0 ? `. ${updated} ingrediente(s) actualizados automáticamente.` : ''}`);
      } else {
        await unitDefinitionsAPI.create(d);
        toast.success('Unidad creada');
      }
      setUnitDialog({ open: false, data: null });
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteUnit = async (id) => {
    if (!window.confirm('¿Eliminar unidad? Solo se puede eliminar si no está en uso.')) return;
    try {
      await unitDefinitionsAPI.delete(id);
      toast.success('Unidad eliminada');
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div data-testid="ingredients-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-lg font-bold">Insumos / Ingredientes</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setShowUnitsManager(!showUnitsManager)}
            className="font-oswald text-xs"
            data-testid="manage-units-btn"
          >
            <ArrowLeftRight size={14} className="mr-1" /> Gestionar Unidades
          </Button>
          <Button 
            onClick={() => setIngredientDialog({ open: true, data: { name: '', unit: 'unidad', category: 'general', min_stock: 0, avg_cost: 0, purchase_unit: '', purchase_quantity: 1, dispatch_quantity: 1, conversion_factor: 1 } })}
            className="bg-primary text-primary-foreground font-oswald"
            data-testid="add-ingredient-btn"
          >
            <Plus size={16} className="mr-1" /> Nuevo Insumo
          </Button>
        </div>
      </div>
      
      {/* Units Manager Panel */}
      {showUnitsManager && (
        <div className="mb-4 p-4 rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={16} className="text-primary" />
              <h3 className="font-oswald font-bold">Unidades de Medida Personalizadas</h3>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setUnitDialog({ open: true, data: { name: '', abbreviation: '', category: 'custom' } })}
                className="bg-primary text-primary-foreground font-oswald text-xs"
                data-testid="add-unit-btn"
              >
                <Plus size={12} className="mr-1" /> Nueva Unidad
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowUnitsManager(false)}>
                <X size={14} />
              </Button>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground mb-3">
            Crea unidades personalizadas. Al renombrar una unidad, el cambio se reflejará automáticamente en todos los insumos vinculados.
          </p>
          
          {/* System units info */}
          <div className="mb-3 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
            <strong>Unidades del sistema:</strong> {UNITS.map(u => u.label).join(', ')}
          </div>
          
          {/* Custom units list */}
          {customUnits.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No hay unidades personalizadas. Crea una para empezar.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {customUnits.map(unit => (
                <div 
                  key={unit.id} 
                  className="flex items-center justify-between p-2 rounded-lg border border-border bg-background"
                  data-testid={`custom-unit-${unit.id}`}
                >
                  <div>
                    <span className="font-medium text-sm">{unit.name}</span>
                    <Badge variant="secondary" className="ml-2 text-[10px]">{unit.abbreviation}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => setUnitDialog({ open: true, data: { ...unit } })}
                      data-testid={`edit-unit-${unit.id}`}
                    >
                      <Pencil size={12} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteUnit(unit.id)}
                      data-testid={`delete-unit-${unit.id}`}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search and filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={ingredientSearch}
            onChange={e => setIngredientSearch(e.target.value)}
            placeholder="Buscar insumo..."
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm"
            data-testid="ingredient-search"
          />
        </div>
        <select
          value={ingredientCategory}
          onChange={e => setIngredientCategory(e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
        >
          <option value="">Todas las categorías</option>
          {INGREDIENT_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Ingredients list */}
      <div className="space-y-2">
        {filteredIngredients.map(ing => {
          const totalStock = getTotalStock(ing.id);
          const isLow = totalStock <= ing.min_stock;
          return (
            <div 
              key={ing.id} 
              className={`flex items-center justify-between p-3 rounded-xl border ${isLow ? 'border-red-500/50 bg-red-500/10' : ing.is_subrecipe ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-card'}`}
              data-testid={`ingredient-${ing.id}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${ing.is_subrecipe ? 'bg-blue-500/20' : 'bg-primary/10'}`}>
                  {ing.is_subrecipe ? (
                    <FileText size={18} className="text-blue-500" />
                  ) : (
                    <Package size={18} className="text-primary" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{ing.name}</span>
                    <Badge variant="secondary" className="text-[9px]">{ing.unit}</Badge>
                    {ing.is_subrecipe && <Badge className="text-[9px] bg-blue-500">Sub-receta</Badge>}
                    {isLow && <Badge variant="destructive" className="text-[9px]">Stock bajo</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{getCategoryLabel(ing.category)}</span>
                    <span>•</span>
                    <span>Costo: {formatMoney(ing.avg_cost)}</span>
                    {ing.is_subrecipe && ing.cost_updated_at && (
                      <>
                        <span>•</span>
                        <span className="text-blue-400 text-[10px]">Actualizado: {new Date(ing.cost_updated_at).toLocaleDateString()}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>Min: {ing.min_stock} {ing.unit}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className={`font-oswald text-lg font-bold ${isLow ? 'text-red-500' : 'text-primary'}`}>
                    {totalStock.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">{ing.unit}</span>
                </div>
                <div className="flex gap-1">
                  {ing.is_subrecipe && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                      onClick={() => onNavigateToProduction?.()}
                      data-testid={`produce-${ing.id}`}
                      title="Ir a Producción"
                    >
                      <Factory size={14} className="mr-1" /> Producir
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-emerald-500 hover:text-emerald-400"
                    onClick={() => onLoadConversionAnalysis?.(ing.id)}
                    title="Ver Análisis de Conversión"
                    data-testid={`conversion-analysis-btn-${ing.id}`}
                  >
                    <Calculator size={14} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => setIngredientDialog({ open: true, data: { ...ing } })}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDeleteIngredient(ing.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {filteredIngredients.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay insumos</p>
          </div>
        )}
      </div>

      {/* ─── INGREDIENT DIALOG ─── */}
      <Dialog open={ingredientDialog.open} onOpenChange={(o) => {
        if (!o) {
          setIngredientDialog({ open: false, data: null });
          setAffectedRecipes({ count: 0, recipes: [] });
          setShowAuditHistory(false);
          setAuditLogs([]);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              {ingredientDialog.data?.id ? 'Editar' : 'Nuevo'} Insumo
              {ingredientDialog.data?.id && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => loadAuditHistory(ingredientDialog.data.id)}
                  className="ml-auto"
                >
                  <History size={14} className="mr-1" /> Historial
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {/* Audit History Panel */}
          {showAuditHistory && (
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Historial de Cambios</span>
                <Button variant="ghost" size="sm" onClick={() => setShowAuditHistory(false)}>
                  <X size={14} />
                </Button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin cambios registrados</p>
                ) : auditLogs.map((log, i) => (
                  <div key={i} className="text-xs p-2 bg-background rounded border border-border/50">
                    <div className="flex justify-between">
                      <span className="font-medium">{log.field_changed}</span>
                      <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {log.old_value} → {log.new_value}
                    </div>
                    <div className="text-primary text-[10px]">Por: {log.changed_by_name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={ingredientDialog.data?.name || ''}
                onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="ingredient-name-input"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Unidad de Despacho</label>
                <select
                  value={ingredientDialog.data?.unit || 'unidad'}
                  onChange={e => {
                    const newUnit = e.target.value;
                    setIngredientDialog(p => ({ ...p, data: { ...p.data, unit: newUnit } }));
                    if (ingredientDialog.data?.id) checkAffectedRecipes(ingredientDialog.data.id);
                  }}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  {customUnits.map(u => <option key={u.id} value={u.abbreviation}>{u.name} ({u.abbreviation})</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Categoría</label>
                <select
                  value={ingredientDialog.data?.category || 'general'}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, category: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                >
                  {INGREDIENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            
            {/* Conversion Factor Calculator - Human Friendly Version */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-4">
                <ArrowLeftRight size={16} className="text-primary" />
                <span className="font-medium text-sm">Conversión de Unidades</span>
              </div>
              
              {/* Human-readable sentence */}
              <div className="bg-background/60 rounded-lg p-4 border border-border/50 mb-4">
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                  Completa la siguiente oración para configurar la conversión:
                </p>
                
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground">Yo compro por</span>
                  <select
                    value={ingredientDialog.data?.purchase_unit || ingredientDialog.data?.unit || 'unidad'}
                    onChange={e => {
                      const newPurchaseUnit = e.target.value;
                      setIngredientDialog(p => ({ ...p, data: { ...p.data, purchase_unit: newPurchaseUnit } }));
                    }}
                    className="px-2 py-1 text-sm bg-primary/10 border border-primary/30 rounded-md font-medium text-primary min-w-[100px]"
                    data-testid="purchase-unit-select"
                  >
                    {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    {customUnits.map(u => <option key={u.id} value={u.abbreviation}>{u.name}</option>)}
                  </select>
                  
                  <span className="text-foreground">y despacho por</span>
                  <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-md font-medium text-emerald-400">
                    {UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                     customUnits.find(u => u.abbreviation === ingredientDialog.data?.unit)?.name ||
                     ingredientDialog.data?.unit || 'Unidad'}
                  </span>
                </div>
                
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground">Por eso, 1</span>
                  <span className="font-medium text-primary">
                    {UNITS.find(u => u.value === (ingredientDialog.data?.purchase_unit || ingredientDialog.data?.unit))?.label || 
                     ingredientDialog.data?.purchase_unit || 'Unidad'}
                  </span>
                  <span className="text-foreground">trae</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={ingredientDialog.data?.dispatch_quantity || 1}
                    onChange={e => {
                      const dq = parseFloat(e.target.value) || 1;
                      const pq = ingredientDialog.data?.purchase_quantity || 1;
                      const factor = dq / pq;
                      setIngredientDialog(p => ({ 
                        ...p, 
                        data: { ...p.data, dispatch_quantity: dq, conversion_factor: factor } 
                      }));
                      if (ingredientDialog.data?.id) checkAffectedRecipes(ingredientDialog.data.id);
                    }}
                    className="w-20 px-2 py-1 text-sm bg-background border-2 border-primary/50 rounded-md font-bold text-center text-primary focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="16"
                    data-testid="dispatch-quantity-input"
                  />
                  <span className="font-medium text-emerald-400">
                    {UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                     customUnits.find(u => u.abbreviation === ingredientDialog.data?.unit)?.name ||
                     ingredientDialog.data?.unit || 'Unidad'}(s)
                  </span>
                </div>
              </div>
              
              {/* Smart Validation Warnings */}
              {(() => {
                const purchaseUnit = (ingredientDialog.data?.purchase_unit || ingredientDialog.data?.unit || '').toLowerCase();
                const dispatchUnit = (ingredientDialog.data?.unit || '').toLowerCase();
                const qty = ingredientDialog.data?.dispatch_quantity || 1;
                
                // Industry standard validations
                const validations = [];
                
                // Libra to Onza
                if (purchaseUnit === 'lb' && dispatchUnit === 'oz' && qty !== 16) {
                  validations.push({
                    type: 'warning',
                    message: `¿Estás seguro? Normalmente 1 Libra tiene 16 Onzas.`,
                    suggestion: 16
                  });
                }
                
                // Kilogramo to Gramo
                if (purchaseUnit === 'kg' && dispatchUnit === 'g' && qty !== 1000) {
                  validations.push({
                    type: 'warning',
                    message: `¿Estás seguro? Normalmente 1 Kilogramo tiene 1000 Gramos.`,
                    suggestion: 1000
                  });
                }
                
                // Litro to Mililitro
                if (purchaseUnit === 'lt' && dispatchUnit === 'ml' && qty !== 1000) {
                  validations.push({
                    type: 'warning',
                    message: `¿Estás seguro? Normalmente 1 Litro tiene 1000 Mililitros.`,
                    suggestion: 1000
                  });
                }
                
                // Galón to Litro
                if (purchaseUnit === 'gal' && dispatchUnit === 'lt' && qty !== 3.785) {
                  validations.push({
                    type: 'warning',
                    message: `¿Estás seguro? Normalmente 1 Galón tiene 3.785 Litros.`,
                    suggestion: 3.785
                  });
                }
                
                // Botella to Onza (700ml = 23.6oz, 750ml = 25.3oz)
                if (purchaseUnit === 'botella' && dispatchUnit === 'oz' && 
                    qty !== 23.6 && qty !== 25.3 && qty !== 25.4) {
                  validations.push({
                    type: 'info',
                    message: `Verifica la capacidad de la botella. ¿Es de 700ml (23.6 oz) o 750ml (25.3 oz)?`,
                    suggestions: [{ label: '700ml', value: 23.6 }, { label: '750ml', value: 25.3 }]
                  });
                }
                
                // Botella to Mililitro
                if (purchaseUnit === 'botella' && dispatchUnit === 'ml' && 
                    qty !== 700 && qty !== 750 && qty !== 1000) {
                  validations.push({
                    type: 'info',
                    message: `Verifica la capacidad de la botella. ¿Cuántos ml tiene?`,
                    suggestions: [{ label: '700ml', value: 700 }, { label: '750ml', value: 750 }, { label: '1L', value: 1000 }]
                  });
                }
                
                if (validations.length === 0) return null;
                
                return (
                  <div className="space-y-2 mb-4">
                    {validations.map((v, idx) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded-lg border ${
                          v.type === 'warning' 
                            ? 'bg-amber-500/10 border-amber-500/30' 
                            : 'bg-blue-500/10 border-blue-500/30'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${
                            v.type === 'warning' ? 'text-amber-500' : 'text-blue-400'
                          }`} />
                          <div className="flex-1">
                            <p className={`text-xs font-medium ${
                              v.type === 'warning' ? 'text-amber-500' : 'text-blue-400'
                            }`}>
                              {v.message}
                            </p>
                            {v.suggestion && (
                              <button
                                type="button"
                                onClick={() => {
                                  const factor = v.suggestion / (ingredientDialog.data?.purchase_quantity || 1);
                                  setIngredientDialog(p => ({ 
                                    ...p, 
                                    data: { ...p.data, dispatch_quantity: v.suggestion, conversion_factor: factor } 
                                  }));
                                }}
                                className="mt-2 text-xs px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded text-amber-400 transition-colors"
                              >
                                Usar {v.suggestion}
                              </button>
                            )}
                            {v.suggestions && (
                              <div className="flex gap-2 mt-2">
                                {v.suggestions.map((s, sidx) => (
                                  <button
                                    key={sidx}
                                    type="button"
                                    onClick={() => {
                                      const factor = s.value / (ingredientDialog.data?.purchase_quantity || 1);
                                      setIngredientDialog(p => ({ 
                                        ...p, 
                                        data: { ...p.data, dispatch_quantity: s.value, conversion_factor: factor } 
                                      }));
                                    }}
                                    className="text-xs px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded text-blue-400 transition-colors"
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              
              {/* Real Money Result */}
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator size={14} className="text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wide">Resultado en Dinero Real</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  Esto significa que cada{' '}
                  <span className="font-bold text-emerald-400">
                    {UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                     ingredientDialog.data?.unit || 'Unidad'}
                  </span>
                  {ingredientDialog.data?.name && (
                    <span className="text-muted-foreground"> de {ingredientDialog.data.name}</span>
                  )}
                  {' '}te cuesta{' '}
                  <span className="font-oswald font-bold text-lg text-primary">
                    {formatMoney(
                      (ingredientDialog.data?.avg_cost || 0) / (ingredientDialog.data?.conversion_factor || 1)
                    )}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-2 opacity-70">
                  Cálculo: {formatMoney(ingredientDialog.data?.avg_cost || 0)} ÷ {ingredientDialog.data?.dispatch_quantity || 1} = {formatMoney((ingredientDialog.data?.avg_cost || 0) / (ingredientDialog.data?.conversion_factor || 1))} por unidad
                </p>
              </div>
              
              {/* Affected Recipes Warning */}
              {affectedRecipes.count > 0 && (
                <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-600">
                        Este cambio afectará el costo de {affectedRecipes.count} receta(s) vinculada(s)
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {affectedRecipes.recipes.slice(0, 3).map(r => r.product_name).join(', ')}
                        {affectedRecipes.count > 3 && ` y ${affectedRecipes.count - 3} más...`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">
                  Stock Mínimo {ingredientDialog.data?.unit && `(en ${
                    UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                    customUnits.find(u => u.abbreviation === ingredientDialog.data?.unit)?.name ||
                    ingredientDialog.data?.unit || 'Unidades'
                  }s)`}
                </label>
                <input
                  type="number"
                  value={ingredientDialog.data?.min_stock || 0}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, min_stock: parseFloat(e.target.value) || 0 } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="min-stock-input"
                />
                {/* Dynamic equivalence note */}
                {ingredientDialog.data?.min_stock > 0 && ingredientDialog.data?.conversion_factor > 0 && (
                  <div className="mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                    <p className="text-[11px] text-blue-400 leading-relaxed">
                      <span className="font-medium">Avisarme cuando me queden menos de </span>
                      <span className="font-bold">{ingredientDialog.data.min_stock} {
                        UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                        ingredientDialog.data?.unit || 'Unidades'
                      }s</span>
                      {ingredientDialog.data?.purchase_unit && ingredientDialog.data?.purchase_unit !== ingredientDialog.data?.unit && (
                        <>
                          <span className="text-muted-foreground"> (Equivalente a </span>
                          <span className="font-bold text-primary">
                            {(ingredientDialog.data.min_stock / (ingredientDialog.data.conversion_factor || 1)).toFixed(2)} {
                              UNITS.find(u => u.value === ingredientDialog.data?.purchase_unit)?.label || 
                              ingredientDialog.data?.purchase_unit || 'Unidades'
                            }s
                          </span>
                          <span className="text-muted-foreground">)</span>
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">
                  Costo Promedio {ingredientDialog.data?.purchase_unit && `(por ${
                    UNITS.find(u => u.value === ingredientDialog.data?.purchase_unit)?.label || 
                    ingredientDialog.data?.purchase_unit || 'Unidad'
                  })`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={ingredientDialog.data?.avg_cost || 0}
                  onChange={e => {
                    const cost = parseFloat(e.target.value) || 0;
                    setIngredientDialog(p => ({ ...p, data: { ...p.data, avg_cost: cost } }));
                    if (ingredientDialog.data?.id) checkAffectedRecipes(ingredientDialog.data.id);
                  }}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  disabled={ingredientDialog.data?.is_subrecipe}
                  data-testid="avg-cost-input"
                />
                {ingredientDialog.data?.is_subrecipe && (
                  <p className="text-[10px] text-muted-foreground mt-1">Costo calculado desde sub-receta</p>
                )}
              </div>
            </div>

            {/* Sub-recipe toggle */}
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">Es Sub-receta</span>
                  <p className="text-xs text-muted-foreground">Este insumo se produce a partir de otros ingredientes</p>
                </div>
                <Switch
                  checked={ingredientDialog.data?.is_subrecipe || false}
                  onCheckedChange={(checked) => setIngredientDialog(p => ({ 
                    ...p, 
                    data: { ...p.data, is_subrecipe: checked, recipe_id: checked ? p.data?.recipe_id : '' } 
                  }))}
                />
              </div>
              {ingredientDialog.data?.is_subrecipe && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-primary">
                    Después de guardar, crea una receta en la pestaña "Recetas" que produzca este ingrediente.
                  </p>
                </div>
              )}
            </div>

            {/* Default Supplier */}
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Truck size={14} className="text-cyan-500" />
                <span className="font-medium text-sm">Proveedor Predeterminado</span>
              </div>
              <select
                value={ingredientDialog.data?.default_supplier_id || ''}
                onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, default_supplier_id: e.target.value || null } }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                data-testid="ingredient-default-supplier"
              >
                <option value="">Sin proveedor asignado</option>
                {suppliers.filter(s => s.active !== false).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Usado por el Asistente de Compras para generar órdenes automáticas
              </p>
            </div>

            <Button onClick={handleSaveIngredient} className="w-full bg-primary text-primary-foreground font-oswald">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── UNIT DEFINITION DIALOG ─── */}
      <Dialog open={unitDialog.open} onOpenChange={(o) => !o && setUnitDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{unitDialog.data?.id ? 'Editar' : 'Nueva'} Unidad de Medida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={unitDialog.data?.name || ''}
                onChange={e => setUnitDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="Ej: Libra, Galón, Caja Grande"
                data-testid="unit-name-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Abreviatura *</label>
              <input
                type="text"
                value={unitDialog.data?.abbreviation || ''}
                onChange={e => setUnitDialog(p => ({ ...p, data: { ...p.data, abbreviation: e.target.value.toLowerCase() } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg font-mono"
                placeholder="Ej: lb, gal, cj"
                data-testid="unit-abbreviation-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se usará en minúsculas. Esta abreviatura aparecerá junto al stock y costos.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Categoría</label>
              <select
                value={unitDialog.data?.category || 'custom'}
                onChange={e => setUnitDialog(p => ({ ...p, data: { ...p.data, category: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="custom">Personalizada</option>
                <option value="weight">Peso</option>
                <option value="volume">Volumen</option>
                <option value="count">Conteo</option>
              </select>
            </div>
            
            {unitDialog.data?.id && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-amber-600">Cambiar la abreviatura actualizará automáticamente:</p>
                    <ul className="mt-1 text-muted-foreground list-disc list-inside">
                      <li>Todos los insumos que usen esta unidad</li>
                      <li>Unidad de compra en los insumos vinculados</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            
            <Button onClick={handleSaveUnit} className="w-full bg-primary text-primary-foreground font-oswald">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
