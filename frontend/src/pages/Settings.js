import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { areasAPI, tablesAPI, reasonsAPI, categoriesAPI, productsAPI, inventorySettingsAPI, warehousesAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Settings as SettingsIcon, MapPin, Table2, AlertTriangle, Plus, Trash2, Package, Tag, Users, CreditCard, Shield, Pencil, Printer, ShoppingBag, Cog, BarChart3, Truck, Heart, Percent, ChevronRight, Banknote, X, Check, Smartphone, Building2, DollarSign, Euro, Palette, GripVertical, RotateCcw, ListChecks, CirclePlus, Search, Sparkles, Database, ServerCrash, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const PERM_LABELS = {
  view_dashboard: 'Ver Dashboard',
  move_tables: 'Mover Mesas', resize_tables: 'Redimensionar Mesas',
  open_table: 'Abrir Mesa', add_products: 'Agregar Productos',
  void_items: 'Anular Items', send_kitchen: 'Enviar a Cocina',
  create_bill: 'Crear Factura', collect_payment: 'Cobrar', split_bill: 'Dividir Cuenta',
  manage_users: 'Config: Usuarios', manage_areas: 'Config: Areas',
  manage_tables: 'Config: Mesas', manage_payment_methods: 'Config: Pagos',
  manage_payment_config: 'Config: Montos Rápidos',
  manage_cancellation_reasons: 'Config: Anulaciones', manage_products: 'Config: Productos',
  manage_sale_types: 'Config: Ventas', manage_print_channels: 'Config: Impresion',
  manage_station_config: 'Config: Estacion',
  manage_inventory: 'Inventario', manage_suppliers: 'Proveedores',
  manage_customers: 'Clientes', manage_reservations: 'Reservaciones',
  view_reports: 'Reportes', export_dgii: 'Exportar DGII',
  open_shift: 'Abrir Turno', close_shift: 'Cerrar Turno', close_day: 'Cierre de Dia',
  release_reserved_table: 'Desbloquear Mesa Reservada',
};

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme, saveTheme, resetTheme, defaultTheme } = useTheme();
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [saleTypes, setSaleTypes] = useState([]);
  const [printChannels, setPrintChannels] = useState([]);
  const [categoryChannels, setCategoryChannels] = useState([]); // Category to channel mappings
  const [stationConfig, setStationConfig] = useState({ require_shift_to_sell: true, require_cash_count: false, auto_send_on_logout: true });
  const [roles, setRoles] = useState([]);
  const [roleDialog, setRoleDialog] = useState({ open: false, name: '', code: '', editId: null });
  const [taxConfig, setTaxConfig] = useState([]);
  
  // Check if user can access theme settings (admin, manager, owner, gerente, propietario)
  const canAccessTheme = ['admin', 'manager', 'owner', 'propietario', 'gerente'].includes(user?.role);

  // Read URL params to determine initial tab state
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'users';
  const initialSubtab = searchParams.get('subtab');

  // Main tab state
  const [mainTab, setMainTab] = useState(initialTab);
  
  // Sub-tab states
  const [mesasSubTab, setMesasSubTab] = useState('mesas');
  const [ventasSubTab, setVentasSubTab] = useState('pagos');
  const [inventarioSubTab, setInventarioSubTab] = useState(initialSubtab === 'productos' ? 'productos' : 'categorias');

  // Product search state
  const [productSearch, setProductSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // User search and filter state
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');

  const [areaDialog, setAreaDialog] = useState({ open: false, name: '', color: '#FF6600', editId: null });
  const [tableDialog, setTableDialog] = useState({ open: false, number: '', area_id: '', capacity: 4, shape: 'round', editId: null });
  const [reasonDialog, setReasonDialog] = useState({ open: false, name: '', return_to_inventory: true });
  const [userDialog, setUserDialog] = useState({ open: false, name: '', pin: '', role: 'waiter', editId: null, permissions: {} });
  const [payDialog, setPayDialog] = useState({ 
    open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
    bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null, is_cash: true 
  });
  const [saleDialog, setSaleDialog] = useState({ open: false, name: '', code: '', tax_exemptions: [], editId: null });
  const [channelDialog, setChannelDialog] = useState({ open: false, name: '', type: 'kitchen', target: 'screen', ip: '', editId: null });
  const [categoryDialog, setCategoryDialog] = useState({ open: false, name: '', color: '#FF6600', editId: null, print_channel: '' });
  
  // System Config
  const [systemConfig, setSystemConfig] = useState({ 
    timezone_offset: -4, 
    restaurant_name: 'Mi Restaurante', 
    rnc: '000-000000-0',
    currency: 'RD$',
    quick_amounts: [100, 200, 500, 1000, 2000, 5000]
  });
  const [timezones, setTimezones] = useState([]);
  const [quickAmountInput, setQuickAmountInput] = useState('');
  const [modifiers, setModifiers] = useState([]);
  const [modifierDialog, setModifierDialog] = useState({ 
    open: false, name: '', required: false, max_selections: 5, options: [], editId: null 
  });
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState(0);
  
  // Inventory Settings State
  const [inventorySettings, setInventorySettings] = useState({
    allow_sale_without_stock: false,
    auto_deduct_on_payment: true,
    default_warehouse_id: '',
    show_stock_alerts: true
  });
  const [warehouses, setWarehouses] = useState([]);
  const [savingInventorySettings, setSavingInventorySettings] = useState(false);

  // Factory Reset State (Admin Only)
  const [resetDialog, setResetDialog] = useState({
    open: false,
    resetSales: false,
    resetInventory: false,
    resetUsers: false,
    confirmPin: '',
    showWarning: false,
    loading: false
  });

  const fetchAll = async () => {
    try {
      const [aRes, tRes, rRes, cRes, pRes, uRes, pmRes, modRes] = await Promise.all([
        areasAPI.list(), tablesAPI.list(), reasonsAPI.list(), categoriesAPI.list(), productsAPI.list(),
        axios.get(`${API}/users`, { headers: hdrs() }),
        axios.get(`${API}/payment-methods`, { headers: hdrs() }),
        axios.get(`${API}/modifiers`, { headers: hdrs() }),
      ]);
      setAreas(aRes.data); setTables(tRes.data); setReasons(rRes.data);
      setCategories(cRes.data); setProducts(pRes.data);
      setUsers(uRes.data); setPayMethods(pmRes.data);
      setModifiers(modRes.data);
      try {
        const [stRes, pcRes, scRes, sysRes, tzRes, ccRes] = await Promise.all([
          axios.get(`${API}/sale-types`, { headers: hdrs() }),
          axios.get(`${API}/print-channels`, { headers: hdrs() }),
          axios.get(`${API}/station-config`, { headers: hdrs() }),
          axios.get(`${API}/system/config`, { headers: hdrs() }),
          axios.get(`${API}/system/timezones`, { headers: hdrs() }),
          axios.get(`${API}/category-channels`, { headers: hdrs() }),
        ]);
        setSaleTypes(stRes.data); setPrintChannels(pcRes.data); setStationConfig(scRes.data);
        setSystemConfig(sysRes.data);
        setTimezones(tzRes.data);
        setCategoryChannels(ccRes.data || []);
        const rolesRes = await axios.get(`${API}/roles`, { headers: hdrs() });
        setRoles(rolesRes.data);
        const taxRes = await axios.get(`${API}/tax-config`, { headers: hdrs() });
        setTaxConfig(taxRes.data);
        // Load inventory settings and warehouses
        try {
          const [invSettingsRes, whRes] = await Promise.all([
            inventorySettingsAPI.get(),
            warehousesAPI.list()
          ]);
          setInventorySettings(invSettingsRes.data);
          setWarehouses(whRes.data || []);
        } catch {}
      } catch {}
    } catch {}
  };

  useEffect(() => { fetchAll(); }, []);

  // Filter users based on search and role
  const filteredUsers = users.filter(u => {
    if (u.active === false) return false;
    
    // Search filter
    if (userSearch) {
      const searchLower = userSearch.toLowerCase();
      const nameMatch = (u.name || '').toLowerCase().includes(searchLower);
      const lastNameMatch = (u.last_name || '').toLowerCase().includes(searchLower);
      const posNameMatch = (u.pos_name || '').toLowerCase().includes(searchLower);
      if (!nameMatch && !lastNameMatch && !posNameMatch) return false;
    }
    
    // Role filter
    if (userRoleFilter && u.role !== userRoleFilter) return false;
    
    return true;
  });

  // Area handlers
  const handleSaveArea = async () => {
    if (!areaDialog.name.trim()) return;
    try {
      if (areaDialog.editId) {
        await areasAPI.update(areaDialog.editId, { name: areaDialog.name, color: areaDialog.color });
      } else {
        await areasAPI.create({ name: areaDialog.name, color: areaDialog.color });
      }
      toast.success(areaDialog.editId ? 'Area actualizada' : 'Area creada');
      setAreaDialog({ open: false, name: '', color: '#FF6600', editId: null }); fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleSaveTable = async () => {
    if (!tableDialog.number || !tableDialog.area_id) return;
    try {
      const data = { 
        number: parseInt(tableDialog.number), 
        area_id: tableDialog.area_id,
        capacity: parseInt(tableDialog.capacity) || 4, 
        shape: tableDialog.shape 
      };
      if (tableDialog.editId) {
        await tablesAPI.update(tableDialog.editId, data);
        toast.success('Mesa actualizada');
      } else {
        await tablesAPI.create({ ...data, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 });
        toast.success('Mesa creada');
      }
      setTableDialog({ open: false, number: '', area_id: '', capacity: 4, shape: 'round', editId: null }); 
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleAddReason = async () => {
    if (!reasonDialog.name.trim()) return;
    try {
      await reasonsAPI.create({ name: reasonDialog.name, return_to_inventory: reasonDialog.return_to_inventory });
      toast.success('Razon creada');
      setReasonDialog({ open: false, name: '', return_to_inventory: true }); fetchAll();
    } catch { toast.error('Error'); }
  };

  // User handlers
  const handleSaveUser = async () => {
    if (!userDialog.name) return;
    try {
      if (userDialog.editId) {
        const data = { name: userDialog.name, role: userDialog.role, permissions: userDialog.permissions };
        if (userDialog.pin && userDialog.pin.length >= 4) data.pin = userDialog.pin;
        await axios.put(`${API}/users/${userDialog.editId}`, data, { headers: hdrs() });
        toast.success('Usuario actualizado');
      } else {
        if (!userDialog.pin || userDialog.pin.length < 4) { toast.error('PIN debe tener minimo 4 digitos'); return; }
        await axios.post(`${API}/users`, { name: userDialog.name, pin: userDialog.pin, role: userDialog.role }, { headers: hdrs() });
        toast.success('Usuario creado');
      }
      setUserDialog({ open: false, name: '', pin: '', role: 'waiter', editId: null, permissions: {} }); fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteUser = async (id) => {
    try { await axios.delete(`${API}/users/${id}`, { headers: hdrs() }); toast.success('Usuario desactivado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Payment method handlers
  const handleSavePayMethod = async () => {
    if (!payDialog.name) return;
    try {
      const data = { 
        name: payDialog.name, 
        icon: payDialog.icon, 
        icon_type: payDialog.icon_type,
        brand_icon: payDialog.brand_icon,
        bg_color: payDialog.bg_color,
        text_color: payDialog.text_color,
        currency: payDialog.currency, 
        exchange_rate: parseFloat(payDialog.exchange_rate) || 1,
        is_cash: payDialog.is_cash
      };
      if (payDialog.editId) {
        await axios.put(`${API}/payment-methods/${payDialog.editId}`, data, { headers: hdrs() });
      } else {
        await axios.post(`${API}/payment-methods`, data, { headers: hdrs() });
      }
      toast.success(payDialog.editId ? 'Actualizado' : 'Creado');
      setPayDialog({ 
        open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
        bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null, is_cash: true 
      }); 
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeletePayMethod = async (id) => {
    try { await axios.delete(`${API}/payment-methods/${id}`, { headers: hdrs() }); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Category handlers
  const handleSaveCategory = async () => {
    if (!categoryDialog.name) return;
    try {
      const data = { name: categoryDialog.name, color: categoryDialog.color };
      let categoryId = categoryDialog.editId;
      
      if (categoryDialog.editId) {
        await categoriesAPI.update(categoryDialog.editId, data);
      } else {
        const result = await categoriesAPI.create(data);
        categoryId = result.data?.id;
      }
      
      // Sync print channel assignment automatically
      if (categoryId && categoryDialog.print_channel) {
        await axios.post(`${API}/category-channels`, {
          category_id: categoryId,
          channel_code: categoryDialog.print_channel
        }, { headers: hdrs() });
      } else if (categoryId && !categoryDialog.print_channel) {
        // Remove channel assignment if cleared
        await axios.delete(`${API}/category-channels/${categoryId}`, { headers: hdrs() }).catch(() => {});
      }
      
      toast.success(categoryDialog.editId ? 'Categoría actualizada' : 'Categoría creada');
      setCategoryDialog({ open: false, name: '', color: '#FF6600', editId: null, print_channel: '' }); 
      fetchAll();
    } catch { toast.error('Error al guardar categoría'); }
  };

  const handleDeleteCategory = async (id) => {
    const hasProducts = products.some(p => p.category_id === id);
    if (hasProducts) {
      toast.error('No puedes eliminar una categoría con productos. Mueve los productos primero.');
      return;
    }
    try { 
      await categoriesAPI.delete(id); 
      toast.success('Categoría eliminada'); 
      fetchAll(); 
    }
    catch { toast.error('Error al eliminar'); }
  };

  // Modifier handlers
  const handleSaveModifier = async () => {
    if (!modifierDialog.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (modifierDialog.options.length === 0) {
      toast.error('Debe agregar al menos una opción');
      return;
    }
    try {
      const data = {
        name: modifierDialog.name,
        required: modifierDialog.required,
        max_selections: parseInt(modifierDialog.max_selections) || 5,
        options: modifierDialog.options.map(opt => ({
          id: opt.id || `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: opt.name,
          price: parseFloat(opt.price) || 0
        }))
      };
      if (modifierDialog.editId) {
        await axios.put(`${API}/modifiers/${modifierDialog.editId}`, data, { headers: hdrs() });
      } else {
        await axios.post(`${API}/modifiers`, data, { headers: hdrs() });
      }
      toast.success(modifierDialog.editId ? 'Modificador actualizado' : 'Modificador creado');
      setModifierDialog({ open: false, name: '', required: false, max_selections: 5, options: [], editId: null });
      setNewOptionName('');
      setNewOptionPrice(0);
      fetchAll();
    } catch { toast.error('Error al guardar modificador'); }
  };

  const handleDeleteModifier = async (id) => {
    try { 
      await axios.delete(`${API}/modifiers/${id}`, { headers: hdrs() }); 
      toast.success('Modificador eliminado'); 
      fetchAll(); 
    }
    catch { toast.error('Error al eliminar'); }
  };

  const addOptionToModifier = () => {
    if (!newOptionName.trim()) return;
    setModifierDialog(p => ({
      ...p,
      options: [...p.options, { 
        id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newOptionName, 
        price: parseFloat(newOptionPrice) || 0 
      }]
    }));
    setNewOptionName('');
    setNewOptionPrice(0);
  };

  const removeOptionFromModifier = (optId) => {
    setModifierDialog(p => ({
      ...p,
      options: p.options.filter(o => o.id !== optId)
    }));
  };

  const updateOptionInModifier = (optId, field, value) => {
    setModifierDialog(p => ({
      ...p,
      options: p.options.map(o => o.id === optId ? { ...o, [field]: value } : o)
    }));
  };

  // Sale type handlers
  const handleSaveSaleType = async () => {
    if (!saleDialog.name) return;
    try {
      const data = { 
        name: saleDialog.name, 
        code: saleDialog.code, 
        tax_rate: parseFloat(saleDialog.tax_rate) || 18, 
        tip_default: parseFloat(saleDialog.tip_default) || 0,
        tax_exemptions: saleDialog.tax_exemptions || []
      };
      if (saleDialog.editId) await axios.put(`${API}/sale-types/${saleDialog.editId}`, data, { headers: hdrs() });
      else await axios.post(`${API}/sale-types`, data, { headers: hdrs() });
      toast.success(saleDialog.editId ? 'Actualizado' : 'Creado');
      setSaleDialog({ open: false, name: '', code: '', tax_rate: 18, tip_default: 0, tax_exemptions: [], editId: null }); fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeleteSaleType = async (id) => {
    try { await axios.delete(`${API}/sale-types/${id}`, { headers: hdrs() }); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Print channel handlers
  const handleSaveChannel = async () => {
    if (!channelDialog.name) return;
    try {
      const data = { name: channelDialog.name, type: channelDialog.type, target: channelDialog.target, ip: channelDialog.ip };
      if (channelDialog.editId) await axios.put(`${API}/print-channels/${channelDialog.editId}`, data, { headers: hdrs() });
      else await axios.post(`${API}/print-channels`, data, { headers: hdrs() });
      toast.success(channelDialog.editId ? 'Actualizado' : 'Creado');
      setChannelDialog({ open: false, name: '', type: 'kitchen', target: 'screen', ip: '', editId: null }); fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeleteChannel = async (id) => {
    try { await axios.delete(`${API}/print-channels/${id}`, { headers: hdrs() }); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Station config handler
  const handleSaveStationConfig = async () => {
    try { await axios.put(`${API}/station-config`, stationConfig, { headers: hdrs() }); toast.success('Configuracion guardada'); }
    catch { toast.error('Error'); }
  };

  // System config handler
  const handleSaveSystemConfig = async () => {
    try { 
      await axios.put(`${API}/system/config`, systemConfig, { headers: hdrs() }); 
      toast.success('Configuración del sistema guardada'); 
    }
    catch { toast.error('Error'); }
  };

  // Factory Reset handler (Admin Only)
  const handleFactoryReset = async () => {
    if (!resetDialog.confirmPin) {
      toast.error('Ingresa tu PIN de administrador');
      return;
    }
    
    if (!resetDialog.resetSales && !resetDialog.resetInventory && !resetDialog.resetUsers) {
      toast.error('Selecciona al menos una opción para resetear');
      return;
    }

    setResetDialog(prev => ({ ...prev, loading: true }));
    
    try {
      const response = await axios.post(`${API}/system/factory-reset`, {
        reset_sales: resetDialog.resetSales,
        reset_inventory: resetDialog.resetInventory,
        reset_users: resetDialog.resetUsers,
        admin_pin: resetDialog.confirmPin
      }, { headers: hdrs() });
      
      toast.success('Reset completado exitosamente', {
        description: response.data.details?.join(', ')
      });
      
      // If users were reset, show the new Admin PIN
      if (resetDialog.resetUsers) {
        toast.warning('El PIN del Admin ha sido cambiado a: 11331744', {
          duration: 10000
        });
      }
      
      // Close dialog and reset state
      setResetDialog({
        open: false,
        resetSales: false,
        resetInventory: false,
        resetUsers: false,
        confirmPin: '',
        showWarning: false,
        loading: false
      });
      
      // Refresh data
      fetchAll();
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error durante el reset';
      toast.error(errorMsg);
      setResetDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Role handlers
  const handleSaveRole = async () => {
    if (!roleDialog.name) return;
    try {
      if (roleDialog.editId) {
        await axios.put(`${API}/roles/${roleDialog.editId}`, { name: roleDialog.name, code: roleDialog.code }, { headers: hdrs() });
      } else {
        const code = roleDialog.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        await axios.post(`${API}/roles`, { name: roleDialog.name, code }, { headers: hdrs() });
      }
      toast.success(roleDialog.editId ? 'Rol actualizado' : 'Rol creado');
      setRoleDialog({ open: false, name: '', code: '', editId: null }); fetchAll();
    } catch { toast.error('Error'); }
  };

  // Tax config handler
  const handleSaveTaxConfig = async () => {
    try {
      await axios.put(`${API}/tax-config`, { taxes: taxConfig }, { headers: hdrs() });
      toast.success('Impuestos guardados');
    } catch { toast.error('Error'); }
  };

  const updateTaxRow = (idx, field, value) => {
    setTaxConfig(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  // Sub-tab button component
  const SubTabButton = ({ active, onClick, icon: Icon, label }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-primary/20 text-primary border border-primary/30' 
          : 'bg-card/50 text-muted-foreground border border-border hover:border-primary/30 hover:text-primary'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col" data-testid="settings-page">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-card/50">
        <SettingsIcon size={22} className="text-primary" />
        <h1 className="font-oswald text-xl font-bold tracking-wide">CONFIGURACION</h1>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <Tabs value={mainTab} onValueChange={setMainTab} className="max-w-4xl mx-auto">
          <TabsList className="bg-card border border-border mb-4 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-users">
              <Users size={14} className="mr-1" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="mesas" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-mesas">
              <Table2 size={14} className="mr-1" /> Mesas
            </TabsTrigger>
            <TabsTrigger value="ventas" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-ventas">
              <ShoppingBag size={14} className="mr-1" /> Ventas
            </TabsTrigger>
            <TabsTrigger value="inventario" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-inventario">
              <Package size={14} className="mr-1" /> Inventario
            </TabsTrigger>
            <TabsTrigger value="channels" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-channels">
              <Printer size={14} className="mr-1" /> Impresion
            </TabsTrigger>
            <TabsTrigger value="station" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-station">
              <Cog size={14} className="mr-1" /> Estacion
            </TabsTrigger>
            <TabsTrigger value="reports-cfg" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-reports-cfg">
              <BarChart3 size={14} className="mr-1" /> Reportes
            </TabsTrigger>
            <TabsTrigger value="customers-cfg" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-customers-cfg">
              <Heart size={14} className="mr-1" /> Clientes
            </TabsTrigger>
            {canAccessTheme && (
              <TabsTrigger value="theme" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white font-oswald text-xs" data-testid="tab-theme">
                <Palette size={14} className="mr-1" /> Paleta
              </TabsTrigger>
            )}
            <TabsTrigger value="system" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-system">
              <Cog size={14} className="mr-1" /> Sistema
            </TabsTrigger>
          </TabsList>

          {/* USERS */}
          <TabsContent value="users">
            {/* Search and Filter Section */}
            <div className="mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Search Bar */}
                <div className="relative w-full sm:w-80">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o usuario..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    data-testid="user-search-input"
                  />
                  {userSearch && (
                    <button
                      onClick={() => setUserSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                
                {/* Role Filter Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setUserRoleFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      userRoleFilter === '' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    data-testid="filter-all"
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setUserRoleFilter('admin')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      userRoleFilter === 'admin' 
                        ? 'bg-red-500 text-white' 
                        : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                    }`}
                    data-testid="filter-admin"
                  >
                    Admin
                  </button>
                  <button
                    onClick={() => setUserRoleFilter('waiter')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      userRoleFilter === 'waiter' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
                    }`}
                    data-testid="filter-waiter"
                  >
                    Waiter
                  </button>
                  <button
                    onClick={() => setUserRoleFilter('cashier')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      userRoleFilter === 'cashier' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                    }`}
                    data-testid="filter-cashier"
                  >
                    Cashier
                  </button>
                  <button
                    onClick={() => setUserRoleFilter('kitchen')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      userRoleFilter === 'kitchen' 
                        ? 'bg-orange-500 text-white' 
                        : 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'
                    }`}
                    data-testid="filter-kitchen"
                  >
                    Kitchen
                  </button>
                </div>
                
                {/* Add User Button */}
                <div className="sm:ml-auto">
                  <a href="/user/new"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform" data-testid="add-user-btn">
                    <Plus size={14} /> Nuevo Empleado
                  </a>
                </div>
              </div>
              
              {/* Active filters info */}
              {(userSearch || userRoleFilter) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Mostrando {filteredUsers.length} de {users.filter(u => u.active !== false).length} usuarios</span>
                  {(userSearch || userRoleFilter) && (
                    <button 
                      onClick={() => { setUserSearch(''); setUserRoleFilter(''); }}
                      className="text-primary hover:underline"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* Users List */}
            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users size={48} className="text-muted-foreground/30 mb-4" />
                <h3 className="font-oswald text-lg font-bold text-muted-foreground mb-2">
                  No se encontraron usuarios
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {userSearch 
                    ? `No hay usuarios con "${userSearch}"` 
                    : userRoleFilter 
                      ? `No hay usuarios con rol "${userRoleFilter}"` 
                      : 'No hay usuarios activos'}
                </p>
                <button
                  onClick={() => { setUserSearch(''); setUserRoleFilter(''); }}
                  className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(user => (
                  <a key={user.id} href={`/user/${user.id}`} 
                    className="flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors cursor-pointer" data-testid={`user-${user.id}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-oswald ${
                        user.role === 'admin' ? 'bg-red-500/20 text-red-500' :
                        user.role === 'waiter' ? 'bg-blue-500/20 text-blue-500' :
                        user.role === 'cashier' ? 'bg-green-500/20 text-green-500' :
                        user.role === 'kitchen' ? 'bg-orange-500/20 text-orange-500' :
                        'bg-primary/20 text-primary'
                      }`}>
                        {user.name?.[0]}{user.last_name?.[0] || ''}
                      </div>
                      <div>
                        <span className="font-semibold">{user.name} {user.last_name || ''}</span>
                        <Badge variant="secondary" className={`ml-2 text-[9px] ${
                          user.role === 'admin' ? 'bg-red-500/10 text-red-500' :
                          user.role === 'waiter' ? 'bg-blue-500/10 text-blue-500' :
                          user.role === 'cashier' ? 'bg-green-500/10 text-green-500' :
                          user.role === 'kitchen' ? 'bg-orange-500/10 text-orange-500' : ''
                        }`}>{user.role}</Badge>
                        {user.training_mode && <Badge variant="outline" className="ml-1 text-[9px] border-yellow-500 text-yellow-400">Entrenamiento</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {user.positions?.length > 0 && (
                        <span className="text-xs text-muted-foreground">{user.positions.length} puesto(s)</span>
                      )}
                      <Pencil size={14} className="text-muted-foreground" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </TabsContent>

          {/* MESAS (includes Areas + Tables) */}
          <TabsContent value="mesas">
            <div className="flex items-center gap-2 mb-4">
              <SubTabButton active={mesasSubTab === 'mesas'} onClick={() => setMesasSubTab('mesas')} icon={Table2} label="Mesas" />
              <SubTabButton active={mesasSubTab === 'areas'} onClick={() => setMesasSubTab('areas')} icon={MapPin} label="Areas" />
            </div>

            {mesasSubTab === 'mesas' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold">Mesas</h2>
                  <Button onClick={() => setTableDialog({ open: true, number: '', area_id: areas[0]?.id || '', capacity: 4, shape: 'round', editId: null })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-table-btn">
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {tables.map(table => (
                    <div key={table.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                      <div>
                        <span className="font-oswald font-bold text-primary">#{table.number}</span>
                        <span className="text-sm ml-2">{areas.find(a => a.id === table.area_id)?.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">Cap: {table.capacity} | {table.shape}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" 
                          onClick={() => setTableDialog({ 
                            open: true, 
                            number: String(table.number), 
                            area_id: table.area_id, 
                            capacity: table.capacity, 
                            shape: table.shape, 
                            editId: table.id 
                          })}
                          className="text-muted-foreground hover:text-primary h-8 w-8">
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { tablesAPI.delete(table.id).then(() => { toast.success('Eliminada'); fetchAll(); }); }}
                          className="text-destructive/60 hover:text-destructive h-8 w-8"><Trash2 size={14} /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {mesasSubTab === 'areas' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold">Areas del Restaurante</h2>
                  <Button onClick={() => setAreaDialog({ open: true, name: '', color: '#FF6600', editId: null })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-area-btn">
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {areas.map(area => (
                    <div key={area.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`area-${area.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: area.color }} />
                        <span className="font-semibold">{area.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{tables.filter(t => t.area_id === area.id).length} mesas</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => setAreaDialog({ open: true, name: area.name, color: area.color, editId: area.id })}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { areasAPI.delete(area.id).then(() => { toast.success('Eliminada'); fetchAll(); }); }}
                          className="text-destructive/60 hover:text-destructive h-8 w-8"><Trash2 size={14} /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* VENTAS (includes Pagos, Impuestos, Anulaciones, Tipos de Venta) */}
          <TabsContent value="ventas">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <SubTabButton active={ventasSubTab === 'pagos'} onClick={() => setVentasSubTab('pagos')} icon={CreditCard} label="Formas de Pago" />
              <SubTabButton active={ventasSubTab === 'impuestos'} onClick={() => setVentasSubTab('impuestos')} icon={Percent} label="Impuestos" />
              <SubTabButton active={ventasSubTab === 'anulaciones'} onClick={() => setVentasSubTab('anulaciones')} icon={AlertTriangle} label="Anulaciones" />
              <SubTabButton active={ventasSubTab === 'tipos'} onClick={() => setVentasSubTab('tipos')} icon={ShoppingBag} label="Tipos de Venta" />
            </div>

            {ventasSubTab === 'pagos' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold">Formas de Pago</h2>
                  <Button onClick={() => setPayDialog({ 
                    open: true, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
                    bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null 
                  })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-payment-btn">
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>
                
                {/* Payment Methods Grid - Vista Mejorada */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                  {payMethods.sort((a, b) => (a.order || 0) - (b.order || 0)).map(m => (
                    <div 
                      key={m.id} 
                      className="group relative rounded-2xl overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1"
                      style={{ backgroundColor: m.bg_color || '#6b7280' }}
                      data-testid={`payment-${m.id}`}
                    >
                      {/* Content */}
                      <div 
                        className="p-4 flex flex-col items-center justify-center min-h-[100px]"
                        style={{ color: m.text_color || '#ffffff' }}
                      >
                        {/* Icon */}
                        {m.icon_type === 'brand' && m.brand_icon ? (
                          <div className="w-10 h-6 bg-white/20 rounded flex items-center justify-center text-[8px] font-bold mb-2">
                            {m.brand_icon.toUpperCase()}
                          </div>
                        ) : (
                          (() => {
                            const icons = { banknote: Banknote, 'credit-card': CreditCard, smartphone: Smartphone, building2: Building2, 'dollar-sign': DollarSign };
                            const Icon = icons[m.icon] || Banknote;
                            return <Icon size={24} className="mb-2" />;
                          })()
                        )}
                        <span className="font-oswald font-bold text-sm text-center">{m.name}</span>
                        {m.currency && m.currency !== 'DOP' && (
                          <span className="text-[10px] opacity-70 mt-1">1 = {m.exchange_rate}</span>
                        )}
                      </div>
                      
                      {/* Hover Actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 bg-white/20 hover:bg-white/30 text-white"
                          onClick={() => setPayDialog({ 
                            open: true, 
                            name: m.name, 
                            icon: m.icon || 'banknote', 
                            icon_type: m.icon_type || 'lucide',
                            brand_icon: m.brand_icon || null,
                            bg_color: m.bg_color || '#6b7280',
                            text_color: m.text_color || '#ffffff',
                            currency: m.currency || 'DOP', 
                            exchange_rate: m.exchange_rate || 1, 
                            editId: m.id,
                            is_cash: m.is_cash !== false // default to true if not set
                          })}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 bg-destructive/50 hover:bg-destructive/70 text-white"
                          onClick={() => handleDeletePayMethod(m.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick Amounts Configuration */}
                <div className="bg-card border-2 border-primary/30 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Banknote size={20} className="text-primary" />
                    <h3 className="font-oswald text-base font-bold">Montos Rápidos de Pago</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Estos botones aparecerán en la pantalla de cobro para agilizar el proceso de pago.
                  </p>
                  
                  {/* Current amounts */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(systemConfig.quick_amounts || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No hay montos configurados</p>
                    ) : (
                      (systemConfig.quick_amounts || []).map((amount, i) => (
                        <div key={i} className="flex items-center gap-1 bg-primary/20 text-primary rounded-xl px-4 py-2 font-oswald font-bold">
                          <span className="text-lg">{amount.toLocaleString()}</span>
                          <button 
                            onClick={() => setSystemConfig(p => ({
                              ...p, 
                              quick_amounts: p.quick_amounts.filter((_, idx) => idx !== i)
                            }))}
                            className="ml-2 hover:text-destructive transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Add new amount */}
                  <div className="flex gap-2">
                    <input 
                      type="number"
                      value={quickAmountInput}
                      onChange={e => setQuickAmountInput(e.target.value)}
                      placeholder="Agregar monto (ej: 500, 1000, 5000)..."
                      className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm font-oswald"
                    />
                    <Button 
                      variant="default" 
                      onClick={() => {
                        const val = parseInt(quickAmountInput);
                        if (val > 0) {
                          setSystemConfig(p => ({
                            ...p,
                            quick_amounts: [...(p.quick_amounts || []), val].sort((a, b) => a - b)
                          }));
                          setQuickAmountInput('');
                        }
                      }}
                      className="px-6 bg-primary text-primary-foreground font-oswald font-bold"
                    >
                      <Plus size={18} className="mr-1" /> Agregar
                    </Button>
                  </div>
                  
                  {/* Save button for quick amounts */}
                  <Button 
                    onClick={handleSaveSystemConfig} 
                    className="w-full mt-4 h-11 bg-green-600 hover:bg-green-700 text-white font-oswald font-bold"
                  >
                    <Check size={18} className="mr-2" /> Guardar Montos Rápidos
                  </Button>
                </div>
              </>
            )}

            {ventasSubTab === 'impuestos' && (
              <>
                <h2 className="font-oswald text-base font-bold mb-4">Configuracion de Impuestos</h2>
                <div className="max-w-2xl">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold border-b border-border">
                    <div className="col-span-1">Activo</div>
                    <div className="col-span-4">Descripcion</div>
                    <div className="col-span-2">Tasa %</div>
                    <div className="col-span-3">Aplicar a Propina</div>
                    <div className="col-span-2">Es Propina</div>
                  </div>
                  <div className="space-y-1 mt-1">
                    {taxConfig.map((tax, idx) => (
                      <div key={tax.id || idx} className={`grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-lg border ${tax.active ? 'border-border bg-card' : 'border-border/30 bg-card/30 opacity-60'}`}
                        data-testid={`tax-row-${idx}`}>
                        <div className="col-span-1">
                          <Switch checked={tax.active} onCheckedChange={(v) => updateTaxRow(idx, 'active', v)} />
                        </div>
                        <div className="col-span-4">
                          <input value={tax.description} onChange={e => updateTaxRow(idx, 'description', e.target.value)}
                            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <input value={tax.rate} onChange={e => updateTaxRow(idx, 'rate', parseFloat(e.target.value) || 0)}
                            type="number" step="0.01"
                            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm font-oswald text-right" />
                        </div>
                        <div className="col-span-3 flex items-center justify-center">
                          <Switch checked={tax.apply_to_tip || false} onCheckedChange={(v) => updateTaxRow(idx, 'apply_to_tip', v)} />
                          <span className="text-[9px] text-muted-foreground ml-1">Sobre total</span>
                        </div>
                        <div className="col-span-2 flex items-center justify-center">
                          <Switch checked={tax.is_tip || false} onCheckedChange={(v) => updateTaxRow(idx, 'is_tip', v)} />
                          <span className="text-[9px] text-muted-foreground ml-1">Propina</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-4 rounded-xl bg-background border border-border">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2">Vista Previa (sobre RD$ 1,000.00)</h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span>Subtotal Neto</span><span className="font-oswald">RD$ 1,000.00</span></div>
                      {taxConfig.filter(t => t.active && t.rate > 0).map((tax, i) => {
                        const base = tax.apply_to_tip ? 1000 + taxConfig.filter(t => t.active && t.rate > 0).slice(0, i).reduce((s, t) => s + (1000 * t.rate / 100), 0) : 1000;
                        const amount = base * (tax.rate / 100);
                        return (
                          <div key={i} className="flex justify-between text-muted-foreground">
                            <span>{tax.description} ({tax.rate}%){tax.is_tip ? ' *' : ''}</span>
                            <span className="font-oswald">RD$ {amount.toFixed(2)}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between font-bold border-t border-border pt-1 mt-1">
                        <span>Total General</span>
                        <span className="font-oswald text-primary">
                          RD$ {(1000 + taxConfig.filter(t => t.active && t.rate > 0).reduce((s, t) => {
                            const base = t.apply_to_tip ? 1000 + s : 1000;
                            return s + (base * t.rate / 100);
                          }, 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-2">* = Se identifica como propina en la factura</p>
                  </div>
                  <Button onClick={handleSaveTaxConfig} className="w-full h-11 mt-4 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="save-tax-config">
                    GUARDAR IMPUESTOS
                  </Button>
                </div>
              </>
            )}

            {ventasSubTab === 'anulaciones' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold">Razones de Anulacion</h2>
                  <Button onClick={() => setReasonDialog({ open: true, name: '', return_to_inventory: true })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-reason-btn">
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {reasons.map(reason => (
                    <div key={reason.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                      <div>
                        <span className="font-semibold text-sm">{reason.name}</span>
                        <Badge variant={reason.return_to_inventory ? 'default' : 'destructive'} className="ml-2 text-[9px]">
                          {reason.return_to_inventory ? 'Retorna inventario' : 'No retorna'}
                        </Badge>
                      </div>
                      <Switch checked={reason.return_to_inventory}
                        onCheckedChange={() => { reasonsAPI.update(reason.id, { return_to_inventory: !reason.return_to_inventory }).then(() => { toast.success('Actualizado'); fetchAll(); }); }} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {ventasSubTab === 'tipos' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold">Tipos de Venta</h2>
                  <Button onClick={() => setSaleDialog({ open: true, name: '', code: '', tax_exemptions: [], editId: null })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-saletype-btn">
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {saleTypes.map(st => {
                    const exemptCount = (st.tax_exemptions || []).length;
                    const appliedTaxes = taxConfig.filter(t => t.active && !(st.tax_exemptions || []).includes(t.id));
                    return (
                      <div key={st.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`saletype-${st.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{st.name}</span>
                          <Badge variant="secondary" className="text-[9px]">{st.code}</Badge>
                          {appliedTaxes.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {appliedTaxes.map(t => `${t.description} ${t.rate}%`).join(' + ')}
                            </span>
                          )}
                          {exemptCount > 0 && (
                            <Badge variant="outline" className="text-[9px] border-red-500/50 text-red-500">
                              {exemptCount} exento(s)
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => setSaleDialog({ open: true, name: st.name, code: st.code, tax_exemptions: st.tax_exemptions || [], editId: st.id })}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                            onClick={() => handleDeleteSaleType(st.id)}><Trash2 size={14} /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* INVENTARIO (includes Productos, Compras, Stock) */}
          <TabsContent value="inventario">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <SubTabButton active={inventarioSubTab === 'categorias'} onClick={() => setInventarioSubTab('categorias')} icon={Tag} label="Categorías" />
              <SubTabButton active={inventarioSubTab === 'productos'} onClick={() => setInventarioSubTab('productos')} icon={Package} label="Productos" />
              <SubTabButton active={inventarioSubTab === 'modificadores'} onClick={() => setInventarioSubTab('modificadores')} icon={ListChecks} label="Modificadores" />
              <SubTabButton active={inventarioSubTab === 'compras'} onClick={() => setInventarioSubTab('compras')} icon={Truck} label="Compras" />
              <SubTabButton active={inventarioSubTab === 'stock'} onClick={() => setInventarioSubTab('stock')} icon={BarChart3} label="Stock" />
              <SubTabButton active={inventarioSubTab === 'config'} onClick={() => setInventarioSubTab('config')} icon={Cog} label="Config" />
            </div>

            {/* CATEGORIAS TAB */}
            {inventarioSubTab === 'categorias' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold">Categorías de Productos</h2>
                  <Button onClick={() => setCategoryDialog({ open: true, name: '', color: '#FF6600', editId: null, print_channel: '' })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-category-btn">
                    <Plus size={14} className="mr-1" /> Nueva Categoría
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categories.map(cat => (
                    <div 
                      key={cat.id} 
                      className="flex items-center justify-between p-4 rounded-xl border-2 transition-all hover:shadow-md"
                      style={{ 
                        borderColor: cat.color + '50', 
                        backgroundColor: cat.color + '10' 
                      }}
                      data-testid={`category-${cat.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: cat.color }}
                        >
                          <Tag size={18} className="text-white" />
                        </div>
                        <div>
                          <span className="font-oswald font-bold">{cat.name}</span>
                          <p className="text-[10px] text-muted-foreground">
                            {products.filter(p => p.category_id === cat.id).length} productos
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-white/50"
                          onClick={() => {
                            const currentChannel = categoryChannels.find(cc => cc.category_id === cat.id);
                            setCategoryDialog({ 
                              open: true, 
                              name: cat.name, 
                              color: cat.color || '#FF6600', 
                              editId: cat.id,
                              print_channel: currentChannel?.channel_code || ''
                            });
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteCategory(cat.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {categories.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Tag size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay categorías creadas</p>
                    <p className="text-sm">Crea tu primera categoría para organizar tus productos</p>
                  </div>
                )}
              </>
            )}

            {inventarioSubTab === 'productos' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold flex items-center gap-2">
                    <Package size={18} className="text-primary" />
                    Productos
                    <Badge variant="secondary" className="ml-1 text-[10px]">{products.length}</Badge>
                  </h2>
                  <a href="/product/new?from=products"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform" data-testid="add-product-btn">
                    <Plus size={14} /> Nuevo Producto
                  </a>
                </div>

                {/* Smart Search Bar */}
                <div className={`relative mb-5 transition-all duration-300 ${searchFocused ? 'scale-[1.01]' : ''}`}>
                  <div className={`relative flex items-center bg-background border-2 rounded-2xl overflow-hidden transition-all duration-300 ${
                    searchFocused ? 'border-primary shadow-lg shadow-primary/20' : 'border-border'
                  }`}>
                    <div className={`pl-4 transition-colors ${searchFocused ? 'text-primary' : 'text-muted-foreground'}`}>
                      <Search size={20} />
                    </div>
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                      placeholder="Buscar producto por nombre, categoría o precio..."
                      className="flex-1 bg-transparent px-3 py-3.5 text-sm outline-none placeholder:text-muted-foreground/50"
                      data-testid="product-search-input"
                    />
                    {productSearch && (
                      <button
                        onClick={() => setProductSearch('')}
                        className="p-2 mr-2 rounded-full hover:bg-muted transition-colors"
                      >
                        <X size={16} className="text-muted-foreground" />
                      </button>
                    )}
                    {!productSearch && searchFocused && (
                      <div className="pr-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Sparkles size={12} className="text-primary animate-pulse" />
                        <span>Búsqueda inteligente</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Search results count */}
                  {productSearch && (
                    <div className="mt-2 px-1 text-xs text-muted-foreground flex items-center gap-2">
                      <Search size={12} />
                      {(() => {
                        const filtered = products.filter(p => 
                          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          categories.find(c => c.id === p.category_id)?.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          String(p.price || p.price_a || 0).includes(productSearch)
                        );
                        return `${filtered.length} producto${filtered.length !== 1 ? 's' : ''} encontrado${filtered.length !== 1 ? 's' : ''}`;
                      })()}
                    </div>
                  )}
                </div>

                {/* Products List */}
                <div className="space-y-1">
                  {(() => {
                    // Filter products based on search
                    const filteredProducts = productSearch 
                      ? products.filter(p => 
                          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          categories.find(c => c.id === p.category_id)?.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          String(p.price || p.price_a || 0).includes(productSearch)
                        )
                      : products;

                    // Group by category
                    const categoriesWithProducts = categories.filter(cat => 
                      filteredProducts.some(p => p.category_id === cat.id)
                    );

                    if (filteredProducts.length === 0 && productSearch) {
                      return (
                        <div className="text-center py-12">
                          <Search size={48} className="mx-auto mb-3 text-muted-foreground/30" />
                          <p className="text-muted-foreground font-medium">No se encontraron productos</p>
                          <p className="text-sm text-muted-foreground/70 mt-1">Intenta con "{productSearch.substring(0, 3)}..." u otro término</p>
                        </div>
                      );
                    }

                    return categoriesWithProducts.map(cat => {
                      const catProducts = filteredProducts.filter(p => p.category_id === cat.id);
                      
                      // Function to highlight matching text
                      const highlightText = (text) => {
                        if (!productSearch) return text;
                        const regex = new RegExp(`(${productSearch})`, 'gi');
                        const parts = String(text).split(regex);
                        return parts.map((part, i) => 
                          regex.test(part) ? <mark key={i} className="bg-yellow-400/40 text-yellow-200 rounded px-0.5">{part}</mark> : part
                        );
                      };

                      return (
                        <div key={cat.id}>
                          <h3 className="font-oswald text-xs uppercase text-muted-foreground tracking-wider mt-4 mb-2 flex items-center gap-2">
                            <Tag size={12} style={{ color: cat.color }} /> 
                            {highlightText(cat.name)}
                            <Badge variant="outline" className="text-[9px] h-4">{catProducts.length}</Badge>
                          </h3>
                          {catProducts.map(prod => (
                            <a 
                              key={prod.id} 
                              href={`/product/${prod.id}?from=products`}
                              className="flex items-center justify-between p-3 rounded-xl bg-card/50 border border-border/50 ml-4 mb-1.5 hover:border-primary/50 hover:bg-card hover:shadow-md transition-all cursor-pointer group"
                              data-testid={`product-${prod.id}`}
                            >
                              <div className="flex items-center gap-3">
                                {prod.button_bg_color ? (
                                  <div 
                                    className="w-10 h-10 rounded-lg flex items-center justify-center shadow-inner"
                                    style={{ backgroundColor: prod.button_bg_color }}
                                  >
                                    <Package size={18} style={{ color: prod.button_text_color || '#fff' }} />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                    <Package size={18} className="text-muted-foreground" />
                                  </div>
                                )}
                                <div>
                                  <span className="text-sm font-medium block group-hover:text-primary transition-colors">
                                    {highlightText(prod.name)}
                                  </span>
                                  {prod.printed_name && prod.printed_name !== prod.name && (
                                    <span className="text-[10px] text-muted-foreground">📝 {prod.printed_name}</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-oswald text-sm font-bold text-primary">
                                  RD$ {(prod.price_a || prod.price || 0).toLocaleString()}
                                </span>
                                <div className="flex items-center gap-1 justify-end mt-0.5">
                                  {!prod.active && <Badge variant="destructive" className="text-[8px] h-4">Inactivo</Badge>}
                                  {(prod.modifier_group_ids?.length > 0 || prod.modifier_assignments?.length > 0) && (
                                    <Badge variant="secondary" className="text-[8px] h-4">
                                      {(prod.modifier_group_ids?.length || 0) + (prod.modifier_assignments?.length || 0)} mod
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            )}

            {/* MODIFICADORES TAB */}
            {inventarioSubTab === 'modificadores' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-oswald text-base font-bold">Grupos de Modificadores</h2>
                    <p className="text-xs text-muted-foreground">Opciones adicionales que se pueden agregar a los productos</p>
                  </div>
                  <Button 
                    onClick={() => setModifierDialog({ open: true, name: '', required: false, max_selections: 5, options: [], editId: null })} 
                    size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" 
                    data-testid="add-modifier-btn"
                  >
                    <Plus size={14} className="mr-1" /> Nuevo Modificador
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {modifiers.map(mod => (
                    <div 
                      key={mod.id} 
                      className="bg-card border border-border rounded-xl overflow-hidden"
                      data-testid={`modifier-${mod.id}`}
                    >
                      {/* Modifier Header */}
                      <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <ListChecks size={18} className="text-primary" />
                          </div>
                          <div>
                            <span className="font-oswald font-bold">{mod.name}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {mod.required && (
                                <Badge variant="destructive" className="text-[9px]">Requerido</Badge>
                              )}
                              <Badge variant="outline" className="text-[9px]">
                                Max: {mod.max_selections || 5} selecciones
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {mod.options?.length || 0} opciones
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => {
                              // Ensure all options have unique IDs
                              const optionsWithIds = (mod.options || []).map((opt, idx) => ({
                                ...opt,
                                id: opt.id || `opt-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`
                              }));
                              setModifierDialog({ 
                                open: true, 
                                name: mod.name, 
                                required: mod.required || false,
                                max_selections: mod.max_selections || 5,
                                options: optionsWithIds, 
                                editId: mod.id 
                              });
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteModifier(mod.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Modifier Options */}
                      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {mod.options?.map((opt, idx) => (
                          <div 
                            key={opt.id || idx} 
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border/50"
                          >
                            <span className="text-sm">{opt.name}</span>
                            <span className={`font-oswald text-sm ${opt.price > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                              {opt.price > 0 ? `+RD$ ${opt.price.toFixed(2)}` : 'Gratis'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                
                {modifiers.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <ListChecks size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay modificadores creados</p>
                    <p className="text-sm">Crea modificadores como "Punto de cocción", "Extras", etc.</p>
                  </div>
                )}
              </>
            )}

            {inventarioSubTab === 'compras' && (
              <div className="text-center py-8">
                <Truck size={40} className="mx-auto mb-3 text-primary opacity-50" />
                <h2 className="font-oswald text-lg mb-2">Proveedores & Compras</h2>
                <p className="text-sm text-muted-foreground mb-4">Proveedores, ordenes de compra, recepcion de mercancia</p>
                <a href="/inventory-manager?tab=purchases" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
                  <Truck size={16} /> Abrir Compras
                </a>
              </div>
            )}

            {inventarioSubTab === 'stock' && (
              <div className="text-center py-8">
                <Package size={40} className="mx-auto mb-3 text-primary opacity-50" />
                <h2 className="font-oswald text-lg mb-2">Inventario Maestro</h2>
                <p className="text-sm text-muted-foreground mb-4">Insumos, almacenes, recetas, stock y movimientos</p>
                <a href="/inventory-manager" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
                  <Package size={16} /> Abrir Inventario
                </a>
              </div>
            )}

            {/* INVENTORY CONFIG SUBTAB */}
            {inventarioSubTab === 'config' && (
              <div className="space-y-4 max-w-2xl">
                <h2 className="font-oswald text-base font-bold mb-4">Configuración de Inventario</h2>
                
                {/* Allow Sale Without Stock Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-card border-2 border-border hover:border-primary/30 transition-colors">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={18} className="text-yellow-500" />
                      <span className="text-sm font-semibold">Permitir Venta sin Stock</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Si está <strong>activado</strong>, los productos se pueden vender aunque no haya stock suficiente (inventario negativo). 
                      Si está <strong>desactivado</strong>, los productos agotados se deshabilitan y muestran "Agotado".
                    </p>
                  </div>
                  <Switch 
                    checked={inventorySettings.allow_sale_without_stock}
                    onCheckedChange={async (v) => {
                      const updated = { ...inventorySettings, allow_sale_without_stock: v };
                      setInventorySettings(updated);
                      setSavingInventorySettings(true);
                      try {
                        await inventorySettingsAPI.update(updated);
                        toast.success(v ? 'Venta sin stock activada' : 'Control de stock activado');
                      } catch { toast.error('Error guardando configuración'); }
                      setSavingInventorySettings(false);
                    }}
                    disabled={savingInventorySettings}
                    data-testid="toggle-allow-sale-without-stock"
                  />
                </div>

                {/* Auto Deduct on Payment Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-card border-2 border-border hover:border-primary/30 transition-colors">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Package size={18} className="text-primary" />
                      <span className="text-sm font-semibold">Deducir Inventario al Cobrar</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Al pagar una cuenta, el sistema descuenta automáticamente los ingredientes del inventario 
                      según las recetas de los productos vendidos.
                    </p>
                  </div>
                  <Switch 
                    checked={inventorySettings.auto_deduct_on_payment}
                    onCheckedChange={async (v) => {
                      const updated = { ...inventorySettings, auto_deduct_on_payment: v };
                      setInventorySettings(updated);
                      setSavingInventorySettings(true);
                      try {
                        await inventorySettingsAPI.update(updated);
                        toast.success(v ? 'Deducción automática activada' : 'Deducción automática desactivada');
                      } catch { toast.error('Error guardando configuración'); }
                      setSavingInventorySettings(false);
                    }}
                    disabled={savingInventorySettings}
                    data-testid="toggle-auto-deduct"
                  />
                </div>

                {/* Default Warehouse Select */}
                <div className="p-4 rounded-xl bg-card border-2 border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 size={18} className="text-primary" />
                    <span className="text-sm font-semibold">Almacén Principal</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    El almacén desde donde se deducirá el stock cuando se cobren las ventas.
                  </p>
                  <select 
                    value={inventorySettings.default_warehouse_id || ''}
                    onChange={async (e) => {
                      const updated = { ...inventorySettings, default_warehouse_id: e.target.value };
                      setInventorySettings(updated);
                      setSavingInventorySettings(true);
                      try {
                        await inventorySettingsAPI.update(updated);
                        toast.success('Almacén principal actualizado');
                      } catch { toast.error('Error guardando configuración'); }
                      setSavingInventorySettings(false);
                    }}
                    disabled={savingInventorySettings}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary"
                    data-testid="select-default-warehouse"
                  >
                    <option value="">-- Seleccionar Almacén --</option>
                    {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                    ))}
                  </select>
                  {warehouses.length === 0 && (
                    <p className="text-[10px] text-yellow-500 mt-2">
                      No hay almacenes creados. Ve a Inventario Maestro para crear uno.
                    </p>
                  )}
                </div>

                {/* Show Stock Alerts Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-card border-2 border-border hover:border-primary/30 transition-colors">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={18} className="text-orange-500" />
                      <span className="text-sm font-semibold">Mostrar Alertas de Stock Bajo</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Muestra indicadores visuales en los productos cuando el stock está por debajo del mínimo.
                    </p>
                  </div>
                  <Switch 
                    checked={inventorySettings.show_stock_alerts}
                    onCheckedChange={async (v) => {
                      const updated = { ...inventorySettings, show_stock_alerts: v };
                      setInventorySettings(updated);
                      setSavingInventorySettings(true);
                      try {
                        await inventorySettingsAPI.update(updated);
                        toast.success(v ? 'Alertas de stock activadas' : 'Alertas de stock desactivadas');
                      } catch { toast.error('Error guardando configuración'); }
                      setSavingInventorySettings(false);
                    }}
                    disabled={savingInventorySettings}
                    data-testid="toggle-stock-alerts"
                  />
                </div>
              </div>
            )}
          </TabsContent>

          {/* PRINT CHANNELS */}
          <TabsContent value="channels">
            {/* Link to new Printer Settings */}
            <a 
              href="/settings/printer" 
              className="mb-6 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-orange-500/20 to-orange-600/10 border-2 border-orange-500/30 hover:border-orange-500/50 transition-all group"
              data-testid="printer-settings-link"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
                  <Printer size={24} className="text-white" />
                </div>
                <div>
                  <span className="font-oswald font-bold text-lg">Configurar Impresora USB/Red</span>
                  <p className="text-xs text-muted-foreground">Cola de impresión, agente USB, impresoras térmicas</p>
                </div>
              </div>
              <ChevronRight className="text-orange-500 group-hover:translate-x-1 transition-transform" />
            </a>

            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Canales de Impresion (Pantalla)</h2>
              <Button onClick={() => setChannelDialog({ open: true, name: '', type: 'kitchen', target: 'screen', ip: '', editId: null })} size="sm"
                className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-channel-btn">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {printChannels.map(ch => (
                <div key={ch.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`channel-${ch.id}`}>
                  <div>
                    <span className="font-semibold">{ch.name}</span>
                    <Badge variant="secondary" className="ml-2 text-[9px]">{ch.type}</Badge>
                    <Badge variant="outline" className="ml-1 text-[9px]">{ch.target === 'screen' ? 'Pantalla' : ch.target === 'network' ? `Red: ${ch.ip}` : 'USB'}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => setChannelDialog({ open: true, name: ch.name, type: ch.type, target: ch.target, ip: ch.ip, editId: ch.id })}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                      onClick={() => handleDeleteChannel(ch.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* STATION CONFIG */}
          <TabsContent value="station">
            <h2 className="font-oswald text-base font-bold mb-4">Configuracion de Estacion</h2>
            <div className="space-y-3 max-w-lg">
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div>
                  <span className="text-sm font-semibold">Turno obligatorio para vender</span>
                  <p className="text-[10px] text-muted-foreground">El cajero debe abrir turno antes de procesar ventas</p>
                </div>
                <Switch checked={stationConfig.require_shift_to_sell}
                  onCheckedChange={(v) => setStationConfig(p => ({ ...p, require_shift_to_sell: v }))} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div>
                  <span className="text-sm font-semibold">Arqueo de caja obligatorio</span>
                  <p className="text-[10px] text-muted-foreground">Requiere conteo de efectivo al cerrar turno</p>
                </div>
                <Switch checked={stationConfig.require_cash_count}
                  onCheckedChange={(v) => setStationConfig(p => ({ ...p, require_cash_count: v }))} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div>
                  <span className="text-sm font-semibold">Envio automatico al cerrar sesion</span>
                  <p className="text-[10px] text-muted-foreground">Envia comandas pendientes al hacer logout</p>
                </div>
                <Switch checked={stationConfig.auto_send_on_logout}
                  onCheckedChange={(v) => setStationConfig(p => ({ ...p, auto_send_on_logout: v }))} />
              </div>
              <Button onClick={handleSaveStationConfig} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="save-station-config">
                GUARDAR CONFIGURACION
              </Button>
            </div>
          </TabsContent>

          {/* REPORTS LINK */}
          <TabsContent value="reports-cfg">
            <div className="text-center py-8">
              <BarChart3 size={40} className="mx-auto mb-3 text-primary opacity-50" />
              <h2 className="font-oswald text-lg mb-2">Reportes</h2>
              <p className="text-sm text-muted-foreground mb-4">Ventas, categorias, productos, meseros, DGII</p>
              <a href="/reports" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
                <BarChart3 size={16} /> Abrir Reportes
              </a>
            </div>
          </TabsContent>

          {/* CUSTOMERS LINK */}
          <TabsContent value="customers-cfg">
            <div className="text-center py-8">
              <Heart size={40} className="mx-auto mb-3 text-primary opacity-50" />
              <h2 className="font-oswald text-lg mb-2">Clientes & Fidelidad</h2>
              <p className="text-sm text-muted-foreground mb-4">Registro, puntos, canjeo, historial</p>
              <a href="/customers" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
                <Heart size={16} /> Abrir Clientes
              </a>
            </div>
          </TabsContent>

          {/* SYSTEM CONFIG */}
          <TabsContent value="system">
            <div className="space-y-6">
              <div>
                <h2 className="font-oswald text-base font-bold mb-4">Configuración del Sistema</h2>
                
                {/* Restaurant Name */}
                <div className="bg-card border border-border rounded-xl p-4 mb-4">
                  <h3 className="text-sm font-semibold mb-3">Nombre del Restaurante</h3>
                  <input 
                    value={systemConfig.restaurant_name || ''} 
                    onChange={e => setSystemConfig(p => ({ ...p, restaurant_name: e.target.value }))}
                    placeholder="Mi Restaurante"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                {/* RNC */}
                <div className="bg-card border border-border rounded-xl p-4 mb-4">
                  <h3 className="text-sm font-semibold mb-2">RNC (Registro Nacional de Contribuyentes)</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Este número aparecerá en los reportes exportados para validez fiscal.
                  </p>
                  <input 
                    value={systemConfig.rnc || ''} 
                    onChange={e => setSystemConfig(p => ({ ...p, rnc: e.target.value }))}
                    placeholder="000-000000-0"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>

                {/* Timezone */}
                <div className="bg-card border border-border rounded-xl p-4 mb-4">
                  <h3 className="text-sm font-semibold mb-2">Zona Horaria</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Selecciona la zona horaria de tu restaurante. Esto afecta las reservaciones y reportes.
                  </p>
                  <select 
                    value={systemConfig.timezone_offset} 
                    onChange={e => setSystemConfig(p => ({ ...p, timezone_offset: parseInt(e.target.value) }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    {timezones.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                {/* Currency */}
                <div className="bg-card border border-border rounded-xl p-4 mb-4">
                  <h3 className="text-sm font-semibold mb-3">Moneda</h3>
                  <select 
                    value={systemConfig.currency || 'RD$'} 
                    onChange={e => setSystemConfig(p => ({ ...p, currency: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="RD$">RD$ - Peso Dominicano</option>
                    <option value="$">$ - Dólar (USD)</option>
                    <option value="€">€ - Euro</option>
                    <option value="COP$">COP$ - Peso Colombiano</option>
                    <option value="MX$">MX$ - Peso Mexicano</option>
                    <option value="S/.">S/. - Sol Peruano</option>
                    <option value="Bs.">Bs. - Bolívar</option>
                    <option value="$">ARS$ - Peso Argentino</option>
                  </select>
                </div>

                <Button onClick={handleSaveSystemConfig} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
                  GUARDAR CONFIGURACIÓN
                </Button>

                {/* Database Maintenance - Admin Only */}
                {user?.role === 'admin' && (
                  <div className="mt-8 pt-6 border-t border-destructive/30">
                    <div className="bg-destructive/5 border border-destructive/30 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                          <Database size={20} className="text-destructive" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-destructive">Mantenimiento de Base de Datos</h3>
                          <p className="text-[10px] text-muted-foreground">Acciones administrativas del sistema</p>
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mb-4">
                        Estas acciones son irreversibles y eliminan datos permanentemente del sistema.
                        Solo el administrador del sistema puede ejecutarlas.
                      </p>
                      
                      <Button 
                        onClick={() => setResetDialog(prev => ({ ...prev, open: true }))}
                        variant="destructive"
                        className="w-full h-11 font-oswald font-bold"
                        data-testid="factory-reset-btn"
                      >
                        <ServerCrash size={18} className="mr-2" />
                        RESETEAR SISTEMA A FÁBRICA
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* THEME / PALETA DE COLORES - Only for admin/manager/owner */}
          {canAccessTheme && (
            <TabsContent value="theme">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-oswald text-base font-bold flex items-center gap-2">
                      <Palette size={20} className="text-purple-500" />
                      Paleta de Colores Glassmorphism
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Personaliza los colores del diseño en todo el sistema (excepto Cocina y TV)
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const ok = await resetTheme();
                      if (ok) toast.success('Tema restablecido');
                      else toast.error('Error al restablecer');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-destructive/20 hover:text-destructive transition-colors"
                  >
                    <RotateCcw size={12} /> Restablecer
                  </button>
                </div>

                {/* Preset Palettes */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Paletas Predefinidas</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Default - Purple/Blue */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#0f0f23',
                        gradientMid1: '#1a1a3e',
                        gradientMid2: '#2d1b4e',
                        gradientEnd: '#1e3a5f',
                        accentColor: '#ff6600',
                        glassOpacity: 0.1,
                        glassBlur: 12,
                        orbColor1: 'rgba(168, 85, 247, 0.3)',
                        orbColor2: 'rgba(59, 130, 246, 0.2)',
                        orbColor3: 'rgba(6, 182, 212, 0.2)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-purple-500/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #2d1b4e 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-purple-400">Predeterminado</span>
                      <p className="text-[10px] text-muted-foreground">Púrpura/Azul</p>
                    </button>

                    {/* Natural - Green */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#0a1f0a',
                        gradientMid1: '#0f2f1a',
                        gradientMid2: '#1a3f2a',
                        gradientEnd: '#0f3f3f',
                        accentColor: '#22c55e',
                        glassOpacity: 0.1,
                        glassBlur: 12,
                        orbColor1: 'rgba(34, 197, 94, 0.3)',
                        orbColor2: 'rgba(16, 185, 129, 0.25)',
                        orbColor3: 'rgba(6, 182, 212, 0.2)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-green-500/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #0a1f0a 0%, #0f2f1a 50%, #1a3f2a 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-green-400">Natural</span>
                      <p className="text-[10px] text-muted-foreground">Verdes bosque</p>
                    </button>

                    {/* Elegant - Gold */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#1a1510',
                        gradientMid1: '#2a2015',
                        gradientMid2: '#3a2a1a',
                        gradientEnd: '#2a1a10',
                        accentColor: '#f59e0b',
                        glassOpacity: 0.12,
                        glassBlur: 14,
                        orbColor1: 'rgba(245, 158, 11, 0.25)',
                        orbColor2: 'rgba(217, 119, 6, 0.2)',
                        orbColor3: 'rgba(180, 83, 9, 0.15)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-amber-500/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #1a1510 0%, #2a2015 50%, #3a2a1a 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-amber-400">Elegante</span>
                      <p className="text-[10px] text-muted-foreground">Dorados cálidos</p>
                    </button>

                    {/* Pastel */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#2d2d3d',
                        gradientMid1: '#3d3d5c',
                        gradientMid2: '#4a4a6a',
                        gradientEnd: '#3a4a5a',
                        accentColor: '#f472b6',
                        glassOpacity: 0.15,
                        glassBlur: 16,
                        orbColor1: 'rgba(244, 114, 182, 0.25)',
                        orbColor2: 'rgba(167, 139, 250, 0.25)',
                        orbColor3: 'rgba(129, 230, 217, 0.2)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-pink-400/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #2d2d3d 0%, #3d3d5c 50%, #4a4a6a 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-pink-400">Pastel</span>
                      <p className="text-[10px] text-muted-foreground">Tonos suaves</p>
                    </button>

                    {/* Ocean */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#0a192f',
                        gradientMid1: '#0d2137',
                        gradientMid2: '#112a45',
                        gradientEnd: '#0f3460',
                        accentColor: '#06b6d4',
                        glassOpacity: 0.1,
                        glassBlur: 12,
                        orbColor1: 'rgba(6, 182, 212, 0.3)',
                        orbColor2: 'rgba(14, 165, 233, 0.25)',
                        orbColor3: 'rgba(59, 130, 246, 0.2)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-cyan-500/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #0a192f 0%, #0d2137 50%, #112a45 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-cyan-400">Océano</span>
                      <p className="text-[10px] text-muted-foreground">Azules profundos</p>
                    </button>

                    {/* Sunset */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#1a0a1a',
                        gradientMid1: '#2d1020',
                        gradientMid2: '#4a1530',
                        gradientEnd: '#2a1a35',
                        accentColor: '#f97316',
                        glassOpacity: 0.12,
                        glassBlur: 14,
                        orbColor1: 'rgba(249, 115, 22, 0.3)',
                        orbColor2: 'rgba(236, 72, 153, 0.25)',
                        orbColor3: 'rgba(168, 85, 247, 0.2)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-orange-500/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #1a0a1a 0%, #2d1020 50%, #4a1530 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-orange-400">Atardecer</span>
                      <p className="text-[10px] text-muted-foreground">Rosa/Naranja</p>
                    </button>

                    {/* Mint */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#1a2a2a',
                        gradientMid1: '#1f3535',
                        gradientMid2: '#254545',
                        gradientEnd: '#203a3a',
                        accentColor: '#2dd4bf',
                        glassOpacity: 0.12,
                        glassBlur: 14,
                        orbColor1: 'rgba(45, 212, 191, 0.3)',
                        orbColor2: 'rgba(52, 211, 153, 0.25)',
                        orbColor3: 'rgba(34, 197, 94, 0.2)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-teal-400/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #1a2a2a 0%, #1f3535 50%, #254545 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-teal-400">Menta</span>
                      <p className="text-[10px] text-muted-foreground">Verde agua</p>
                    </button>

                    {/* Cherry */}
                    <button
                      onClick={() => setTheme({
                        gradientStart: '#1a0f0f',
                        gradientMid1: '#2a1515',
                        gradientMid2: '#3a1a1a',
                        gradientEnd: '#2a1010',
                        accentColor: '#ef4444',
                        glassOpacity: 0.1,
                        glassBlur: 12,
                        orbColor1: 'rgba(239, 68, 68, 0.3)',
                        orbColor2: 'rgba(244, 63, 94, 0.25)',
                        orbColor3: 'rgba(236, 72, 153, 0.2)',
                      })}
                      className="p-3 rounded-xl border border-border hover:border-red-500/50 transition-all group"
                    >
                      <div className="h-12 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, #1a0f0f 0%, #2a1515 50%, #3a1a1a 100%)' }} />
                      <span className="text-xs font-medium group-hover:text-red-400">Cereza</span>
                      <p className="text-[10px] text-muted-foreground">Rojos intensos</p>
                    </button>
                  </div>
                </div>

                {/* Live Preview */}
                <div 
                  className="rounded-xl overflow-hidden border border-border h-32 relative"
                  style={{
                    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-10 -left-10 w-24 h-24 rounded-full blur-[40px] animate-pulse" style={{ backgroundColor: theme.orbColor1 }} />
                    <div className="absolute top-1/2 -right-5 w-20 h-20 rounded-full blur-[30px] animate-pulse" style={{ backgroundColor: theme.orbColor2 }} />
                    <div className="absolute -bottom-5 left-1/3 w-24 h-24 rounded-full blur-[35px] animate-pulse" style={{ backgroundColor: theme.orbColor3 }} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl px-6 py-3 shadow-lg">
                      <span className="font-oswald text-white font-bold">Vista Previa en Vivo</span>
                    </div>
                  </div>
                </div>

                {/* Gradient Colors */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Inicio del Gradiente</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={theme.gradientStart}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientStart: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border-0"
                      />
                      <input
                        value={theme.gradientStart}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientStart: e.target.value }))}
                        className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Gradiente Medio 1</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={theme.gradientMid1}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientMid1: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border-0"
                      />
                      <input
                        value={theme.gradientMid1}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientMid1: e.target.value }))}
                        className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Gradiente Medio 2</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={theme.gradientMid2}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientMid2: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border-0"
                      />
                      <input
                        value={theme.gradientMid2}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientMid2: e.target.value }))}
                        className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Final del Gradiente</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={theme.gradientEnd}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientEnd: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border-0"
                      />
                      <input
                        value={theme.gradientEnd}
                        onChange={(e) => setTheme(prev => ({ ...prev, gradientEnd: e.target.value }))}
                        className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Accent Color */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Color de Acento (Botones Principales)</h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-4 items-center flex-wrap">
                      <input
                        type="color"
                        value={theme.accentColor}
                        onChange={(e) => setTheme(prev => ({ ...prev, accentColor: e.target.value }))}
                        className="w-12 h-12 rounded-lg cursor-pointer border-0"
                      />
                      <input
                        value={theme.accentColor}
                        onChange={(e) => setTheme(prev => ({ ...prev, accentColor: e.target.value }))}
                        className="w-28 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                      />
                      <div className="flex gap-2 flex-wrap">
                        {['#FF6600', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4'].map(c => (
                          <button
                            key={c}
                            onClick={() => setTheme(prev => ({ ...prev, accentColor: c }))}
                            className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${theme.accentColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                            style={{ backgroundColor: c, boxShadow: theme.accentColor === c ? `0 0 12px ${c}` : 'none' }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Preview button with accent color */}
                    <div className="flex gap-3 items-center">
                      <span className="text-xs text-muted-foreground">Vista previa:</span>
                      <button 
                        className="px-4 py-2 rounded-xl font-oswald font-bold text-white transition-all active:scale-95"
                        style={{ backgroundColor: theme.accentColor }}
                      >
                        BOTÓN DE EJEMPLO
                      </button>
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-oswald font-bold text-white text-sm"
                        style={{ backgroundColor: theme.accentColor }}
                      >
                        RD
                      </div>
                    </div>
                  </div>
                </div>

                {/* Glass Effect Settings */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-semibold">Efecto Glass</h3>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs text-muted-foreground">Opacidad del Vidrio</label>
                      <span className="text-xs font-mono">{Math.round(theme.glassOpacity * 100)}%</span>
                    </div>
                    <Slider
                      value={[theme.glassOpacity * 100]}
                      onValueChange={([v]) => setTheme(prev => ({ ...prev, glassOpacity: v / 100 }))}
                      min={5}
                      max={30}
                      step={1}
                      className="py-2"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs text-muted-foreground">Intensidad del Blur</label>
                      <span className="text-xs font-mono">{theme.glassBlur}px</span>
                    </div>
                    <Slider
                      value={[theme.glassBlur]}
                      onValueChange={([v]) => setTheme(prev => ({ ...prev, glassBlur: v }))}
                      min={4}
                      max={24}
                      step={1}
                      className="py-2"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={async () => {
                    const ok = await saveTheme(theme);
                    if (ok) toast.success('Tema guardado correctamente');
                    else toast.error('Error al guardar el tema');
                  }}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-oswald font-bold text-lg transition-all active:scale-95"
                >
                  GUARDAR PALETA DE COLORES
                </button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Area Dialog */}
      <Dialog open={areaDialog.open} onOpenChange={(o) => !o && setAreaDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="area-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{areaDialog.editId ? 'Editar' : 'Nueva'} Area</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={areaDialog.name} onChange={e => setAreaDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="area-name-input" />
            <div className="flex gap-2">
              {['#FF6600','#4CAF50','#2196F3','#9C27B0','#E91E63','#FFB300'].map(c => (
                <button key={c} onClick={() => setAreaDialog(p => ({ ...p, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 ${areaDialog.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <Button onClick={handleSaveArea} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-area">
              {areaDialog.editId ? 'GUARDAR' : 'CREAR AREA'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Table Dialog */}
      <Dialog open={tableDialog.open} onOpenChange={(o) => !o && setTableDialog(p => ({ ...p, open: false, editId: null }))}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald">{tableDialog.editId ? 'Editar Mesa' : 'Nueva Mesa'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={tableDialog.number} onChange={e => setTableDialog(p => ({ ...p, number: e.target.value }))}
              type="number" placeholder="Numero de mesa" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <select value={tableDialog.area_id} onChange={e => setTableDialog(p => ({ ...p, area_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              <option value="">Seleccionar área</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input value={tableDialog.capacity} onChange={e => setTableDialog(p => ({ ...p, capacity: e.target.value }))}
              type="number" placeholder="Capacidad" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2">
              {['round', 'square', 'rectangle'].map(s => (
                <button key={s} onClick={() => setTableDialog(p => ({ ...p, shape: s }))}
                  className={`flex-1 p-2 rounded-lg text-xs font-medium border transition-all ${
                    tableDialog.shape === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'
                  }`}>{s === 'round' ? 'Redonda' : s === 'square' ? 'Cuadrada' : 'Rectangular'}</button>
              ))}
            </div>
            <Button onClick={handleSaveTable} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
              {tableDialog.editId ? 'GUARDAR CAMBIOS' : 'CREAR MESA'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reason Dialog */}
      <Dialog open={reasonDialog.open} onOpenChange={(o) => !o && setReasonDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Razon</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={reasonDialog.name} onChange={e => setReasonDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Razon" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
              <span className="text-sm">Retorna al inventario</span>
              <Switch checked={reasonDialog.return_to_inventory} onCheckedChange={(v) => setReasonDialog(p => ({ ...p, return_to_inventory: v }))} />
            </div>
            <Button onClick={handleAddReason} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Dialog */}
      <Dialog open={userDialog.open} onOpenChange={(o) => !o && setUserDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="user-dialog">
          <DialogHeader><DialogTitle className="font-oswald flex items-center gap-2">
            <Shield size={18} className="text-primary" /> {userDialog.editId ? 'Editar' : 'Nuevo'} Usuario
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={userDialog.name} onChange={e => setUserDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre completo" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="user-name-input" />
            <input value={userDialog.pin} onChange={e => setUserDialog(p => ({ ...p, pin: e.target.value }))}
              placeholder={userDialog.editId ? "Nuevo PIN (vacio = no cambiar)" : "PIN (min 4 digitos)"}
              type="password" maxLength={6} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="user-pin-input" />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rol</label>
              <div className="flex gap-1 flex-wrap">
                {roles.map(r => (
                  <button key={r.id} onClick={() => setUserDialog(p => ({ ...p, role: r.code }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      userDialog.role === r.code ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'
                    }`}>{r.name}</button>
                ))}
                <button onClick={() => setRoleDialog({ open: true, name: '', code: '', editId: null })}
                  className="px-2 py-1.5 rounded-lg text-xs border border-dashed border-muted-foreground text-muted-foreground hover:border-primary hover:text-primary">
                  <Plus size={12} className="inline mr-0.5" /> Rol
                </button>
              </div>
            </div>
            <div className="border border-border rounded-lg p-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                <Shield size={12} /> Permisos ({Object.values(userDialog.permissions).filter(Boolean).length} activos)
              </h4>
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {Object.entries(PERM_LABELS).map(([key, label]) => {
                    const val = userDialog.permissions[key] !== undefined ? userDialog.permissions[key] : false;
                    return (
                      <div key={key} className="flex items-center justify-between py-0.5">
                        <span className="text-[11px]">{label}</span>
                        <Switch checked={val} onCheckedChange={(v) => setUserDialog(p => ({ ...p, permissions: { ...p.permissions, [key]: v } }))} />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
            <Button onClick={handleSaveUser} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-user">
              {userDialog.editId ? 'GUARDAR CAMBIOS' : 'CREAR USUARIO'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={roleDialog.open} onOpenChange={(o) => !o && setRoleDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-xs bg-card border-border" data-testid="role-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nuevo Rol</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={roleDialog.name} onChange={e => setRoleDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre del rol (ej: Supervisor, Host)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={handleSaveRole} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR ROL</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Method Dialog - REDISEÑADO */}
      <Dialog open={payDialog.open} onOpenChange={(o) => !o && setPayDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-lg bg-card border-border" data-testid="payment-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{payDialog.editId ? 'Editar' : 'Nueva'} Forma de Pago</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 pr-2">
              {/* Name */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nombre del Método</label>
                <input value={payDialog.name} onChange={e => setPayDialog(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Efectivo RD$, Visa, Mastercard..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="payment-name-input" />
              </div>

              {/* Icon Type Selection */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Tipo de Icono</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPayDialog(p => ({ ...p, icon_type: 'lucide', brand_icon: null }))}
                    className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                      payDialog.icon_type === 'lucide' 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <CreditCard className="mx-auto mb-1" size={24} />
                    <span className="text-xs font-medium">Icono Simple</span>
                  </button>
                  <button
                    onClick={() => setPayDialog(p => ({ ...p, icon_type: 'brand', brand_icon: 'visa' }))}
                    className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                      payDialog.icon_type === 'brand' 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <div className="w-10 h-6 mx-auto mb-1 bg-blue-600 rounded flex items-center justify-center text-white text-[8px] font-bold">VISA</div>
                    <span className="text-xs font-medium">Marca/Procesador</span>
                  </button>
                </div>
              </div>

              {/* Brand Icon Selection (if brand type) */}
              {payDialog.icon_type === 'brand' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Selecciona la Marca</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'visa', name: 'Visa', color: '#1565C0' },
                      { id: 'mastercard', name: 'Mastercard', color: '#FF5722' },
                      { id: 'amex', name: 'Amex', color: '#1976D2' },
                      { id: 'discover', name: 'Discover', color: '#E64A19' },
                      { id: 'paypal', name: 'PayPal', color: '#039BE5' },
                      { id: 'cash', name: 'Efectivo', color: '#16a34a' },
                      { id: 'bank', name: 'Banco', color: '#0891b2' },
                      { id: 'dollar', name: 'Dólar', color: '#059669' },
                      { id: 'euro', name: 'Euro', color: '#d97706' },
                    ].map(brand => (
                      <button
                        key={brand.id}
                        onClick={() => setPayDialog(p => ({ ...p, brand_icon: brand.id, bg_color: brand.color }))}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          payDialog.brand_icon === brand.id 
                            ? 'border-primary ring-2 ring-primary/30' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div 
                          className="w-full h-10 rounded-lg flex items-center justify-center text-white text-[9px] font-bold mb-1"
                          style={{ backgroundColor: brand.color }}
                        >
                          {brand.name.toUpperCase()}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{brand.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lucide Icon Selection (if lucide type) */}
              {payDialog.icon_type === 'lucide' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Selecciona el Icono</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { id: 'banknote', Icon: Banknote, name: 'Billetes' },
                      { id: 'credit-card', Icon: CreditCard, name: 'Tarjeta' },
                      { id: 'smartphone', Icon: Smartphone, name: 'Teléfono' },
                      { id: 'building2', Icon: Building2, name: 'Banco' },
                      { id: 'dollar-sign', Icon: DollarSign, name: 'Dólar' },
                    ].map(item => (
                      <button
                        key={item.id}
                        onClick={() => setPayDialog(p => ({ ...p, icon: item.id }))}
                        className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center ${
                          payDialog.icon === item.id 
                            ? 'border-primary bg-primary/10 text-primary' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <item.Icon size={24} />
                        <span className="text-[9px] mt-1">{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Color de Fondo</label>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      '#16a34a', '#059669', '#0891b2', '#1e40af', '#7c3aed', 
                      '#c026d3', '#dc2626', '#d97706', '#6b7280', '#1f2937'
                    ].map(color => (
                      <button
                        key={color}
                        onClick={() => setPayDialog(p => ({ ...p, bg_color: color }))}
                        className={`w-8 h-8 rounded-lg transition-all ${
                          payDialog.bg_color === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Color de Texto</label>
                  <div className="flex gap-1">
                    {['#ffffff', '#000000', '#fef3c7', '#d1fae5'].map(color => (
                      <button
                        key={color}
                        onClick={() => setPayDialog(p => ({ ...p, text_color: color }))}
                        className={`w-8 h-8 rounded-lg border border-border transition-all ${
                          payDialog.text_color === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Vista Previa</label>
                <div className="flex justify-center p-4 bg-background rounded-xl border border-border">
                  <div 
                    className="w-32 h-28 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-lg transition-all"
                    style={{ backgroundColor: payDialog.bg_color, color: payDialog.text_color }}
                  >
                    {payDialog.icon_type === 'brand' && payDialog.brand_icon ? (
                      <div className="w-12 h-8 bg-white/20 rounded flex items-center justify-center text-[8px] font-bold">
                        {payDialog.brand_icon.toUpperCase()}
                      </div>
                    ) : (
                      (() => {
                        const icons = { banknote: Banknote, 'credit-card': CreditCard, smartphone: Smartphone, building2: Building2, 'dollar-sign': DollarSign };
                        const Icon = icons[payDialog.icon] || Banknote;
                        return <Icon size={28} />;
                      })()
                    )}
                    <span className="font-oswald font-bold text-xs text-center px-2 leading-tight">
                      {payDialog.name || 'Método de Pago'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Currency & Exchange */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Moneda</label>
                  <select value={payDialog.currency} onChange={e => setPayDialog(p => ({ ...p, currency: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="DOP">DOP (Peso)</option>
                    <option value="USD">USD (Dólar)</option>
                    <option value="EUR">EUR (Euro)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tipo de Cambio</label>
                  <input value={payDialog.exchange_rate} onChange={e => setPayDialog(p => ({ ...p, exchange_rate: e.target.value }))}
                    type="number" step="0.01" placeholder="1.00" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
                </div>
              </div>

              {/* Cash or Card Toggle */}
              <div className="bg-background border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-semibold block">¿Es Efectivo?</label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {payDialog.is_cash 
                        ? 'Si el cliente paga de más → CAMBIO (se devuelve)' 
                        : 'Si el cliente paga de más → PROPINA (se queda)'}
                    </p>
                  </div>
                  <Switch 
                    checked={payDialog.is_cash} 
                    onCheckedChange={(checked) => setPayDialog(p => ({ ...p, is_cash: checked }))}
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setPayDialog(p => ({ ...p, is_cash: true }))}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      payDialog.is_cash 
                        ? 'bg-green-500/20 border-2 border-green-500 text-green-400' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayDialog(p => ({ ...p, is_cash: false }))}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      !payDialog.is_cash 
                        ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-400' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    💳 Tarjeta
                  </button>
                </div>
              </div>

              <Button onClick={handleSavePayMethod} className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-payment">
                {payDialog.editId ? 'GUARDAR CAMBIOS' : 'CREAR MÉTODO DE PAGO'}
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialog.open} onOpenChange={(o) => !o && setCategoryDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="category-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{categoryDialog.editId ? 'Editar' : 'Nueva'} Categoría</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nombre de la Categoría</label>
              <input 
                value={categoryDialog.name} 
                onChange={e => setCategoryDialog(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Bebidas, Postres, Entradas..." 
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" 
                data-testid="category-name-input"
              />
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Color de la Categoría</label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={categoryDialog.color}
                  onChange={(e) => setCategoryDialog(p => ({ ...p, color: e.target.value }))}
                  className="w-12 h-12 rounded-lg cursor-pointer border-0"
                />
                <input
                  value={categoryDialog.color}
                  onChange={(e) => setCategoryDialog(p => ({ ...p, color: e.target.value }))}
                  className="w-24 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <div className="flex gap-1 flex-wrap">
                  {['#FF6600', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategoryDialog(p => ({ ...p, color: c }))}
                      className={`w-7 h-7 rounded-lg border-2 transition-all ${categoryDialog.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Print Channel Dropdown - NEW */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                <Printer size={12} className="text-orange-500" />
                Canal de Impresión Predeterminado
              </label>
              <select
                value={categoryDialog.print_channel}
                onChange={(e) => setCategoryDialog(p => ({ ...p, print_channel: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                data-testid="category-print-channel"
              >
                <option value="">Sin asignar (usa Cocina por defecto)</option>
                {printChannels.filter(ch => ch.active && ch.code).map(ch => (
                  <option key={ch.id} value={ch.code}>
                    {ch.name} {ch.printer_name ? `→ ${ch.printer_name}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Los productos de esta categoría se imprimirán en este canal automáticamente
              </p>
            </div>

            {/* Preview */}
            <div className="p-4 rounded-xl border-2" style={{ borderColor: categoryDialog.color + '50', backgroundColor: categoryDialog.color + '15' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: categoryDialog.color }}>
                  <Tag size={20} className="text-white" />
                </div>
                <div>
                  <span className="font-oswald font-bold text-lg">{categoryDialog.name || 'Nombre de Categoría'}</span>
                  <p className="text-[10px] text-muted-foreground">Vista previa del botón</p>
                  {categoryDialog.print_channel && (
                    <Badge variant="outline" className="text-[9px] mt-1 border-orange-500/50 text-orange-500">
                      <Printer size={10} className="mr-1" />
                      {printChannels.find(ch => ch.code === categoryDialog.print_channel)?.name || categoryDialog.print_channel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Button onClick={handleSaveCategory} className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-category">
              {categoryDialog.editId ? 'GUARDAR CAMBIOS' : 'CREAR CATEGORÍA'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modifier Dialog */}
      <Dialog open={modifierDialog.open} onOpenChange={(o) => !o && setModifierDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-lg bg-card border-border" data-testid="modifier-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{modifierDialog.editId ? 'Editar' : 'Nuevo'} Grupo de Modificadores</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nombre del Grupo</label>
                <input 
                  value={modifierDialog.name} 
                  onChange={e => setModifierDialog(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Punto de cocción, Extras, Aderezos..." 
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" 
                  data-testid="modifier-name-input"
                />
              </div>
              
              {/* Settings Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                  <div>
                    <label className="text-sm font-semibold block">¿Es Requerido?</label>
                    <p className="text-[10px] text-muted-foreground">El cliente debe elegir al menos una opción</p>
                  </div>
                  <Switch 
                    checked={modifierDialog.required} 
                    onCheckedChange={(checked) => setModifierDialog(p => ({ ...p, required: checked }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Máximo de Selecciones</label>
                  <input 
                    type="number"
                    min="1"
                    max="20"
                    value={modifierDialog.max_selections} 
                    onChange={e => setModifierDialog(p => ({ ...p, max_selections: parseInt(e.target.value) || 5 }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" 
                  />
                </div>
              </div>

              {/* Options List */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Opciones ({modifierDialog.options.length})</label>
                <div className="space-y-2 mb-3">
                  {modifierDialog.options.map((opt, idx) => (
                    <div key={opt.id || idx} className="flex items-center gap-2 p-2 bg-background rounded-lg border border-border">
                      <input 
                        value={opt.name}
                        onChange={e => updateOptionInModifier(opt.id, 'name', e.target.value)}
                        placeholder="Nombre de opción"
                        className="flex-1 bg-transparent border-0 text-sm outline-none"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">+RD$</span>
                        <input 
                          type="number"
                          step="0.01"
                          value={opt.price}
                          onChange={e => updateOptionInModifier(opt.id, 'price', parseFloat(e.target.value) || 0)}
                          className="w-20 bg-muted rounded px-2 py-1 text-sm font-oswald text-right outline-none"
                        />
                      </div>
                      <button 
                        onClick={() => removeOptionFromModifier(opt.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                
                {/* Add New Option */}
                <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border-2 border-dashed border-primary/30">
                  <input 
                    value={newOptionName}
                    onChange={e => setNewOptionName(e.target.value)}
                    placeholder="Nueva opción..."
                    className="flex-1 bg-transparent border-0 text-sm outline-none"
                    onKeyDown={e => e.key === 'Enter' && addOptionToModifier()}
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">+RD$</span>
                    <input 
                      type="number"
                      step="0.01"
                      value={newOptionPrice}
                      onChange={e => setNewOptionPrice(parseFloat(e.target.value) || 0)}
                      className="w-20 bg-muted rounded px-2 py-1 text-sm font-oswald text-right outline-none"
                      onKeyDown={e => e.key === 'Enter' && addOptionToModifier()}
                    />
                  </div>
                  <button 
                    onClick={addOptionToModifier}
                    className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                
                {/* Quick Add Suggestions */}
                {modifierDialog.options.length === 0 && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <p className="text-[10px] text-muted-foreground mb-2">Sugerencias rápidas:</p>
                    <div className="flex flex-wrap gap-1">
                      {['Término medio', 'Bien cocido', '3/4', 'Sin cebolla', 'Extra queso', 'Sin sal', 'Picante'].map(sug => (
                        <button
                          key={sug}
                          onClick={() => {
                            setModifierDialog(p => ({
                              ...p,
                              options: [...p.options, { 
                                id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                name: sug, 
                                price: 0 
                              }]
                            }));
                          }}
                          className="px-2 py-1 text-[10px] rounded bg-background border border-border hover:border-primary/50 transition-colors"
                        >
                          + {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Button onClick={handleSaveModifier} className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-modifier">
                {modifierDialog.editId ? 'GUARDAR CAMBIOS' : 'CREAR MODIFICADOR'}
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Sale Type Dialog */}
      <Dialog open={saleDialog.open} onOpenChange={(o) => !o && setSaleDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="saletype-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{saleDialog.editId ? 'Editar' : 'Nuevo'} Tipo de Venta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={saleDialog.name} onChange={e => setSaleDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre (ej: Consumidor Final)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={saleDialog.code} onChange={e => setSaleDialog(p => ({ ...p, code: e.target.value }))}
              placeholder="Codigo (ej: dine_in, take_out)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" />
            
            {/* Impuestos Aplicables */}
            <div className="p-3 rounded-lg bg-background border border-border">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={14} className="text-green-500" />
                <span className="text-sm font-semibold">Impuestos Aplicables</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-3">
                Desmarca los impuestos que NO aplican a este tipo de venta (ej: Delivery sin propina).
              </p>
              
              <div className="space-y-2">
                {taxConfig.filter(tax => tax.active).map(tax => {
                  const isExempt = (saleDialog.tax_exemptions || []).includes(tax.id);
                  const isApplied = !isExempt;
                  
                  const toggleTax = (e) => {
                    e.stopPropagation();
                    setSaleDialog(p => {
                      const current = p.tax_exemptions || [];
                      if (current.includes(tax.id)) {
                        return { ...p, tax_exemptions: current.filter(id => id !== tax.id) };
                      } else {
                        return { ...p, tax_exemptions: [...current, tax.id] };
                      }
                    });
                  };
                  
                  return (
                    <div 
                      key={tax.id}
                      className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                        isApplied 
                          ? 'bg-green-500/10 border-green-500/50' 
                          : 'bg-red-500/5 border-red-500/30'
                      }`}
                      data-testid={`saletype-tax-${tax.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Switch 
                          checked={isApplied}
                          onCheckedChange={toggleTax}
                          data-testid={`saletype-tax-switch-${tax.id}`}
                        />
                        <div>
                          <span className="text-sm font-medium">{tax.description}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{tax.rate}%</span>
                        </div>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={`text-[9px] ${isApplied ? 'border-green-500/50 text-green-500' : 'border-red-500/50 text-red-500'}`}
                      >
                        {isApplied ? 'Aplica' : 'Exento'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <Button onClick={handleSaveSaleType} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
              {saleDialog.editId ? 'GUARDAR' : 'CREAR'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Channel Dialog */}
      <Dialog open={channelDialog.open} onOpenChange={(o) => !o && setChannelDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="channel-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{channelDialog.editId ? 'Editar' : 'Nuevo'} Canal de Impresion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={channelDialog.name} onChange={e => setChannelDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre (ej: Cocina Principal)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <select value={channelDialog.type} onChange={e => setChannelDialog(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              <option value="kitchen">Cocina</option>
              <option value="bar">Barra</option>
              <option value="receipt">Recibo/Caja</option>
            </select>
            <select value={channelDialog.target} onChange={e => setChannelDialog(p => ({ ...p, target: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              <option value="screen">Pantalla (virtual)</option>
              <option value="network">Impresora de Red</option>
              <option value="usb">Impresora USB</option>
            </select>
            {channelDialog.target === 'network' && (
              <input value={channelDialog.ip} onChange={e => setChannelDialog(p => ({ ...p, ip: e.target.value }))}
                placeholder="IP de la impresora (ej: 192.168.1.100)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" />
            )}
            <Button onClick={handleSaveChannel} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
              {channelDialog.editId ? 'GUARDAR' : 'CREAR'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Factory Reset Dialog - Admin Only */}
      <Dialog open={resetDialog.open} onOpenChange={(open) => setResetDialog(prev => ({ ...prev, open, showWarning: false, confirmPin: '' }))}>
        <DialogContent className="sm:max-w-[500px] bg-card border-destructive/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-oswald">
              <ShieldAlert size={24} />
              Resetear Sistema a Fábrica
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Selecciona los datos que deseas eliminar permanentemente del sistema.
            </DialogDescription>
          </DialogHeader>
          
          {!resetDialog.showWarning ? (
            <>
              {/* Selection Panel */}
              <div className="space-y-4 py-4">
                {/* Reset Sales */}
                <div 
                  className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    resetDialog.resetSales 
                      ? 'bg-red-500/10 border-red-500/50' 
                      : 'bg-background border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => setResetDialog(prev => ({ ...prev, resetSales: !prev.resetSales }))}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      resetDialog.resetSales ? 'bg-red-500' : 'bg-muted'
                    }`}>
                      <BarChart3 size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Historial de Ventas</p>
                      <p className="text-[10px] text-muted-foreground">Órdenes, facturas, turnos, cola de impresión</p>
                    </div>
                  </div>
                  <Switch 
                    checked={resetDialog.resetSales} 
                    onCheckedChange={(v) => setResetDialog(prev => ({ ...prev, resetSales: v }))}
                    data-testid="reset-sales-switch"
                  />
                </div>

                {/* Reset Inventory */}
                <div 
                  className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    resetDialog.resetInventory 
                      ? 'bg-red-500/10 border-red-500/50' 
                      : 'bg-background border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => setResetDialog(prev => ({ ...prev, resetInventory: !prev.resetInventory }))}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      resetDialog.resetInventory ? 'bg-red-500' : 'bg-muted'
                    }`}>
                      <Package size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Datos de Inventario</p>
                      <p className="text-[10px] text-muted-foreground">Movimientos de stock, compras, transacciones</p>
                    </div>
                  </div>
                  <Switch 
                    checked={resetDialog.resetInventory} 
                    onCheckedChange={(v) => setResetDialog(prev => ({ ...prev, resetInventory: v }))}
                    data-testid="reset-inventory-switch"
                  />
                </div>

                {/* Reset Users */}
                <div 
                  className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    resetDialog.resetUsers 
                      ? 'bg-red-500/10 border-red-500/50' 
                      : 'bg-background border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => setResetDialog(prev => ({ ...prev, resetUsers: !prev.resetUsers }))}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      resetDialog.resetUsers ? 'bg-red-500' : 'bg-muted'
                    }`}>
                      <Users size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Lista de Usuarios</p>
                      <p className="text-[10px] text-muted-foreground">Elimina todos excepto Admin (PIN: 11331744)</p>
                    </div>
                  </div>
                  <Switch 
                    checked={resetDialog.resetUsers} 
                    onCheckedChange={(v) => setResetDialog(prev => ({ ...prev, resetUsers: v }))}
                    data-testid="reset-users-switch"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setResetDialog(prev => ({ ...prev, open: false }))}
                >
                  Cancelar
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => setResetDialog(prev => ({ ...prev, showWarning: true }))}
                  disabled={!resetDialog.resetSales && !resetDialog.resetInventory && !resetDialog.resetUsers}
                  data-testid="continue-reset-btn"
                >
                  Continuar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              {/* Warning Confirmation */}
              <div className="py-4 space-y-4">
                <Alert variant="destructive" className="border-2 border-red-500 bg-red-500/10">
                  <ShieldAlert className="h-5 w-5" />
                  <AlertTitle className="font-oswald text-lg">¡ADVERTENCIA!</AlertTitle>
                  <AlertDescription className="mt-2">
                    <p className="font-bold mb-2">Esta acción es IRREVERSIBLE.</p>
                    <p className="text-sm mb-3">Se eliminarán permanentemente los siguientes datos:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {resetDialog.resetSales && <li>Todas las órdenes, facturas y turnos</li>}
                      {resetDialog.resetInventory && <li>Todos los movimientos y transacciones de inventario</li>}
                      {resetDialog.resetUsers && (
                        <li>
                          Todos los usuarios <span className="font-bold">(excepto Admin)</span>
                          <br/>
                          <span className="text-yellow-400 text-xs">El PIN del Admin será cambiado a: 11331744</span>
                        </li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>

                {/* PIN Confirmation */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">
                    Ingresa tu PIN de Administrador para confirmar:
                  </label>
                  <input
                    type="password"
                    value={resetDialog.confirmPin}
                    onChange={(e) => setResetDialog(prev => ({ ...prev, confirmPin: e.target.value }))}
                    placeholder="PIN de Admin"
                    className="w-full bg-background border-2 border-destructive/50 rounded-lg px-4 py-3 text-center text-lg font-mono tracking-widest focus:border-destructive focus:outline-none"
                    maxLength={8}
                    data-testid="confirm-pin-input"
                  />
                </div>
              </div>

              <DialogFooter className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setResetDialog(prev => ({ ...prev, showWarning: false, confirmPin: '' }))}
                  disabled={resetDialog.loading}
                >
                  Volver
                </Button>
                <Button 
                  variant="destructive"
                  onClick={handleFactoryReset}
                  disabled={!resetDialog.confirmPin || resetDialog.loading}
                  className="min-w-[150px]"
                  data-testid="confirm-reset-btn"
                >
                  {resetDialog.loading ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} className="mr-2" />
                      EJECUTAR RESET
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
