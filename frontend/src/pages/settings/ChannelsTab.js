import { useState } from 'react';
import { useSettings } from './SettingsContext';
import { Printer, Plus, Trash2, Pencil, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function ChannelsTab() {
  const { printChannels, fetchAll } = useSettings();
  const [channelDialog, setChannelDialog] = useState({ open: false, name: '', type: 'kitchen', target: 'screen', ip: '', editId: null });

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

  return (
    <div>
      {/* Link to Printer Settings */}
      <a 
        href="/settings/printer" 
        className="mb-6 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-orange-500/20 to-orange-600/10 border-2 border-orange-500/30 hover:border-orange-500/50 transition-all group"
        data-testid="printer-settings-link"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
            <Printer size={24} className="text-white" />
          </div>
          <div>
            <span className="font-oswald font-bold text-lg">Configurar Impresora USB/Red</span>
            <p className="text-xs text-muted-foreground">Cola de impresión, agente USB, impresoras térmicas</p>
          </div>
        </div>
        <ChevronRight className="text-orange-500 group-hover:translate-x-1 transition-transform" />
      </a>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-base font-bold">Canales de Impresion (Pantalla)</h2>
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
              <Badge variant="secondary" className="ml-2 text-[11px]">{ch.type}</Badge>
              <Badge variant="outline" className="ml-1 text-[11px]">{ch.target === 'screen' ? 'Pantalla' : ch.target === 'network' ? `Red: ${ch.ip}` : 'USB'}</Badge>
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

      {/* Channel Dialog */}
      <Dialog open={channelDialog.open} onOpenChange={(o) => !o && setChannelDialog({ ...channelDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald">{channelDialog.editId ? 'Editar Canal' : 'Nuevo Canal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={channelDialog.name} onChange={e => setChannelDialog({ ...channelDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Cocina Principal" />
            </div>
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <select value={channelDialog.type} onChange={e => setChannelDialog({ ...channelDialog, type: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                <option value="kitchen">Cocina</option>
                <option value="bar">Bar</option>
                <option value="receipt">Recibo</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Destino</label>
              <select value={channelDialog.target} onChange={e => setChannelDialog({ ...channelDialog, target: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                <option value="screen">Pantalla (KDS)</option>
                <option value="network">Impresora de Red</option>
                <option value="usb">Impresora USB</option>
              </select>
            </div>
            {channelDialog.target === 'network' && (
              <div>
                <label className="text-sm font-medium">Dirección IP</label>
                <input type="text" value={channelDialog.ip} onChange={e => setChannelDialog({ ...channelDialog, ip: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="192.168.1.100" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChannelDialog({ ...channelDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveChannel} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
