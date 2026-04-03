import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Check, Minus, Plus, ArrowRightLeft, X } from 'lucide-react';
import { ordersAPI, tablesAPI } from '@/lib/api';
import { notify } from '@/lib/notify';

/**
 * MoveItemsFlow — multi-step flow for moving items between accounts/tables.
 * Props:
 *   active        – boolean, whether this flow is visible
 *   order         – current order object
 *   tableOrders   – all orders on the current table
 *   tableId       – current table id
 *   onDone        – callback after successful move (refreshes data)
 *   onCancel      – callback to exit the flow
 */
export default function MoveItemsFlow({ active, order, tableOrders, tableId, onDone, onCancel }) {
  const [step, setStep] = useState(1);           // 1=select items, 2=select dest
  const [selected, setSelected] = useState({});   // { itemId: qtyToMove }
  const [destTab, setDestTab] = useState('same');  // 'same' | 'other'
  const [otherTables, setOtherTables] = useState([]);
  const [otherTableOrders, setOtherTableOrders] = useState([]);
  const [selectedOtherTable, setSelectedOtherTable] = useState(null);
  const [loading, setLoading] = useState(false);

  // Movable items: only 'pending' or 'sent' status
  const movableItems = useMemo(() =>
    (order?.items || []).filter(i => ['pending', 'sent'].includes(i.status)),
    [order]
  );

  // Other accounts on the same table (excluding current order)
  const otherAccounts = useMemo(() =>
    (tableOrders || []).filter(o => o.id !== order?.id && !['closed', 'cancelled'].includes(o.status)),
    [tableOrders, order]
  );

  const selectedCount = Object.values(selected).reduce((s, q) => s + q, 0);

  const toggleItem = (item) => {
    setSelected(prev => {
      const copy = { ...prev };
      if (copy[item.id]) { delete copy[item.id]; }
      else { copy[item.id] = item.quantity; }
      return copy;
    });
  };

  const adjustQty = (itemId, delta, maxQty) => {
    setSelected(prev => {
      const cur = prev[itemId] || 0;
      const next = Math.max(1, Math.min(maxQty, cur + delta));
      return { ...prev, [itemId]: next };
    });
  };

  const goToStep2 = async () => {
    setStep(2);
    // Pre-load other tables for "Otra Mesa" tab
    try {
      const res = await tablesAPI.list();
      setOtherTables((res.data || []).filter(t => t.id !== tableId && t.status !== 'free'));
    } catch {}
  };

  const selectOtherTable = async (t) => {
    setSelectedOtherTable(t);
    try {
      const res = await ordersAPI.getTableOrders(t.id);
      setOtherTableOrders((res.data || []).filter(o => !['closed', 'cancelled'].includes(o.status)));
    } catch { setOtherTableOrders([]); }
  };

  const executeMove = async (targetOrderId, destLabel) => {
    const itemIds = Object.keys(selected);
    const quantities = {};
    itemIds.forEach(id => {
      const orig = movableItems.find(i => i.id === id);
      if (orig && selected[id] < orig.quantity) quantities[id] = selected[id];
    });

    notify.confirm(`¿Mover ${selectedCount} artículo(s) a ${destLabel}?`, {
      onConfirm: async () => {
        setLoading(true);
        try {
          await ordersAPI.moveItems(order.id, targetOrderId, itemIds, Object.keys(quantities).length ? quantities : undefined);
          notify.success('Artículo(s) movido(s) correctamente');
          reset();
          onDone();
        } catch (err) {
          notify.error('Error al mover', { description: err.response?.data?.detail || err.message });
        } finally { setLoading(false); }
      },
    });
  };

  const reset = () => {
    setStep(1);
    setSelected({});
    setDestTab('same');
    setOtherTables([]);
    setOtherTableOrders([]);
    setSelectedOtherTable(null);
  };

  const cancel = () => { reset(); onCancel(); };

  if (!active) return null;

  /* ── STEP 1: SELECT ITEMS ─────────────────────────── */
  if (step === 1) {
    return (
      <div className="flex flex-col h-full" data-testid="move-items-step1">
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {movableItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hay artículos que se puedan mover</p>
            ) : movableItems.map(item => {
              const isSelected = !!selected[item.id];
              const modTotal = (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
              return (
                <div key={item.id} data-testid={`move-item-${item.id}`}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected ? 'bg-cyan-500/10 border-cyan-500/50 ring-1 ring-cyan-500/30' : 'bg-background/50 border-border/50'
                  }`}
                  onClick={() => toggleItem(item)}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-muted-foreground/40'
                  }`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-oswald text-sm font-bold text-primary">{item.quantity}x</span>
                      <span className="text-sm font-bold truncate">{item.product_name}</span>
                    </div>
                    {item.modifiers?.length > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {item.modifiers.map(m => m.name).join(', ')}
                      </div>
                    )}
                    <Badge variant="outline" className="text-[8px] h-4 mt-1 border-blue-500 text-blue-400">
                      {item.status === 'pending' ? 'Pendiente' : 'Enviado'}
                    </Badge>
                  </div>
                  <span className="text-sm font-oswald font-bold text-muted-foreground notranslate">
                    ${((item.unit_price + modTotal) * item.quantity).toFixed(2)}
                  </span>
                </div>
              );
            })}
            {/* Partial qty selectors for selected items with qty > 1 */}
            {Object.entries(selected).map(([itemId, qty]) => {
              const item = movableItems.find(i => i.id === itemId);
              if (!item || item.quantity <= 1) return null;
              return (
                <div key={`qty-${itemId}`} className="flex items-center justify-between px-3 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                  <span className="text-xs text-cyan-400 font-medium">Cantidad a mover de {item.product_name}:</span>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); adjustQty(itemId, -1, item.quantity); }}
                      className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 active:scale-90">
                      <Minus size={14} />
                    </button>
                    <span className="font-oswald font-bold text-sm w-6 text-center notranslate">{qty}</span>
                    <button onClick={(e) => { e.stopPropagation(); adjustQty(itemId, 1, item.quantity); }}
                      className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 active:scale-90">
                      <Plus size={14} />
                    </button>
                    <span className="text-xs text-muted-foreground">/ {item.quantity}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        {/* Floating action bar */}
        <div className="border-t border-border p-3 flex items-center justify-between gap-2 bg-background/95 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <span className="text-xs text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount} artículo(s) seleccionado(s)` : 'Selecciona los artículos a mover'}
          </span>
          <div className="flex gap-2">
            <button onClick={cancel} data-testid="move-items-cancel"
              className="px-4 py-2 rounded-full text-sm font-medium border border-border text-muted-foreground hover:bg-muted transition-all active:scale-95">
              Cancelar
            </button>
            <button onClick={goToStep2} disabled={selectedCount === 0} data-testid="move-items-next"
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all active:scale-95 ${
                selectedCount > 0 ? 'bg-cyan-500 text-white hover:bg-cyan-600' : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}>
              Siguiente
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── STEP 2: SELECT DESTINATION ───────────────────── */
  return (
    <Dialog open={step === 2} onOpenChange={(open) => { if (!open) setStep(1); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden" data-testid="move-items-step2">
        <DialogTitle className="sr-only">Seleccionar destino</DialogTitle>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-oswald font-bold flex items-center gap-2">
              <ArrowRightLeft size={18} className="text-cyan-500" /> Mover a...
            </h3>
            <button onClick={() => setStep(1)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted"><X size={16} /></button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3 bg-muted rounded-lg p-1">
            <button onClick={() => { setDestTab('same'); setSelectedOtherTable(null); }}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${destTab === 'same' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
              data-testid="move-dest-tab-same">
              Esta Mesa
            </button>
            <button onClick={() => setDestTab('other')}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${destTab === 'other' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
              data-testid="move-dest-tab-other">
              Otra Mesa
            </button>
          </div>
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="p-4 space-y-2">
            {destTab === 'same' ? (
              <>
                {otherAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No hay otras cuentas en esta mesa</p>
                ) : otherAccounts.map(acc => (
                  <button key={acc.id} onClick={() => executeMove(acc.id, `Cuenta ${acc.account_label || acc.account_number || '#'}`)}
                    disabled={loading} data-testid={`move-dest-account-${acc.id}`}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all active:scale-[0.98]">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/15 flex items-center justify-center text-cyan-500 font-oswald font-bold text-sm">
                      #{acc.account_number || '?'}
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-bold">{acc.account_label || `Cuenta #${acc.account_number}`}</p>
                      <p className="text-xs text-muted-foreground">{(acc.items || []).filter(i => i.status !== 'cancelled').length} artículos</p>
                    </div>
                  </button>
                ))}
              </>
            ) : !selectedOtherTable ? (
              <>
                {otherTables.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No hay otras mesas abiertas</p>
                ) : otherTables.map(t => (
                  <button key={t.id} onClick={() => selectOtherTable(t)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all active:scale-[0.98]"
                    data-testid={`move-dest-table-${t.number || t.name}`}>
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-oswald font-bold text-sm">
                      {t.number || t.name}
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-bold">Mesa {t.number || t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.status === 'occupied' ? 'Ocupada' : t.status === 'divided' ? 'Dividida' : t.status}</p>
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <>
                <button onClick={() => setSelectedOtherTable(null)}
                  className="text-xs text-cyan-500 font-medium mb-2 hover:underline">
                  ← Cambiar mesa
                </button>
                <p className="text-xs text-muted-foreground mb-2">Cuentas en Mesa {selectedOtherTable.number || selectedOtherTable.name}:</p>
                {otherTableOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin cuentas abiertas</p>
                ) : otherTableOrders.map(acc => (
                  <button key={acc.id} onClick={() => executeMove(acc.id, `Mesa ${selectedOtherTable.number || selectedOtherTable.name} - Cuenta #${acc.account_number || '1'}`)}
                    disabled={loading} data-testid={`move-dest-other-account-${acc.id}`}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all active:scale-[0.98]">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/15 flex items-center justify-center text-cyan-500 font-oswald font-bold text-sm">
                      #{acc.account_number || '1'}
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-bold">{acc.account_label || `Cuenta #${acc.account_number || '1'}`}</p>
                      <p className="text-xs text-muted-foreground">{(acc.items || []).filter(i => i.status !== 'cancelled').length} artículos</p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
