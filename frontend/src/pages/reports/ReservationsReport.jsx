import { CalendarDays, Users, CheckCircle2, XCircle, TrendingUp, Phone, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const formatPct = (v) => `${v}%`;

const STATUS_LABELS = {
  confirmed: 'Confirmada',
  seated: 'Sentada',
  completed: 'Completada',
  no_show: 'No Show',
  cancelled: 'Cancelada',
};

const STATUS_COLORS = {
  confirmed: 'bg-green-500/20 text-green-600',
  seated: 'bg-blue-500/20 text-blue-600',
  completed: 'bg-purple-500/20 text-purple-600',
  no_show: 'bg-red-500/20 text-red-600',
  cancelled: 'bg-gray-500/20 text-gray-600',
};

export default function ReservationsReport({ data }) {
  if (!data) return <p className="text-center text-muted-foreground py-8">Sin datos</p>;

  const { summary, by_day, by_hour, by_status, top_customers, details } = data;
  if (!summary) return <p className="text-center text-muted-foreground py-8">Sin datos</p>;

  return (
    <div className="space-y-5" data-testid="reservations-report">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <CalendarDays size={20} className="text-primary mx-auto mb-1" />
          <p className="font-oswald text-2xl font-bold">{summary.total}</p>
          <p className="text-xs text-muted-foreground">Total Reservaciones</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
          <CheckCircle2 size={20} className="text-green-500 mx-auto mb-1" />
          <p className="font-oswald text-2xl font-bold text-green-600">{summary.confirmed + summary.seated + summary.completed}</p>
          <p className="text-xs text-muted-foreground">Cumplidas</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <XCircle size={20} className="text-red-500 mx-auto mb-1" />
          <p className="font-oswald text-2xl font-bold text-red-600">{summary.no_show}</p>
          <p className="text-xs text-muted-foreground">No Show</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
          <Users size={20} className="text-blue-500 mx-auto mb-1" />
          <p className="font-oswald text-2xl font-bold text-blue-600">{summary.total_guests}</p>
          <p className="text-xs text-muted-foreground">Total Personas</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
          <TrendingUp size={20} className="text-amber-500 mx-auto mb-1" />
          <p className="font-oswald text-2xl font-bold text-amber-600">{formatPct(summary.fulfillment_rate)}</p>
          <p className="text-xs text-muted-foreground">Tasa Cumplimiento</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Reservaciones por Dia</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={by_day}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(25 100% 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Por Estado</h4>
          {summary.total > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={by_status.filter(s => s.count > 0)} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                    {by_status.filter(s => s.count > 0).map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {by_status.filter(s => s.count > 0).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span>{s.status}: <strong>{s.count}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
        </div>
      </div>

      {/* By Hour + Top Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Horas Mas Populares</h4>
          {by_hour.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={by_hour}>
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Top Clientes</h4>
          {top_customers.length > 0 ? (
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {top_customers.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                      <UserCheck size={14} className="text-primary" />
                    </div>
                    <div>
                      <span className="font-medium text-sm">{c.name}</span>
                      {c.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={8} />{c.phone}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-oswald font-bold text-sm">{c.count}</span>
                    <p className="text-xs text-muted-foreground">{c.total_guests} personas</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h4 className="text-xs font-bold uppercase text-muted-foreground">Detalle de Reservaciones</h4>
        </div>
        {details.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left p-3">Cliente</th>
                  <th className="text-left p-3">Telefono</th>
                  <th className="text-left p-3">Fecha</th>
                  <th className="text-left p-3">Hora</th>
                  <th className="text-center p-3">Personas</th>
                  <th className="text-left p-3">Mesas</th>
                  <th className="text-left p-3">Area</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-left p-3">Registrado por</th>
                  <th className="text-left p-3">Notas</th>
                </tr>
              </thead>
              <tbody>
                {details.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.customer_name}</td>
                    <td className="p-3 text-muted-foreground">{r.phone || '-'}</td>
                    <td className="p-3 font-mono text-xs">{r.date}</td>
                    <td className="p-3 font-mono text-xs">{r.time}</td>
                    <td className="p-3 text-center font-oswald">{r.party_size}</td>
                    <td className="p-3 text-xs">{r.tables || '-'}</td>
                    <td className="p-3 text-xs">{r.area || '-'}</td>
                    <td className="p-3">
                      <Badge className={`text-xs ${STATUS_COLORS[r.status] || 'bg-gray-500/20 text-gray-500'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs font-medium">{r.created_by || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[150px] truncate">{r.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted-foreground text-center py-8">No hay reservaciones en este periodo</p>}
      </div>
    </div>
  );
}
