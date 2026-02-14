import { useState } from 'react';
import { toast } from 'sonner';
import { Warehouse, Plus, Pencil, Trash2, AlertTriangle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { warehousesAPI } from '@/lib/api';

export default function WarehousesTab({ 
  warehouses, 
  stock,
  ingredients,
  onRefreshAll 
}) {
  const [warehouseDialog, setWarehouseDialog] = useState({ open: false, data: null });

  // ─── WAREHOUSE HANDLERS ───
  const handleSaveWarehouse = async () => {
    const d = warehouseDialog.data;
    if (!d?.name?.trim()) { 
      toast.error('Nombre requerido'); 
      return; 
    }
    try {
      if (d.id) {
        await warehousesAPI.update(d.id, d);
        toast.success('Almacén actualizado');
      } else {
        await warehousesAPI.create(d);
        toast.success('Almacén creado');
      }
      setWarehouseDialog({ open: false, data: null });
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteWarehouse = async (id) => {
    if (!window.confirm('¿Eliminar almacén?')) return;
    try {
      await warehousesAPI.delete(id);
      toast.success('Almacén eliminado');
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div data-testid="warehouses-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-lg font-bold">Almacenes</h2>
        <Button 
          onClick={() => setWarehouseDialog({ open: true, data: { name: '', location: '' } })}
          className="bg-primary text-primary-foreground font-oswald"
          data-testid="add-warehouse-btn"
        >
          <Plus size={16} className="mr-1" /> Nuevo Almacén
        </Button>
      </div>

      {/* Warehouses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map(wh => {
          const whStock = stock.filter(s => s.warehouse_id === wh.id);
          const itemCount = whStock.length;
          const lowStockCount = whStock.filter(s => {
            const ing = ingredients.find(i => i.id === s.ingredient_id);
            return ing && s.current_stock <= ing.min_stock;
          }).length;
          
          return (
            <div 
              key={wh.id} 
              className="p-4 rounded-xl border border-border bg-card"
              data-testid={`warehouse-${wh.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Warehouse size={18} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-oswald font-bold">{wh.name}</h3>
                    {wh.location && <p className="text-xs text-muted-foreground">{wh.location}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={() => setWarehouseDialog({ open: true, data: { ...wh } })}
                    data-testid={`edit-warehouse-${wh.id}`}
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDeleteWarehouse(wh.id)}
                    data-testid={`delete-warehouse-${wh.id}`}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{itemCount} items</span>
                {lowStockCount > 0 && (
                  <Badge variant="destructive" className="text-[9px]">
                    <AlertTriangle size={10} className="mr-1" /> {lowStockCount} bajo stock
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
        {warehouses.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Warehouse size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay almacenes</p>
          </div>
        )}
      </div>

      {/* ─── WAREHOUSE DIALOG ─── */}
      <Dialog open={warehouseDialog.open} onOpenChange={(o) => !o && setWarehouseDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{warehouseDialog.data?.id ? 'Editar' : 'Nuevo'} Almacén</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={warehouseDialog.data?.name || ''}
                onChange={e => setWarehouseDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="warehouse-name-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Ubicación</label>
              <input
                type="text"
                value={warehouseDialog.data?.location || ''}
                onChange={e => setWarehouseDialog(p => ({ ...p, data: { ...p.data, location: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="warehouse-location-input"
              />
            </div>
            <Button onClick={handleSaveWarehouse} className="w-full bg-primary text-primary-foreground font-oswald" data-testid="save-warehouse-btn">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
