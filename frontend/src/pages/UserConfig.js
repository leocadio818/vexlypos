import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Save, User, Phone, Mail, Calendar, Shield, Clock, Plus, Trash2, Camera, ChevronDown, ChevronRight, RotateCcw, AlertTriangle, Eye, EyeOff, Lock, GraduationCap, Briefcase, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// ─── Permission categories ───
const PERMISSION_CATEGORIES = {
  ventas: {
    label: 'Ventas',
    icon: 'DollarSign',
    permissions: {
      open_table: 'Abrir Mesa',
      add_products: 'Agregar Productos',
      void_items: 'Anular Items',
      send_kitchen: 'Enviar a Cocina',
      create_bill: 'Crear Factura',
      collect_payment: 'Cobrar',
      split_bill: 'Dividir Cuenta',
      apply_discount: 'Aplicar Descuentos',
      modify_price: 'Modificar Precios',
      reprint_receipt: 'Reimprimir Recibo',
    }
  },
  mesas: {
    label: 'Mesas',
    icon: 'LayoutGrid',
    permissions: {
      move_tables: 'Mover Mesas',
      resize_tables: 'Redimensionar Mesas',
      transfer_table: 'Transferir Mesa',
      merge_tables: 'Unir Mesas',
      release_reserved_table: 'Desbloquear Mesa Reservada',
      access_all_tables: 'Acceder a Todas las Mesas',
    }
  },
  administracion: {
    label: 'Administracion',
    icon: 'ClipboardList',
    permissions: {
      view_dashboard: 'Ver Dashboard',
      open_shift: 'Abrir Turno',
      close_shift: 'Cerrar Turno',
      close_day: 'Cierre de Dia',
      view_reports: 'Ver Reportes',
      export_dgii: 'Exportar DGII',
      manage_reservations: 'Gestionar Reservaciones',
      manage_customers: 'Gestionar Clientes',
      manager_on_duty: 'Gerente en Turno',
      can_manage_tax_override: 'Exencion de Impuestos',
    }
  },
  inventario: {
    label: 'Inventario',
    icon: 'Package',
    permissions: {
      manage_inventory: 'Gestionar Inventario',
      manage_suppliers: 'Gestionar Proveedores',
      stock_adjustment: 'Ajustes de Stock',
      receive_orders: 'Recibir Pedidos',
    }
  },
  configuracion: {
    label: 'Configuracion',
    icon: 'Settings',
    permissions: {
      manage_users: 'Gestionar Usuarios',
      manage_areas: 'Gestionar Areas',
      manage_tables: 'Gestionar Mesas',
      manage_payment_methods: 'Metodos de Pago',
      manage_cancellation_reasons: 'Razones Anulacion',
      manage_products: 'Gestionar Productos',
      manage_sale_types: 'Tipos de Venta',
      manage_print_channels: 'Gestion Impresion',
      manage_station_config: 'Config Estacion',
    }
  },
};

// Default permissions by builtin role
const ROLE_DEFAULTS = {
  admin: Object.values(PERMISSION_CATEGORIES).reduce((acc, cat) => {
    Object.keys(cat.permissions).forEach(p => acc[p] = true);
    return acc;
  }, {}),
  waiter: {
    open_table: true, add_products: true, send_kitchen: true, create_bill: true,
    split_bill: true, view_dashboard: true, manage_reservations: true,
  },
  cashier: {
    open_table: true, add_products: true, void_items: true, send_kitchen: true,
    create_bill: true, collect_payment: true, split_bill: true, apply_discount: true,
    reprint_receipt: true, view_dashboard: true, open_shift: true, close_shift: true,
    view_reports: true, manage_customers: true, access_all_tables: true,
  },
  supervisor: {
    open_table: true, add_products: true, void_items: true, send_kitchen: true,
    create_bill: true, collect_payment: true, split_bill: true, apply_discount: true,
    move_tables: true, transfer_table: true, merge_tables: true, release_reserved_table: true,
    view_dashboard: true, open_shift: true, close_shift: true, view_reports: true,
    manage_reservations: true, manage_customers: true, reprint_receipt: true,
    access_all_tables: true,
  },
  kitchen: { view_dashboard: true, send_kitchen: true },
};

// Role display info  
const ROLE_DISPLAY = {
  admin: { label: 'Administrador', color: 'bg-red-500', short: 'ADM' },
  waiter: { label: 'Mesero', color: 'bg-blue-500', short: 'MES' },
  cashier: { label: 'Cajero', color: 'bg-emerald-500', short: 'CAJ' },
  supervisor: { label: 'Supervisor', color: 'bg-purple-500', short: 'SUP' },
  kitchen: { label: 'Cocina', color: 'bg-amber-500', short: 'COC' },
};

function getRoleCode(role) {
  return role.code || role.id;
}

function getRoleDefaults(roleCode, roles) {
  if (ROLE_DEFAULTS[roleCode]) return { ...ROLE_DEFAULTS[roleCode] };
  const customRole = roles.find(r => getRoleCode(r) === roleCode);
  if (customRole?.permissions) return { ...customRole.permissions };
  return {};
}

function getRoleLabel(roleCode, roles) {
  if (ROLE_DISPLAY[roleCode]) return ROLE_DISPLAY[roleCode].label;
  const customRole = roles.find(r => getRoleCode(r) === roleCode);
  return customRole?.name || roleCode;
}

function getRoleColor(roleCode) {
  return ROLE_DISPLAY[roleCode]?.color || 'bg-zinc-600';
}

// ─── Collapsible section component ───
function Section({ title, icon: Icon, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-primary" />}
          <span className="font-oswald text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</span>
          {badge}
        </div>
        {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder, className = '', readOnly, icon: Icon, required, ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="text-[11px] text-muted-foreground mb-1 block flex items-center gap-1">
          {Icon && <Icon size={10} />} {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
        className={`w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary/50 focus:outline-none transition-colors ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
        {...props}
      />
    </div>
  );
}

export default function UserConfig() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isNew = userId === 'new';

  const isAdmin = currentUser?.role === 'admin';
  const canEditPin = isAdmin || (!isNew && currentUser?.id === userId) || isNew;
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [expandedCats, setExpandedCats] = useState({ ventas: true });
  const [createRoleDialog, setCreateRoleDialog] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [trainingStats, setTrainingStats] = useState(null);

  const [user, setUser] = useState({
    name: '', last_name: '', pos_name: '', pin: '', role: 'waiter', active: true,
    address_line1: '', address_line2: '', city: '', state: '', postal_code: '',
    phone_home: '', phone_work: '', phone_mobile: '', email: '', birth_date: '',
    social_security: '', start_date: new Date().toISOString().split('T')[0], end_date: '',
    card_number: '', training_mode: false, system_interface: 'restaurant',
    positions: [], permissions: {}, photo_url: '',
    // keep other fields for backward compat
    web_access: false, web_password: '', reference_number: '', shift_rules: '',
    ignore_hours: false, manager_on_duty: false, till_employee: false,
    annual_salary: 0, schedule: [], preferred_hours: 0, skill_level: 1,
    revenue_center_id: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const rolesRes = await axios.get(`${API}/roles`, { headers: hdrs() });
      setRoles(rolesRes.data);

      if (!isNew) {
        const userRes = await axios.get(`${API}/users/${userId}`, { headers: hdrs() });
        const u = userRes.data;
        setUser(prev => ({ ...prev, ...u, pin: '' }));

        // Fetch training stats
        try {
          const statsRes = await axios.get(`${API}/users/${userId}/training-stats`, { headers: hdrs() });
          setTrainingStats(statsRes.data);
        } catch { /* ignore if no training data */ }
      }
    } catch (e) {
      console.error(e);
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [userId, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derived: current role defaults & special permissions count
  const roleDefaults = getRoleDefaults(user.role, roles);
  const specialCount = Object.keys(user.permissions).filter(p => {
    const userHas = user.permissions[p];
    const roleHas = roleDefaults[p] || false;
    return userHas !== roleHas && userHas !== undefined;
  }).length;

  const validatePin = (pin) => {
    if (!pin) return { valid: true, error: '' };
    if (!/^\d+$/.test(pin)) return { valid: false, error: 'Solo numeros' };
    if (pin.length > 8) return { valid: false, error: 'Max 8 digitos' };
    if (pin.startsWith('0')) return { valid: false, error: 'No puede iniciar con 0' };
    return { valid: true, error: '' };
  };

  const handleSelectRole = (role) => {
    const code = getRoleCode(role);
    const defaults = role.builtin ? (ROLE_DEFAULTS[code] || {}) : (role.permissions || {});
    setUser(p => ({ ...p, role: code, permissions: { ...defaults } }));
    toast.success(`Puesto: ${role.name}`, { duration: 1500 });
  };

  const handleSave = async () => {
    if (!user.name.trim()) { toast.error('El nombre es requerido'); return; }
    if (isNew && !user.pin) { toast.error('El PIN es requerido'); return; }
    if (user.pin && canEditPin) {
      const v = validatePin(user.pin);
      if (!v.valid) { toast.error(v.error); return; }
    }

    setSaving(true);
    try {
      if (user.pin && canEditPin) {
        const checkRes = await axios.post(`${API}/users/check-pin`, {
          pin: user.pin, exclude_user_id: isNew ? null : userId
        }, { headers: hdrs() });
        if (checkRes.data.exists) {
          setSaving(false);
          toast.error('Este PIN ya esta asignado a otro usuario activo');
          return;
        }
      }

      const data = { ...user, pos_name: user.pos_name || `${user.name} ${user.last_name}`.trim() };
      if (!isNew && (!data.pin || !canEditPin)) delete data.pin;

      if (isNew) {
        await axios.post(`${API}/users`, data, { headers: hdrs() });
        toast.success('Empleado creado');
      } else {
        await axios.put(`${API}/users/${userId}`, data, { headers: hdrs() });
        toast.success('Empleado actualizado');
      }
      navigate('/settings');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error guardando');
    } finally { setSaving(false); }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) { toast.error('Nombre del puesto requerido'); return; }
    try {
      const code = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
      await axios.post(`${API}/roles`, { name: newRoleName.trim(), code, permissions: {} }, { headers: hdrs() });
      toast.success(`Puesto "${newRoleName}" creado`);
      setNewRoleName('');
      setCreateRoleDialog(false);
      const rolesRes = await axios.get(`${API}/roles`, { headers: hdrs() });
      setRoles(rolesRes.data);
    } catch (e) { toast.error('Error creando puesto'); }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const currentRoleLabel = getRoleLabel(user.role, roles);

  return (
    <div className="h-full flex flex-col" data-testid="user-config-page">
      {/* ═══ HEADER ═══ */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} data-testid="back-btn">
            <ArrowLeft size={20} />
          </Button>
          <User size={20} className="text-primary" />
          <h1 className="font-oswald text-lg font-bold tracking-wide">{isNew ? 'NUEVO EMPLEADO' : 'EDITAR EMPLEADO'}</h1>
          {!isNew && <Badge variant={user.active ? 'default' : 'destructive'}>{user.active ? 'Activo' : 'Inactivo'}</Badge>}
          {user.training_mode && (
            <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
              <GraduationCap size={12} className="mr-1" /> ENTRENAMIENTO
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Activo</span>
            <Switch checked={user.active} onCheckedChange={v => setUser(p => ({ ...p, active: v }))} />
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <GraduationCap size={14} className={user.training_mode ? 'text-amber-400' : 'text-muted-foreground'} />
            <span className="text-[11px] text-muted-foreground">Entrenamiento</span>
            <Switch
              checked={user.training_mode}
              onCheckedChange={v => setUser(p => ({ ...p, training_mode: v }))}
              data-testid="training-mode-switch"
              className={user.training_mode ? 'data-[state=checked]:bg-amber-500' : ''}
            />
          </div>
          <div className="h-5 w-px bg-border" />
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="save-user-btn">
            <Save size={16} className="mr-2" /> {saving ? 'GUARDANDO...' : 'GUARDAR'}
          </Button>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ═══ LEFT COLUMN: Employee Data ═══ */}
          <div className="lg:col-span-5 space-y-4">
            {/* Essential Info */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-oswald text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <User size={14} className="text-primary" /> Datos del Empleado
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Nombre" value={user.name} required onChange={e => setUser(p => ({ ...p, name: e.target.value }))} data-testid="user-name-input" />
                <Input label="Apellido" value={user.last_name} onChange={e => setUser(p => ({ ...p, last_name: e.target.value }))} data-testid="user-lastname-input" />
              </div>

              <Input label="Nombre P.O.S." value={user.pos_name} onChange={e => setUser(p => ({ ...p, pos_name: e.target.value }))} placeholder={`${user.name} ${user.last_name}`.trim()} />

              {/* PIN */}
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Lock size={10} /> PIN de Acceso {isNew && <span className="text-red-400">*</span>}
                  {!canEditPin && <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-400 ml-1">Solo Admin</Badge>}
                </label>
                {canEditPin ? (
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'} value={user.pin} maxLength={8}
                      onChange={e => setUser(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                      placeholder={isNew ? '1-8 digitos' : 'Vacio = no cambiar'}
                      className={`w-full bg-background border rounded-lg px-3 py-2 pr-10 text-sm font-mono tracking-widest ${user.pin && !validatePin(user.pin).valid ? 'border-red-500' : 'border-border'}`}
                      data-testid="user-pin-input"
                    />
                    {isAdmin && (
                      <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                    {user.pin && !validatePin(user.pin).valid && <p className="text-[10px] text-red-500 mt-1">{validatePin(user.pin).error}</p>}
                  </div>
                ) : (
                  <div className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm font-mono text-muted-foreground">
                    ???????? <span className="text-xs ml-2 text-amber-400">(Contacte al admin)</span>
                  </div>
                )}
              </div>

              {/* Photo */}
              <div className="flex items-center gap-3 pt-1">
                <div className="w-16 h-16 rounded-xl bg-background border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
                  {user.photo_url ? <img src={user.photo_url} alt="" className="w-full h-full object-cover rounded-xl" /> : <Camera size={24} className="text-muted-foreground/30" />}
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-oswald font-bold text-lg">{user.name || 'Nuevo'} {user.last_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className={`${getRoleColor(user.role)} text-white text-[10px]`}>{currentRoleLabel}</Badge>
                    {user.training_mode && <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">Entrenamiento</Badge>}
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Info - Collapsible */}
            <Section title="Contacto" icon={Phone}>
              <div className="grid grid-cols-3 gap-2">
                <Input label="Tel. Casa" value={user.phone_home} onChange={e => setUser(p => ({ ...p, phone_home: e.target.value }))} />
                <Input label="Tel. Trabajo" value={user.phone_work} onChange={e => setUser(p => ({ ...p, phone_work: e.target.value }))} />
                <Input label="Tel. Movil" value={user.phone_mobile} onChange={e => setUser(p => ({ ...p, phone_mobile: e.target.value }))} />
              </div>
              <Input label="Email" type="email" icon={Mail} value={user.email} onChange={e => setUser(p => ({ ...p, email: e.target.value }))} />
              <Input label="Direccion" value={user.address_line1} onChange={e => setUser(p => ({ ...p, address_line1: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2">
                <Input label="Ciudad" value={user.city} onChange={e => setUser(p => ({ ...p, city: e.target.value }))} />
                <Input label="Estado" value={user.state} onChange={e => setUser(p => ({ ...p, state: e.target.value }))} />
                <Input label="Cod.Postal" value={user.postal_code} onChange={e => setUser(p => ({ ...p, postal_code: e.target.value }))} />
              </div>
            </Section>

            {/* Employment - Collapsible */}
            <Section title="Empleo" icon={Briefcase}>
              <Input label="Cedula / IMSS" value={user.social_security} onChange={e => setUser(p => ({ ...p, social_security: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Fecha Inicio" type="date" value={user.start_date} onChange={e => setUser(p => ({ ...p, start_date: e.target.value }))} />
                <Input label="Fecha Fin" type="date" value={user.end_date} onChange={e => setUser(p => ({ ...p, end_date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Fecha Nacimiento" type="date" icon={Calendar} value={user.birth_date} onChange={e => setUser(p => ({ ...p, birth_date: e.target.value }))} />
                <Input label="Tarjeta #" value={user.card_number} readOnly placeholder="Sin asignar" />
              </div>
            </Section>

            {/* Training Dashboard - Only shows if user has/had training */}
            {!isNew && (user.training_mode || (trainingStats && trainingStats.orders_count > 0)) && (
              <Section title="Progreso de Entrenamiento" icon={GraduationCap} defaultOpen={user.training_mode}
                badge={user.training_mode ? <Badge className="bg-amber-500/20 text-amber-400 text-[9px] ml-2">Activo</Badge> : <Badge variant="secondary" className="text-[9px] ml-2">Historial</Badge>}
              >
                {trainingStats ? (
                  <div className="space-y-3" data-testid="training-stats">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-background rounded-lg p-3 text-center border border-border">
                        <p className="text-2xl font-oswald font-bold text-primary">{trainingStats.orders_count}</p>
                        <p className="text-[10px] text-muted-foreground">Ordenes</p>
                      </div>
                      <div className="bg-background rounded-lg p-3 text-center border border-border">
                        <p className="text-2xl font-oswald font-bold text-emerald-400">{trainingStats.bills_paid}</p>
                        <p className="text-[10px] text-muted-foreground">Cobros Practicados</p>
                      </div>
                      <div className="bg-background rounded-lg p-3 text-center border border-border">
                        <p className="text-2xl font-oswald font-bold text-blue-400">{trainingStats.items_practiced}</p>
                        <p className="text-[10px] text-muted-foreground">Items Procesados</p>
                      </div>
                      <div className="bg-background rounded-lg p-3 text-center border border-border">
                        <p className="text-2xl font-oswald font-bold text-amber-400">${trainingStats.total_amount_practiced.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">Monto Practicado</p>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="text-[11px] text-muted-foreground space-y-1">
                      {trainingStats.first_activity && (
                        <p>Inicio: <span className="text-foreground">{new Date(trainingStats.first_activity).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                      )}
                      {trainingStats.last_activity && (
                        <p>Ultima actividad: <span className="text-foreground">{new Date(trainingStats.last_activity).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></p>
                      )}
                    </div>

                    {/* Recent Activity */}
                    {trainingStats.recent_activity?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1.5 font-bold uppercase">Actividad Reciente</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {trainingStats.recent_activity.map((a, i) => (
                            <div key={i} className="flex items-center justify-between bg-background rounded px-2 py-1.5 text-xs border border-border">
                              <span className="text-muted-foreground">{a.date ? new Date(a.date).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                              <span>{a.items_count} items</span>
                              <Badge variant={a.status === 'paid' ? 'default' : 'secondary'} className="text-[9px]">
                                {a.status === 'paid' ? 'Cobrado' : a.status === 'open' ? 'Abierto' : a.status}
                              </Badge>
                              <span className="font-mono font-bold">${a.total.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {trainingStats.orders_count === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aun no hay actividad de entrenamiento
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Cargando estadisticas...</p>
                )}
              </Section>
            )}
          </div>

          {/* ═══ RIGHT COLUMN: Puesto + Permissions ═══ */}
          <div className="lg:col-span-7 space-y-4">
            {/* Puesto Selector */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-oswald text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Briefcase size={14} className="text-primary" /> Seleccionar Puesto
                </h3>
                <Button size="sm" variant="outline" onClick={() => setCreateRoleDialog(true)} className="h-7 text-xs" data-testid="create-role-btn">
                  <Plus size={12} className="mr-1" /> Crear Puesto
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Al seleccionar un puesto se cargan los permisos por defecto. Luego puedes personalizarlos abajo.
              </p>
              <div className="flex flex-wrap gap-2" data-testid="role-selector">
                {roles
                  // Deduplicate: prefer builtin roles, skip custom roles with same code as builtins
                  .filter((role, idx, arr) => {
                    if (role.builtin) return true;
                    const code = getRoleCode(role);
                    const builtinCodes = ['admin', 'waiter', 'cashier', 'supervisor', 'kitchen'];
                    if (builtinCodes.includes(code)) return false; // Skip custom dupes
                    // Also skip if another custom role with same code exists earlier
                    return arr.findIndex(r => getRoleCode(r) === code) === idx;
                  })
                  .map(role => {
                  const code = getRoleCode(role);
                  const isSelected = user.role === code;
                  const permCount = role.builtin
                    ? Object.values(ROLE_DEFAULTS[code] || {}).filter(Boolean).length
                    : Object.values(role.permissions || {}).filter(Boolean).length;

                  return (
                    <button
                      key={role.id}
                      onClick={() => handleSelectRole(role)}
                      data-testid={`role-option-${code}`}
                      className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isSelected
                          ? `${getRoleColor(code)} text-white shadow-lg shadow-primary/20 scale-105`
                          : 'bg-background border border-border hover:border-primary/50 hover:bg-muted/30'
                      }`}
                    >
                      {isSelected && <Check size={14} />}
                      <span className="font-oswald">{role.name}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-muted-foreground'}`}>
                        {permCount}p
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Permissions Grid */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-oswald text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Shield size={14} className="text-primary" /> Permisos de {currentRoleLabel}
                </h3>
                <div className="flex items-center gap-2">
                  {specialCount > 0 && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-[10px]">
                      <AlertTriangle size={10} className="mr-1" /> {specialCount} especial(es)
                    </Badge>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="reset-permissions-btn"
                    onClick={() => { setUser(p => ({ ...p, permissions: getRoleDefaults(p.role, roles) })); toast.success('Permisos restablecidos'); }}>
                    <RotateCcw size={12} className="mr-1" /> Restablecer
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-1" data-testid="permissions-grid">
                {Object.entries(PERMISSION_CATEGORIES).map(([catKey, cat]) => {
                  const isExpanded = expandedCats[catKey];
                  const catPerms = Object.keys(cat.permissions);
                  const activeCount = catPerms.filter(p => user.permissions[p]).length;
                  const specialInCat = catPerms.filter(p => {
                    const has = user.permissions[p];
                    const def = roleDefaults[p] || false;
                    return has !== def && has !== undefined;
                  }).length;

                  return (
                    <div key={catKey} className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedCats(prev => ({ ...prev, [catKey]: !prev[catKey] }))}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-background hover:bg-muted/30 transition-colors"
                        data-testid={`perm-category-${catKey}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-oswald font-bold text-sm">{cat.label}</span>
                          <Badge variant="secondary" className="text-[10px]">{activeCount}/{catPerms.length}</Badge>
                          {specialInCat > 0 && (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-[10px]">{specialInCat} especial</Badge>
                          )}
                        </div>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 bg-card/50 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {Object.entries(cat.permissions).map(([permKey, permLabel]) => {
                            const userHas = user.permissions[permKey] || false;
                            const roleHas = roleDefaults[permKey] || false;
                            const isSpecial = userHas !== roleHas;

                            return (
                              <div
                                key={permKey}
                                className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                                  isSpecial ? 'bg-orange-500/5 border border-orange-500/30' : 'bg-background border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm truncate">{permLabel}</span>
                                  {isSpecial && <span className="text-[9px] text-orange-400 flex-shrink-0">especial</span>}
                                </div>
                                <Switch
                                  checked={userHas}
                                  onCheckedChange={v => setUser(p => ({ ...p, permissions: { ...p.permissions, [permKey]: v } }))}
                                  className={`flex-shrink-0 ${isSpecial ? 'data-[state=checked]:bg-orange-500' : ''}`}
                                  data-testid={`perm-${permKey}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border border-orange-500/40 bg-orange-500/10" />
                  <span>Permiso Especial (fuera del puesto)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border border-border bg-background" />
                  <span>Permiso del Puesto</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Create Role Dialog ═══ */}
      <Dialog open={createRoleDialog} onOpenChange={setCreateRoleDialog}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Plus size={18} className="text-primary" /> Crear Puesto Nuevo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Crea un puesto personalizado. Luego podras asignarle permisos al seleccionarlo.
            </p>
            <Input label="Nombre del Puesto" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Ej: Bartender, Host..." required />
            <Button onClick={handleCreateRole} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-create-role-btn">
              CREAR PUESTO
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
