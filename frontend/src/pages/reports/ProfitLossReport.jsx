import { formatMoney } from './reportUtils';

export default function ProfitLossReport({ data }) {
  if (!data?.revenue) return null;
  const isProfit = data.profit?.gross_profit >= 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-emerald-400 uppercase">Ingresos Netos</p>
          <p className="font-oswald text-2xl font-bold text-emerald-400">{formatMoney(data.revenue.net_revenue)}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-red-400 uppercase">Costo de Ventas</p>
          <p className="font-oswald text-xl font-bold text-red-400">{formatMoney(data.costs.cost_of_goods_sold)}</p>
        </div>
        <div className={`${isProfit ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded-xl p-4 text-center`}>
          <p className={`text-[10px] ${isProfit ? 'text-green-400' : 'text-red-400'} uppercase`}>Ganancia Bruta</p>
          <p className={`font-oswald text-2xl font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(data.profit.gross_profit)}</p>
        </div>
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-primary uppercase">Margen Bruto</p>
          <p className="font-oswald text-2xl font-bold text-primary">{data.profit.gross_margin_pct}%</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ingresos</h4>
          <div className="space-y-2">
            <div className="flex justify-between p-2 bg-background rounded">
              <span className="text-sm">Ventas Brutas</span>
              <span className="font-oswald">{formatMoney(data.revenue.gross_sales)}</span>
            </div>
            <div className="flex justify-between p-2 bg-background rounded text-muted-foreground">
              <span className="text-sm">(-) Propinas</span>
              <span className="font-oswald">{formatMoney(data.revenue.tips_collected)}</span>
            </div>
            <div className="flex justify-between p-2 bg-background rounded text-muted-foreground">
              <span className="text-sm">(-) Impuestos</span>
              <span className="font-oswald">{formatMoney(data.revenue.tax_collected)}</span>
            </div>
            <div className="flex justify-between p-2 bg-emerald-500/10 rounded border border-emerald-500/30">
              <span className="text-sm font-semibold text-emerald-400">Ingresos Netos</span>
              <span className="font-oswald font-bold text-emerald-400">{formatMoney(data.revenue.net_revenue)}</span>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Costos</h4>
          <div className="space-y-2">
            <div className="flex justify-between p-2 bg-background rounded">
              <span className="text-sm">Costo de Ventas</span>
              <span className="font-oswald text-red-400">{formatMoney(data.costs.cost_of_goods_sold)}</span>
            </div>
            <div className="flex justify-between p-2 bg-background rounded">
              <span className="text-sm">Compras del Período</span>
              <span className="font-oswald">{formatMoney(data.costs.purchases)}</span>
            </div>
            <div className="flex justify-between p-2 bg-background rounded">
              <span className="text-sm">Mermas</span>
              <span className="font-oswald text-amber-400">{formatMoney(data.costs.waste_loss)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
