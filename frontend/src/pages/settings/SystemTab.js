import { useState } from 'react';
import { useSettings } from './SettingsContext';
import { Printer, Building2, ShieldAlert, MapPin, Phone, Mail, FileText, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ThermalTicket from '@/components/ThermalTicket';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function SystemTab() {
  const { systemConfig, setSystemConfig, timezones } = useSettings();
  const [showTicketPreview, setShowTicketPreview] = useState(false);

  const handleSaveSystemConfig = async () => {
    try { 
      await axios.put(`${API}/system/config`, systemConfig, { headers: hdrs() }); 
      toast.success('Configuración guardada'); 
    }
    catch { toast.error('Error'); }
  };

  // Demo order for ticket preview
  const demoOrder = {
    items: [
      { name: 'Hamburguesa Clásica', quantity: 2, price: 450, notes: 'Sin cebolla' },
      { name: 'Papas Fritas', quantity: 1, price: 150 },
      { name: 'Refresco', quantity: 2, price: 100 },
    ],
    subtotal: 1250,
    itbis: 225,
    propina: 125,
    total: 1600,
    ncf: 'B0200000001',
    ncfType: 'B02',
    tableNumber: 5,
    waiterName: 'Carlos',
    paymentMethod: 'Efectivo',
    amountPaid: 2000,
    change: 400,
    createdAt: new Date().toISOString()
  };

  return (
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
          <p className="text-xs text-muted-foreground mb-3">Este número aparecerá en los reportes exportados para validez fiscal.</p>
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
          <p className="text-xs text-muted-foreground mb-3">Selecciona la zona horaria de tu restaurante.</p>
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
          </select>
        </div>

        <Button onClick={handleSaveSystemConfig} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold">
          GUARDAR CONFIGURACIÓN
        </Button>
      </div>

      {/* Ticket Business Data */}
      <div className="mt-8 pt-6 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
              <Printer size={20} className="text-green-500" />
            </div>
            <div>
              <h2 className="font-oswald text-base font-bold">Datos del Negocio para Ticket</h2>
              <p className="text-xs text-muted-foreground">Esta información aparecerá en los tickets impresos</p>
            </div>
          </div>
          <Button variant={showTicketPreview ? "default" : "outline"} size="sm"
            onClick={() => setShowTicketPreview(!showTicketPreview)}
            className={showTicketPreview ? "bg-green-600 hover:bg-green-700" : ""} data-testid="toggle-ticket-preview">
            {showTicketPreview ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />}
            {showTicketPreview ? "Ocultar Vista Previa" : "Ver Vista Previa"}
          </Button>
        </div>

        <div className={`grid gap-6 ${showTicketPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Form Fields */}
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Building2 size={14} className="text-primary" /> Nombre Comercial
              </h3>
              <input value={systemConfig.ticket_business_name || systemConfig.restaurant_name || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_business_name: e.target.value }))}
                placeholder="RESTAURANTE DEMO"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald uppercase" data-testid="ticket-business-name" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Razón Social</h3>
              <input value={systemConfig.ticket_legal_name || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_legal_name: e.target.value }))}
                placeholder="RESTAURANTE DEMO SRL"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="ticket-legal-name" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <ShieldAlert size={14} className="text-yellow-500" /> RNC (Ticket)
              </h3>
              <input value={systemConfig.ticket_rnc || systemConfig.rnc || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_rnc: e.target.value }))}
                placeholder="1-31-12345-6"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" data-testid="ticket-rnc" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <MapPin size={14} className="text-blue-500" /> Dirección
              </h3>
              <input value={systemConfig.ticket_address_street || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_street: e.target.value }))}
                placeholder="Calle y numero (ej: C/ Las Flores #12)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-address-street" />
              <input value={systemConfig.ticket_address_building || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_building: e.target.value }))}
                placeholder="Edificio / Local (opcional)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-address-building" />
              <input value={systemConfig.ticket_address_sector || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_sector: e.target.value }))}
                placeholder="Sector (ej: Jarabacoa)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-address-sector" />
              <input value={systemConfig.ticket_address_city || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_city: e.target.value }))}
                placeholder="Ciudad / Provincia (ej: La Vega)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="ticket-address-city" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Phone size={14} className="text-green-500" /> Contacto
              </h3>
              <input value={systemConfig.ticket_phone || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_phone: e.target.value }))}
                placeholder="809-555-1234"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" />
              <input value={systemConfig.ticket_email || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_email: e.target.value }))}
                placeholder="info@restaurante.com"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileText size={14} className="text-purple-500" /> Mensajes
              </h3>
              <input value={systemConfig.ticket_thank_you || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_thank_you: e.target.value }))}
                placeholder="¡Gracias por su preferencia!"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" />
              <input value={systemConfig.ticket_dgii_message || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_dgii_message: e.target.value }))}
                placeholder="Consulte este NCF en dgii.gov.do"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            </div>

            <Button onClick={handleSaveSystemConfig} className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-oswald font-bold">
              GUARDAR DATOS DEL TICKET
            </Button>
          </div>

          {/* Ticket Preview */}
          {showTicketPreview && (
            <div className="flex justify-center">
              <div className="sticky top-4">
                <div className="bg-white rounded-lg shadow-xl p-2 max-w-[320px]">
                  <div className="flex items-center justify-between px-2 py-1 bg-gray-100 rounded-t-lg mb-2">
                    <span className="text-xs text-gray-600 font-medium">Vista Previa del Ticket</span>
                    <span className="text-[10px] text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Servidor</span>
                  </div>
                  <ThermalTicket
                    order={demoOrder}
                    businessConfig={{
                      business_name: systemConfig.ticket_business_name || systemConfig.restaurant_name || 'RESTAURANTE DEMO',
                      legal_name: systemConfig.ticket_legal_name || '',
                      rnc: systemConfig.ticket_rnc || systemConfig.rnc || '000-000000-0',
                      address: systemConfig.ticket_address || 'Dirección del negocio',
                      city: systemConfig.ticket_city || 'Santo Domingo',
                      phone: systemConfig.ticket_phone || '809-555-0000',
                      email: systemConfig.ticket_email || '',
                      thank_you_message: systemConfig.ticket_thank_you || '¡Gracias por su preferencia!',
                      dgii_message: systemConfig.ticket_dgii_message || 'Consulte este NCF en dgii.gov.do'
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
