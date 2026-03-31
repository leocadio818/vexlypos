import { X, Check, SplitSquareHorizontal, MoveRight, Users } from 'lucide-react';
import { formatMoney } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * SplitCheckView — Modo "Editar Cuenta" (dividir/mover items entre cuentas).
 * Se muestra cuando splitMode=true dentro del panel izquierdo de OrderScreen.
 */
export default function SplitCheckView({
  tableOrders,
  activeOrderId,
  order,
  activeItems,
  selectedSplitItems,
  setSelectedSplitItems,
  onToggleSplitItem,
  onSelectOrder,
  onDeleteEmptyAccount,
  onSplitToNewAccount,
  onMoveToAccount,
  getOrderTotal,
  isOrderEmpty,
}) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Orders/Accounts Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto">
        {tableOrders.map(ord => {
          const isEmpty = isOrderEmpty(ord);
          const canDelete = isEmpty && tableOrders.length > 1;
          return (
            <div key={ord.id} className="relative flex items-center">
              <button
                onClick={() => onSelectOrder(ord.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-oswald whitespace-nowrap transition-all ${
                  activeOrderId === ord.id
                    ? 'bg-primary text-primary-foreground font-bold'
                    : 'bg-card border border-border text-muted-foreground hover:border-primary/50'
                } ${canDelete ? 'pr-7' : ''}`}
              >
                Cuenta #{ord.account_number || 1}
                <span className="ml-1 text-[11px] opacity-70">({ord.items?.filter(i => i.status !== 'cancelled').length || 0})</span>
              </button>
              {/* Delete button for empty accounts */}
              {canDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEmptyAccount(ord.id, ord.account_number || 1);
                  }}
                  data-testid={`delete-account-split-${ord.account_number || 1}`}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-sm"
                  title="Eliminar cuenta vacía"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Current Order Items — Select to move */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">
              Selecciona items para mover
            </p>
            {activeItems.length > 0 && (
              <button
                onClick={() => {
                  if (selectedSplitItems.length === activeItems.length) {
                    setSelectedSplitItems([]);
                  } else {
                    setSelectedSplitItems(activeItems.map(i => i.id));
                  }
                }}
                className="text-xs text-primary hover:underline font-semibold"
              >
                {selectedSplitItems.length === activeItems.length ? '✓ Deseleccionar todos' : '☐ Seleccionar todos'}
              </button>
            )}
          </div>
          {activeItems.length === 0 ? (
            <div className="text-center py-8">
              <Users size={24} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Esta cuenta está vacía</p>
            </div>
          ) : (
            activeItems.map(item => {
              const isSelected = selectedSplitItems.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => onToggleSplitItem(item.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-red-500/20 border-red-500'
                      : 'bg-background/50 border-border/50 hover:border-primary/50'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'bg-red-500 border-red-500' : 'border-muted-foreground/40'
                  }`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-oswald text-xs font-bold text-primary">{item.quantity}x</span>
                      <span className="text-xs font-medium truncate">{item.product_name}</span>
                    </div>
                    {item.modifiers?.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {item.modifiers.map((m, i) => <Badge key={i} variant="secondary" className="text-[7px] h-3.5 px-1">{m.name}</Badge>)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-oswald text-[11px]">{formatMoney(item.unit_price * item.quantity)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Action bar */}
      <div className="p-3 border-t border-border bg-card space-y-2">
        {selectedSplitItems.length > 0 ? (
          <>
            <p className="text-xs text-center font-semibold text-red-400">
              {selectedSplitItems.length} item(s) seleccionado(s)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={onSplitToNewAccount}
                className="h-10 bg-green-600 hover:bg-green-700 text-white font-oswald font-bold text-xs"
              >
                <SplitSquareHorizontal size={12} className="mr-1" /> Nueva Cuenta
              </Button>
              {tableOrders.length > 1 && (
                <Button
                  onClick={onMoveToAccount}
                  className="h-10 bg-purple-600 hover:bg-purple-700 text-white font-oswald font-bold text-xs"
                >
                  <MoveRight size={12} className="mr-1" /> Mover a Cuenta
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center">
            Toca los items que deseas mover a otra cuenta
          </p>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">Total Cuenta #{order?.account_number || 1}</span>
          <span className="font-oswald text-lg font-bold text-primary">
            {formatMoney(getOrderTotal(order))}
          </span>
        </div>
      </div>
    </div>
  );
}
