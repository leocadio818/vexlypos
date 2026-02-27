import { Button } from '@/components/ui/button';
import { Sparkline, CustomTooltip, formatMoney, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from './reportUtils';

export default function TopProductsReport({ data: reportData, topLimit, onChangeLimit }) {
  const data = reportData?.products || [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Mostrar Top:</span>
        {[10, 20, 30].map(n => (
          <Button key={n} size="sm" variant={topLimit === n ? 'default' : 'outline'} onClick={() => onChangeLimit(n)} className="h-7 px-3 text-xs">{n}</Button>
        ))}
      </div>
      {data.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Top Productos</h4>
            <ResponsiveContainer width="100%" height={Math.min(data.length * 35, 400)}>
              <BarChart data={data.slice(0, 10)} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9, fill: '#999' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#FF6600" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 overflow-auto max-h-[450px]">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle con Tendencia</h4>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-1">#</th>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-right py-2">Cant.</th>
                  <th className="text-right py-2">Total</th>
                  <th className="text-right py-2">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 px-1 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 font-medium truncate max-w-[120px]">{p.name}</td>
                    <td className="py-2 text-right text-muted-foreground">{p.quantity}</td>
                    <td className="py-2 text-right font-oswald text-primary">{formatMoney(p.total)}</td>
                    <td className="py-2 text-right"><Sparkline data={p.sparkline || []} color="#FF6600" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-12">Sin datos para este período</p>
      )}
    </div>
  );
}
