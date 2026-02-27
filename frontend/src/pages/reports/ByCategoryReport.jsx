import { COLORS, CustomTooltip, formatMoney, PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from './reportUtils';

export default function ByCategoryReport({ data: reportData }) {
  const data = Array.isArray(reportData) ? reportData : [];
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-12">Sin datos para este período</p>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Distribución por Categoría</h4>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ranking de Categorías</h4>
        <div className="space-y-2">
          {data.map((cat, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="font-medium text-sm">{cat.category}</span>
              </div>
              <span className="font-oswald text-primary font-bold">{formatMoney(cat.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
