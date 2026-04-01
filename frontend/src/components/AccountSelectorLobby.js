import { ArrowLeft, Plus, Merge, Printer } from 'lucide-react';
import { formatMoney } from '@/lib/api';

/**
 * AccountSelectorLobby — Grid de cuentas divididas para una mesa.
 * Se muestra cuando la mesa tiene múltiples órdenes y el usuario no ha seleccionado una.
 */
export default function AccountSelectorLobby({
  tableOrders,
  table,
  selectorMergeMode,
  setSelectorMergeMode,
  selectorMergeSource,
  setSelectorMergeSource,
  onBack,
  onSelectAccount,
  onNewAccount,
  onPrintAll,
  onMerge,
  getOrderTotal,
  isOrderEmpty,
}) {
  return (
    <div className="h-full flex flex-col" data-testid="account-selector">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border backdrop-blur-xl bg-card/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition-all shrink-0"
            data-testid="back-to-tables-from-selector"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="font-oswald text-lg sm:text-xl font-bold text-foreground">Mesa {table?.number || '?'}</h2>
            <p className="text-xs text-muted-foreground">{tableOrders.length} cuentas abiertas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewAccount}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-oswald font-bold bg-green-600/20 border border-green-600/50 text-green-400 hover:bg-green-600/30 transition-all active:scale-95"
            data-testid="new-account-from-selector"
          >
            <Plus size={14} /> Nueva
          </button>
          {tableOrders.length >= 2 && (
            <button
              onClick={() => { setSelectorMergeMode(!selectorMergeMode); setSelectorMergeSource(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-oswald font-bold transition-all active:scale-95 ${
                selectorMergeMode
                  ? 'bg-purple-600 border border-purple-400 text-white'
                  : 'bg-purple-600/20 border border-purple-600/50 text-purple-400 hover:bg-purple-600/30'
              }`}
              data-testid="merge-from-selector"
            >
              <Merge size={14} /> {selectorMergeMode ? 'Cancelar' : 'Unir'}
            </button>
          )}
          <button
            onClick={onPrintAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-oswald font-bold bg-cyan-600/20 border border-cyan-600/50 text-cyan-400 hover:bg-cyan-600/30 transition-all active:scale-95"
            data-testid="print-all-from-selector"
          >
            <Printer size={14} /> Todas
          </button>
        </div>
      </div>

      {/* Account Cards — Full screen grid */}
      <div className="flex-1 p-3 sm:p-5 lg:p-8 overflow-y-auto">
        {selectorMergeMode ? (
          <p className="text-sm text-purple-400 mb-4 text-center font-semibold">
            {selectorMergeSource
              ? `Ahora toca la cuenta DESTINO para unir con Cuenta #${tableOrders.find(o => o.id === selectorMergeSource)?.account_number || '?'}`
              : 'Toca la cuenta ORIGEN que deseas mover'}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mb-4 text-center">Selecciona la cuenta a la que deseas agregar productos</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {tableOrders.map(ord => {
            const items = ord.items?.filter(i => i.status !== 'cancelled') || [];
            const total = getOrderTotal(ord);
            const isEmpty = items.length === 0;
            const isSource = selectorMergeSource === ord.id;
            const isTarget = selectorMergeMode && selectorMergeSource && !isSource;

            return (
              <button
                key={ord.id}
                onClick={() => {
                  if (selectorMergeMode) {
                    if (!selectorMergeSource) {
                      setSelectorMergeSource(ord.id);
                    } else if (ord.id !== selectorMergeSource) {
                      onMerge(ord.id);
                    }
                  } else {
                    onSelectAccount(ord);
                  }
                }}
                data-testid={`select-account-${ord.account_number || 1}`}
                className={`p-4 sm:p-5 rounded-2xl border-2 transition-all text-left active:scale-[0.97] ${
                  isSource
                    ? 'border-purple-500 bg-purple-500/20 ring-2 ring-purple-500/50 scale-[1.02]'
                    : isTarget
                      ? 'border-green-500/70 bg-green-500/10 hover:bg-green-500/20 hover:border-green-400'
                      : selectorMergeMode
                        ? 'border-purple-500/50 bg-muted/50 hover:border-purple-400 animate-pulse'
                        : 'border-border bg-card hover:border-primary/60 hover:bg-primary/10'
                }`}
                style={selectorMergeMode && !isSource ? { animationDuration: '2s' } : {}}
              >
                {/* Merge mode badges */}
                {isSource && (
                  <div className="mb-2">
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-purple-600 text-white uppercase">Origen</span>
                  </div>
                )}
                {isTarget && (
                  <div className="mb-2">
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-600 text-white uppercase">Toca para unir aquí</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-oswald text-xl sm:text-2xl font-bold text-primary">
                      Cuenta #{ord.account_number || 1}
                    </span>
                    {(ord.account_label || ord.label) && (
                      <span className="ml-2 text-sm text-muted-foreground">({ord.account_label || ord.label})</span>
                    )}
                  </div>
                  <span className="font-oswald text-lg sm:text-xl font-bold text-foreground">
                    {formatMoney(total)}
                  </span>
                </div>
                <div className="border-t border-border pt-2">
                  {isEmpty ? (
                    <p className="text-sm text-muted-foreground py-1">Sin productos</p>
                  ) : (
                    <div className="space-y-1">
                      {items.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-foreground/70 truncate flex-1">{item.quantity}x {item.product_name}</span>
                          <span className="text-muted-foreground ml-3 shrink-0 font-mono">{formatMoney(item.unit_price * item.quantity)}</span>
                        </div>
                      ))}
                      {items.length > 5 && (
                        <p className="text-xs text-muted-foreground pt-1">+{items.length - 5} más...</p>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
