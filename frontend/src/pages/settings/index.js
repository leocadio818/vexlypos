import { useSearchParams, useNavigate } from 'react-router-dom';
import { SettingsProvider } from './SettingsContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Table2, CreditCard, Package, Printer, Cog, BarChart3, Heart, Calculator, FileText, Palette, Warehouse } from 'lucide-react';

// Import tab components
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

function SettingsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = searchParams.get('tab') || 'users';

  const handleTabChange = (value) => {
    // Si es "inventario-maestro", navegar a la página de Inventario Maestro
    if (value === 'inventario-maestro') {
      navigate('/inventory');
      return;
    }
    setSearchParams({ tab: value });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Cog size={20} className="text-primary" />
          </div>
          <h1 className="font-oswald text-2xl font-bold tracking-wide">CONFIGURACION</h1>
        </header>

        <Tabs defaultValue={initialTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="flex flex-wrap justify-start gap-1 bg-transparent h-auto p-0 mb-6">
            <TabsTrigger value="users" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-users">
              <Users size={14} className="mr-1" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="mesas" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-mesas">
              <Table2 size={14} className="mr-1" /> Mesas
            </TabsTrigger>
            <TabsTrigger value="ventas" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-ventas">
              <CreditCard size={14} className="mr-1" /> Ventas
            </TabsTrigger>
            <TabsTrigger value="inventario" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-inventario">
              <Package size={14} className="mr-1" /> Configuración Productos
            </TabsTrigger>
            <TabsTrigger value="inventario-maestro" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-xs" data-testid="tab-inventario-maestro">
              <Warehouse size={14} className="mr-1" /> Inventario Maestro
            </TabsTrigger>
            <TabsTrigger value="channels" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-channels">
              <Printer size={14} className="mr-1" /> Impresion
            </TabsTrigger>
            <TabsTrigger value="station" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-station">
              <Cog size={14} className="mr-1" /> Estacion
            </TabsTrigger>
            <TabsTrigger value="reports-cfg" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-reports">
              <BarChart3 size={14} className="mr-1" /> Reportes
            </TabsTrigger>
            <TabsTrigger value="customers-cfg" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-customers">
              <Heart size={14} className="mr-1" /> Clientes
            </TabsTrigger>
            <TabsTrigger value="taxes" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-taxes">
              <Calculator size={14} className="mr-1" /> Impuestos
            </TabsTrigger>
            <TabsTrigger value="ncf" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-ncf">
              <FileText size={14} className="mr-1" /> NCF
            </TabsTrigger>
            <TabsTrigger value="theme" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-theme">
              <Palette size={14} className="mr-1" /> Paleta
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-1 px-3 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs" data-testid="tab-system">
              <Cog size={14} className="mr-1" /> Sistema
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="mesas"><MesasTab /></TabsContent>
          <TabsContent value="ventas"><VentasTab /></TabsContent>
          <TabsContent value="inventario"><InventarioTab /></TabsContent>
          <TabsContent value="channels"><ChannelsTab /></TabsContent>
          <TabsContent value="station"><StationTab /></TabsContent>
          <TabsContent value="reports-cfg"><ReportsTab /></TabsContent>
          <TabsContent value="customers-cfg"><CustomersTab /></TabsContent>
          <TabsContent value="taxes"><TaxesTab /></TabsContent>
          <TabsContent value="ncf"><NcfTab /></TabsContent>
          <TabsContent value="theme"><ThemeTab /></TabsContent>
          <TabsContent value="system"><SystemTab /></TabsContent>
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
