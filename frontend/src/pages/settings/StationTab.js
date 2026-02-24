import { useSettings } from './SettingsContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Monitor, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function StationTab() {
  const { stationConfig, setStationConfig } = useSettings();
  
  // Estado para gestión de terminales
  const [terminals, setTerminals] = useState([]);
  const [loadingTerminals, setLoadingTerminals] = useState(true);
  const [terminalDialog, setTerminalDialog] = useState({ open: false, mode: 'create', terminal: null });
  const [terminalForm, setTerminalForm] = useState({ name: '', code: '', is_active: true });
  const [saving, setSaving] = useState(false);

  // Cargar terminales
  const fetchTerminals = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/pos-sessions/terminals/all`, { headers: hdrs() });
      setTerminals(res.data || []);
    } catch (err) {
      console.error('Error loading terminals:', err);
      toast.error('Error cargando terminales');
    } finally {
      setLoadingTerminals(false);
    }
  }, []);

  useEffect(() => {
    fetchTerminals();
  }, [fetchTerminals]);

  const handleSaveStationConfig = async () => {
    try { 
      await axios.put(`${API}/station-config`, stationConfig, { headers: hdrs() }); 
      toast.success('Configuracion guardada'); 
    }
    catch { toast.error('Error'); }
  };

  // Abrir diálogo para crear terminal
  const openCreateDialog = () => {
    setTerminalForm({ name: '', code: '', is_active: true });
    setTerminalDialog({ open: true, mode: 'create', terminal: null });
  };

  // Abrir diálogo para editar terminal
  const openEditDialog = (terminal) => {
    setTerminalForm({ 
      name: terminal.name, 
      code: terminal.code || '', 
      is_active: terminal.is_active !== false 
    });
    setTerminalDialog({ open: true, mode: 'edit', terminal });
  };

  // Guardar terminal (crear o editar)
  const handleSaveTerminal = async () => {
    if (!terminalForm.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      if (terminalDialog.mode === 'create') {
        await axios.post(`${API}/pos-sessions/terminals`, terminalForm, { headers: hdrs() });
        toast.success('Terminal creado correctamente');
      } else {
        await axios.put(`${API}/pos-sessions/terminals/${terminalDialog.terminal.id}`, terminalForm, { headers: hdrs() });
        toast.success('Terminal actualizado correctamente');
      }
      setTerminalDialog({ open: false, mode: 'create', terminal: null });
      fetchTerminals();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error guardando terminal');
    } finally {
      setSaving(false);
    }
  };

  // Eliminar terminal
  const handleDeleteTerminal = async (terminal) => {
    if (!window.confirm(`¿Eliminar terminal "${terminal.name}"?`)) return;

    try {
      await axios.delete(`${API}/pos-sessions/terminals/${terminal.id}`, { headers: hdrs() });
      toast.success('Terminal eliminado');
      fetchTerminals();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error eliminando terminal');
    }
  };

  return (
    <div className="space-y-8">
      {/* Sección: Configuración de Estación */}
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

      {/* Sección: Gestión de Terminales/Cajas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-oswald text-base font-bold">Terminales / Cajas</h2>
            <p className="text-[11px] text-muted-foreground">Gestiona las estaciones de trabajo disponibles</p>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="bg-primary text-primary-foreground" data-testid="add-terminal-btn">
            <Plus size={16} className="mr-1" />
            Agregar
          </Button>
        </div>

        {loadingTerminals ? (
          <div className="text-center py-8 text-muted-foreground">Cargando terminales...</div>
        ) : terminals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No hay terminales configurados</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {terminals.map(terminal => (
              <div 
                key={terminal.id} 
                className={`p-4 rounded-lg border transition-all ${
                  terminal.is_active !== false 
                    ? 'bg-card border-border' 
                    : 'bg-muted/30 border-border/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor size={20} className={terminal.is_active !== false ? 'text-primary' : 'text-muted-foreground'} />
                    <div>
                      <h3 className="font-semibold text-sm">{terminal.name}</h3>
                      <p className="text-[10px] text-muted-foreground">Código: {terminal.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {terminal.is_active !== false ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : (
                      <XCircle size={14} className="text-red-500" />
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 h-8 text-xs"
                    onClick={() => openEditDialog(terminal)}
                    data-testid={`edit-terminal-${terminal.id}`}
                  >
                    <Edit2 size={12} className="mr-1" />
                    Editar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 px-2 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteTerminal(terminal)}
                    data-testid={`delete-terminal-${terminal.id}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Diálogo para crear/editar terminal */}
      <Dialog open={terminalDialog.open} onOpenChange={(open) => !open && setTerminalDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">
              {terminalDialog.mode === 'create' ? 'Nuevo Terminal' : 'Editar Terminal'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nombre *</label>
              <Input
                value={terminalForm.name}
                onChange={(e) => setTerminalForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Caja Principal, Barra, Terraza"
                className="h-11"
                data-testid="terminal-name-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1.5 block">Código (opcional)</label>
              <Input
                value={terminalForm.code}
                onChange={(e) => setTerminalForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="Ej: POS1, BAR, TERR"
                className="h-11 font-mono"
                maxLength={10}
                data-testid="terminal-code-input"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Se genera automáticamente si no se especifica</p>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <div>
                <span className="text-sm font-medium">Terminal Activo</span>
                <p className="text-[10px] text-muted-foreground">Los terminales inactivos no aparecen al abrir turno</p>
              </div>
              <Switch 
                checked={terminalForm.is_active}
                onCheckedChange={(v) => setTerminalForm(p => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setTerminalDialog(p => ({ ...p, open: false }))}
            >
              Cancelar
            </Button>
            <Button 
              className="flex-1 bg-primary text-primary-foreground"
              onClick={handleSaveTerminal}
              disabled={saving || !terminalForm.name.trim()}
              data-testid="save-terminal-btn"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
