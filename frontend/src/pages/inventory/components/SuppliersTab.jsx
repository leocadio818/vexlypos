import { useState } from 'react';
import { toast } from 'sonner';
import { Truck, Plus, Pencil, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { suppliersAPI } from '@/lib/api';

export default function SuppliersTab({ 
  suppliers, 
  onRefreshAll 
}) {
  const [supplierDialog, setSupplierDialog] = useState({ open: false, data: null });

  // ─── SUPPLIER HANDLERS ───
  const handleSaveSupplier = async () => {
    const d = supplierDialog.data;
    if (!d?.name?.trim()) { 
      toast.error('Nombre requerido'); 
      return; 
    }
    try {
      if (d.id) {
        await suppliersAPI.update(d.id, d);
        toast.success('Proveedor actualizado');
      } else {
        await suppliersAPI.create(d);
        toast.success('Proveedor creado');
      }
      setSupplierDialog({ open: false, data: null });
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('¿Eliminar proveedor?')) return;
    try {
      await suppliersAPI.delete(id);
      toast.success('Proveedor eliminado');
      onRefreshAll?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div data-testid="suppliers-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-lg font-bold">Proveedores</h2>
        <Button 
          onClick={() => setSupplierDialog({ open: true, data: { name: '', contact_name: '', phone: '', email: '', address: '', rnc: '' } })}
          className="bg-primary text-primary-foreground font-oswald"
          data-testid="add-supplier-btn"
        >
          <Plus size={16} className="mr-1" /> Nuevo Proveedor
        </Button>
      </div>

      {/* Suppliers List */}
      <div className="space-y-2">
        {suppliers.filter(s => s.active !== false).map(sup => (
          <div 
            key={sup.id} 
            className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
            data-testid={`supplier-${sup.id}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{sup.name}</h3>
                <div className="text-xs text-muted-foreground space-x-2">
                  {sup.contact_name && <span>{sup.contact_name}</span>}
                  {sup.phone && <span>• {sup.phone}</span>}
                  {sup.rnc && <span>• RNC: {sup.rnc}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setSupplierDialog({ open: true, data: { ...sup } })}
                data-testid={`edit-supplier-${sup.id}`}
              >
                <Pencil size={14} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive"
                onClick={() => handleDeleteSupplier(sup.id)}
                data-testid={`delete-supplier-${sup.id}`}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay proveedores</p>
          </div>
        )}
      </div>

      {/* ─── SUPPLIER DIALOG ─── */}
      <Dialog open={supplierDialog.open} onOpenChange={(o) => !o && setSupplierDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{supplierDialog.data?.id ? 'Editar' : 'Nuevo'} Proveedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={supplierDialog.data?.name || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="supplier-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Contacto</label>
                <input
                  type="text"
                  value={supplierDialog.data?.contact_name || ''}
                  onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, contact_name: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="supplier-contact-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Teléfono</label>
                <input
                  type="text"
                  value={supplierDialog.data?.phone || ''}
                  onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, phone: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="supplier-phone-input"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={supplierDialog.data?.email || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, email: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="supplier-email-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">RNC</label>
              <input
                type="text"
                value={supplierDialog.data?.rnc || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, rnc: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="supplier-rnc-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Dirección</label>
              <textarea
                value={supplierDialog.data?.address || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, address: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
                data-testid="supplier-address-input"
              />
            </div>
            <Button onClick={handleSaveSupplier} className="w-full bg-primary text-primary-foreground font-oswald" data-testid="save-supplier-btn">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
