import { useState, useEffect } from 'react';
import { areasAPI, tablesAPI, reasonsAPI, categoriesAPI, productsAPI } from '@/lib/api';
import { Settings as SettingsIcon, MapPin, Table2, AlertTriangle, Plus, Trash2, Package, Tag, Users, CreditCard, Shield, Pencil, Printer, ShoppingBag, Cog, BarChart3, Truck, Heart, Percent, ChevronRight, Banknote, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [saleTypes, setSaleTypes] = useState([]);
  const [printChannels, setPrintChannels] = useState([]);
  const [stationConfig, setStationConfig] = useState({ require_shift_to_sell: true, require_cash_count: false, auto_send_on_logout: true });
  const [roles, setRoles] = useState([]);
  const [roleDialog, setRoleDialog] = useState({ open: false, name: '', code: '', editId: null });
  const [taxConfig, setTaxConfig] = useState([]);

  // Sub-tab states
  const [mesasSubTab, setMesasSubTab] = useState('mesas');
  const [ventasSubTab, setVentasSubTab] = useState('pagos');
  const [inventarioSubTab, setInventarioSubTab] = useState('productos');

  const [areaDialog, setAreaDialog] = useState({ open: false, name: '', color: '#FF6600', editId: null });
  const [tableDialog, setTableDialog] = useState({ open: false, number: '', area_id: '', capacity: 4, shape: 'round' });
  const [reasonDialog, setReasonDialog] = useState({ open: false, name: '', return_to_inventory: true });
  const [userDialog, setUserDialog] = useState({ open: false, name: '', pin: '', role: 'waiter', editId: null, permissions: {} });
  const [payDialog, setPayDialog] = useState({ 
    open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
    bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null 
  });
  const [saleDialog, setSaleDialog] = useState({ open: false, name: '', code: '', tax_rate: 18, tip_default: 0, editId: null });
  const [channelDialog, setChannelDialog] = useState({ open: false, name: '', type: 'kitchen', target: 'screen', ip: '', editId: null });
  
  // System Config
  const [systemConfig, setSystemConfig] = useState({ 
    timezone_offset: -4, 
    restaurant_name: 'Mi Restaurante', 
    currency: 'RD$',
    quick_amounts: [100, 200, 500, 1000, 2000, 5000]
  });
  const [timezones, setTimezones] = useState([]);
  const [quickAmountInput, setQuickAmountInput] = useState('');

  const fetchAll = async () => {
    try {
      const [aRes, tRes, rRes, cRes, pRes, uRes, pmRes] = await Promise.all([
        areasAPI.list(), tablesAPI.list(), reasonsAPI.list(), categoriesAPI.list(), productsAPI.list(),
        axios.get(`${API}/users`, { headers: hdrs() }),
        axios.get(`${API}/payment-methods`, { headers: hdrs() }),
      ]);
      setAreas(aRes.data); setTables(tRes.data); setReasons(rRes.data);
      setCategories(cRes.data); setProducts(pRes.data);
      setUsers(uRes.data); setPayMethods(pmRes.data);
      try {
        const [stRes, pcRes, scRes, sysRes, tzRes] = await Promise.all([
          axios.get(`${API}/sale-types`, { headers: hdrs() }),
          axios.get(`${API}/print-channels`, { headers: hdrs() }),
          axios.get(`${API}/station-config`, { headers: hdrs() }),
          axios.get(`${API}/system/config`, { headers: hdrs() }),
          axios.get(`${API}/system/timezones`, { headers: hdrs() }),
        ]);
        setSaleTypes(stRes.data); setPrintChannels(pcRes.data); setStationConfig(scRes.data);
        setSystemConfig(sysRes.data);
        setTimezones(tzRes.data);
        const rolesRes = await axios.get(`${API}/roles`, { headers: hdrs() });
        setRoles(rolesRes.data);
        const taxRes = await axios.get(`${API}/tax-config`, { headers: hdrs() });
        setTaxConfig(taxRes.data);
      } catch {}
    } catch {}
  };

  useEffect(() => { fetchAll(); }, []);

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

  const handleAddTable = async () => {
    if (!tableDialog.number || !tableDialog.area_id) return;
    try {
      await tablesAPI.create({ number: parseInt(tableDialog.number), area_id: tableDialog.area_id,
        capacity: parseInt(tableDialog.capacity) || 4, shape: tableDialog.shape,
        x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 });
      toast.success('Mesa creada');
      setTableDialog({ open: false, number: '', area_id: '', capacity: 4, shape: 'round' }); fetchAll();
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
        exchange_rate: parseFloat(payDialog.exchange_rate) || 1 
      };
      if (payDialog.editId) {
        await axios.put(`${API}/payment-methods/${payDialog.editId}`, data, { headers: hdrs() });
      } else {
        await axios.post(`${API}/payment-methods`, data, { headers: hdrs() });
      }
      toast.success(payDialog.editId ? 'Actualizado' : 'Creado');
      setPayDialog({ 
        open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
        bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null 
      }); 
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeletePayMethod = async (id) => {
    try { await axios.delete(`${API}/payment-methods/${id}`, { headers: hdrs() }); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Sale type handlers
  const handleSaveSaleType = async () => {
    if (!saleDialog.name) return;
    try {
      const data = { name: saleDialog.name, code: saleDialog.code, tax_rate: parseFloat(saleDialog.tax_rate) || 18, tip_default: parseFloat(saleDialog.tip_default) || 0 };
      if (saleDialog.editId) await axios.put(`${API}/sale-types/${saleDialog.editId}`, data, { headers: hdrs() });
      else await axios.post(`${API}/sale-types`, data, { headers: hdrs() });
      toast.success(saleDialog.editId ? 'Actualizado' : 'Creado');
      setSaleDialog({ open: false, name: '', code: '', tax_rate: 18, tip_default: 0, editId: null }); fetchAll();
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
        <Tabs defaultValue="users" className="max-w-4xl mx-auto">
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
            <TabsTrigger value="system" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-system">
              <Cog size={14} className="mr-1" /> Sistema
            </TabsTrigger>
          </TabsList>

          {/* USERS */}
          <TabsContent value="users">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Usuarios del Sistema</h2>
              <a href="/user/new"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform" data-testid="add-user-btn">
                <Plus size={14} /> Nuevo Empleado
              </a>
            </div>
            <div className="space-y-2">
              {users.filter(u => u.active !== false).map(user => (
                <a key={user.id} href={`/user/${user.id}`} 
                  className="flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors cursor-pointer" data-testid={`user-${user.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold font-oswald">
                      {user.name?.[0]}{user.last_name?.[0] || ''}
                    </div>
                    <div>
                      <span className="font-semibold">{user.name} {user.last_name || ''}</span>
                      <Badge variant="secondary" className="ml-2 text-[9px]">{user.role}</Badge>
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
                  <Button onClick={() => setTableDialog({ open: true, number: '', area_id: areas[0]?.id || '', capacity: 4, shape: 'round' })} size="sm"
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
                      <Button variant="ghost" size="icon" onClick={() => { tablesAPI.delete(table.id).then(() => { toast.success('Eliminada'); fetchAll(); }); }}
                        className="text-destructive/60 hover:text-destructive h-8 w-8"><Trash2 size={14} /></Button>
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
                  <Button onClick={() => setPayDialog({ open: true, name: '', icon: 'circle', editId: null })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-payment-btn">
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2 mb-6">
                  {payMethods.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`payment-${m.id}`}>
                      <div>
                        <span className="font-semibold">{m.name}</span>
                        {m.currency && m.currency !== 'DOP' && (
                          <Badge variant="outline" className="ml-2 text-[9px] border-yellow-500 text-yellow-400">
                            {m.currency} (1={m.exchange_rate})
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => setPayDialog({ open: true, name: m.name, icon: m.icon || '', currency: m.currency || 'DOP', exchange_rate: m.exchange_rate || 1, editId: m.id })}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                          onClick={() => handleDeletePayMethod(m.id)}>
                          <Trash2 size={14} />
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
                  <Button onClick={() => setSaleDialog({ open: true, name: '', code: '', tax_rate: 18, tip_default: 0, editId: null })} size="sm"
                    className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-saletype-btn">
                    <Plus size={14} className="mr-1" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {saleTypes.map(st => (
                    <div key={st.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`saletype-${st.id}`}>
                      <div>
                        <span className="font-semibold">{st.name}</span>
                        <Badge variant="secondary" className="ml-2 text-[9px]">{st.code}</Badge>
                        <span className="text-xs text-muted-foreground ml-2">ITBIS {st.tax_rate}% | Propina {st.tip_default}%</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => setSaleDialog({ open: true, name: st.name, code: st.code, tax_rate: st.tax_rate, tip_default: st.tip_default, editId: st.id })}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                          onClick={() => handleDeleteSaleType(st.id)}><Trash2 size={14} /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* INVENTARIO (includes Productos, Compras, Stock) */}
          <TabsContent value="inventario">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <SubTabButton active={inventarioSubTab === 'productos'} onClick={() => setInventarioSubTab('productos')} icon={Package} label="Productos" />
              <SubTabButton active={inventarioSubTab === 'compras'} onClick={() => setInventarioSubTab('compras')} icon={Truck} label="Compras" />
              <SubTabButton active={inventarioSubTab === 'stock'} onClick={() => setInventarioSubTab('stock')} icon={BarChart3} label="Stock" />
            </div>

            {inventarioSubTab === 'productos' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-oswald text-base font-bold">Productos</h2>
                  <a href="/product/new"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform" data-testid="add-product-btn">
                    <Plus size={14} /> Nuevo Producto
                  </a>
                </div>
                <div className="space-y-1">
                  {categories.map(cat => (
                    <div key={cat.id}>
                      <h3 className="font-oswald text-xs uppercase text-muted-foreground tracking-wider mt-4 mb-2 flex items-center gap-2">
                        <Tag size={12} style={{ color: cat.color }} /> {cat.name}
                      </h3>
                      {products.filter(p => p.category_id === cat.id).map(prod => (
                        <a 
                          key={prod.id} 
                          href={`/product/${prod.id}`}
                          className="flex items-center justify-between p-2 rounded bg-card/50 border border-border/50 ml-4 mb-1 hover:border-primary/50 hover:bg-card transition-colors cursor-pointer"
                          data-testid={`product-${prod.id}`}
                        >
                          <div className="flex items-center gap-2">
                            {prod.button_bg_color && (
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: prod.button_bg_color }} />
                            )}
                            <span className="text-sm">{prod.name}</span>
                            {prod.printed_name && prod.printed_name !== prod.name && (
                              <span className="text-[10px] text-muted-foreground font-mono">({prod.printed_name})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {prod.modifier_assignments?.length > 0 && (
                              <Badge variant="outline" className="text-[9px]">{prod.modifier_assignments.length} mod</Badge>
                            )}
                            <span className="font-oswald text-sm text-primary font-bold">RD$ {prod.price?.toFixed(2)}</span>
                            <Pencil size={12} className="text-muted-foreground" />
                          </div>
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {inventarioSubTab === 'compras' && (
              <div className="text-center py-8">
                <Truck size={40} className="mx-auto mb-3 text-primary opacity-50" />
                <h2 className="font-oswald text-lg mb-2">Proveedores & Compras</h2>
                <p className="text-sm text-muted-foreground mb-4">Proveedores, ordenes de compra, recepcion de mercancia</p>
                <a href="/suppliers" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
                  <Truck size={16} /> Abrir Compras
                </a>
              </div>
            )}

            {inventarioSubTab === 'stock' && (
              <div className="text-center py-8">
                <Package size={40} className="mx-auto mb-3 text-primary opacity-50" />
                <h2 className="font-oswald text-lg mb-2">Inventario</h2>
                <p className="text-sm text-muted-foreground mb-4">Stock, almacenes, recetas, costos y movimientos</p>
                <a href="/inventory" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
                  <Package size={16} /> Abrir Inventario
                </a>
              </div>
            )}
          </TabsContent>

          {/* PRINT CHANNELS */}
          <TabsContent value="channels">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Canales de Impresion</h2>
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
              </div>
            </div>
          </TabsContent>
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
      <Dialog open={tableDialog.open} onOpenChange={(o) => !o && setTableDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Mesa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={tableDialog.number} onChange={e => setTableDialog(p => ({ ...p, number: e.target.value }))}
              type="number" placeholder="Numero de mesa" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <select value={tableDialog.area_id} onChange={e => setTableDialog(p => ({ ...p, area_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
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
            <Button onClick={handleAddTable} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR MESA</Button>
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

      {/* Payment Method Dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => !o && setPayDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="payment-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{payDialog.editId ? 'Editar' : 'Nueva'} Forma de Pago</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={payDialog.name} onChange={e => setPayDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre (ej: Efectivo, Tarjeta, USD)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="payment-name-input" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Moneda</label>
                <select value={payDialog.currency} onChange={e => setPayDialog(p => ({ ...p, currency: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="DOP">DOP (Peso)</option>
                  <option value="USD">USD (Dolar)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo de cambio</label>
                <input value={payDialog.exchange_rate} onChange={e => setPayDialog(p => ({ ...p, exchange_rate: e.target.value }))}
                  type="number" step="0.01" placeholder="1.00" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
              </div>
            </div>
            <Button onClick={handleSavePayMethod} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-payment">
              {payDialog.editId ? 'GUARDAR' : 'CREAR'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sale Type Dialog */}
      <Dialog open={saleDialog.open} onOpenChange={(o) => !o && setSaleDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="saletype-dialog">
          <DialogHeader><DialogTitle className="font-oswald">{saleDialog.editId ? 'Editar' : 'Nuevo'} Tipo de Venta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={saleDialog.name} onChange={e => setSaleDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre (ej: Consumidor Final)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={saleDialog.code} onChange={e => setSaleDialog(p => ({ ...p, code: e.target.value }))}
              placeholder="Codigo (ej: dine_in, take_out)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ITBIS %</label>
                <input value={saleDialog.tax_rate} onChange={e => setSaleDialog(p => ({ ...p, tax_rate: e.target.value }))}
                  type="number" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Propina Default %</label>
                <input value={saleDialog.tip_default} onChange={e => setSaleDialog(p => ({ ...p, tip_default: e.target.value }))}
                  type="number" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
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
    </div>
  );
}
