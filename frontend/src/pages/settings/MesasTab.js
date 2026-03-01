import { useState } from 'react';
import { useSettings } from './SettingsContext';
import { areasAPI, tablesAPI } from '@/lib/api';
import { MapPin, Table2, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '@/components/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

// Sub-tab button component
const SubTabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      active 
        ? 'bg-primary/20 text-primary border border-primary/30' 
        : 'bg-card/50 text-muted-foreground border border-border hover:border-primary/30 hover:text-primary'
    }`}
  >
    <Icon size={14} />
    {label}
  </button>
);

export default function MesasTab() {
  const { areas, tables, fetchAll } = useSettings();
  const [mesasSubTab, setMesasSubTab] = useState('mesas');
  
  // Dialogs
  const [areaDialog, setAreaDialog] = useState({ open: false, name: '', color: '#FF6600', editId: null });
  const [tableDialog, setTableDialog] = useState({ open: false, number: '', area_id: '', capacity: 4, shape: 'round', editId: null });

  // Area handlers
  const handleSaveArea = async () => {
    if (!areaDialog.name.trim()) return;
    try {
      if (areaDialog.editId) {
        await areasAPI.update(areaDialog.editId, { name: areaDialog.name, color: areaDialog.color });
      } else {
        await areasAPI.create({ name: areaDialog.name, color: areaDialog.color });
      }
      toast.success(areaDialog.editId ? 'Area actualizada' : 'Area creada');
      setAreaDialog({ open: false, name: '', color: '#FF6600', editId: null }); 
      fetchAll();
    } catch { toast.error('Error'); }
  };

  // Table handlers
  const handleSaveTable = async () => {
    if (!tableDialog.number || !tableDialog.area_id) return;
    try {
      const data = { 
        number: parseInt(tableDialog.number), 
        area_id: tableDialog.area_id,
        capacity: parseInt(tableDialog.capacity) || 4, 
        shape: tableDialog.shape 
      };
      if (tableDialog.editId) {
        await tablesAPI.update(tableDialog.editId, data);
        toast.success('Mesa actualizada');
      } else {
        await tablesAPI.create({ ...data, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 });
        toast.success('Mesa creada');
      }
      setTableDialog({ open: false, number: '', area_id: '', capacity: 4, shape: 'round', editId: null }); 
      fetchAll();
    } catch { toast.error('Error'); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <SubTabButton active={mesasSubTab === 'mesas'} onClick={() => setMesasSubTab('mesas')} icon={Table2} label="Mesas" />
        <SubTabButton active={mesasSubTab === 'areas'} onClick={() => setMesasSubTab('areas')} icon={MapPin} label="Areas" />
      </div>

      {mesasSubTab === 'mesas' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Mesas</h2>
            <Button onClick={() => setTableDialog({ open: true, number: '', area_id: areas[0]?.id || '', capacity: 4, shape: 'round', editId: null })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-table-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tables.map(table => (
              <div key={table.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div>
                  <span className="font-oswald font-bold text-primary">#{table.number}</span>
                  <span className="text-sm ml-2">{areas.find(a => a.id === table.area_id)?.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">Cap: {table.capacity} | {table.shape}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" 
                    onClick={() => setTableDialog({ 
                      open: true, 
                      number: String(table.number), 
                      area_id: table.area_id, 
                      capacity: table.capacity, 
                      shape: table.shape, 
                      editId: table.id 
                    })}
                    className="text-muted-foreground hover:text-primary h-8 w-8">
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { tablesAPI.delete(table.id).then(() => { toast.success('Eliminada'); fetchAll(); }); }}
                    className="text-destructive/60 hover:text-destructive h-8 w-8"><Trash2 size={14} /></Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mesasSubTab === 'areas' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Areas del Restaurante</h2>
            <Button onClick={() => setAreaDialog({ open: true, name: '', color: '#FF6600', editId: null })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-area-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
          </div>
          <div className="space-y-2">
            {areas.map(area => (
              <div key={area.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`area-${area.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: area.color }} />
                  <span className="font-semibold">{area.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{tables.filter(t => t.area_id === area.id).length} mesas</Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => setAreaDialog({ open: true, name: area.name, color: area.color, editId: area.id })}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { areasAPI.delete(area.id).then(() => { toast.success('Eliminada'); fetchAll(); }); }}
                    className="text-destructive/60 hover:text-destructive h-8 w-8"><Trash2 size={14} /></Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Area Dialog */}
      <Dialog open={areaDialog.open} onOpenChange={(o) => !o && setAreaDialog({ ...areaDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald">{areaDialog.editId ? 'Editar Area' : 'Nueva Area'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={areaDialog.name} onChange={e => setAreaDialog({ ...areaDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Terraza" />
            </div>
            <div>
              <label className="text-sm font-medium">Color</label>
              <input type="color" value={areaDialog.color} onChange={e => setAreaDialog({ ...areaDialog, color: e.target.value })}
                className="w-full h-10 mt-1 rounded-lg border border-border cursor-pointer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAreaDialog({ ...areaDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveArea} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Dialog */}
      <Dialog open={tableDialog.open} onOpenChange={(o) => !o && setTableDialog({ ...tableDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald">{tableDialog.editId ? 'Editar Mesa' : 'Nueva Mesa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Número</label>
              <NumericInput value={tableDialog.number} onChange={e => setTableDialog({ ...tableDialog, number: e.target.value })}
                label="Numero de Mesa" allowDecimal={false} className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: 1" />
            </div>
            <div>
              <label className="text-sm font-medium">Area</label>
              <select value={tableDialog.area_id} onChange={e => setTableDialog({ ...tableDialog, area_id: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Capacidad</label>
              <NumericInput value={tableDialog.capacity} onChange={e => setTableDialog({ ...tableDialog, capacity: e.target.value })}
                label="Capacidad" allowDecimal={false} className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Forma</label>
              <select value={tableDialog.shape} onChange={e => setTableDialog({ ...tableDialog, shape: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                <option value="round">Redonda</option>
                <option value="square">Cuadrada</option>
                <option value="rectangle">Rectangular</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTableDialog({ ...tableDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveTable} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
