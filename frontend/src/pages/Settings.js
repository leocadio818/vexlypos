import { useState, useEffect } from 'react';
import { areasAPI, tablesAPI, reasonsAPI, categoriesAPI, productsAPI } from '@/lib/api';
import { Settings as SettingsIcon, MapPin, Table2, AlertTriangle, Plus, Trash2, Package, Tag, Users, CreditCard, Shield, Pencil, Printer, ShoppingBag, Cog } from 'lucide-react';
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

  const [areaDialog, setAreaDialog] = useState({ open: false, name: '', color: '#FF6600', editId: null });
  const [tableDialog, setTableDialog] = useState({ open: false, number: '', area_id: '', capacity: 4, shape: 'round' });
  const [reasonDialog, setReasonDialog] = useState({ open: false, name: '', return_to_inventory: true });
  const [productDialog, setProductDialog] = useState({ open: false, name: '', category_id: '', price: '', track_inventory: false });
  const [userDialog, setUserDialog] = useState({ open: false, name: '', pin: '', role: 'waiter', editId: null, permissions: {} });
  const [payDialog, setPayDialog] = useState({ open: false, name: '', icon: 'circle', currency: 'DOP', exchange_rate: 1, editId: null });
  const [saleDialog, setSaleDialog] = useState({ open: false, name: '', code: '', tax_rate: 18, tip_default: 0, editId: null });
  const [channelDialog, setChannelDialog] = useState({ open: false, name: '', type: 'kitchen', target: 'screen', ip: '', editId: null });

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
        const [stRes, pcRes, scRes] = await Promise.all([
          axios.get(`${API}/sale-types`, { headers: hdrs() }),
          axios.get(`${API}/print-channels`, { headers: hdrs() }),
          axios.get(`${API}/station-config`, { headers: hdrs() }),
        ]);
        setSaleTypes(stRes.data); setPrintChannels(pcRes.data); setStationConfig(scRes.data);
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

  const handleAddProduct = async () => {
    if (!productDialog.name || !productDialog.category_id || !productDialog.price) return;
    try {
      await productsAPI.create({ name: productDialog.name, category_id: productDialog.category_id,
        price: parseFloat(productDialog.price), track_inventory: productDialog.track_inventory });
      toast.success('Producto creado');
      setProductDialog({ open: false, name: '', category_id: '', price: '', track_inventory: false }); fetchAll();
    } catch { toast.error('Error'); }
  };

  // User handlers
  const handleSaveUser = async () => {
    if (!userDialog.name) return;
    try {
      if (userDialog.editId) {
        const data = { name: userDialog.name, role: userDialog.role, permissions: userDialog.permissions };
        if (userDialog.pin) data.pin = userDialog.pin;
        await axios.put(`${API}/users/${userDialog.editId}`, data, { headers: hdrs() });
      } else {
        if (!userDialog.pin) { toast.error('PIN requerido'); return; }
        await axios.post(`${API}/users`, { name: userDialog.name, pin: userDialog.pin, role: userDialog.role }, { headers: hdrs() });
      }
      toast.success(userDialog.editId ? 'Usuario actualizado' : 'Usuario creado');
      setUserDialog({ open: false, name: '', pin: '', role: 'waiter', editId: null, permissions: {} }); fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeleteUser = async (id) => {
    try { await axios.delete(`${API}/users/${id}`, { headers: hdrs() }); toast.success('Usuario desactivado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Payment method handlers
  const handleSavePayMethod = async () => {
    if (!payDialog.name) return;
    try {
      const data = { name: payDialog.name, icon: payDialog.icon, currency: payDialog.currency, exchange_rate: parseFloat(payDialog.exchange_rate) || 1 };
      if (payDialog.editId) {
        await axios.put(`${API}/payment-methods/${payDialog.editId}`, data, { headers: hdrs() });
      } else {
        await axios.post(`${API}/payment-methods`, data, { headers: hdrs() });
      }
      toast.success(payDialog.editId ? 'Actualizado' : 'Creado');
      setPayDialog({ open: false, name: '', icon: 'circle', currency: 'DOP', exchange_rate: 1, editId: null }); fetchAll();
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
            <TabsTrigger value="areas" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-areas">
              <MapPin size={14} className="mr-1" /> Areas
            </TabsTrigger>
            <TabsTrigger value="tables" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-tables">
              <Table2 size={14} className="mr-1" /> Mesas
            </TabsTrigger>
            <TabsTrigger value="payment" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-payment">
              <CreditCard size={14} className="mr-1" /> Pagos
            </TabsTrigger>
            <TabsTrigger value="reasons" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-reasons">
              <AlertTriangle size={14} className="mr-1" /> Anulaciones
            </TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-products">
              <Package size={14} className="mr-1" /> Productos
            </TabsTrigger>
            <TabsTrigger value="saletypes" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-saletypes">
              <ShoppingBag size={14} className="mr-1" /> Ventas
            </TabsTrigger>
            <TabsTrigger value="channels" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-channels">
              <Printer size={14} className="mr-1" /> Impresion
            </TabsTrigger>
            <TabsTrigger value="station" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-station">
              <Cog size={14} className="mr-1" /> Estacion
            </TabsTrigger>
          </TabsList>

          {/* USERS */}
          <TabsContent value="users">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Usuarios del Sistema</h2>
              <Button onClick={() => setUserDialog({ open: true, name: '', pin: '', role: 'waiter', editId: null, permissions: {} })}
                size="sm" className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-user-btn">
                <Plus size={14} className="mr-1" /> Nuevo Usuario
              </Button>
            </div>
            <div className="space-y-2">
              {users.filter(u => u.active !== false).map(user => (
                <div key={user.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`user-${user.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold font-oswald">
                      {user.name?.[0]}
                    </div>
                    <div>
                      <span className="font-semibold">{user.name}</span>
                      <Badge variant="secondary" className="ml-2 text-[9px]">{user.role}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => setUserDialog({ open: true, name: user.name, pin: '', role: user.role, editId: user.id, permissions: user.permissions || {} })}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                      onClick={() => handleDeleteUser(user.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* AREAS */}
          <TabsContent value="areas">
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
          </TabsContent>

          {/* TABLES */}
          <TabsContent value="tables">
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
          </TabsContent>

          {/* PAYMENT METHODS */}
          <TabsContent value="payment">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Formas de Pago</h2>
              <Button onClick={() => setPayDialog({ open: true, name: '', icon: 'circle', editId: null })} size="sm"
                className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-payment-btn">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
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
          </TabsContent>

          {/* CANCELLATION REASONS */}
          <TabsContent value="reasons">
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
          </TabsContent>

          {/* PRODUCTS */}
          <TabsContent value="products">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Productos</h2>
              <Button onClick={() => setProductDialog({ open: true, name: '', category_id: categories[0]?.id || '', price: '', track_inventory: false })} size="sm"
                className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-product-btn">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-1">
              {categories.map(cat => (
                <div key={cat.id}>
                  <h3 className="font-oswald text-xs uppercase text-muted-foreground tracking-wider mt-4 mb-2 flex items-center gap-2">
                    <Tag size={12} style={{ color: cat.color }} /> {cat.name}
                  </h3>
                  {products.filter(p => p.category_id === cat.id).map(prod => (
                    <div key={prod.id} className="flex items-center justify-between p-2 rounded bg-card/50 border border-border/50 ml-4 mb-1">
                      <span className="text-sm">{prod.name}</span>
                      <span className="font-oswald text-sm text-primary font-bold">RD$ {prod.price?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* SALE TYPES */}
          <TabsContent value="saletypes">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Tipos de Venta e Impuestos</h2>
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

      {/* Product Dialog */}
      <Dialog open={productDialog.open} onOpenChange={(o) => !o && setProductDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald">Nuevo Producto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={productDialog.name} onChange={e => setProductDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <select value={productDialog.category_id} onChange={e => setProductDialog(p => ({ ...p, category_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={productDialog.price} onChange={e => setProductDialog(p => ({ ...p, price: e.target.value }))}
              type="number" placeholder="Precio RD$" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
              <span className="text-sm">Controlar inventario</span>
              <Switch checked={productDialog.track_inventory} onCheckedChange={(v) => setProductDialog(p => ({ ...p, track_inventory: v }))} />
            </div>
            <Button onClick={handleAddProduct} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR</Button>
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
              placeholder="Nombre" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="user-name-input" />
            <input value={userDialog.pin} onChange={e => setUserDialog(p => ({ ...p, pin: e.target.value }))}
              placeholder={userDialog.editId ? "Nuevo PIN (dejar vacio para no cambiar)" : "PIN (4 digitos)"}
              type="password" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="user-pin-input" />
            <select value={userDialog.role} onChange={e => setUserDialog(p => ({ ...p, role: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="user-role-select">
              <option value="admin">Administrador</option>
              <option value="waiter">Mesero</option>
              <option value="cashier">Cajero</option>
              <option value="kitchen">Cocina</option>
            </select>
            <div className="border border-border rounded-lg p-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                <Shield size={12} /> Permisos Personalizados
              </h4>
              <ScrollArea className="max-h-40">
                <div className="space-y-2">
                  {Object.entries(PERM_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs">{label}</span>
                      <Switch
                        checked={userDialog.permissions[key] !== undefined ? userDialog.permissions[key] : false}
                        onCheckedChange={(v) => setUserDialog(p => ({ ...p, permissions: { ...p.permissions, [key]: v } }))}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <Button onClick={handleSaveUser} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-user">
              {userDialog.editId ? 'GUARDAR CAMBIOS' : 'CREAR USUARIO'}
            </Button>
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
