import { COLORS, CustomTooltip, formatMoney, PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from './reportUtils';

export default function WasteReport({ data }) {
  if (!data?.summary) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-red-400 uppercase">Valor Total Mermas</p>
          <p className="font-oswald text-2xl font-bold text-red-400">{formatMoney(data.summary.total_waste_value)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Total Movimientos</p>
          <p className="font-oswald text-2xl font-bold">{data.summary.total_movements}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.by_ingredient?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Insumo</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {data.by_ingredient.map((ing, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                  <span className="text-sm">{ing.name}</span>
                  <span className="font-oswald text-red-400">{formatMoney(ing.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.by_reason?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Razón</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.by_reason} dataKey="value" nameKey="reason" cx="50%" cy="50%" outerRadius={70}>
                  {data.by_reason.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
