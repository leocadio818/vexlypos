import { CustomTooltip, formatMoney, Badge, Users, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from './reportUtils';

export default function ByWaiterReport({ data: reportData }) {
  const data = Array.isArray(reportData) ? reportData : [];
  return (
    <div className="space-y-4">
      {data.length > 0 ? (
        <>
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ventas por Mesero</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#FF6600" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle</h4>
            <div className="space-y-2">
              {data.map((w, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-muted-foreground" />
                    <span className="font-semibold">{w.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <Badge variant="outline">{w.bills} facturas</Badge>
                    <span className="text-yellow-400">Propinas: {formatMoney(w.tips)}</span>
                    <span className="font-oswald text-primary font-bold">{formatMoney(w.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : <p className="text-sm text-muted-foreground text-center py-12">Sin datos para el período</p>}
    </div>
  );
}
