import { formatMoney } from './reportUtils';
import { Sparkles, TrendingUp } from 'lucide-react';

export default function TopCombinationsReport({ data }) {
  const rows = data?.rows || [];
  const totalCombinations = data?.total_combinations_found || 0;
  const totalSold = data?.total_sold || 0;
  const totalRevenue = data?.total_revenue || 0;

  return (
    <div className="space-y-4" data-testid="top-combinations-report">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Combinaciones únicas</p>
          <p className="font-oswald text-2xl font-bold text-amber-500 mt-1" data-testid="tc-unique-count">{totalCombinations}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Items vendidos (top)</p>
          <p className="font-oswald text-2xl font-bold text-emerald-500 mt-1" data-testid="tc-total-sold">{totalSold}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Ingresos generados (top)</p>
          <p className="font-oswald text-2xl font-bold text-cyan-500 mt-1" data-testid="tc-total-revenue">{formatMoney(totalRevenue)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Sparkles size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay combinaciones con modificadores en el período seleccionado.</p>
          <p className="text-xs mt-1 opacity-70">Las combinaciones se cuentan cuando un producto se vende con uno o más modificadores.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="tc-table">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">#</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Producto</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Modificadores</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Veces vendida</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Ingresos</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Ticket prom.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/20" data-testid={`tc-row-${i}`}>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                        r.rank === 1 ? 'bg-amber-400/30 text-amber-600 border border-amber-400/40' :
                        r.rank === 2 ? 'bg-slate-400/30 text-slate-600 border border-slate-400/40' :
                        r.rank === 3 ? 'bg-orange-500/30 text-orange-600 border border-orange-500/40' :
                        'bg-muted text-muted-foreground'
                      }`}>{r.rank}</span>
                    </td>
                    <td className="py-2 px-3 font-bold" data-testid={`tc-product-${i}`}>{r.product_name}</td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {r.modifiers.map((m, j) => (
                          <span key={j} className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px] font-medium">{m}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-oswald font-bold text-amber-600" data-testid={`tc-count-${i}`}>
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp size={12} />{r.count}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-oswald font-bold">{formatMoney(r.total_revenue)}</td>
                    <td className="py-2 px-3 text-right font-oswald text-muted-foreground">{formatMoney(r.avg_ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground px-1">
        Se cuentan solo items con al menos un modificador. Orden: ventas (desc), luego ingresos.
      </div>
    </div>
  );
}
