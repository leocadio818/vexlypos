import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SettingsProvider } from './SettingsContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Table2, CreditCard, Package, Printer, Cog, BarChart3, Heart, Calculator, FileText, Palette, Warehouse, Tag } from 'lucide-react';

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

// Tab definitions with permission mapping
const ALL_TABS = [
  { value: 'users', label: 'Usuarios', icon: Users, permission: 'config_users', component: UsersTab },
  { value: 'mesas', label: 'Mesas', icon: Table2, permission: 'config_mesas', component: MesasTab },
  { value: 'ventas', label: 'Ventas', icon: CreditCard, permission: 'config_ventas', component: VentasTab },
  { value: 'inventario', label: 'Config. Productos', icon: Package, permission: 'config_productos', component: InventarioTab },
  { value: 'inventario-maestro', label: 'Inventario Maestro', icon: Warehouse, permission: 'config_inventario', navigate: '/inventory' },
  { value: 'channels', label: 'Impresion', icon: Printer, permission: 'config_impresion', component: ChannelsTab },
  { value: 'station', label: 'Estacion', icon: Cog, permission: 'config_estacion', component: StationTab },
  { value: 'reports-cfg', label: 'Reportes', icon: BarChart3, permission: 'config_reportes', component: ReportsTab },
  { value: 'customers-cfg', label: 'Clientes', icon: Heart, permission: 'config_clientes', component: CustomersTab },
  { value: 'taxes', label: 'Impuestos', icon: Calculator, permission: 'config_impuestos', component: TaxesTab },
  { value: 'ncf', label: 'NCF', icon: FileText, permission: 'config_ncf', component: NcfTab },
  { value: 'theme', label: 'Apariencia', icon: Palette, permission: 'config_apariencia', component: ThemeTab },
  { value: 'system', label: 'Sistema', icon: Cog, permission: 'config_sistema', component: SystemTab },
  { value: 'descuentos', label: 'Descuentos', icon: Tag, permission: 'config_descuentos', component: DescuentosTab },
];

function SettingsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  // Filter tabs by user permissions
  const allowedTabs = useMemo(() => {
    return ALL_TABS.filter(tab => hasPermission(tab.permission));
  }, [hasPermission]);

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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 md:p-6">
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
