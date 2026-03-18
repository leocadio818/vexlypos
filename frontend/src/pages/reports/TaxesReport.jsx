import { formatMoney } from './reportUtils';

export default function TaxesReport({ data }) {
  if (!data?.summary) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Subtotal</p>
          <p className="font-oswald text-xl font-bold">{formatMoney(data.summary.total_subtotal)}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-blue-400 uppercase">ITBIS 18%</p>
          <p className="font-oswald text-xl font-bold text-blue-400">{formatMoney(data.summary.total_itbis)}</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-yellow-400 uppercase">Propina Legal 10%</p>
          <p className="font-oswald text-xl font-bold text-yellow-400">{formatMoney(data.summary.total_tips)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-emerald-400 uppercase">Total Recaudado</p>
          <p className="font-oswald text-xl font-bold text-emerald-400">{formatMoney(data.summary.total_sales)}</p>
        </div>
      </div>
      {data.daily?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Desglose Diario</h4>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-right py-2">Subtotal</th>
                  <th className="text-right py-2">ITBIS</th>
                  <th className="text-right py-2">Propinas</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 font-mono">{d.date}</td>
                    <td className="py-2 text-right">{formatMoney(d.subtotal)}</td>
                    <td className="py-2 text-right text-blue-400">{formatMoney(d.itbis)}</td>
                    <td className="py-2 text-right text-yellow-400">{formatMoney(d.tips)}</td>
                    <td className="py-2 text-right font-oswald text-primary">{formatMoney(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
