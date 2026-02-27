import { formatMoney, Badge } from './reportUtils';

export default function CashCloseReport({ data }) {
  if (!data?.summary) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-emerald-400 uppercase">Total Ventas</p>
          <p className="font-oswald text-2xl font-bold text-emerald-400">{formatMoney(data.summary.total_sales)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Efectivo</p>
          <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.summary.cash_total)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Tarjetas/Otros</p>
          <p className="font-oswald text-xl font-bold text-purple-400">{formatMoney(data.summary.card_total)}</p>
        </div>
      </div>
      {data.by_payment_method?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Desglose por Forma de Pago</h4>
          <div className="space-y-2">
            {data.by_payment_method.map((pm, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                <div className="flex items-center gap-2">
                  <Badge variant={pm.is_cash ? 'default' : 'secondary'} className="text-[10px]">{pm.is_cash ? 'Efectivo' : 'Electrónico'}</Badge>
                  <span className="font-medium text-sm">{pm.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">{pm.count} transacciones</span>
                  <span className="font-oswald text-primary font-bold">{formatMoney(pm.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
