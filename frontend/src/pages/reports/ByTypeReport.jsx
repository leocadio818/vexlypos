import { CustomTooltip, formatMoney, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from './reportUtils';

export default function ByTypeReport({ data: reportData }) {
  const data = reportData?.types || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.slice(0, 4).map((t, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase truncate">{t.name}</p>
            <p className="font-oswald text-xl font-bold text-primary">{formatMoney(t.total)}</p>
            <p className="text-[10px] text-muted-foreground">{t.count} transacciones</p>
          </div>
        ))}
      </div>
      {data.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#666' }} />
              <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" fill="#FF6600" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
