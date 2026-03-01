import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { productsAPI, categoriesAPI, modifiersAPI, reportCategoriesAPI } from '@/lib/api';
import { ArrowLeft, Save, Package, Tag, DollarSign, Palette, ListChecks, Plus, Trash2, GripVertical, FileText, List, Printer, Check, Image, ImageIcon, Pizza, Coffee, Sandwich, IceCream, Soup, Wine, Beer, Beef, Fish, Salad, Cookie, Cake, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { NumericInput } from '@/components/NumericKeypad';

const PRESET_COLORS = [
  '#FF6600', '#4CAF50', '#2196F3', '#9C27B0', '#E91E63', '#FFB300',
  '#00BCD4', '#795548', '#607D8B', '#F44336', '#3F51B5', '#8BC34A',
  '#FF5722', '#673AB7', '#009688', '#CDDC39', '#FFC107', '#03A9F4'
];

// Iconos predefinidos para productos de restaurante
const PRODUCT_ICONS = [
  { id: 'pizza', label: 'Pizza', Icon: Pizza },
  { id: 'coffee', label: 'Café', Icon: Coffee },
  { id: 'sandwich', label: 'Sandwich', Icon: Sandwich },
  { id: 'ice-cream', label: 'Helado', Icon: IceCream },
  { id: 'soup', label: 'Sopa', Icon: Soup },
  { id: 'wine', label: 'Vino', Icon: Wine },
  { id: 'beer', label: 'Cerveza', Icon: Beer },
  { id: 'beef', label: 'Carne', Icon: Beef },
  { id: 'fish', label: 'Pescado', Icon: Fish },
  { id: 'salad', label: 'Ensalada', Icon: Salad },
  { id: 'cookie', label: 'Galleta', Icon: Cookie },
  { id: 'cake', label: 'Postre', Icon: Cake },
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
    image_url: '',  // URL de imagen del producto
    icon: '',       // Icono de Lucide (ej: 'pizza', 'coffee', 'sandwich')
    track_inventory: false,
    print_channels: [],  // Array of channel codes for multi-channel printing
    tax_exemptions: [],  // Array of tax IDs this product is exempt from
    use_category_taxes: true,  // If true, inherit tax settings from category
    modifier_assignments: [],
    // Recipe fields (for display)
    recipe_ingredients: []
  });

  // Print channels state
  const [printChannels, setPrintChannels] = useState([]);
  // Tax config state
  const [taxConfig, setTaxConfig] = useState([]);

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
      const [catRes, reportCatRes, modRes, channelsRes, taxRes] = await Promise.all([
        categoriesAPI.list(),
        reportCategoriesAPI.list(),
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/modifier-groups-with-options`).then(r => r.json()),
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/print-channels`).then(r => r.json()),
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/taxes/config`).then(r => r.json())
      ]);
      setCategories(catRes.data);
      setReportCategories(reportCatRes.data);
      setModifierGroups(Array.isArray(modRes) ? modRes : modRes.data || []);
      setPrintChannels(channelsRes || []);
      setTaxConfig(taxRes || []);

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
          image_url: p.image_url || '',
          icon: p.icon || '',
          track_inventory: p.track_inventory || false,
          print_channels: p.print_channels || [],
          tax_exemptions: p.tax_exemptions || [],
          use_category_taxes: p.use_category_taxes !== false,  // Default to true
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
        printed_name: product.printed_name || product.name,
        print_channels: product.print_channels || [],
        tax_exemptions: product.tax_exemptions || []
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
          track_inventory: false,
          print_channels: [],
          tax_exemptions: []
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

                {/* Canal de Impresión */}
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Printer size={14} className="text-orange-500" />
                    <span className="text-sm font-semibold">Canal de Impresión</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Selecciona dónde se imprime la comanda. Si no seleccionas ninguno, usará el canal de la categoría.
                    Puedes seleccionar varios para combos (ej: comida a Cocina + bebida a Bar).
                  </p>
                  
                  <div className="space-y-2">
                    {/* Opción por defecto - Usar Categoría */}
                    <div 
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                        product.print_channels.length === 0 
                          ? 'bg-orange-500/10 border-orange-500/50' 
                          : 'bg-background border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setProduct(p => ({ ...p, print_channels: [] }))}
                      data-testid="print-channel-default"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        product.print_channels.length === 0 
                          ? 'border-orange-500 bg-orange-500' 
                          : 'border-muted-foreground'
                      }`}>
                        {product.print_channels.length === 0 && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium">Usar el de la Categoría</span>
                        <p className="text-[10px] text-muted-foreground">Hereda el canal configurado para la categoría del producto</p>
                      </div>
                      <Badge variant="secondary" className="text-[9px]">Por defecto</Badge>
                    </div>

                    {/* Lista de canales disponibles */}
                    {printChannels.filter(ch => ch.active).map(channel => {
                      const isSelected = product.print_channels.includes(channel.code);
                      return (
                        <div 
                          key={channel.id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-orange-500/10 border-orange-500/50' 
                              : 'bg-background border-border hover:border-muted-foreground'
                          }`}
                          onClick={() => {
                            setProduct(p => {
                              const current = p.print_channels || [];
                              if (current.includes(channel.code)) {
                                // Remove channel
                                return { ...p, print_channels: current.filter(c => c !== channel.code) };
                              } else {
                                // Add channel
                                return { ...p, print_channels: [...current, channel.code] };
                              }
                            });
                          }}
                          data-testid={`print-channel-${channel.code}`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isSelected 
                              ? 'border-orange-500 bg-orange-500' 
                              : 'border-muted-foreground'
                          }`}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                          <div className="flex-1">
                            <span className="text-sm font-medium">{channel.name}</span>
                            {channel.printer_name && (
                              <p className="text-[10px] text-muted-foreground">Impresora: {channel.printer_name}</p>
                            )}
                          </div>
                          <Badge 
                            variant="outline" 
                            className={`text-[9px] ${
                              channel.code === 'kitchen' ? 'border-orange-500/50 text-orange-500' :
                              channel.code === 'bar' ? 'border-purple-500/50 text-purple-500' :
                              channel.code === 'receipt' ? 'border-green-500/50 text-green-500' :
                              'border-blue-500/50 text-blue-500'
                            }`}
                          >
                            {channel.code}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>

                  {/* Indicador de canales seleccionados */}
                  {product.print_channels.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">Imprimirá en:</span>
                      {product.print_channels.map(code => {
                        const ch = printChannels.find(c => c.code === code);
                        return (
                          <Badge key={code} className="bg-orange-500/20 text-orange-400 text-[10px]">
                            {ch?.name || code}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Impuestos Aplicables */}
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign size={14} className="text-green-500" />
                    <span className="text-sm font-semibold">Impuestos Aplicables</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Configura qué impuestos aplican a este producto. Puedes heredar de la categoría o configurar individualmente.
                  </p>
                  
                  {/* Usar el de la Categoría - Similar to print channels */}
                  <div 
                    className={`flex items-center justify-between p-3 rounded-lg border mb-3 transition-all cursor-pointer ${
                      product.use_category_taxes 
                        ? 'bg-green-500/10 border-green-500/50' 
                        : 'bg-background border-border hover:bg-muted/30'
                    }`}
                    onClick={() => setProduct(p => ({ ...p, use_category_taxes: !p.use_category_taxes, tax_exemptions: [] }))}
                    data-testid="use-category-taxes-toggle"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        product.use_category_taxes 
                          ? 'border-green-500 bg-green-500' 
                          : 'border-muted-foreground'
                      }`}>
                        {product.use_category_taxes && <Check size={12} className="text-white" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium">Usar el de la Categoría</span>
                        <p className="text-[10px] text-muted-foreground">Hereda configuración de impuestos de la categoría del producto</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[9px] ${product.use_category_taxes ? 'border-green-500/50 text-green-500' : ''}`}>
                      {product.use_category_taxes ? 'Por defecto' : ''}
                    </Badge>
                  </div>
                  
                  {/* Individual tax toggles - only show when not using category taxes */}
                  {!product.use_category_taxes && (
                    <div className="space-y-2">
                      {taxConfig.filter(tax => tax.is_active).map(tax => {
                        const isExempt = (product.tax_exemptions || []).includes(tax.id);
                        const isApplied = !isExempt;
                        return (
                          <div 
                            key={tax.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                              isApplied 
                                ? 'bg-green-500/10 border-green-500/50' 
                                : 'bg-red-500/5 border-red-500/30'
                            }`}
                            onClick={() => {
                              setProduct(p => {
                                const current = p.tax_exemptions || [];
                                if (current.includes(tax.id)) {
                                  // Remove from exemptions (re-apply tax)
                                  return { ...p, tax_exemptions: current.filter(id => id !== tax.id) };
                                } else {
                                  // Add to exemptions (exempt from tax)
                                  return { ...p, tax_exemptions: [...current, tax.id] };
                                }
                              });
                            }}
                            data-testid={`tax-toggle-${tax.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                isApplied 
                                  ? 'border-green-500 bg-green-500' 
                                  : 'border-muted-foreground'
                              }`}>
                                {isApplied && <Check size={12} className="text-white" />}
                              </div>
                              <div>
                                <span className="text-sm font-medium">{tax.description}</span>
                                <p className="text-[10px] text-muted-foreground">{tax.rate}%</p>
                              </div>
                            </div>
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] ${
                                isApplied 
                                  ? 'border-green-500/50 text-green-500' 
                                  : 'border-red-500/50 text-red-500'
                              }`}
                            >
                              {isApplied ? 'Aplica' : 'Exento'}
                            </Badge>
                          </div>
                        );
                      })}
                      
                      {taxConfig.filter(tax => tax.is_active).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No hay impuestos configurados. Ve a Configuración → Ventas → Impuestos.
                        </p>
                      )}

                      {/* Resumen de impuestos exentos */}
                      {(product.tax_exemptions || []).length > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">Exento de:</span>
                          {(product.tax_exemptions || []).map(taxId => {
                            const tax = taxConfig.find(t => t.id === taxId);
                            return (
                              <Badge key={taxId} className="bg-red-500/20 text-red-400 text-[10px]">
                                {tax?.name || taxId}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Imagen / Icono del Producto */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon size={14} /> Imagen / Icono del Producto
                </h3>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Opcional: Sube una imagen desde tu PC, pega una URL, o selecciona un icono
                </p>
                
                {/* Subir imagen desde PC */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Subir imagen desde tu PC</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        // Validar tamaño (5MB max)
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error('Imagen muy grande. Máximo 5MB');
                          return;
                        }
                        
                        // Subir imagen
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        try {
                          toast.loading('Subiendo imagen...', { id: 'upload' });
                          const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/products/upload-image`, {
                            method: 'POST',
                            body: formData
                          });
                          
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.detail || 'Error al subir');
                          }
                          
                          const data = await res.json();
                          // Construir URL completa
                          const imageUrl = `${process.env.REACT_APP_BACKEND_URL}${data.url}`;
                          setProduct(p => ({ ...p, image_url: imageUrl, icon: '' }));
                          toast.success('Imagen subida correctamente', { id: 'upload' });
                        } catch (err) {
                          toast.error(err.message || 'Error al subir imagen', { id: 'upload' });
                        }
                        
                        // Limpiar input
                        e.target.value = '';
                      }}
                      className="hidden"
                      id="product-image-upload"
                      data-testid="product-image-upload"
                    />
                    <label
                      htmlFor="product-image-upload"
                      className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors"
                    >
                      <Image size={16} className="text-primary" />
                      <span className="text-sm font-medium text-primary">Seleccionar imagen</span>
                    </label>
                    <span className="text-[10px] text-muted-foreground">
                      JPG, PNG, WebP o GIF (máx. 5MB)
                    </span>
                  </div>
                </div>

                {/* Separador */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs text-muted-foreground">o</span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>

                {/* URL de Imagen */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Pegar URL de imagen</label>
                  <input 
                    value={product.image_url}
                    onChange={e => setProduct(p => ({ ...p, image_url: e.target.value, icon: '' }))}
                    placeholder="https://ejemplo.com/imagen.jpg"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                    data-testid="product-image-url-input"
                  />
                </div>

                {/* Separador */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs text-muted-foreground">o</span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>

                {/* O selecciona un icono */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Seleccionar un Icono</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setProduct(p => ({ ...p, icon: '', image_url: '' }))}
                      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xs transition-all ${
                        !product.icon && !product.image_url ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-muted-foreground'
                      }`}
                      title="Sin icono"
                    >
                      ✕
                    </button>
                    {PRODUCT_ICONS.map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        onClick={() => setProduct(p => ({ ...p, icon: id, image_url: '' }))}
                        className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                          product.icon === id ? 'border-primary bg-primary/10 scale-110' : 'border-border bg-background hover:border-muted-foreground'
                        }`}
                        title={label}
                      >
                        <Icon size={18} className={product.icon === id ? 'text-primary' : 'text-muted-foreground'} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview de imagen/icono */}
                {(product.image_url || product.icon) && (
                  <div className="pt-3 border-t border-border">
                    <label className="text-xs text-muted-foreground mb-2 block">Vista Previa</label>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl border border-border bg-background flex items-center justify-center overflow-hidden">
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt="Preview" 
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : product.icon ? (
                          (() => {
                            const iconData = PRODUCT_ICONS.find(i => i.id === product.icon);
                            if (iconData) {
                              const IconComponent = iconData.Icon;
                              return <IconComponent size={32} className="text-primary" />;
                            }
                            return null;
                          })()
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Así aparecerá en el botón de producto
                      </span>
                    </div>
                  </div>
                )}
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
                      className="px-4 py-3 rounded-xl font-oswald font-bold text-sm transition-all hover:scale-105 flex items-center gap-2"
                      style={{
                        backgroundColor: product.button_bg_color || '#3f3f46',
                        color: product.button_text_color || '#FFFFFF'
                      }}
                    >
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-6 h-6 rounded object-cover" />
                      ) : product.icon ? (
                        (() => {
                          const iconData = PRODUCT_ICONS.find(i => i.id === product.icon);
                          if (iconData) {
                            const IconComponent = iconData.Icon;
                            return <IconComponent size={16} />;
                          }
                          return null;
                        })()
                      ) : null}
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
        <DialogContent className="max-w-md bg-card border-border" data-testid="modifier-assignment-dialog">
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
              <div className="flex gap-2">
                <select 
                  value={modAssignDialog.group_id}
                  onChange={e => setModAssignDialog(p => ({ ...p, group_id: e.target.value }))}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
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
                {/* Edit & Delete group buttons */}
                {modAssignDialog.group_id && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={async () => {
                        const g = modifierGroups.find(g => g.id === modAssignDialog.group_id);
                        const newName = window.prompt('Nuevo nombre del grupo:', g?.name || '');
                        if (!newName || !newName.trim() || newName === g?.name) return;
                        try {
                          const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/modifier-groups/${modAssignDialog.group_id}`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName.trim() })
                          });
                          if (!res.ok) throw new Error();
                          setModifierGroups(prev => prev.map(g => g.id === modAssignDialog.group_id ? { ...g, name: newName.trim() } : g));
                          toast.success('Grupo renombrado');
                        } catch { toast.error('Error al renombrar grupo'); }
                      }}
                      className="p-2 rounded-lg border border-border hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                      title="Renombrar grupo"
                      data-testid="rename-group-btn"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={async () => {
                        const g = modifierGroups.find(g => g.id === modAssignDialog.group_id);
                        if (!window.confirm(`Eliminar grupo "${g?.name}" y todas sus opciones?`)) return;
                        try {
                          const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/modifier-groups/${modAssignDialog.group_id}`, { method: 'DELETE' });
                          if (!res.ok) throw new Error();
                          const deletedId = modAssignDialog.group_id;
                          setModifierGroups(prev => prev.filter(g => g.id !== deletedId));
                          setProduct(prev => ({ ...prev, modifier_assignments: prev.modifier_assignments.filter(a => a.group_id !== deletedId) }));
                          setModAssignDialog(p => ({ ...p, group_id: '' }));
                          toast.success('Grupo eliminado');
                        } catch { toast.error('Error al eliminar grupo'); }
                      }}
                      className="p-2 rounded-lg border border-red-500/30 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
                      title="Eliminar grupo"
                      data-testid="delete-group-btn"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              {modAssignDialog.editIndex === null && (
                <button 
                  onClick={async () => {
                    const name = window.prompt('Nombre del nuevo grupo de preguntas:');
                    if (!name || !name.trim()) return;
                    try {
                      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/modifier-groups`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name.trim(), min_selection: 0, max_selection: 0 })
                      });
                      const newGroup = await res.json();
                      newGroup.options = [];
                      setModifierGroups(prev => [...prev, newGroup]);
                      setModAssignDialog(p => ({ ...p, group_id: newGroup.id }));
                    } catch {}
                  }}
                  className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                  data-testid="create-new-group-btn"
                >
                  <Plus size={12} /> Crear Nuevo Grupo
                </button>
              )}
            </div>

            {/* Min selections */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Selecciones Mínimas</label>
              <input 
                type="number"
               
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

            {/* Options list - fully editable: name, price, add, delete */}
            {modAssignDialog.group_id && (() => {
              const selectedGroup = modifierGroups.find(g => g.id === modAssignDialog.group_id);
              const options = selectedGroup?.options || [];
              const API_BASE = process.env.REACT_APP_BACKEND_URL;
              
              const updateOption = (idx, field, value) => {
                setModifierGroups(prev => prev.map(g => {
                  if (g.id !== modAssignDialog.group_id) return g;
                  return { ...g, options: g.options.map((o, i) => i === idx ? { ...o, [field]: value } : o) };
                }));
              };
              
              const persistOption = (opt) => {
                if (!opt.id) return;
                fetch(`${API_BASE}/api/modifiers/${opt.id}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: opt.name, price: opt.price || 0, group_id: opt.group_id || modAssignDialog.group_id })
                });
              };
              
              const addNewOption = async () => {
                try {
                  const res = await fetch(`${API_BASE}/api/modifiers`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group_id: modAssignDialog.group_id, name: 'Nueva Opcion', price: 0 })
                  });
                  const newOpt = await res.json();
                  setModifierGroups(prev => prev.map(g => {
                    if (g.id !== modAssignDialog.group_id) return g;
                    return { ...g, options: [...(g.options || []), newOpt] };
                  }));
                } catch {}
              };
              
              const deleteOption = async (opt, idx) => {
                if (!opt.id) return;
                await fetch(`${API_BASE}/api/modifiers/${opt.id}`, { method: 'DELETE' });
                setModifierGroups(prev => prev.map(g => {
                  if (g.id !== modAssignDialog.group_id) return g;
                  return { ...g, options: g.options.filter((_, i) => i !== idx) };
                }));
              };
              
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-muted-foreground">Opciones ({options.length})</label>
                    <button onClick={addNewOption} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium" data-testid="add-group-option-btn">
                      <Plus size={12} /> Agregar Opcion
                    </button>
                  </div>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {options.map((opt, idx) => (
                      <div key={opt.id || idx} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border" data-testid={`option-row-${idx}`}>
                        <input
                          value={opt.name}
                          onChange={e => updateOption(idx, 'name', e.target.value)}
                          onBlur={() => persistOption(options[idx])}
                          className="flex-1 bg-transparent border-none text-sm outline-none min-w-0"
                          placeholder="Nombre opcion"
                          data-testid={`option-name-${idx}`}
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-muted-foreground">RD$</span>
                          <input
                            type="number"
                            value={opt.price || 0}
                            onChange={e => updateOption(idx, 'price', parseFloat(e.target.value) || 0)}
                            onBlur={() => persistOption(options[idx])}
                            className="w-16 bg-card border border-border rounded px-2 py-1 text-sm text-right font-mono"
                            data-testid={`option-price-${idx}`}
                          />
                        </div>
                        <button onClick={() => deleteOption(opt, idx)} className="text-red-400 hover:text-red-300 shrink-0 p-1" data-testid={`option-delete-${idx}`}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {options.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-4">Sin opciones. Haz clic en "Agregar Opcion".</p>
                    )}
                  </div>
                </div>
              );
            })()}

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
