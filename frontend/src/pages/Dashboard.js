import { useState, useEffect, useCallback } from 'react';
import { formatMoney } from '@/lib/api';
import { getSystemTimezone, formatSystemDate } from '@/lib/timezone';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, ShoppingCart, DollarSign, Utensils, AlertTriangle, Clock, CreditCard, Banknote, BarChart3, Heart, UtensilsCrossed, CheckCircle2, XCircle, Tag, ArrowLeftRight, Wallet } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function Dashboard() {
  const [data, setData] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      await getSystemTimezone(); // ensure timezone is cached
      const res = await axios.get(`${API}/reports/dashboard`, { headers: headers() });
      setData(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (!data) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  const { today, operations, loyalty, hourly_sales, open_tables = [], closed_tables = [], voids = {} } = data;
  const voidsToday = voids.today || { count: 0, total: 0, by_reason: [], items: [] };
  const voidsJornada = voids.jornada || { count: 0, total: 0, by_reason: [], items: [] };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="font-mono text-white/60">{payload[0]?.payload?.hour}</p>
        <p className="font-oswald text-white text-base font-bold">{formatMoney(payload[0]?.value)}</p>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col" data-testid="dashboard-page">
      {/* Header - Glassmorphism */}
      <div className="px-4 py-3 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-orange-400" />
          <h1 className="font-oswald text-xl font-bold tracking-wide text-white">DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs animate-pulse border-orange-400 text-orange-400 bg-orange-400/10">EN VIVO</Badge>
          <span className="text-xs text-white/60 font-mono">{formatSystemDate(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Top KPI Row - Glassmorphism */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="kpi-cards">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-bl-full" />
              <DollarSign size={16} className="text-orange-400 mb-2" />
              <p className="text-[10px] text-white/50 uppercase tracking-wider">Ventas Hoy</p>
              <p className="font-oswald text-2xl font-bold text-orange-400 mt-1">{formatMoney(today.total_sales)}</p>
              <p className="text-[10px] text-white/50 mt-1">{today.bills_count} facturas | Promedio: {formatMoney(today.avg_ticket)}</p>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-bl-full" />
              <Banknote size={16} className="text-green-400 mb-2" />
              <p className="text-[10px] text-white/50 uppercase tracking-wider">Efectivo</p>
              <p className="font-oswald text-2xl font-bold text-green-400 mt-1">{formatMoney(today.cash)}</p>
              <div className="flex items-center gap-2 mt-1">
                <CreditCard size={10} className="text-blue-400" />
                <span className="text-[10px] text-blue-400 font-oswald">Tarjeta: {formatMoney(today.card)}</span>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full" />
              <TrendingUp size={16} className="text-blue-400 mb-2" />
              <p className="text-[10px] text-white/50 uppercase tracking-wider">ITBIS Recaudado</p>
              <p className="font-oswald text-2xl font-bold text-blue-400 mt-1">{formatMoney(today.itbis)}</p>
              <p className="text-[10px] text-white/50 mt-1">Propinas: {formatMoney(today.tips)}</p>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/10 rounded-bl-full" />
              <Utensils size={16} className="text-yellow-400 mb-2" />
              <p className="text-[10px] text-white/50 uppercase tracking-wider">Ocupacion</p>
              <p className="font-oswald text-2xl font-bold text-yellow-400 mt-1">{operations.occupancy_pct}%</p>
              <p className="text-[10px] text-white/50 mt-1">{operations.occupied_tables}/{operations.total_tables} mesas ocupadas</p>
            </div>
          </div>

          {/* Payment Methods Breakdown - Jornada */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="payment-breakdown">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Banknote size={18} className="text-green-500" />
              </div>
              <div>
                <p className="font-oswald text-lg font-bold text-green-500">{formatMoney(today.cash)}</p>
                <p className="text-[10px] text-muted-foreground">Efectivo</p>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <CreditCard size={18} className="text-blue-500" />
              </div>
              <div>
                <p className="font-oswald text-lg font-bold text-blue-500">{formatMoney(today.card)}</p>
                <p className="text-[10px] text-muted-foreground">Tarjeta</p>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <ArrowLeftRight size={18} className="text-purple-500" />
              </div>
              <div>
                <p className="font-oswald text-lg font-bold text-purple-500">{formatMoney(today.transfer || 0)}</p>
                <p className="text-[10px] text-muted-foreground">Transferencia</p>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Wallet size={18} className="text-amber-500" />
              </div>
              <div>
                <p className="font-oswald text-lg font-bold text-amber-500">{formatMoney(today.tips)}</p>
                <p className="text-[10px] text-muted-foreground">Propinas</p>
              </div>
            </div>
          </div>


          {/* Operations Row - Glassmorphism */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="operations-cards">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
                <Tag size={18} className="text-rose-400" />
              </div>
              <div>
                <p className="font-oswald text-xl font-bold text-rose-400">-{formatMoney(today.discounts || 0)}</p>
                <p className="text-[10px] text-white/50">Descuentos ({today.discounts_count || 0})</p>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <ShoppingCart size={18} className="text-orange-400" />
              </div>
              <div>
                <p className="font-oswald text-xl font-bold text-white">{operations.active_orders}</p>
                <p className="text-[10px] text-white/50">Ordenes Activas</p>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Clock size={18} className="text-green-400" />
              </div>
              <div>
                <p className="font-oswald text-xl font-bold text-white">{operations.open_shifts}</p>
                <p className="text-[10px] text-white/50">Turnos Abiertos</p>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${operations.inventory_alerts > 0 ? 'bg-red-500/20' : 'bg-white/5'}`}>
                <AlertTriangle size={18} className={operations.inventory_alerts > 0 ? 'text-red-400' : 'text-white/40'} />
              </div>
              <div>
                <p className={`font-oswald text-xl font-bold ${operations.inventory_alerts > 0 ? 'text-red-400' : 'text-white'}`}>{operations.inventory_alerts}</p>
                <p className="text-[10px] text-white/50">Alertas Inventario</p>
              </div>
            </div>
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                <Heart size={18} className="text-pink-400" />
              </div>
              <div>
                <p className="font-oswald text-xl font-bold text-white">{loyalty.total_customers}</p>
                <p className="text-[10px] text-white/50">Clientes Fidelidad</p>
              </div>
            </div>
          </div>

          {/* Open & Closed Tables - Glassmorphism */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="tables-section">
            {/* Open Tables */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <h3 className="font-oswald text-sm font-bold uppercase tracking-wider text-white/50">Mesas Abiertas</h3>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-oswald">{open_tables.length}</Badge>
              </div>
              {open_tables.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-4">No hay mesas abiertas</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {open_tables.map((t, i) => {
                    const mins = t.opened_at ? Math.floor((Date.now() - new Date(t.opened_at).getTime()) / 60000) : 0;
                    const timeStr = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
                    return (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10" data-testid={`open-table-${t.table_number}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <span className="font-oswald text-sm font-bold text-green-400">{t.table_number}</span>
                          </div>
                          <div>
                            <p className="text-xs text-white/70">{t.waiter || 'Sin mesero'}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Clock size={10} className="text-white/40" />
                              <span className="text-[10px] text-white/40 font-mono">{timeStr}</span>
                              <span className="text-[10px] text-white/30">|</span>
                              <span className="text-[10px] text-white/40">{t.items_count} items</span>
                            </div>
                          </div>
                        </div>
                        <p className="font-oswald text-base font-bold text-green-400">{formatMoney(t.consumption)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {open_tables.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-xs">
                  <span className="text-white/40">Total en mesas</span>
                  <span className="font-oswald font-bold text-green-400">{formatMoney(open_tables.reduce((s,t) => s + t.consumption, 0))}</span>
                </div>
              )}
            </div>

            {/* Closed Tables Today */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-blue-400" />
                  <h3 className="font-oswald text-sm font-bold uppercase tracking-wider text-white/50">Mesas Cerradas Hoy</h3>
                </div>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 font-oswald">{closed_tables.length}</Badge>
              </div>
              {closed_tables.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-4">No hay mesas cerradas hoy</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {closed_tables.map((t, i) => {
                    const paidTime = t.last_paid && t.last_paid.includes('T') ? t.last_paid.split('T')[1].slice(0,5) : '';
                    return (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10" data-testid={`closed-table-${t.table_number}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <span className="font-oswald text-sm font-bold text-blue-400">{t.table_number}</span>
                          </div>
                          <div>
                            <p className="text-xs text-white/70">{t.bills_count} factura{t.bills_count > 1 ? 's' : ''}</p>
                            {paidTime && <p className="text-[10px] text-white/40 font-mono mt-0.5">{paidTime}</p>}
                          </div>
                        </div>
                        <p className="font-oswald text-base font-bold text-blue-400">{formatMoney(t.total)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {closed_tables.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-xs">
                  <span className="text-white/40">Total facturado</span>
                  <span className="font-oswald font-bold text-blue-400">{formatMoney(closed_tables.reduce((s,t) => s + t.total, 0))}</span>
                </div>
              )}
            </div>
          </div>

          {/* Voids/Anulaciones Panel - Glassmorphism */}
          {(voidsToday.count > 0 || voidsJornada.count > 0) && (
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4" data-testid="voids-section">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <XCircle size={14} className="text-red-400" />
                  <h3 className="font-oswald text-sm font-bold uppercase tracking-wider text-white/50">Anulaciones</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Hoy */}
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] text-red-300/60 uppercase font-bold mb-1">Hoy (Tiempo Real)</p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-oswald text-2xl font-bold text-red-400">{voidsToday.count}</span>
                    <span className="text-xs text-white/40">anulaciones</span>
                  </div>
                  <p className="font-oswald text-base font-bold text-red-400 mt-1">{formatMoney(voidsToday.total)}</p>
                  {voidsToday.by_reason.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {voidsToday.by_reason.map((r, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-white/50 truncate mr-2">{r.reason}</span>
                          <span className="text-red-400 font-mono shrink-0">{r.count}x {formatMoney(r.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Jornada */}
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <p className="text-[10px] text-orange-300/60 uppercase font-bold mb-1">Jornada Operativa</p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-oswald text-2xl font-bold text-orange-400">{voidsJornada.count}</span>
                    <span className="text-xs text-white/40">anulaciones</span>
                  </div>
                  <p className="font-oswald text-base font-bold text-orange-400 mt-1">{formatMoney(voidsJornada.total)}</p>
                  {voidsJornada.by_reason.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {voidsJornada.by_reason.map((r, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-white/50 truncate mr-2">{r.reason}</span>
                          <span className="text-orange-400 font-mono shrink-0">{r.count}x {formatMoney(r.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Last voided items */}
              {voidsJornada.items.length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/10">
                  <p className="text-[10px] text-white/30 uppercase font-bold mb-1.5">Items Anulados Recientes</p>
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {voidsJornada.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-0.5" data-testid={`void-item-${i}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-red-400 font-mono">x{item.quantity}</span>
                          <span className="text-white/70">{item.product_name}</span>
                          <span className="text-white/30">— {item.reason}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-white/40">{item.requested_by}</span>
                          <span className="text-red-400 font-mono">{formatMoney(item.unit_price * item.quantity)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hourly Sales Chart - Glassmorphism */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4" data-testid="hourly-chart">
            <h3 className="font-oswald text-sm font-bold mb-3 uppercase tracking-wider text-white/50">Ventas por Hora - Hoy</h3>
            {hourly_sales.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={hourly_sales}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6600" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#FF6600" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="total" stroke="#FF6600" strokeWidth={2} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-white/40 text-sm">
                Las ventas del dia se mostraran aqui en tiempo real
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
