import { useState, useMemo } from 'react';
import { 
  FileText, Plus, Pencil, Trash2, Check, X, Save, AlertCircle, ArrowLeftRight, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { purchaseOrdersAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { toast } from 'sonner';

const PO_STATUS = {
  draft: { label: 'Borrador', color: 'bg-gray-500' },
  pending: { label: 'Pendiente', color: 'bg-yellow-500' },
  partial: { label: 'Parcial', color: 'bg-blue-500' },
  received: { label: 'Recibida', color: 'bg-green-500' },
  cancelled: { label: 'Cancelada', color: 'bg-red-500' },
};

export default function PurchasesTab({ 
  purchaseOrders,
  suppliers,
  warehouses,
  ingredients,
  onRefreshAll
}) {
  const [poStatusFilter, setPOStatusFilter] = useState('');
  const [poDialog, setPODialog] = useState({ open: false, data: null });
  const [receiveDialog, setReceiveDialog] = useState({ open: false, po: null });

  // Filter POs
  const filteredPOs = purchaseOrders.filter(po => {
    return !poStatusFilter || po.status === poStatusFilter;
  });

  // ─── PURCHASE ORDER HANDLERS ───
  const handleSavePO = async () => {
    const d = poDialog.data;
    if (!d?.supplier_id) { toast.error('Proveedor requerido'); return; }
    if (!d?.warehouse_id) { toast.error('Almacén requerido'); return; }
    if (!d?.items?.length) { toast.error('Agrega items'); return; }
    try {
      if (d.id) {
        await purchaseOrdersAPI.update(d.id, d);
        toast.success('Orden actualizada');
      } else {
        await purchaseOrdersAPI.create(d);
        toast.success('Orden creada');
      }
      setPODialog({ open: false, data: null });
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleReceivePO = async () => {
    const po = receiveDialog.po;
    const items = receiveDialog.items || [];
    if (!items.some(i => i.received_quantity > 0)) {
      toast.error('Ingresa cantidades recibidas');
      return;
    }
    try {
      await purchaseOrdersAPI.receive(po.id, {
        warehouse_id: po.warehouse_id,
        items: items.filter(i => i.received_quantity > 0).map(i => ({
          ingredient_id: i.ingredient_id,
          received_quantity: parseFloat(i.received_quantity) || 0,
          actual_unit_price: parseFloat(i.actual_unit_price) || 0,
        })),
        notes: receiveDialog.notes || '',
      });
      toast.success('Mercancía recibida');
      setReceiveDialog({ open: false, po: null });
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleUpdatePOStatus = async (poId, status) => {
    try {
      await purchaseOrdersAPI.updateStatus(poId, status);
      toast.success('Estado actualizado');
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeletePO = async (id) => {
    if (!window.confirm('¿Eliminar orden?')) return;
    try {
      await purchaseOrdersAPI.delete(id);
      toast.success('Orden eliminada');
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div data-testid="purchases-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-lg font-bold">Órdenes de Compra</h2>
        <Button 
          onClick={() => setPODialog({ open: true, data: { supplier_id: '', warehouse_id: '', items: [], notes: '', expected_date: '' } })}
          className="bg-primary text-primary-foreground font-oswald"
          data-testid="add-po-btn"
        >
          <Plus size={16} className="mr-1" /> Nueva Orden
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        <select
          value={poStatusFilter}
          onChange={e => setPOStatusFilter(e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          data-testid="po-status-filter"
        >
          <option value="">Todos los estados</option>
          {Object.entries(PO_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* PO list */}
      <div className="space-y-3">
        {filteredPOs.map(po => {
          const status = PO_STATUS[po.status] || PO_STATUS.draft;
          return (
            <div 
              key={po.id} 
              className="p-4 rounded-xl border border-border bg-card"
              data-testid={`po-${po.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-oswald font-bold">{po.supplier_name}</h3>
                    <Badge className={`${status.color} text-white text-[9px]`}>{status.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(po.created_at).toLocaleDateString()} • {po.items?.length} items • 
                    Total: {formatMoney(po.total)}
                    {po.actual_total && po.actual_total !== po.total && (
                      <span className="text-primary ml-1">Real: {formatMoney(po.actual_total)}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {po.status === 'draft' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleUpdatePOStatus(po.id, 'pending')}
                    >
                      Enviar
                    </Button>
                  )}
                  {['pending', 'partial'].includes(po.status) && (
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => setReceiveDialog({ 
                        open: true, 
                        po, 
                        items: po.items.map(i => ({ 
                          ...i, 
                          received_quantity: 0,
                          actual_unit_price: i.unit_price 
                        })),
                        notes: ''
                      })}
                    >
                      Recibir
                    </Button>
                  )}
                  {po.status === 'draft' && (
                    <>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => setPODialog({ open: true, data: { ...po } })}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDeletePO(po.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Items */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {po.items?.map((item, idx) => (
                  <div key={idx} className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm">
                    <div className="font-medium truncate">{item.ingredient_name}</div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>{item.quantity} × {formatMoney(item.unit_price)}</span>
                      {item.received_quantity > 0 && (
                        <span className="text-green-500">✓ {item.received_quantity}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {filteredPOs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay órdenes de compra</p>
          </div>
        )}
      </div>

      {/* Purchase Order Dialog */}
      <Dialog open={poDialog.open} onOpenChange={(o) => !o && setPODialog({ open: false, data: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{poDialog.data?.id ? 'Editar' : 'Nueva'} Orden de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Proveedor *</label>
                <select
                  value={poDialog.data?.supplier_id || ''}
                  onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, supplier_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="po-supplier-select"
                >
                  <option value="">Seleccionar...</option>
                  {suppliers.filter(s => s.active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Almacén destino *</label>
                <select
                  value={poDialog.data?.warehouse_id || ''}
                  onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, warehouse_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="po-warehouse-select"
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Items</label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setPODialog(p => ({
                      ...p,
                      data: {
                        ...p.data,
                        items: [...(p.data?.items || []), { ingredient_id: '', ingredient_name: '', quantity: 1, unit_price: 0 }]
                      }
                    }));
                  }}
                  data-testid="add-po-item-btn"
                >
                  <Plus size={14} className="mr-1" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {(poDialog.data?.items || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
                    <select
                      value={item.ingredient_id}
                      onChange={e => {
                        const ing = ingredients.find(i => i.id === e.target.value);
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.map((i, j) => j === idx ? { 
                              ...i, 
                              ingredient_id: e.target.value,
                              ingredient_name: ing?.name || '',
                              unit_price: ing?.avg_cost || i.unit_price
                            } : i)
                          }
                        }));
                      }}
                      className="flex-1 px-2 py-1 bg-card border border-border rounded text-sm"
                    >
                      <option value="">Seleccionar insumo...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => {
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.map((i, j) => j === idx ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i)
                          }
                        }));
                      }}
                      className="w-20 px-2 py-1 bg-card border border-border rounded text-sm"
                      placeholder="Cant."
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => {
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.map((i, j) => j === idx ? { ...i, unit_price: parseFloat(e.target.value) || 0 } : i)
                          }
                        }));
                      }}
                      className="w-24 px-2 py-1 bg-card border border-border rounded text-sm"
                      placeholder="Precio"
                    />
                    <span className="text-xs text-muted-foreground w-20">
                      {formatMoney((item.quantity || 0) * (item.unit_price || 0))}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        setPODialog(p => ({
                          ...p,
                          data: {
                            ...p.data,
                            items: p.data.items.filter((_, j) => j !== idx)
                          }
                        }));
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
              {poDialog.data?.items?.length > 0 && (
                <div className="text-right mt-2 font-oswald font-bold">
                  Total: {formatMoney((poDialog.data?.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Notas</label>
              <textarea
                value={poDialog.data?.notes || ''}
                onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
              />
            </div>

            <Button onClick={handleSavePO} className="w-full bg-primary text-primary-foreground font-oswald" data-testid="save-po-btn">
              <Save size={16} className="mr-1" /> Guardar Orden
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive PO Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(o) => !o && setReceiveDialog({ open: false, po: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">Recibir Mercancía</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="font-semibold">{receiveDialog.po?.supplier_name}</div>
              <div className="text-sm text-muted-foreground">
                Almacén: {warehouses.find(w => w.id === receiveDialog.po?.warehouse_id)?.name}
              </div>
            </div>

            <div className="space-y-2">
              {(receiveDialog.items || []).map((item, idx) => {
                const pending = item.quantity - (item.received_quantity || 0);
                return (
                  <div key={idx} className="p-3 rounded-lg bg-background border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{item.ingredient_name}</span>
                      <span className="text-xs text-muted-foreground">
                        Pedido: {item.quantity} | Pendiente: {pending}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Cantidad recibida</label>
                        <input
                          type="number"
                          value={receiveDialog.items[idx]?.received_quantity || ''}
                          onChange={e => {
                            const items = [...receiveDialog.items];
                            items[idx] = { ...items[idx], received_quantity: parseFloat(e.target.value) || 0 };
                            setReceiveDialog(p => ({ ...p, items }));
                          }}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                          placeholder={`Max: ${pending}`}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Precio real</label>
                        <input
                          type="number"
                          step="0.01"
                          value={receiveDialog.items[idx]?.actual_unit_price || ''}
                          onChange={e => {
                            const items = [...receiveDialog.items];
                            items[idx] = { ...items[idx], actual_unit_price: parseFloat(e.target.value) || 0 };
                            setReceiveDialog(p => ({ ...p, items }));
                          }}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                          placeholder={item.unit_price}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="text-sm font-medium">Notas de recepción</label>
              <textarea
                value={receiveDialog.notes || ''}
                onChange={e => setReceiveDialog(p => ({ ...p, notes: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
                placeholder="Observaciones..."
              />
            </div>

            <Button onClick={handleReceivePO} className="w-full bg-green-600 hover:bg-green-700 text-white font-oswald" data-testid="confirm-receive-btn">
              <Check size={16} className="mr-1" /> Confirmar Recepción
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
