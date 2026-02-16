import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { productsAPI, categoriesAPI, modifiersAPI, reportCategoriesAPI } from '@/lib/api';
import { ArrowLeft, Save, Package, Tag, DollarSign, Palette, ListChecks, Plus, Trash2, GripVertical, FileText, List } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const PRESET_COLORS = [
  '#FF6600', '#4CAF50', '#2196F3', '#9C27B0', '#E91E63', '#FFB300',
  '#00BCD4', '#795548', '#607D8B', '#F44336', '#3F51B5', '#8BC34A',
  '#FF5722', '#673AB7', '#009688', '#CDDC39', '#FFC107', '#03A9F4'
];

export default function ProductConfig() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = productId === 'new';
  const fromProducts = searchParams.get('from') === 'products';

  const handleGoBack = () => {
    if (fromProducts) {
      navigate('/settings?tab=inventario&subtab=productos');
    } else {
      navigate(-1);
    }
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [reportCategories, setReportCategories] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [activeTab, setActiveTab] = useState('general');
  
  // Price keypad state
  const [priceKeypad, setPriceKeypad] = useState({ open: false, field: null, value: '' });

  // Product form state
  const [product, setProduct] = useState({
    name: '',
    printed_name: '',
    category_id: '',
    report_category_id: '',
    price: 0,
    price_a: 0,
    price_b: 0,
    price_c: 0,
    price_d: 0,
    price_e: 0,
    button_bg_color: '',
    button_text_color: '#FFFFFF',
    track_inventory: false,
    print_channels: [],  // Array of channel codes for multi-channel printing
    modifier_assignments: [],
    // Recipe fields (for display)
    recipe_ingredients: []
  });

  // Print channels state
  const [printChannels, setPrintChannels] = useState([]);

  // Dialog for adding modifier assignment
  const [modAssignDialog, setModAssignDialog] = useState({
    open: false,
    group_id: '',
    min_selections: 0,
    max_selections: 1,
    allow_multiple: false,
    editIndex: null
  });

  const fetchData = useCallback(async () => {
    try {
      const [catRes, reportCatRes, modRes, channelsRes] = await Promise.all([
        categoriesAPI.list(),
        reportCategoriesAPI.list(),
        modifiersAPI.list(),
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/print-channels`).then(r => r.json())
      ]);
      setCategories(catRes.data);
      setReportCategories(reportCatRes.data);
      setModifierGroups(modRes.data);
      setPrintChannels(channelsRes || []);

      if (!isNew) {
        const prodRes = await productsAPI.get(productId);
        const p = prodRes.data;
        setProduct({
          name: p.name || '',
          printed_name: p.printed_name || '',
          category_id: p.category_id || '',
          report_category_id: p.report_category_id || '',
          price: p.price || 0,
          price_a: p.price_a || p.price || 0,
          price_b: p.price_b || 0,
          price_c: p.price_c || 0,
          price_d: p.price_d || 0,
          price_e: p.price_e || 0,
          button_bg_color: p.button_bg_color || '',
          button_text_color: p.button_text_color || '#FFFFFF',
          track_inventory: p.track_inventory || false,
          print_channels: p.print_channels || [],
          modifier_assignments: p.modifier_assignments || [],
          recipe_ingredients: p.recipe_ingredients || []
        });
      } else {
        // Set defaults for new product
        setProduct(prev => ({
          ...prev,
          category_id: catRes.data[0]?.id || ''
        }));
      }
    } catch (e) {
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [productId, isNew]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!product.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!product.category_id) {
      toast.error('La categoría es requerida');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...product,
        price: parseFloat(product.price) || 0,
        price_a: parseFloat(product.price_a) || parseFloat(product.price) || 0,
        price_b: parseFloat(product.price_b) || 0,
        price_c: parseFloat(product.price_c) || 0,
        price_d: parseFloat(product.price_d) || 0,
        price_e: parseFloat(product.price_e) || 0,
        printed_name: product.printed_name || product.name
      };

      if (isNew) {
        const result = await productsAPI.create(data);
        toast.success('Producto creado exitosamente');
        // Reset form for creating another product, but stay on the page
        setProduct({
          name: '', 
          price: '', 
          price_a: '',
          price_b: '',
          price_c: '',
          price_d: '',
          price_e: '',
          category_id: product.category_id, // Keep category
          report_category_id: product.report_category_id,
          active: true, 
          modifier_group_ids: [], 
          modifier_assignments: [],
          button_bg_color: '#6366f1', 
          button_text_color: '#ffffff', 
          printed_name: '',
          track_inventory: false
        });
        // Show option to go back to list
        toast.info('Puedes crear otro producto o volver a la lista', { duration: 3000 });
      } else {
        await productsAPI.update(productId, data);
        toast.success('Producto actualizado exitosamente');
        // Stay on the same product page
      }
    } catch (e) {
      toast.error('Error guardando producto');
    } finally {
      setSaving(false);
    }
  };

  const handleAddModifierAssignment = () => {
    const { group_id, min_selections, max_selections, allow_multiple, editIndex } = modAssignDialog;
    if (!group_id) {
      toast.error('Seleccione un grupo de preguntas');
      return;
    }

    const assignment = {
      group_id,
      min_selections: parseInt(min_selections) || 0,
      max_selections: parseInt(max_selections) || 1,
      allow_multiple
    };

    if (editIndex !== null) {
      setProduct(prev => ({
        ...prev,
        modifier_assignments: prev.modifier_assignments.map((a, i) => 
          i === editIndex ? assignment : a
        )
      }));
    } else {
      // Check if already assigned
      if (product.modifier_assignments.some(a => a.group_id === group_id)) {
        toast.error('Este grupo ya está asignado');
        return;
      }
      setProduct(prev => ({
        ...prev,
        modifier_assignments: [...prev.modifier_assignments, assignment]
      }));
    }

    setModAssignDialog({
      open: false,
      group_id: '',
      min_selections: 0,
      max_selections: 1,
      allow_multiple: false,
      editIndex: null
    });
  };

  const handleRemoveModifierAssignment = (index) => {
    setProduct(prev => ({
      ...prev,
      modifier_assignments: prev.modifier_assignments.filter((_, i) => i !== index)
    }));
  };

  const getModifierGroupName = (groupId) => {
    const group = modifierGroups.find(g => g.id === groupId);
    return group?.name || 'Desconocido';
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="product-config-page">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleGoBack} data-testid="back-btn">
            <ArrowLeft size={20} />
          </Button>
          <Package size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">
            {isNew ? 'NUEVO PRODUCTO' : 'EDITAR PRODUCTO'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={handleGoBack} 
            className="font-oswald font-bold"
            data-testid="back-to-list-btn"
          >
            <List size={16} className="mr-2" />
            VOLVER A LISTA
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-primary text-primary-foreground font-oswald font-bold active:scale-95"
            data-testid="save-product-btn"
          >
            <Save size={16} className="mr-2" />
            {saving ? 'GUARDANDO...' : 'GUARDAR'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-card border border-border mb-4 w-full justify-start gap-1 p-1">
              <TabsTrigger 
                value="general" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald"
                data-testid="tab-general"
              >
                <FileText size={14} className="mr-1" /> General
              </TabsTrigger>
              <TabsTrigger 
                value="precios" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald"
                data-testid="tab-precios"
              >
                <DollarSign size={14} className="mr-1" /> Precios
              </TabsTrigger>
              <TabsTrigger 
                value="receta" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald"
                data-testid="tab-receta"
              >
                <Tag size={14} className="mr-1" /> Receta
              </TabsTrigger>
              <TabsTrigger 
                value="modificadores" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald"
                data-testid="tab-modificadores"
              >
                <ListChecks size={14} className="mr-1" /> Asignar Modificadores
              </TabsTrigger>
            </TabsList>

            {/* GENERAL TAB */}
            <TabsContent value="general" className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  Información Básica
                </h3>
                
                {/* Descripción (nombre) */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Descripción (Nombre del Producto) *</label>
                  <input 
                    value={product.name}
                    onChange={e => setProduct(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Hamburguesa Clásica"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                    data-testid="product-name-input"
                  />
                </div>

                {/* Descripción Impresa */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Descripción Impresa (Ticket)</label>
                  <input 
                    value={product.printed_name}
                    onChange={e => setProduct(p => ({ ...p, printed_name: e.target.value }))}
                    placeholder="Ej: HAMBURGUESA CL."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono"
                    data-testid="product-printed-name-input"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Cómo aparece en tickets y comandas (si está vacío, usa el nombre)
                  </p>
                </div>

                {/* Categoría del Menu */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Categoría del Menú *</label>
                  <select 
                    value={product.category_id}
                    onChange={e => setProduct(p => ({ ...p, category_id: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                    data-testid="product-category-select"
                  >
                    <option value="">Seleccionar categoría...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Categoría de Reporte */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Categoría de Reporte</label>
                  <select 
                    value={product.report_category_id}
                    onChange={e => setProduct(p => ({ ...p, report_category_id: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                    data-testid="product-report-category-select"
                  >
                    <option value="">Sin categoría de reporte</option>
                    {reportCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Para agrupar en reportes fiscales y estadísticos
                  </p>
                </div>

                {/* Control de Inventario */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
                  <div>
                    <span className="text-sm font-semibold">Controlar Inventario</span>
                    <p className="text-[10px] text-muted-foreground">Descontar stock al vender</p>
                  </div>
                  <Switch 
                    checked={product.track_inventory}
                    onCheckedChange={v => setProduct(p => ({ ...p, track_inventory: v }))}
                    data-testid="track-inventory-switch"
                  />
                </div>
              </div>

              {/* Button Style */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Palette size={14} /> Estilo del Botón POS
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Color de Fondo</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setProduct(p => ({ ...p, button_bg_color: '' }))}
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center text-[10px] ${
                          !product.button_bg_color ? 'border-primary' : 'border-border'
                        } bg-background`}
                        title="Predeterminado"
                      >
                        ✕
                      </button>
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setProduct(p => ({ ...p, button_bg_color: color }))}
                          className={`w-7 h-7 rounded-lg border-2 transition-all ${
                            product.button_bg_color === color ? 'border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <input 
                      type="color"
                      value={product.button_bg_color || '#FF6600'}
                      onChange={e => setProduct(p => ({ ...p, button_bg_color: e.target.value }))}
                      className="mt-2 w-full h-8 rounded cursor-pointer"
                      data-testid="bg-color-picker"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Color de Texto</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['#FFFFFF', '#000000', '#1a1a1a', '#333333'].map(color => (
                        <button
                          key={color}
                          onClick={() => setProduct(p => ({ ...p, button_text_color: color }))}
                          className={`w-7 h-7 rounded-lg border-2 transition-all ${
                            product.button_text_color === color ? 'border-primary scale-110' : 'border-border'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <input 
                      type="color"
                      value={product.button_text_color || '#FFFFFF'}
                      onChange={e => setProduct(p => ({ ...p, button_text_color: e.target.value }))}
                      className="mt-2 w-full h-8 rounded cursor-pointer"
                      data-testid="text-color-picker"
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="pt-3 border-t border-border">
                  <label className="text-xs text-muted-foreground mb-2 block">Vista Previa</label>
                  <div className="flex items-center gap-3">
                    <button
                      className="px-4 py-3 rounded-xl font-oswald font-bold text-sm transition-all hover:scale-105"
                      style={{
                        backgroundColor: product.button_bg_color || '#3f3f46',
                        color: product.button_text_color || '#FFFFFF'
                      }}
                    >
                      {product.name || 'Producto'}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Así se verá en la pantalla de ventas
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* PRECIOS TAB */}
            <TabsContent value="precios" className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <DollarSign size={14} /> Lista de Precios
                </h3>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Toca cualquier precio para editarlo con el teclado numérico
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Precio Principal (A) */}
                  <div className="col-span-full">
                    <label className="text-xs text-muted-foreground mb-1 block font-semibold">
                      Precio Principal (Precio A) *
                    </label>
                    <button 
                      type="button"
                      onClick={() => setPriceKeypad({ 
                        open: true, 
                        field: 'price_a', 
                        value: String(product.price_a || product.price || ''),
                        label: 'Precio Principal'
                      })}
                      className="w-full flex items-center justify-between px-4 py-4 bg-gradient-to-r from-primary/5 to-primary/10 border-2 border-primary/30 rounded-xl hover:border-primary/50 transition-all group"
                      data-testid="price-a-btn"
                    >
                      <span className="text-sm text-muted-foreground">RD$</span>
                      <span className="font-oswald text-2xl font-bold text-primary">
                        {(product.price_a || product.price || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </span>
                      <DollarSign size={20} className="text-primary/50 group-hover:text-primary transition-colors" />
                    </button>
                  </div>

                  {/* Precios B-E */}
                  {[
                    { key: 'price_b', label: 'Precio B' },
                    { key: 'price_c', label: 'Precio C' },
                    { key: 'price_d', label: 'Precio D' },
                    { key: 'price_e', label: 'Precio E' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                      <button 
                        type="button"
                        onClick={() => setPriceKeypad({ 
                          open: true, 
                          field: key, 
                          value: String(product[key] || ''),
                          label
                        })}
                        className="w-full flex items-center justify-between px-3 py-3 bg-background border border-border rounded-xl hover:border-primary/50 transition-all group"
                        data-testid={`${key}-btn`}
                      >
                        <span className="text-xs text-muted-foreground">RD$</span>
                        <span className="font-oswald text-lg font-bold">
                          {(product[key] || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                        <DollarSign size={16} className="text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* RECETA TAB */}
            <TabsContent value="receta" className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Tag size={14} /> Receta / Ingredientes
                  </h3>
                </div>
                
                <div className="text-center py-8 border border-dashed border-border rounded-xl bg-background/50">
                  <Tag size={32} className="mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground mb-2">
                    La receta se configura en el módulo de Inventario Maestro
                  </p>
                  <a 
                    href="/inventory-manager?tab=recipes" 
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  >
                    <Tag size={14} /> Ir a Inventario Maestro
                  </a>
                </div>

                {product.recipe_ingredients && product.recipe_ingredients.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Ingredientes actuales:</h4>
                    <div className="space-y-1">
                      {product.recipe_ingredients.map((ing, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-background border border-border/50">
                          <span className="text-sm">{ing.ingredient_name}</span>
                          <span className="text-xs text-muted-foreground">{ing.quantity} {ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* MODIFICADORES TAB */}
            <TabsContent value="modificadores" className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <ListChecks size={14} /> Preguntas Forzadas / Modificadores
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Grupos de opciones que aparecerán al agregar este producto
                    </p>
                  </div>
                  <Button 
                    size="sm"
                    onClick={() => setModAssignDialog({
                      open: true,
                      group_id: modifierGroups[0]?.id || '',
                      min_selections: 0,
                      max_selections: 1,
                      allow_multiple: false,
                      editIndex: null
                    })}
                    className="bg-primary text-primary-foreground font-bold active:scale-95"
                    data-testid="add-modifier-btn"
                  >
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>

                {/* Assigned modifiers list */}
                {product.modifier_assignments.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-border rounded-xl bg-background/50">
                    <ListChecks size={32} className="mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No hay grupos de preguntas asignados
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Agregue grupos como "Endulzantes", "Tamaño", "Extras", etc.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {product.modifier_assignments.map((assignment, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-primary/50 transition-colors"
                        data-testid={`modifier-assignment-${index}`}
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical size={16} className="text-muted-foreground/40" />
                          <div>
                            <span className="font-semibold text-sm">
                              {getModifierGroupName(assignment.group_id)}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[9px]">
                                Min: {assignment.min_selections}
                              </Badge>
                              <Badge variant="secondary" className="text-[9px]">
                                Max: {assignment.max_selections}
                              </Badge>
                              {assignment.allow_multiple && (
                                <Badge variant="outline" className="text-[9px] border-green-500 text-green-400">
                                  Múltiple
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => setModAssignDialog({
                              open: true,
                              group_id: assignment.group_id,
                              min_selections: assignment.min_selections,
                              max_selections: assignment.max_selections,
                              allow_multiple: assignment.allow_multiple,
                              editIndex: index
                            })}
                          >
                            <Tag size={14} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive/60 hover:text-destructive"
                            onClick={() => handleRemoveModifierAssignment(index)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modifier Assignment Dialog */}
      <Dialog open={modAssignDialog.open} onOpenChange={(o) => !o && setModAssignDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="modifier-assignment-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <ListChecks size={18} className="text-primary" />
              {modAssignDialog.editIndex !== null ? 'Editar' : 'Asignar'} Grupo de Preguntas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Group selector */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Grupo de Preguntas *</label>
              <select 
                value={modAssignDialog.group_id}
                onChange={e => setModAssignDialog(p => ({ ...p, group_id: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                disabled={modAssignDialog.editIndex !== null}
                data-testid="modifier-group-select"
              >
                <option value="">Seleccionar...</option>
                {modifierGroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.options?.length || 0} opciones)
                  </option>
                ))}
              </select>
            </div>

            {/* Min selections */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Selecciones Mínimas</label>
              <input 
                type="number"
                min="0"
                value={modAssignDialog.min_selections}
                onChange={e => setModAssignDialog(p => ({ ...p, min_selections: parseInt(e.target.value) || 0 }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                data-testid="min-selections-input"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                0 = Opcional, mayor que 0 = Obligatorio
              </p>
            </div>

            {/* Max selections */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Selecciones Máximas</label>
              <input 
                type="number"
                min="1"
                value={modAssignDialog.max_selections}
                onChange={e => setModAssignDialog(p => ({ ...p, max_selections: parseInt(e.target.value) || 1 }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                data-testid="max-selections-input"
              />
            </div>

            {/* Allow multiple */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
              <div>
                <span className="text-sm font-semibold">Permite Múltiples</span>
                <p className="text-[10px] text-muted-foreground">
                  Puede seleccionar la misma opción varias veces
                </p>
              </div>
              <Switch 
                checked={modAssignDialog.allow_multiple}
                onCheckedChange={v => setModAssignDialog(p => ({ ...p, allow_multiple: v }))}
                data-testid="allow-multiple-switch"
              />
            </div>

            <Button 
              onClick={handleAddModifierAssignment}
              className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95"
              data-testid="confirm-modifier-assignment"
            >
              {modAssignDialog.editIndex !== null ? 'GUARDAR CAMBIOS' : 'AGREGAR GRUPO'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Beautiful Price Keypad Modal */}
      {priceKeypad.open && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPriceKeypad({ open: false, field: null, value: '' })}
          />
          
          {/* Keypad Card */}
          <div className="relative w-full max-w-xs animate-in zoom-in-95 duration-200">
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-primary/50 to-primary rounded-3xl blur-lg opacity-30" />
            
            {/* Card content */}
            <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl border border-white/10 p-5 shadow-2xl">
              {/* Header */}
              <div className="text-center mb-4">
                <span className="text-xs text-white/50 uppercase tracking-wider">{priceKeypad.label}</span>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-white/40 text-lg">RD$</span>
                  <span className="font-oswald text-4xl font-bold text-white">
                    {priceKeypad.value || '0'}
                  </span>
                </div>
              </div>
              
              {/* Keypad Grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === '⌫') {
                        setPriceKeypad(p => ({ ...p, value: p.value.slice(0, -1) }));
                      } else if (key === '.') {
                        if (!priceKeypad.value.includes('.')) {
                          setPriceKeypad(p => ({ ...p, value: p.value + '.' }));
                        }
                      } else {
                        setPriceKeypad(p => ({ ...p, value: p.value + key }));
                      }
                    }}
                    className={`h-14 rounded-xl font-oswald text-xl font-bold transition-all active:scale-95 ${
                      key === '⌫' 
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
              
              {/* Quick amounts */}
              <div className="grid grid-cols-4 gap-1.5 mb-4">
                {[50, 100, 250, 500].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setPriceKeypad(p => ({ ...p, value: String(amount) }))}
                    className="py-2 rounded-lg bg-primary/20 text-primary text-xs font-bold hover:bg-primary/30 transition-all active:scale-95"
                  >
                    {amount}
                  </button>
                ))}
              </div>
              
              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPriceKeypad({ open: false, field: null, value: '' })}
                  className="py-3 rounded-xl bg-white/10 text-white font-oswald font-bold hover:bg-white/20 transition-all active:scale-95"
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const val = parseFloat(priceKeypad.value) || 0;
                    if (priceKeypad.field === 'price_a') {
                      setProduct(p => ({ ...p, price_a: val, price: val }));
                    } else {
                      setProduct(p => ({ ...p, [priceKeypad.field]: val }));
                    }
                    setPriceKeypad({ open: false, field: null, value: '' });
                  }}
                  className="py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white font-oswald font-bold hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/30"
                >
                  CONFIRMAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
