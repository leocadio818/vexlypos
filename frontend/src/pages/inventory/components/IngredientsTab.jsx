import { useState, useCallback } from 'react';
import { notify } from '@/lib/notify';
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
import { NumericInput } from '@/components/NumericKeypad';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { useTheme } from '@/context/ThemeContext';

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
  // Theme context for light/dark mode styling
  const { isMinimalist, isNeoDark } = useTheme();
  const isLightMode = isMinimalist && !isNeoDark;
  
  // Search/filter states
  const [confirmProps, showConfirm] = useConfirmDialog();
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
    if (!data?.default_supplier_id && !(data?.suppliers?.length > 0)) {
      errors.default_supplier_id = 'Agrega al menos un proveedor';
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
      notify.error('Error al cargar historial');
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
      notify.error(firstError);
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
        notify.success(`Ingrediente actualizado${res.data?.audit_logs_created > 0 ? ' (cambios registrados en auditoría)' : ''}`);
      } else {
        await ingredientsAPI.create(saveData);
        notify.success('Ingrediente creado');
      }
      setIngredientDialog({ open: false, data: null });
      setAffectedRecipes({ count: 0, recipes: [] });
      setShowAuditHistory(false);
      setValidationAttempted(false);
      onRefreshAll?.();
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteIngredient = async (id) => {
    { const ok = await showConfirm({ title: 'Confirmar', description: '¿Eliminar ingrediente?' }); if (!ok) return; }
    try {
      await ingredientsAPI.delete(id);
      notify.success('Ingrediente eliminado');
      onRefreshAll?.();
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error');
    }
  };

  // ─── CUSTOM UNITS HANDLERS ───
  const handleSaveUnit = async () => {
    const d = unitDialog.data;
    if (!d?.name?.trim()) { notify.error('Nombre requerido'); return; }
    if (!d?.abbreviation?.trim()) { notify.error('Abreviatura requerida'); return; }
    try {
      if (d.id) {
        const res = await unitDefinitionsAPI.update(d.id, d);
        const updated = res.data?.ingredients_updated || 0;
        notify.success(`Unidad actualizada${updated > 0 ? `. ${updated} ingrediente(s) actualizados automáticamente.` : ''}`);
      } else {
        await unitDefinitionsAPI.create(d);
        notify.success('Unidad creada');
      }
      setUnitDialog({ open: false, data: null });
      onRefreshAll?.();
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteUnit = async (id) => {
    { const ok = await showConfirm({ title: 'Confirmar', description: '¿Eliminar unidad? Solo se puede eliminar si no está en uso.' }); if (!ok) return; }
    try {
      await unitDefinitionsAPI.delete(id);
      notify.success('Unidad eliminada');
      onRefreshAll?.();
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div data-testid="ingredients-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="font-oswald text-base sm:text-lg font-bold">Insumos / Ingredientes</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setShowUnitsManager(!showUnitsManager)}
            className="font-oswald text-xs flex-1 sm:flex-none"
            data-testid="manage-units-btn"
          >
            <ArrowLeftRight size={14} className="mr-1" /> Unidades
          </Button>
          <Button 
            onClick={() => {
              setValidationAttempted(false);
              setIngredientDialog({ open: true, data: { name: '', unit: 'unidad', category: 'general', min_stock: 0, avg_cost: 0, purchase_unit: '', purchase_quantity: 1, dispatch_quantity: 1, conversion_factor: 1, suppliers: [] } });
            }}
            className="bg-primary text-primary-foreground font-oswald text-xs flex-1 sm:flex-none"
            data-testid="add-ingredient-btn"
          >
            <Plus size={14} className="mr-1" /> Nuevo
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
                    <Badge variant="secondary" className="ml-2 text-xs">{unit.abbreviation}</Badge>
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
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
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
          const isLow = totalStock < ing.min_stock;
          return (
            <div 
              key={ing.id} 
              className={`p-2 sm:p-3 rounded-xl border ${isLow ? 'border-red-500/50 bg-red-500/10' : ing.is_subrecipe ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-card'}`}
              data-testid={`ingredient-${ing.id}`}
            >
              {/* Top row: icon + name + stock */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${ing.is_subrecipe ? 'bg-blue-500/20' : 'bg-primary/10'}`}>
                    {ing.is_subrecipe ? (
                      <FileText size={16} className="text-blue-500" />
                    ) : (
                      <Package size={16} className="text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-semibold text-sm truncate">{ing.name}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{ing.unit}</Badge>
                      {ing.is_subrecipe && <Badge className="text-[10px] bg-blue-500 shrink-0">Sub-receta</Badge>}
                      {isLow && <Badge variant="destructive" className="text-[10px] shrink-0">Bajo</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                      <span>{getCategoryLabel(ing.category)}</span>
                      <span>•</span>
                      <span>{formatMoney(ing.avg_cost)}</span>
                      <span>•</span>
                      <span>Min: {ing.min_stock}</span>
                    </div>
                  </div>
                </div>
                {/* Stock number */}
                <div className="text-right shrink-0">
                  <span className={`font-oswald text-base sm:text-lg font-bold ${isLow ? 'text-red-500' : 'text-primary'}`}>
                    {totalStock.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-0.5">{ing.unit}</span>
                </div>
              </div>
              {/* Bottom row: action buttons */}
              <div className="flex items-center justify-end gap-1 mt-1.5 border-t border-border/50 pt-1.5">
                {ing.is_subrecipe && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                    onClick={() => onNavigateToProduction?.()}
                    data-testid={`produce-${ing.id}`}
                    title="Ir a Producción"
                  >
                    <Factory size={12} className="mr-1" /> Producir
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-emerald-500 hover:text-emerald-400"
                  onClick={() => onLoadConversionAnalysis?.(ing.id)}
                  title="Ver Análisis de Conversión"
                  data-testid={`conversion-analysis-btn-${ing.id}`}
                >
                  <Calculator size={13} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={() => {
                    setValidationAttempted(false);
                    setIngredientDialog({ open: true, data: { ...ing, suppliers: ing.suppliers || [] } });
                  }}
                >
                  <Pencil size={13} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-destructive"
                  onClick={() => handleDeleteIngredient(ing.id)}
                >
                  <Trash2 size={13} />
                  </Button>
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
                    <div className="text-primary text-xs">Por: {log.changed_by_name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            {/* Validation Error Summary */}
            {validationAttempted && !currentValidation.isValid && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-500">
                      Completa todos los campos obligatorios para guardar
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Los campos marcados en rojo son necesarios para que tus órdenes de compra y costos sean exactos.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <label className={`text-sm font-medium ${validationAttempted && currentValidation.errors.name ? 'text-red-500' : ''}`}>
                Nombre del Insumo *
              </label>
              <input
                type="text"
                value={ingredientDialog.data?.name || ''}
                onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className={`w-full mt-1 px-3 py-2 bg-background border rounded-lg ${
                  validationAttempted && currentValidation.errors.name 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-border'
                }`}
                data-testid="ingredient-name-input"
                placeholder="Ej: Ron Brugal, Carne de Res..."
              />
              {validationAttempted && currentValidation.errors.name && (
                <p className="text-xs text-red-500 mt-1">{currentValidation.errors.name}</p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-sm font-medium ${validationAttempted && currentValidation.errors.unit ? 'text-red-500' : ''}`}>
                  Unidad de Despacho *
                </label>
                <select
                  value={ingredientDialog.data?.unit || 'unidad'}
                  onChange={e => {
                    const newUnit = e.target.value;
                    setIngredientDialog(p => ({ ...p, data: { ...p.data, unit: newUnit } }));
                    if (ingredientDialog.data?.id) checkAffectedRecipes(ingredientDialog.data.id);
                  }}
                  className={`w-full mt-1 px-3 py-2 bg-background border rounded-lg ${
                    validationAttempted && currentValidation.errors.unit 
                      ? 'border-red-500' 
                      : 'border-border'
                  }`}
                  style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}
                >
                  {UNITS.map(u => <option key={u.value} value={u.value} style={{ color: '#1E293B', backgroundColor: '#FFFFFF' }}>{u.label}</option>)}
                  {customUnits.map(u => <option key={u.id} value={u.abbreviation} style={{ color: '#1E293B', backgroundColor: '#FFFFFF' }}>{u.name} ({u.abbreviation})</option>)}
                </select>
                {validationAttempted && currentValidation.errors.unit && (
                  <p className="text-xs text-red-500 mt-1">{currentValidation.errors.unit}</p>
                )}
              </div>
              <div>
                <label className={`text-sm font-medium ${validationAttempted && currentValidation.errors.category ? 'text-red-500' : ''}`}>
                  Categoría *
                </label>
                <select
                  value={ingredientDialog.data?.category || 'general'}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, category: e.target.value } }))}
                  className={`w-full mt-1 px-3 py-2 bg-background border rounded-lg ${
                    validationAttempted && currentValidation.errors.category 
                      ? 'border-red-500' 
                      : 'border-border'
                  }`}
                  style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}
                >
                  {INGREDIENT_CATEGORIES.map(c => <option key={c.value} value={c.value} style={{ color: '#1E293B', backgroundColor: '#FFFFFF' }}>{c.label}</option>)}
                </select>
                {validationAttempted && currentValidation.errors.category && (
                  <p className="text-xs text-red-500 mt-1">{currentValidation.errors.category}</p>
                )}
              </div>
            </div>
            
            {/* Conversion Factor Calculator - Human Friendly Version */}
            <div className={`p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border ${
              validationAttempted && currentValidation.errors.dispatch_quantity 
                ? 'border-red-500' 
                : 'border-primary/20'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight size={16} className="text-primary" />
                  <span 
                    className="font-medium text-sm"
                    style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}
                  >Conversión de Unidades *</span>
                </div>
                {validationAttempted && currentValidation.errors.dispatch_quantity && (
                  <span className="text-xs text-red-500">{currentValidation.errors.dispatch_quantity}</span>
                )}
              </div>
              
              {/* Human-readable sentence */}
              <div 
                className="bg-background/60 rounded-lg p-4 border border-border/50 mb-4"
                style={isLightMode ? { backgroundColor: '#F8FAFC' } : {}}
              >
                <p 
                  className="text-sm mb-3 leading-relaxed"
                  style={isLightMode ? { color: '#475569', WebkitTextFillColor: '#475569' } : {}}
                >
                  Completa la siguiente oración para configurar la conversión:
                </p>
                
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}>Yo compro por</span>
                  <select
                    value={ingredientDialog.data?.purchase_unit || ingredientDialog.data?.unit || 'unidad'}
                    onChange={e => {
                      const newPurchaseUnit = e.target.value;
                      setIngredientDialog(p => ({ ...p, data: { ...p.data, purchase_unit: newPurchaseUnit } }));
                    }}
                    className="px-2 py-1 text-sm border rounded-md font-medium min-w-[100px]"
                    style={isLightMode 
                      ? { backgroundColor: '#EFF6FF', borderColor: '#3B82F6', color: '#1E293B', WebkitTextFillColor: '#1E293B' } 
                      : { backgroundColor: 'rgb(var(--primary) / 0.1)', borderColor: 'rgb(var(--primary) / 0.3)', color: 'hsl(var(--primary))' }
                    }
                    data-testid="purchase-unit-select"
                  >
                    {UNITS.map(u => <option key={u.value} value={u.value} style={{ color: '#1E293B', backgroundColor: '#FFFFFF' }}>{u.label}</option>)}
                    {customUnits.map(u => <option key={u.id} value={u.abbreviation} style={{ color: '#1E293B', backgroundColor: '#FFFFFF' }}>{u.name}</option>)}
                  </select>
                  
                  <span style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}>y despacho por</span>
                  <span 
                    className="px-2 py-1 rounded-md font-medium"
                    style={isLightMode 
                      ? { backgroundColor: '#D1FAE5', borderColor: '#10B981', color: '#047857', WebkitTextFillColor: '#047857', border: '1px solid #10B981' } 
                      : { backgroundColor: 'rgb(16 185 129 / 0.1)', border: '1px solid rgb(16 185 129 / 0.3)', color: '#34D399' }
                    }
                  >
                    {UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                     customUnits.find(u => u.abbreviation === ingredientDialog.data?.unit)?.name ||
                     ingredientDialog.data?.unit || 'Unidad'}
                  </span>
                </div>
                
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}>Por eso, 1</span>
                  <span 
                    className="font-medium"
                    style={isLightMode ? { color: '#1D4ED8', WebkitTextFillColor: '#1D4ED8' } : {}}
                  >
                    {UNITS.find(u => u.value === (ingredientDialog.data?.purchase_unit || ingredientDialog.data?.unit))?.label || 
                     ingredientDialog.data?.purchase_unit || 'Unidad'}
                  </span>
                  <span style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}>trae</span>
                  <NumericInput label="Valor"
                   
                   
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
                    className={`w-20 px-2 py-1 text-sm bg-background border-2 rounded-md font-bold text-center focus:ring-1 ${
                      validationAttempted && currentValidation.errors.dispatch_quantity 
                        ? 'border-red-500 text-red-500 focus:border-red-500 focus:ring-red-500' 
                        : 'border-primary/50 text-primary focus:border-primary focus:ring-primary'
                    }`}
                    placeholder="16"
                    data-testid="dispatch-quantity-input"
                  />
                  <span 
                    className="font-medium"
                    style={isLightMode ? { color: '#047857', WebkitTextFillColor: '#047857' } : { color: '#34D399' }}
                  >
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
              <div 
                className="p-3 rounded-lg"
                style={isLightMode 
                  ? { backgroundColor: '#D1FAE5', border: '1px solid #10B981' } 
                  : { backgroundColor: 'rgb(16 185 129 / 0.1)', border: '1px solid rgb(16 185 129 / 0.3)' }
                }
              >
                <div className="flex items-center gap-2 mb-2">
                  <Calculator size={14} style={isLightMode ? { color: '#047857' } : { color: '#34D399' }} />
                  <span 
                    className="text-xs font-medium uppercase tracking-wide"
                    style={isLightMode ? { color: '#047857', WebkitTextFillColor: '#047857' } : { color: '#34D399' }}
                  >
                    Resultado en Dinero Real
                  </span>
                </div>
                <p 
                  className="text-sm leading-relaxed"
                  style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}
                >
                  Esto significa que cada{' '}
                  <span 
                    className="font-bold"
                    style={isLightMode ? { color: '#047857', WebkitTextFillColor: '#047857' } : { color: '#34D399' }}
                  >
                    {UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                     ingredientDialog.data?.unit || 'Unidad'}
                  </span>
                  {ingredientDialog.data?.name && (
                    <span style={isLightMode ? { color: '#64748B', WebkitTextFillColor: '#64748B' } : {}}> de {ingredientDialog.data.name}</span>
                  )}
                  {' '}te cuesta{' '}
                  <span 
                    className="font-oswald font-bold text-lg"
                    style={isLightMode ? { color: '#1D4ED8', WebkitTextFillColor: '#1D4ED8' } : {}}
                  >
                    {formatMoney(
                      (ingredientDialog.data?.avg_cost || 0) / (ingredientDialog.data?.conversion_factor || 1)
                    )}
                  </span>
                </p>
                <p 
                  className="text-xs mt-2"
                  style={isLightMode ? { color: '#64748B', WebkitTextFillColor: '#64748B', opacity: 0.9 } : { opacity: 0.7 }}
                >
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
                      <p className="text-xs text-muted-foreground mt-0.5">
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
                <label className={`text-sm font-medium ${validationAttempted && currentValidation.errors.min_stock ? 'text-red-500' : ''}`}>
                  Stock Mínimo * {ingredientDialog.data?.unit && `(en ${
                    UNITS.find(u => u.value === ingredientDialog.data?.unit)?.label || 
                    customUnits.find(u => u.abbreviation === ingredientDialog.data?.unit)?.name ||
                    ingredientDialog.data?.unit || 'Unidades'
                  }s)`}
                </label>
                <NumericInput label="Valor"
                  value={ingredientDialog.data?.min_stock ?? ''}
                  onChange={e => setIngredientDialog(p => ({ ...p, data: { ...p.data, min_stock: parseFloat(e.target.value) || 0 } }))}
                  className={`w-full mt-1 px-3 py-2 bg-background border rounded-lg ${
                    validationAttempted && currentValidation.errors.min_stock 
                      ? 'border-red-500' 
                      : 'border-border'
                  }`}
                  data-testid="min-stock-input"
                  placeholder="0"
                />
                {validationAttempted && currentValidation.errors.min_stock && (
                  <p className="text-xs text-red-500 mt-1">{currentValidation.errors.min_stock}</p>
                )}
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
                <label className={`text-sm font-medium ${validationAttempted && currentValidation.errors.avg_cost ? 'text-red-500' : ''}`}>
                  Costo Promedio * {ingredientDialog.data?.purchase_unit && `(por ${
                    UNITS.find(u => u.value === ingredientDialog.data?.purchase_unit)?.label || 
                    ingredientDialog.data?.purchase_unit || 'Unidad'
                  })`}
                </label>
                <NumericInput label="Valor"
                 
                  value={ingredientDialog.data?.avg_cost ?? ''}
                  onChange={e => {
                    const cost = parseFloat(e.target.value) || 0;
                    setIngredientDialog(p => ({ ...p, data: { ...p.data, avg_cost: cost } }));
                    if (ingredientDialog.data?.id) checkAffectedRecipes(ingredientDialog.data.id);
                  }}
                  className={`w-full mt-1 px-3 py-2 bg-background border rounded-lg ${
                    validationAttempted && currentValidation.errors.avg_cost 
                      ? 'border-red-500' 
                      : 'border-border'
                  }`}
                  disabled={ingredientDialog.data?.is_subrecipe}
                  data-testid="avg-cost-input"
                  placeholder="0.00"
                />
                {validationAttempted && currentValidation.errors.avg_cost && (
                  <p className="text-xs text-red-500 mt-1">{currentValidation.errors.avg_cost}</p>
                )}
                {ingredientDialog.data?.is_subrecipe && (
                  <p className="text-xs text-muted-foreground mt-1">Costo calculado desde sub-receta</p>
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

            {/* Multi-Supplier List — OBLIGATORIO */}
            <div className={`p-3 rounded-lg bg-card border ${
              validationAttempted && currentValidation.errors.default_supplier_id 
                ? 'border-red-500' 
                : 'border-border'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Truck size={14} className={validationAttempted && currentValidation.errors.default_supplier_id ? 'text-red-500' : 'text-cyan-500'} />
                  <span className={`font-medium text-sm ${validationAttempted && currentValidation.errors.default_supplier_id ? 'text-red-500' : ''}`}>
                    Proveedores *
                  </span>
                </div>
                {validationAttempted && currentValidation.errors.default_supplier_id && (
                  <span className="text-xs text-red-500">Obligatorio</span>
                )}
              </div>
              
              {/* Supplier rows */}
              <div className="space-y-2 mb-2">
                {(ingredientDialog.data?.suppliers || []).map((sup, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-background border border-border" data-testid={`supplier-row-${idx}`}>
                    <select
                      value={sup.supplier_id || ''}
                      onChange={e => {
                        const sName = suppliers.find(s => s.id === e.target.value)?.name || '';
                        setIngredientDialog(p => {
                          const list = [...(p.data?.suppliers || [])];
                          list[idx] = { ...list[idx], supplier_id: e.target.value, supplier_name: sName };
                          return { ...p, data: { ...p.data, suppliers: list } };
                        });
                      }}
                      className="flex-1 min-w-0 px-2 py-2 bg-background border border-border rounded text-sm"
                    >
                      <option value="">Proveedor...</option>
                      {suppliers.filter(s => s.active !== false).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Precio"
                      value={sup.unit_price || ''}
                      onChange={e => {
                        setIngredientDialog(p => {
                          const list = [...(p.data?.suppliers || [])];
                          list[idx] = { ...list[idx], unit_price: parseFloat(e.target.value) || 0 };
                          return { ...p, data: { ...p.data, suppliers: list } };
                        });
                      }}
                      className="w-24 px-2 py-2 bg-background border border-border rounded text-sm text-right"
                    />
                    <button
                      type="button"
                      title={sup.is_default ? 'Proveedor principal' : 'Marcar como principal'}
                      onClick={() => {
                        setIngredientDialog(p => {
                          const list = (p.data?.suppliers || []).map((s, i) => ({ ...s, is_default: i === idx }));
                          const defaultSid = list[idx]?.supplier_id || '';
                          return { ...p, data: { ...p.data, suppliers: list, default_supplier_id: defaultSid } };
                        });
                      }}
                      className={`p-2 rounded-md shrink-0 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center transition-colors ${
                        sup.is_default
                          ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/40'
                          : 'bg-muted text-muted-foreground border border-transparent hover:border-border'
                      }`}
                      data-testid={`supplier-default-${idx}`}
                    >
                      {sup.is_default ? '\u2605' : '\u2606'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIngredientDialog(p => {
                          const list = (p.data?.suppliers || []).filter((_, i) => i !== idx);
                          if (list.length > 0 && !list.some(s => s.is_default)) list[0].is_default = true;
                          const defaultSid = list.find(s => s.is_default)?.supplier_id || '';
                          return { ...p, data: { ...p.data, suppliers: list, default_supplier_id: defaultSid } };
                        });
                      }}
                      className="p-2 rounded-md text-red-500/70 hover:text-red-500 hover:bg-red-500/10 shrink-0 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center"
                      data-testid={`supplier-remove-${idx}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              
              {/* Add supplier button */}
              <button
                type="button"
                onClick={() => {
                  setIngredientDialog(p => {
                    const list = [...(p.data?.suppliers || [])];
                    list.push({ supplier_id: '', supplier_name: '', unit_price: 0, is_default: list.length === 0 });
                    return { ...p, data: { ...p.data, suppliers: list } };
                  });
                }}
                className="w-full py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center justify-center gap-1 min-h-[3rem]"
                data-testid="supplier-add-btn"
              >
                <Plus size={14} /> Agregar proveedor
              </button>
              
              {validationAttempted && currentValidation.errors.default_supplier_id ? (
                <p className="text-xs text-red-500 mt-1">
                  Agrega al menos un proveedor para generar ordenes de compra correctas.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Asigna proveedores con precios para comparar en ordenes de compra
                </p>
              )}
            </div>

            <Button 
              onClick={handleSaveIngredient} 
              className={`w-full font-oswald ${
                currentValidation.isValid 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted'
              }`}
              data-testid="save-ingredient-btn"
            >
              <Save size={16} className="mr-1" /> 
              {currentValidation.isValid ? 'Guardar' : 'Completa los campos obligatorios'}
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
    <ConfirmDialog {...confirmProps} />
    </div>
    );
}
