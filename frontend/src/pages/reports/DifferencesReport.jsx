import { CustomTooltip, formatMoney, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from './reportUtils';

export default function DifferencesReport({ data }) {
  if (!data?.summary) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Total Diferencias</p>
          <p className="font-oswald text-2xl font-bold">{data.summary.total_count}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-red-400 uppercase">Faltantes</p>
          <p className="font-oswald text-xl font-bold text-red-400">{formatMoney(data.summary.total_shortage)}</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-green-400 uppercase">Sobrantes</p>
          <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.summary.total_surplus)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-amber-400 uppercase">Pérdida Neta</p>
          <p className="font-oswald text-xl font-bold text-amber-400">{formatMoney(data.summary.net_value)}</p>
        </div>
      </div>
      {data.by_reason?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Razón</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.by_reason}>
              <XAxis dataKey="reason" tick={{ fontSize: 10, fill: '#666' }} />
              <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#FF6600" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
