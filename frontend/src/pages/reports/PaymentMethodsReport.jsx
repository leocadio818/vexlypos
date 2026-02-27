import { COLORS, Sparkline, CustomTooltip, formatMoney, Badge, PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from './reportUtils';

export default function PaymentMethodsReport({ data: reportData }) {
  const data = reportData?.methods || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Distribución</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} label={({ name, percentage }) => `${name} ${percentage}%`}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle con Tendencia</h4>
          <div className="space-y-2">
            {data.map((pm, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="font-medium text-sm">{pm.name}</span>
                  <Sparkline data={pm.sparkline || []} color={COLORS[i % COLORS.length]} />
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <Badge variant="outline" className="text-[9px]">{pm.percentage}%</Badge>
                  <span className="font-oswald text-primary font-bold">{formatMoney(pm.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
