import { CustomTooltip, formatMoney, Badge, Users, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from './reportUtils';

export default function VoidAuditReport({ data }) {
  if (!data?.summary) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-red-400 uppercase">Total Anulado</p>
          <p className="font-oswald text-2xl font-bold text-red-400">{formatMoney(data.summary.total_voided)}</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-green-400 uppercase">Recuperado</p>
          <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.summary.total_recovered)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-amber-400 uppercase">Pérdida Neta</p>
          <p className="font-oswald text-xl font-bold text-amber-400">{formatMoney(data.summary.total_loss)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Total Anulaciones</p>
          <p className="font-oswald text-2xl font-bold">{data.summary.total_count}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Razón</h4>
          {data.by_reason?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.by_reason.slice(0, 6)} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis dataKey="reason" type="category" width={100} tick={{ fontSize: 9, fill: '#999' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#E53935" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Autorizadores</h4>
          {data.by_authorizer?.length > 0 ? (
            <div className="space-y-2">
              {data.by_authorizer.map((auth, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-muted-foreground" />
                    <span className="font-medium text-sm">{auth.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">{auth.count} anulaciones</Badge>
                    <span className="font-oswald text-red-400">{formatMoney(auth.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sin autorizaciones registradas</p>}
        </div>
      </div>
    </div>
  );
}
