import { formatMoney, Badge } from './reportUtils';

export default function StockAdjustmentsReport({ data }) {
  if (!data?.stats) return null;
  const { stats, logs = [], by_reason = [], by_ingredient = [] } = data;
  return (
    <div className="space-y-4" data-testid="stock-adjustments-report">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-oswald font-bold text-primary">{stats.total_adjustments}</div>
          <div className="text-xs text-muted-foreground">Total Ajustes</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-oswald font-bold text-green-400">+{stats.total_positive_units}</div>
          <div className="text-xs text-muted-foreground">Unidades Agregadas</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-oswald font-bold text-red-400">-{stats.total_negative_units}</div>
          <div className="text-xs text-muted-foreground">Unidades Removidas</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className={`text-2xl font-oswald font-bold ${stats.net_value_impact >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(stats.net_value_impact)}</div>
          <div className="text-xs text-muted-foreground">Impacto Neto</div>
        </div>
      </div>
      {by_reason.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-oswald font-bold text-sm mb-3">Por Razón de Ajuste</h4>
          <div className="space-y-2">
            {by_reason.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30">
                <span>{r.reason}</span>
                <div className="flex gap-4">
                  <span className="text-muted-foreground">{r.count} ajuste(s)</span>
                  <span className="font-oswald font-bold">{formatMoney(r.total_value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {by_ingredient.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-oswald font-bold text-sm mb-3">Por Insumo</h4>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Insumo</th>
                <th className="text-center p-2">Ajustes</th>
                <th className="text-right p-2">Cantidad Neta</th>
                <th className="text-right p-2">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {by_ingredient.map((bi, i) => (
                <tr key={i}>
                  <td className="p-2 font-medium">{bi.name}</td>
                  <td className="p-2 text-center">{bi.adjustments}</td>
                  <td className={`p-2 text-right font-oswald ${bi.net_quantity >= 0 ? 'text-green-400' : 'text-red-400'}`}>{bi.net_quantity > 0 ? '+' : ''}{bi.net_quantity.toFixed(2)}</td>
                  <td className="p-2 text-right font-oswald font-bold">{formatMoney(bi.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <h4 className="font-oswald font-bold text-sm p-4 pb-2">Detalle de Ajustes</h4>
        <table className="w-full text-sm" data-testid="adjustments-detail-table">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 pl-4">Fecha</th>
              <th className="text-left p-2">Insumo</th>
              <th className="text-left p-2">Almacén</th>
              <th className="text-right p-2">Cantidad</th>
              <th className="text-right p-2">Antes</th>
              <th className="text-right p-2">Después</th>
              <th className="text-right p-2">Valor</th>
              <th className="text-left p-2">Razón</th>
              <th className="text-left p-2 pr-4">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log, i) => (
              <tr key={log.id || i} className="hover:bg-muted/30">
                <td className="p-2 pl-4 text-muted-foreground whitespace-nowrap">{new Date(log.timestamp).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="p-2 font-medium">{log.ingredient_name}</td>
                <td className="p-2 text-muted-foreground">{log.warehouse_name}</td>
                <td className={`p-2 text-right font-oswald font-bold ${log.quantity >= 0 ? 'text-green-400' : 'text-red-400'}`}>{log.quantity > 0 ? '+' : ''}{log.quantity}</td>
                <td className="p-2 text-right font-mono text-muted-foreground">{log.stock_before}</td>
                <td className="p-2 text-right font-mono">{log.stock_after}</td>
                <td className="p-2 text-right font-oswald">{formatMoney(log.monetary_value)}</td>
                <td className="p-2">{log.reason}</td>
                <td className="p-2 pr-4 text-muted-foreground">{log.adjusted_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <div className="text-center py-8 text-muted-foreground">No hay ajustes de stock en este período</div>}
      </div>
    </div>
  );
}
