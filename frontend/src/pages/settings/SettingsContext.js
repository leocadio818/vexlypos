import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { areasAPI, tablesAPI, reasonsAPI, categoriesAPI, productsAPI, inventorySettingsAPI, warehousesAPI, taxesAPI, ncfAPI } from '@/lib/api';
import { notify } from '@/lib/notify';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Permission labels for user management
export const PERM_LABELS = {
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
  view_audit_complete: 'Ver Auditoría Completa del Sistema',
  access_caja: 'Acceso a Caja',
  // Config tab permissions (14 total)
  config_users: 'Pestaña Usuarios',
  config_mesas: 'Pestaña Mesas',
  config_ventas: 'Pestaña Ventas',
  config_productos: 'Pestaña Productos',
  config_inventario: 'Pestaña Inventario Maestro',
  config_impresion: 'Pestaña Impresion',
  config_estacion: 'Pestaña Estacion',
  config_reportes: 'Pestaña Reportes',
  config_clientes: 'Pestaña Clientes',
  config_impuestos: 'Pestaña Impuestos',
  config_ncf: 'Pestaña NCF',
  config_apariencia: 'Pestaña Apariencia',
  config_sistema: 'Pestaña Sistema',
  config_descuentos: 'Pestaña Descuentos',
  config_tipos_venta: 'Sub-Pestaña Tipos de Venta',
};

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  // Core data states
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [saleTypes, setSaleTypes] = useState([]);
  const [printChannels, setPrintChannels] = useState([]);
  const [categoryChannels, setCategoryChannels] = useState([]);
  const [stationConfig, setStationConfig] = useState({ require_shift_to_sell: true, require_cash_count: false, auto_send_on_logout: true });
  const [roles, setRoles] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [taxConfig, setTaxConfig] = useState([]);
  
  // NCF State
  const [ncfTypes, setNcfTypes] = useState([]);
  const [ncfSequences, setNcfSequences] = useState([]);
  const [ncfAlerts, setNcfAlerts] = useState({ critical: [], warning: [], ok: [] });
  
  // System Config
  const [systemConfig, setSystemConfig] = useState({ 
    timezone_offset: -4, 
    restaurant_name: 'Mi Restaurante', 
    rnc: '000-000000-0',
    currency: 'RD$',
    quick_amounts: [100, 200, 500, 1000, 2000, 5000]
  });
  const [timezones, setTimezones] = useState([]);
  
  // Inventory Settings
  const [inventorySettings, setInventorySettings] = useState({
    allow_sale_without_stock: false,
    auto_deduct_on_payment: true,
    default_warehouse_id: '',
    show_stock_alerts: true
  });
  const [warehouses, setWarehouses] = useState([]);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    try {
      const [aRes, tRes, rRes, cRes, pRes, uRes, pmRes, modRes] = await Promise.all([
        areasAPI.list(), tablesAPI.list(), reasonsAPI.list(), categoriesAPI.list(), productsAPI.listAll(),
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
        
        // Load tax config
        try {
          const taxRes = await taxesAPI.getConfigs();
          setTaxConfig(taxRes.data);
        } catch (e) {
          console.warn('Could not load tax config:', e);
        }
        
        // Load NCF data
        try {
          const [ncfTypesRes, ncfSeqRes, ncfAlertsRes] = await Promise.all([
            ncfAPI.getTypes(),
            ncfAPI.getSequences(true, true),
            ncfAPI.getAlerts()
          ]);
          setNcfTypes(ncfTypesRes.data);
          setNcfSequences(ncfSeqRes.data);
          setNcfAlerts(ncfAlertsRes.data.alerts || { critical: [], warning: [], ok: [] });
        } catch (e) {
          console.warn('Could not load NCF data:', e);
        }
        
        // Load inventory settings
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
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Refresh NCF data
  const refreshNCFData = async () => {
    try {
      const [ncfSeqRes, ncfAlertsRes] = await Promise.all([
        ncfAPI.getSequences(true, true),
        ncfAPI.getAlerts()
      ]);
      setNcfSequences(ncfSeqRes.data);
      setNcfAlerts(ncfAlertsRes.data.alerts || { critical: [], warning: [], ok: [] });
      notify.success('Datos NCF actualizados');
    } catch (err) {
      notify.error('Error al actualizar datos NCF');
    }
  };

  // Refresh tax config
  const refreshTaxConfig = async () => {
    try {
      const taxRes = await taxesAPI.getConfigs();
      setTaxConfig(taxRes.data);
    } catch {}
  };

  const value = {
    // Data
    areas, setAreas,
    tables, setTables,
    reasons, setReasons,
    categories, setCategories,
    products, setProducts,
    users, setUsers,
    payMethods, setPayMethods,
    saleTypes, setSaleTypes,
    printChannels, setPrintChannels,
    categoryChannels, setCategoryChannels,
    stationConfig, setStationConfig,
    roles, setRoles,
    modifiers, setModifiers,
    taxConfig, setTaxConfig,
    ncfTypes, setNcfTypes,
    ncfSequences, setNcfSequences,
    ncfAlerts, setNcfAlerts,
    systemConfig, setSystemConfig,
    timezones, setTimezones,
    inventorySettings, setInventorySettings,
    warehouses, setWarehouses,
    // Actions
    fetchAll,
    refreshNCFData,
    refreshTaxConfig,
    // Constants
    API,
    hdrs,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export { API, hdrs };
