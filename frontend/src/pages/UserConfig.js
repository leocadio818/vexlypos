import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, User, Phone, Mail, MapPin, Calendar, Shield, Clock, Briefcase, Plus, Trash2, Camera, Key, Globe, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const DAYS = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return `${h}${ampm}`;
});

const SYSTEM_INTERFACES = [
  { code: 'restaurant', label: 'Capacidad Restaurante' },
  { code: 'quick_order', label: 'Orden Rápida (Bar/Comida Rápida)' },
  { code: 'host', label: 'Host/Hostess' },
  { code: 'delivery', label: 'Repartidor' },
  { code: 'delivery_mode', label: 'Modo Reparto' },
  { code: 'clock_only', label: 'Solo Marca Entrada/Salida' },
];

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

export default function UserConfig() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const isNew = userId === 'new';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [roles, setRoles] = useState([]);
  const [revenueCenters, setRevenueCenters] = useState([]);

  // Position assignment dialog
  const [posDialog, setPosDialog] = useState({
    open: false,
    position_id: '',
    hourly_rate: 0,
    is_primary: false,
    editIndex: null
  });

  // Schedule dialog
  const [scheduleDialog, setScheduleDialog] = useState(false);

  // User form state
  const [user, setUser] = useState({
    // Basic info
    name: '',
    last_name: '',
    pos_name: '',
    pin: '',
    role: 'waiter',
    active: true,
    
    // Contact info
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    phone_home: '',
    phone_work: '',
    phone_mobile: '',
    email: '',
    birth_date: '',
    social_security: '', // IMSS/Cedula
    
    // Employment
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    revenue_center_id: '',
    card_number: '',
    training_mode: false,
    
    // Advanced settings
    system_interface: 'restaurant',
    web_access: false,
    web_password: '',
    reference_number: '',
    shift_rules: '',
    ignore_hours: false,
    manager_on_duty: false,
    till_employee: false,
    
    // Positions/salarios
    positions: [],
    annual_salary: 0,
    
    // Schedule (7 days x 24 hours)
    schedule: DAYS.map(() => HOURS.map(() => 'available')), // 'available', 'required', 'unavailable'
    preferred_hours: 0,
    skill_level: 1,
    
    // Permissions
    permissions: {},
    
    // Photo
    photo_url: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [rolesRes] = await Promise.all([
        axios.get(`${API}/roles`, { headers: hdrs() }),
      ]);
      setRoles(rolesRes.data);
      
      // Default revenue centers
      setRevenueCenters([
        { id: 'default', name: 'Default Revenue Center' },
        { id: 'bar', name: 'Bar' },
        { id: 'restaurant', name: 'Restaurante' },
        { id: 'terrace', name: 'Terraza' },
      ]);

      if (!isNew) {
        const userRes = await axios.get(`${API}/users/${userId}`, { headers: hdrs() });
        const u = userRes.data;
        setUser(prev => ({
          ...prev,
          name: u.name || '',
          last_name: u.last_name || '',
          pos_name: u.pos_name || u.name || '',
          role: u.role || 'waiter',
          active: u.active !== false,
          address_line1: u.address_line1 || '',
          address_line2: u.address_line2 || '',
          city: u.city || '',
          state: u.state || '',
          postal_code: u.postal_code || '',
          phone_home: u.phone_home || '',
          phone_work: u.phone_work || '',
          phone_mobile: u.phone_mobile || '',
          email: u.email || '',
          birth_date: u.birth_date || '',
          social_security: u.social_security || '',
          start_date: u.start_date || '',
          end_date: u.end_date || '',
          revenue_center_id: u.revenue_center_id || '',
          card_number: u.card_number || '',
          training_mode: u.training_mode || false,
          system_interface: u.system_interface || 'restaurant',
          web_access: u.web_access || false,
          reference_number: u.reference_number || '',
          shift_rules: u.shift_rules || '',
          ignore_hours: u.ignore_hours || false,
          manager_on_duty: u.manager_on_duty || false,
          till_employee: u.till_employee || false,
          positions: u.positions || [],
          annual_salary: u.annual_salary || 0,
          schedule: u.schedule || DAYS.map(() => HOURS.map(() => 'available')),
          preferred_hours: u.preferred_hours || 0,
          skill_level: u.skill_level || 1,
          permissions: u.permissions || {},
          photo_url: u.photo_url || '',
        }));
      }
    } catch (e) {
      console.error(e);
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [userId, isNew]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!user.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (isNew && (!user.pin || user.pin.length < 4)) {
      toast.error('PIN debe tener mínimo 4 dígitos');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...user,
        pos_name: user.pos_name || `${user.name} ${user.last_name}`.trim(),
      };
      
      // Remove empty pin if editing
      if (!isNew && !data.pin) {
        delete data.pin;
      }

      if (isNew) {
        await axios.post(`${API}/users`, data, { headers: hdrs() });
        toast.success('Usuario creado exitosamente');
      } else {
        await axios.put(`${API}/users/${userId}`, data, { headers: hdrs() });
        toast.success('Usuario actualizado exitosamente');
      }
      navigate('/settings');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error guardando usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPosition = () => {
    const { position_id, hourly_rate, is_primary, editIndex } = posDialog;
    if (!position_id) {
      toast.error('Seleccione un puesto');
      return;
    }

    const position = {
      position_id,
      position_name: roles.find(r => r.id === position_id)?.name || position_id,
      hourly_rate: parseFloat(hourly_rate) || 0,
      is_primary,
    };

    if (editIndex !== null) {
      setUser(prev => ({
        ...prev,
        positions: prev.positions.map((p, i) => i === editIndex ? position : (is_primary ? { ...p, is_primary: false } : p))
      }));
    } else {
      setUser(prev => ({
        ...prev,
        positions: is_primary 
          ? [...prev.positions.map(p => ({ ...p, is_primary: false })), position]
          : [...prev.positions, position]
      }));
    }

    setPosDialog({ open: false, position_id: '', hourly_rate: 0, is_primary: false, editIndex: null });
  };

  const handleRemovePosition = (index) => {
    setUser(prev => ({
      ...prev,
      positions: prev.positions.filter((_, i) => i !== index)
    }));
  };

  const toggleScheduleCell = (dayIdx, hourIdx) => {
    setUser(prev => {
      const newSchedule = prev.schedule.map((day, di) =>
        day.map((hour, hi) => {
          if (di === dayIdx && hi === hourIdx) {
            // Cycle: available -> required -> unavailable -> available
            if (hour === 'available') return 'required';
            if (hour === 'required') return 'unavailable';
            return 'available';
          }
          return hour;
        })
      );
      return { ...prev, schedule: newSchedule };
    });
  };

  const getScheduleCellColor = (status) => {
    switch (status) {
      case 'required': return 'bg-green-500';
      case 'unavailable': return 'bg-zinc-900';
      default: return 'bg-red-500/30';
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="user-config-page">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} data-testid="back-btn">
            <ArrowLeft size={20} />
          </Button>
          <User size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">
            {isNew ? 'NUEVO EMPLEADO' : 'EDITAR EMPLEADO'}
          </h1>
          {!isNew && (
            <Badge variant={user.active ? 'default' : 'destructive'} className="ml-2">
              {user.active ? 'Activo' : 'Inactivo'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <span className="text-xs text-muted-foreground">Está Activo?</span>
            <Switch 
              checked={user.active}
              onCheckedChange={v => setUser(p => ({ ...p, active: v }))}
            />
          </div>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-primary text-primary-foreground font-oswald font-bold active:scale-95"
            data-testid="save-user-btn"
          >
            <Save size={16} className="mr-2" />
            {saving ? 'GUARDANDO...' : 'GUARDAR'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* User name header */}
          <div className="mb-4 pb-3 border-b border-border">
            <h2 className="text-2xl font-bold text-primary font-oswald">
              {user.name || 'Nuevo'} {user.last_name}
            </h2>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-card border border-border mb-4 w-full justify-start gap-1 p-1">
              <TabsTrigger 
                value="info" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald"
                data-testid="tab-info"
              >
                <User size={14} className="mr-1" /> Informc.Empleado
              </TabsTrigger>
              <TabsTrigger 
                value="advanced" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald"
                data-testid="tab-advanced"
              >
                <Settings size={14} className="mr-1" /> Avanzado
              </TabsTrigger>
              <TabsTrigger 
                value="positions" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald"
                data-testid="tab-positions"
              >
                <Briefcase size={14} className="mr-1" /> Empleador
              </TabsTrigger>
            </TabsList>

            {/* INFO TAB */}
            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left column - Basic Info */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    Información Personal
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Nombre Empleado *</label>
                      <input 
                        value={user.name}
                        onChange={e => setUser(p => ({ ...p, name: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                        data-testid="user-name-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Apellido</label>
                      <input 
                        value={user.last_name}
                        onChange={e => setUser(p => ({ ...p, last_name: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                        data-testid="user-lastname-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nombre P.O.S.</label>
                    <input 
                      value={user.pos_name}
                      onChange={e => setUser(p => ({ ...p, pos_name: e.target.value }))}
                      placeholder={`${user.name} ${user.last_name}`.trim() || 'Nombre para el POS'}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Dirección Línea 1</label>
                    <input 
                      value={user.address_line1}
                      onChange={e => setUser(p => ({ ...p, address_line1: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Dirección Línea 2</label>
                    <input 
                      value={user.address_line2}
                      onChange={e => setUser(p => ({ ...p, address_line2: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Ciudad</label>
                      <input 
                        value={user.city}
                        onChange={e => setUser(p => ({ ...p, city: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
                      <input 
                        value={user.state}
                        onChange={e => setUser(p => ({ ...p, state: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Cód.Postal</label>
                      <input 
                        value={user.postal_code}
                        onChange={e => setUser(p => ({ ...p, postal_code: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cédula / IMSS</label>
                    <input 
                      value={user.social_security}
                      onChange={e => setUser(p => ({ ...p, social_security: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                        <Phone size={10} /> Tel. Casa
                      </label>
                      <input 
                        value={user.phone_home}
                        onChange={e => setUser(p => ({ ...p, phone_home: e.target.value }))}
                        placeholder="(   )"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                        <Phone size={10} /> Tel. Trabajo
                      </label>
                      <input 
                        value={user.phone_work}
                        onChange={e => setUser(p => ({ ...p, phone_work: e.target.value }))}
                        placeholder="(   )"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                        <Phone size={10} /> Tel. Móvil
                      </label>
                      <input 
                        value={user.phone_mobile}
                        onChange={e => setUser(p => ({ ...p, phone_mobile: e.target.value }))}
                        placeholder="(   )"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                      <Mail size={10} /> Email
                    </label>
                    <input 
                      type="email"
                      value={user.email}
                      onChange={e => setUser(p => ({ ...p, email: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                        <Calendar size={10} /> Fecha Nacimiento
                      </label>
                      <input 
                        type="date"
                        value={user.birth_date}
                        onChange={e => setUser(p => ({ ...p, birth_date: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="text-center pt-5">
                      <span className="text-xs text-muted-foreground">Edad</span>
                      <p className="font-oswald font-bold text-primary">
                        {user.birth_date ? Math.floor((new Date() - new Date(user.birth_date)) / 31557600000) : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
                    <div>
                      <span className="text-sm font-semibold">Md. Entrenamiento</span>
                      <p className="text-[10px] text-muted-foreground">Usuario en modo de capacitación</p>
                    </div>
                    <Switch 
                      checked={user.training_mode}
                      onCheckedChange={v => setUser(p => ({ ...p, training_mode: v }))}
                    />
                  </div>
                </div>

                {/* Right column - POS & Employment */}
                <div className="space-y-4">
                  {/* POS Functions */}
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider">
                      Configuración POS
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Inicio Día</label>
                        <input 
                          type="date"
                          value={user.start_date}
                          onChange={e => setUser(p => ({ ...p, start_date: e.target.value }))}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Fin de Día</label>
                        <input 
                          type="date"
                          value={user.end_date}
                          onChange={e => setUser(p => ({ ...p, end_date: e.target.value }))}
                          placeholder="01/01/6000"
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Centro de Ingresos</label>
                      <select 
                        value={user.revenue_center_id}
                        onChange={e => setUser(p => ({ ...p, revenue_center_id: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">Default Revenue Center</option>
                        {revenueCenters.map(rc => (
                          <option key={rc.id} value={rc.id}>{rc.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tarjeta #</label>
                        <input 
                          value={user.card_number}
                          onChange={e => setUser(p => ({ ...p, card_number: e.target.value }))}
                          placeholder="***"
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button variant="outline" className="w-full" size="sm">
                          Asignar Tarjeta
                        </Button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block"># Referencia</label>
                      <input 
                        value={user.reference_number}
                        onChange={e => setUser(p => ({ ...p, reference_number: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">PIN de Acceso *</label>
                      <input 
                        type="password"
                        value={user.pin}
                        onChange={e => setUser(p => ({ ...p, pin: e.target.value }))}
                        placeholder={isNew ? 'Mínimo 4 dígitos' : 'Vacío = no cambiar'}
                        maxLength={6}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-widest"
                        data-testid="user-pin-input"
                      />
                    </div>
                  </div>

                  {/* Photo & Actions */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 rounded-xl bg-background border-2 border-dashed border-border flex items-center justify-center">
                        {user.photo_url ? (
                          <img src={user.photo_url} alt="Foto" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          <Camera size={32} className="text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Button variant="outline" className="w-full justify-start" size="sm">
                          <Camera size={14} className="mr-2" /> Foto
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start" 
                          size="sm"
                          onClick={() => setScheduleDialog(true)}
                        >
                          <Clock size={14} className="mr-2" /> Horarios
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Shield size={14} /> Permisos ({Object.values(user.permissions).filter(Boolean).length} activos)
                    </h3>
                    <ScrollArea className="max-h-48">
                      <div className="space-y-1">
                        {Object.entries(PERM_LABELS).map(([key, label]) => {
                          const val = user.permissions[key] !== undefined ? user.permissions[key] : false;
                          return (
                            <div key={key} className="flex items-center justify-between py-0.5">
                              <span className="text-[11px]">{label}</span>
                              <Switch 
                                checked={val} 
                                onCheckedChange={(v) => setUser(p => ({ ...p, permissions: { ...p.permissions, [key]: v } }))} 
                              />
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ADVANCED TAB */}
            <TabsContent value="advanced" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* System Interface */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    Interfase Sistema
                  </h3>
                  <div className="space-y-2">
                    {SYSTEM_INTERFACES.map(si => (
                      <label key={si.code} className="flex items-center gap-3 p-2 rounded-lg bg-background border border-border hover:border-primary/50 cursor-pointer">
                        <input 
                          type="radio"
                          name="system_interface"
                          value={si.code}
                          checked={user.system_interface === si.code}
                          onChange={e => setUser(p => ({ ...p, system_interface: e.target.value }))}
                          className="w-4 h-4 text-primary"
                        />
                        <span className="text-sm">{si.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Web Authorization */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Globe size={14} /> Autorización Vía WEB
                  </h3>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
                    <span className="text-sm">Acceso WEB</span>
                    <Switch 
                      checked={user.web_access}
                      onCheckedChange={v => setUser(p => ({ ...p, web_access: v }))}
                    />
                  </div>

                  {user.web_access && (
                    <Button variant="outline" className="w-full" onClick={() => {
                      const newPass = prompt('Nueva contraseña web:');
                      if (newPass) setUser(p => ({ ...p, web_password: newPass }));
                    }}>
                      <Key size={14} className="mr-2" /> Configura Contraseña
                    </Button>
                  )}

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ref#</label>
                    <input 
                      value={user.reference_number}
                      onChange={e => setUser(p => ({ ...p, reference_number: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Reglas para turnos</label>
                    <select 
                      value={user.shift_rules}
                      onChange={e => setUser(p => ({ ...p, shift_rules: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Ninguno Seleccionado</option>
                      <option value="standard">Turno Estándar</option>
                      <option value="flexible">Turno Flexible</option>
                      <option value="rotating">Turno Rotativo</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between p-2 rounded bg-background border border-border">
                      <span className="text-sm">Despreciar Horas del Empleado</span>
                      <Switch 
                        checked={user.ignore_hours}
                        onCheckedChange={v => setUser(p => ({ ...p, ignore_hours: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background border border-border">
                      <span className="text-sm">Gerente en Servicio</span>
                      <Switch 
                        checked={user.manager_on_duty}
                        onCheckedChange={v => setUser(p => ({ ...p, manager_on_duty: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background border border-border">
                      <span className="text-sm">Till Employee/Card</span>
                      <Switch 
                        checked={user.till_employee}
                        onCheckedChange={v => setUser(p => ({ ...p, till_employee: v }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* POSITIONS TAB */}
            <TabsContent value="positions" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Config. Puesto */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider">
                      Config. Puesto
                    </h3>
                    <Button 
                      size="sm"
                      onClick={() => setPosDialog({ open: true, position_id: roles[0]?.id || '', hourly_rate: 0, is_primary: user.positions.length === 0, editIndex: null })}
                      className="bg-primary text-primary-foreground font-bold active:scale-95"
                    >
                      <Plus size={14} className="mr-1" /> Agregar
                    </Button>
                  </div>

                  {/* Positions table */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      <div className="col-span-5">Puesto</div>
                      <div className="col-span-3 text-right">Pagar Tarifa/H</div>
                      <div className="col-span-2 text-center">Primaria</div>
                      <div className="col-span-2"></div>
                    </div>
                    <div className="divide-y divide-border">
                      {user.positions.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          Sin puestos asignados
                        </div>
                      ) : (
                        user.positions.map((pos, idx) => (
                          <div key={idx} className={`grid grid-cols-12 gap-2 px-3 py-2 items-center ${pos.is_primary ? 'bg-primary/10' : ''}`}>
                            <div className="col-span-5 text-sm font-medium">
                              {pos.position_name}
                            </div>
                            <div className="col-span-3 text-right font-oswald text-sm">
                              {pos.hourly_rate?.toFixed(2) || '0.00'}
                            </div>
                            <div className="col-span-2 text-center">
                              <input 
                                type="checkbox" 
                                checked={pos.is_primary} 
                                onChange={() => {
                                  setUser(prev => ({
                                    ...prev,
                                    positions: prev.positions.map((p, i) => ({
                                      ...p,
                                      is_primary: i === idx
                                    }))
                                  }));
                                }}
                                className="w-4 h-4"
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-destructive/60 hover:text-destructive"
                                onClick={() => handleRemovePosition(idx)}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Salario Anual</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">RD$</span>
                      <input 
                        type="number"
                        value={user.annual_salary}
                        onChange={e => setUser(p => ({ ...p, annual_salary: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-background border border-border rounded-lg pl-12 pr-3 py-2 text-sm font-oswald text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* Role Selection */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="font-oswald text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    Selecc. Puesto Labores
                  </h3>
                  
                  <div className="space-y-1">
                    {roles.map(role => (
                      <button
                        key={role.id}
                        onClick={() => setUser(p => ({ ...p, role: role.code }))}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                          user.role === role.code 
                            ? 'bg-primary text-primary-foreground font-semibold' 
                            : 'bg-background border border-border hover:border-primary/50'
                        }`}
                      >
                        <span className="font-oswald mr-2 text-xs opacity-60">{role.level || '00'}</span>
                        {role.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Position Dialog */}
      <Dialog open={posDialog.open} onOpenChange={(o) => !o && setPosDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Briefcase size={18} className="text-primary" />
              {posDialog.editIndex !== null ? 'Editar' : 'Agregar'} Puesto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Puesto</label>
              <select 
                value={posDialog.position_id}
                onChange={e => setPosDialog(p => ({ ...p, position_id: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">Seleccionar...</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pagar Tarifa/Hora</label>
              <input 
                type="number"
                step="0.01"
                value={posDialog.hourly_rate}
                onChange={e => setPosDialog(p => ({ ...p, hourly_rate: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-oswald"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
              <span className="text-sm">Primaria</span>
              <Switch 
                checked={posDialog.is_primary}
                onCheckedChange={v => setPosDialog(p => ({ ...p, is_primary: v }))}
              />
            </div>
            <Button onClick={handleAddPosition} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
              {posDialog.editIndex !== null ? 'GUARDAR' : 'AGREGAR'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
        <DialogContent className="max-w-4xl bg-card border-border" data-testid="schedule-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              Formato Horarios de Empleado
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Schedule Grid */}
            <div className="lg:col-span-2 overflow-auto">
              <div className="min-w-[500px]">
                {/* Header */}
                <div className="grid grid-cols-8 gap-px mb-px">
                  <div className="text-[10px] text-muted-foreground p-1"></div>
                  {DAYS.map(day => (
                    <div key={day} className="text-[10px] text-center font-semibold text-muted-foreground p-1">
                      {day}
                    </div>
                  ))}
                </div>
                {/* Grid */}
                <div className="border border-border rounded overflow-hidden">
                  {HOURS.map((hour, hourIdx) => (
                    <div key={hour} className="grid grid-cols-8 gap-px bg-border">
                      <div className="bg-card text-[9px] text-muted-foreground p-1 flex items-center">
                        {hour}
                      </div>
                      {DAYS.map((_, dayIdx) => (
                        <button
                          key={dayIdx}
                          onClick={() => toggleScheduleCell(dayIdx, hourIdx)}
                          className={`h-5 ${getScheduleCellColor(user.schedule[dayIdx]?.[hourIdx])} hover:opacity-80 transition-opacity`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend & Info */}
            <div className="space-y-4">
              <div>
                <h4 className="font-oswald text-sm mb-2">Horario de:</h4>
                <p className="text-lg font-semibold">{user.name} {user.last_name}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500/30 rounded" />
                  <span className="text-sm">No Requerido</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded" />
                  <span className="text-sm">Requerido</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-zinc-900 rounded border border-border" />
                  <span className="text-sm">No puede trabajar</span>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Horas Preferidas</label>
                  <input 
                    type="number"
                    value={user.preferred_hours}
                    onChange={e => setUser(p => ({ ...p, preferred_hours: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nivel Habilidad 1-10</label>
                  <input 
                    type="number"
                    min="1"
                    max="10"
                    value={user.skill_level}
                    onChange={e => setUser(p => ({ ...p, skill_level: Math.min(10, Math.max(1, parseInt(e.target.value) || 1)) }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 space-y-2">
                <Button onClick={() => setScheduleDialog(false)} className="w-full bg-green-600 hover:bg-green-700 text-white font-oswald">
                  ✓ Salvar Cambios
                </Button>
                <Button variant="outline" onClick={() => setScheduleDialog(false)} className="w-full font-oswald text-destructive border-destructive/30">
                  ✕ Cancelar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
