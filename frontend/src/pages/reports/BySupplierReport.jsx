import { COLORS, CustomTooltip, formatMoney, Badge, PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from './reportUtils';

export default function BySupplierReport({ data }) {
  if (!data?.suppliers) return null;
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-purple-500/20 to-violet-600/10 border border-purple-500/30 rounded-xl p-4 text-center">
        <p className="text-[10px] text-purple-400 uppercase">Total Gastado en Período</p>
        <p className="font-oswald text-3xl font-bold text-purple-400">{formatMoney(data.total)}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Distribución</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.suppliers.slice(0, 8)} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                {data.suppliers.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 overflow-auto max-h-[280px]">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle</h4>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="text-left py-2">Proveedor</th>
                <th className="text-right py-2">Órdenes</th>
                <th className="text-right py-2">%</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.map((s, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-2 font-medium">{s.name}</td>
                  <td className="py-2 text-right text-muted-foreground">{s.orders}</td>
                  <td className="py-2 text-right"><Badge variant="outline" className="text-[9px]">{s.percentage}%</Badge></td>
                  <td className="py-2 text-right font-oswald text-primary">{formatMoney(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
