import { useSettings } from './SettingsContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function StationTab() {
  const { stationConfig, setStationConfig } = useSettings();

  const handleSaveStationConfig = async () => {
    try { 
      await axios.put(`${API}/station-config`, stationConfig, { headers: hdrs() }); 
      toast.success('Configuracion guardada'); 
    }
    catch { toast.error('Error'); }
  };

  return (
    <div>
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
    </div>
  );
}
