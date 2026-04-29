import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SettingsProvider } from './SettingsContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Table2, CreditCard, Package, Printer, Cog, BarChart3, Heart, Calculator, FileText, Palette, Warehouse, Tag, AlertCircle, Boxes, Shield, Crown, Activity } from 'lucide-react';

import UsersTab from './UsersTab';
import MesasTab from './MesasTab';
import VentasTab from './VentasTab';
import InventarioTab from './InventarioTab';
import ChannelsTab from './ChannelsTab';
import StationTab from './StationTab';
import ReportsTab from './ReportsTab';
import CustomersTab from './CustomersTab';
import TaxesTab from './TaxesTab';
import NcfTab from './NcfTab';
import SystemTab from './SystemTab';
import ThemeTab from './ThemeTab';
import DescuentosTab from './DescuentosTab';
import SystemLogsTab from './SystemLogsTab';
import SimpleInventoryTab from './SimpleInventoryTab';
import SessionsTab from './SessionsTab';
import PlanTab from './PlanTab';
import HealthTab from './HealthTab';

// Tab definitions with permission mapping (new config_* + old manage_* fallback)
const ALL_TABS = [
  { value: 'users', label: 'Usuarios', icon: Users, permissions: ['config_users','manage_users'], component: UsersTab },
  { value: 'mesas', label: 'Mesas', icon: Table2, permissions: ['config_mesas','manage_tables','manage_areas'], component: MesasTab },
  { value: 'ventas', label: 'Ventas', icon: CreditCard, permissions: ['config_ventas','manage_payment_methods','manage_cancellation_reasons','manage_sale_types'], component: VentasTab },
  { value: 'inventario', label: 'Config. Productos', icon: Package, permissions: ['config_productos','manage_products'], component: InventarioTab },
  { value: 'inventario-maestro', label: 'Inventario Maestro', icon: Warehouse, permissions: ['config_inventario','manage_inventory','manage_suppliers'], navigate: '/inventory' },
  { value: 'inventario-simple', label: 'Inv. Simple', icon: Boxes, permissions: ['config_inventario','manage_inventory'], component: SimpleInventoryTab },
  { value: 'channels', label: 'Impresion', icon: Printer, permissions: ['config_impresion','manage_print_channels'], component: ChannelsTab },
  { value: 'station', label: 'Estacion', icon: Cog, permissions: ['config_estacion','manage_station_config'], component: StationTab },
  { value: 'reports-cfg', label: 'Reportes', icon: BarChart3, permissions: ['config_reportes'], component: ReportsTab },
  { value: 'customers-cfg', label: 'Clientes', icon: Heart, permissions: ['config_clientes','manage_customers'], component: CustomersTab },
  { value: 'taxes', label: 'Impuestos', icon: Calculator, permissions: ['config_impuestos'], component: TaxesTab },
  { value: 'ncf', label: 'NCF', icon: FileText, permissions: ['config_ncf'], component: NcfTab },
  { value: 'theme', label: 'Apariencia', icon: Palette, permissions: ['config_apariencia'], component: ThemeTab },
  { value: 'system', label: 'Sistema', icon: Cog, permissions: ['config_sistema'], component: SystemTab },
  { value: 'logs', label: 'Logs', icon: AlertCircle, permissions: ['view_system_logs','config_sistema'], component: SystemLogsTab },
  { value: 'descuentos', label: 'Descuentos', icon: Tag, permissions: ['config_descuentos','manage_cancellation_reasons'], component: DescuentosTab },
  { value: 'sesiones', label: 'Sesiones', icon: Shield, adminOnly: true, component: SessionsTab },
  { value: 'plan', label: 'Plan', icon: Crown, superAdminOnly: true, component: PlanTab },
  { value: 'health', label: 'Salud', icon: Activity, adminOnly: true, component: HealthTab },
];

function SettingsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  // Filter tabs by user permissions (check any of the tab's permissions)
  const { user, isAdmin } = useAuth();
  const allowedTabs = useMemo(() => {
    return ALL_TABS.filter(tab => {
      if (tab.superAdminOnly) return user?.is_super_admin === true;
      // BUG-F7 fix: admin tabs include Propietario / custom roles with level>=100
      if (tab.adminOnly) return isAdmin;
      return tab.permissions?.some(p => hasPermission(p));
    });
  }, [hasPermission, user, isAdmin]);

  // Smart default: first allowed tab (or requested tab if allowed)
  const requestedTab = searchParams.get('tab');
  const defaultTab = useMemo(() => {
    if (requestedTab && allowedTabs.find(t => t.value === requestedTab)) return requestedTab;
    return allowedTabs[0]?.value || 'users';
  }, [requestedTab, allowedTabs]);

  const handleTabChange = (value) => {
    const tab = ALL_TABS.find(t => t.value === value);
    if (tab?.navigate) {
      navigate(tab.navigate);
      return;
    }
    setSearchParams({ tab: value });
  };

  if (allowedTabs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No tienes permisos de configuracion</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 md:p-6 pb-28 sm:pb-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Cog size={20} className="text-primary" />
          </div>
          <h1 className="font-oswald text-2xl font-bold tracking-wide">CONFIGURACION</h1>
        </header>

        <Tabs defaultValue={defaultTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="flex flex-wrap justify-start gap-1 bg-transparent h-auto p-0 mb-6">
            {allowedTabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs ${
                  tab.value === 'inventario-maestro' 
                    ? 'data-[state=active]:bg-emerald-600 data-[state=active]:text-white'
                    : 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                }`}
                data-testid={`tab-${tab.value}`}
              >
                <tab.icon size={14} className="mr-1" /> {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {allowedTabs.filter(t => t.component).map(tab => (
            <TabsContent key={tab.value} value={tab.value}>
              <tab.component />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <SettingsProvider>
      <SettingsContent />
    </SettingsProvider>
  );
}
