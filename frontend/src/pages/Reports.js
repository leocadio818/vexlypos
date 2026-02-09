import { useState, useEffect, useCallback } from 'react';
import { formatMoney } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart3, TrendingUp, Calendar, Mail, Users, ArrowRightLeft, Table2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const COLORS = ['#FF6600', '#E53935', '#1E88E5', '#43A047', '#FFB300', '#E91E63', '#8E24AA', '#00BCD4'];

export default function Reports() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [daily, setDaily] = useState(null);
  const [byCategory, setByCategory] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [byWaiter, setByWaiter] = useState([]);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [tableMovements, setTableMovements] = useState([]);
  const [movementStats, setMovementStats] = useState(null);

  const fetchReports = useCallback(async () => {
    try {
      const [dRes, cRes, pRes, wRes, mRes, msRes] = await Promise.all([
        axios.get(`${API}/reports/daily-sales`, { params: { date }, headers: headers() }),
        axios.get(`${API}/reports/sales-by-category`, { params: { date }, headers: headers() }),
        axios.get(`${API}/reports/top-products`, { params: { date }, headers: headers() }),
        axios.get(`${API}/reports/sales-by-waiter`, { params: { date }, headers: headers() }),
        axios.get(`${API}/reports/table-movements`, { params: { date, limit: 20 }, headers: headers() }),
        axios.get(`${API}/reports/table-movements/stats`, { params: { date }, headers: headers() }),
      ]);
      setDaily(dRes.data);
      setByCategory(cRes.data);
      setTopProducts(pRes.data);
      setByWaiter(wRes.data);
      setTableMovements(mRes.data);
      setMovementStats(msRes.data);
    } catch {}
  }, [date]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleSendDailyEmail = async () => {
    if (!emailTo) { toast.error('Ingresa un correo'); return; }
    setSending(true);
    try {
      const res = await axios.post(`${API}/email/daily-close`, { to: emailTo, date }, { headers: headers() });
      if (res.data.status === 'sent') toast.success('Reporte enviado por correo');
      else if (res.data.status === 'preview') toast.info('Modo preview: RESEND_API_KEY no configurada');
      else toast.error('Error enviando');
    } catch { toast.error('Error enviando correo'); }
    setSending(false);
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="font-semibold">{payload[0]?.payload?.name || payload[0]?.payload?.category}</p>
        <p className="font-oswald text-primary">{formatMoney(payload[0]?.value)}</p>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col" data-testid="reports-page">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">REPORTES</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm font-mono" data-testid="report-date" />
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Daily Summary */}
          {daily && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="daily-summary">
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Total Ventas</p>
                <p className="font-oswald text-2xl font-bold text-primary">{formatMoney(daily.total_sales)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Facturas</p>
                <p className="font-oswald text-2xl font-bold">{daily.total_bills}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">ITBIS</p>
                <p className="font-oswald text-xl font-bold text-blue-400">{formatMoney(daily.total_itbis)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Propinas</p>
                <p className="font-oswald text-xl font-bold text-yellow-400">{formatMoney(daily.total_tips)}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales by Category */}
            <div className="bg-card border border-border rounded-xl p-4" data-testid="chart-by-category">
              <h3 className="font-oswald text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground">Ventas por Categoria</h3>
              {byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={byCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                      {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-12">Sin datos para esta fecha</p>}
            </div>

            {/* Top Products */}
            <div className="bg-card border border-border rounded-xl p-4" data-testid="chart-top-products">
              <h3 className="font-oswald text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground">Top Productos</h3>
              {topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topProducts.slice(0, 8)} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fill: '#999' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" fill="#FF6600" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-12">Sin datos para esta fecha</p>}
            </div>
          </div>

          {/* Sales by Waiter */}
          <div className="bg-card border border-border rounded-xl p-4" data-testid="waiter-sales">
            <h3 className="font-oswald text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users size={14} /> Ventas por Mesero
            </h3>
            {byWaiter.length > 0 ? (
              <div className="space-y-2">
                {byWaiter.map((w, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                    <span className="font-semibold text-sm">{w.name}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">{w.bills} facturas</span>
                      <span className="text-yellow-400 font-oswald">Propinas: {formatMoney(w.tips)}</span>
                      <span className="font-oswald text-primary font-bold">{formatMoney(w.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">Sin datos para esta fecha</p>}
          </div>

          {/* Email Daily Close */}
          <div className="bg-card border border-border rounded-xl p-4" data-testid="email-daily-close">
            <h3 className="font-oswald text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Mail size={14} /> Enviar Cierre por Correo
            </h3>
            <div className="flex gap-2">
              <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="correo@ejemplo.com" type="email"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="daily-email-input" />
              <Button onClick={handleSendDailyEmail} disabled={sending} className="bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="send-daily-email-btn">
                <Mail size={16} className="mr-2" /> {sending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Para activar el envio de correos, agrega tu API Key de Resend en el archivo .env del backend (RESEND_API_KEY).
              Obtenerla en: <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">resend.com/api-keys</a>
            </p>
          </div>

          {/* Table Movements Audit */}
          <div className="bg-card border border-border rounded-xl p-4" data-testid="table-movements-section">
            <h3 className="font-oswald text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ArrowRightLeft size={14} /> Historial de Movimientos de Mesas
            </h3>
            
            {/* Stats Summary */}
            {movementStats && movementStats.total_movements > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div className="bg-background border border-border/50 rounded-lg p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Total Movimientos</p>
                  <p className="font-oswald text-xl font-bold text-primary">{movementStats.total_movements}</p>
                </div>
                <div className="bg-background border border-border/50 rounded-lg p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Movimientos Simples</p>
                  <p className="font-oswald text-xl font-bold text-blue-400">{movementStats.single_moves}</p>
                </div>
                <div className="bg-background border border-border/50 rounded-lg p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Movimientos Múltiples</p>
                  <p className="font-oswald text-xl font-bold text-purple-400">{movementStats.bulk_moves}</p>
                </div>
                <div className="bg-background border border-border/50 rounded-lg p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Cuentas Unidas</p>
                  <p className="font-oswald text-xl font-bold text-yellow-400">{movementStats.merges}</p>
                </div>
              </div>
            )}

            {/* Movement Log Table */}
            {tableMovements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 px-2">Hora</th>
                      <th className="py-2 px-2">Usuario</th>
                      <th className="py-2 px-2">Origen</th>
                      <th className="py-2 px-2">Destino</th>
                      <th className="py-2 px-2">Tipo</th>
                      <th className="py-2 px-2">Cuentas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableMovements.map((m) => (
                      <tr key={m.id} className="border-b border-border/30 hover:bg-background/50">
                        <td className="py-2 px-2 font-mono text-muted-foreground">
                          <Clock size={10} className="inline mr-1" />
                          {m.created_at?.split('T')[1]?.slice(0, 5) || '--:--'}
                        </td>
                        <td className="py-2 px-2">
                          <span className="font-medium">{m.user_name}</span>
                          <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0">{m.user_role}</Badge>
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="secondary" className="font-oswald">
                            <Table2 size={10} className="mr-1" /> Mesa {m.source_table_number}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">
                          <Badge className="font-oswald bg-primary/20 text-primary border-primary/30">
                            <Table2 size={10} className="mr-1" /> Mesa {m.target_table_number}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">
                          {m.merged ? (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[9px]">Unión</Badge>
                          ) : m.movement_type === 'bulk' ? (
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[9px]">Múltiple</Badge>
                          ) : (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[9px]">Simple</Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 font-oswald text-center">{m.orders_moved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                No hay movimientos de mesas registrados para esta fecha
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
