import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatMoney } from '@/lib/api';
import { getSystemTimezone, formatSystemDate } from '@/lib/timezone';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, ShoppingCart, DollarSign, Utensils, AlertTriangle, Clock, CreditCard, Banknote, BarChart3, Heart, UtensilsCrossed, CheckCircle2, XCircle, Tag, ArrowLeftRight, Wallet } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { useSectionLayout, useScreenEditMode, useLongPress } from '@/hooks/useEditableGrid';
import { EditableCardGrid, EditModeBar } from '@/components/EditableCardGrid';
import TopLoyaltyCustomers from '@/components/TopLoyaltyCustomers';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Card ID constants
const KPI_IDS = ['ventas', 'efectivo', 'itbis', 'ocupacion'];
const PAY_IDS = ['tarjeta', 'transferencia', 'propinas', 'facturas'];
const OPS_IDS = ['descuentos', 'ordenes', 'anulaciones', 'turnos', 'alertas', 'fidelidad'];
const TABLE_IDS = ['mesas_abiertas', 'mesas_cerradas'];

export default function Dashboard() {
  const [data, setData] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      await getSystemTimezone();
      const res = await axios.get(`${API}/reports/dashboard`, { headers: headers() });
      setData(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Edit mode coordination
  const screen = useScreenEditMode();
  const kpiSection = useSectionLayout('dashboard', 'kpi', KPI_IDS);
  const paySection = useSectionLayout('dashboard', 'pay', PAY_IDS);
  const opsSection = useSectionLayout('dashboard', 'ops', OPS_IDS);
  const tableSection = useSectionLayout('dashboard', 'tables', TABLE_IDS);

  // Register all sections
  const allSections = useMemo(() => [kpiSection, paySection, opsSection, tableSection], [kpiSection, paySection, opsSection, tableSection]);
  useEffect(() => { screen.registerSection(allSections); }, [allSections, screen.registerSection]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAnyHidden = kpiSection.hasHiddenCards || paySection.hasHiddenCards || opsSection.hasHiddenCards || tableSection.hasHiddenCards;
  const longPress = useLongPress(screen.enterEditMode, 900);

  if (!data) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  const { today, operations, loyalty, hourly_sales, open_tables = [], closed_tables = [], voids = {}, jornada = {} } = data;
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

  // ── Card renderers ──
  const renderKpi = (id) => {
    const cards = {
      ventas: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden h-full" data-testid="kpi-ventas">
          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-bl-full" />
          <DollarSign size={16} className="text-orange-400 mb-2" />
          <p className="text-xs text-white/80 uppercase tracking-wider font-semibold">Ventas Hoy</p>
          <p className="font-oswald text-2xl font-bold text-orange-400 mt-1">{formatMoney(today.total_sales)}</p>
          <p className="text-xs text-white/70 mt-1">{today.bills_count} facturas | Promedio: {formatMoney(today.avg_ticket)}</p>
        </div>
      ),
      efectivo: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden h-full" data-testid="kpi-efectivo">
          <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-bl-full" />
          <Banknote size={16} className="text-green-400 mb-2" />
          <p className="text-xs text-white/80 uppercase tracking-wider font-semibold">Efectivo</p>
          <p className="font-oswald text-2xl font-bold text-green-400 mt-1">{formatMoney(today.cash)}</p>
        </div>
      ),
      itbis: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden h-full" data-testid="kpi-itbis">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full" />
          <TrendingUp size={16} className="text-blue-400 mb-2" />
          <p className="text-xs text-white/80 uppercase tracking-wider font-semibold">ITBIS Recaudado</p>
          <p className="font-oswald text-2xl font-bold text-blue-400 mt-1">{formatMoney(today.itbis)}</p>
          <p className="text-xs text-white/70 mt-1">Propinas: {formatMoney(today.tips)}</p>
        </div>
      ),
      ocupacion: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 relative overflow-hidden h-full" data-testid="kpi-ocupacion">
          <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/10 rounded-bl-full" />
          <Utensils size={16} className="text-yellow-400 mb-2" />
          <p className="text-xs text-white/80 uppercase tracking-wider font-semibold">Ocupacion</p>
          <p className="font-oswald text-2xl font-bold text-yellow-400 mt-1">{operations.occupancy_pct}%</p>
          <p className="text-xs text-white/70 mt-1">{operations.occupied_tables}/{operations.total_tables} mesas ocupadas</p>
        </div>
      ),
    };
    return cards[id] || null;
  };

  const renderPay = (id) => {
    const cards = {
      tarjeta: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="pay-tarjeta">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0"><CreditCard size={18} className="text-blue-500" /></div>
          <div><p className="font-oswald text-lg font-bold text-blue-500">{formatMoney(today.card)}</p><p className="text-xs text-muted-foreground font-medium">Tarjeta</p></div>
        </div>
      ),
      transferencia: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="pay-transferencia">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0"><ArrowLeftRight size={18} className="text-purple-500" /></div>
          <div><p className="font-oswald text-lg font-bold text-purple-500">{formatMoney(today.transfer || 0)}</p><p className="text-xs text-muted-foreground font-medium">Transferencia</p></div>
        </div>
      ),
      propinas: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="pay-propinas">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0"><Wallet size={18} className="text-amber-500" /></div>
          <div><p className="font-oswald text-lg font-bold text-amber-500">{formatMoney(today.tips)}</p><p className="text-xs text-muted-foreground font-medium">Propinas</p></div>
        </div>
      ),
      facturas: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="pay-facturas">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0"><UtensilsCrossed size={18} className="text-cyan-400" /></div>
          <div><p className="font-oswald text-lg font-bold text-cyan-400 notranslate">{today.bills_count}</p><p className="text-xs text-muted-foreground font-medium">Facturas</p></div>
        </div>
      ),
    };
    return cards[id] || null;
  };

  const renderOps = (id) => {
    const cards = {
      descuentos: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="ops-descuentos">
          <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0"><Tag size={18} className="text-rose-400" /></div>
          <div><p className="font-oswald text-xl font-bold text-rose-400">-{formatMoney(today.discounts || 0)}</p><p className="text-xs text-white/70 font-medium">Descuentos ({today.discounts_count || 0})</p></div>
        </div>
      ),
      ordenes: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="ops-ordenes">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0"><ShoppingCart size={18} className="text-orange-400" /></div>
          <div><p className="font-oswald text-xl font-bold text-white">{operations.active_orders}</p><p className="text-xs text-white/70 font-medium">Ordenes Activas</p></div>
        </div>
      ),
      anulaciones: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="ops-anulaciones">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0"><XCircle size={18} className="text-red-400" /></div>
          <div><p className="font-oswald text-xl font-bold text-red-400">-{formatMoney(voidsToday.total)}</p><p className="text-xs text-white/70 font-medium">Anulaciones ({voidsToday.count})</p></div>
        </div>
      ),
      turnos: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="ops-turnos">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0"><Clock size={18} className="text-green-400" /></div>
          <div><p className="font-oswald text-xl font-bold text-white">{operations.open_shifts}</p><p className="text-xs text-white/70 font-medium">Turnos Abiertos</p></div>
        </div>
      ),
      alertas: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="ops-alertas">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${operations.inventory_alerts > 0 ? 'bg-red-500/20' : 'bg-white/5'}`}>
            <AlertTriangle size={18} className={operations.inventory_alerts > 0 ? 'text-red-400' : 'text-white/60'} />
          </div>
          <div><p className={`font-oswald text-xl font-bold ${operations.inventory_alerts > 0 ? 'text-red-400' : 'text-white'}`}>{operations.inventory_alerts}</p><p className="text-xs text-white/70 font-medium">Alertas Inventario</p></div>
        </div>
      ),
      fidelidad: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3 h-full" data-testid="ops-fidelidad">
          <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center shrink-0"><Heart size={18} className="text-pink-400" /></div>
          <div><p className="font-oswald text-xl font-bold text-white">{loyalty.total_customers}</p><p className="text-xs text-white/70 font-medium">Clientes Fidelidad</p></div>
        </div>
      ),
    };
    return cards[id] || null;
  };

  const renderTable = (id) => {
    const cards = {
      mesas_abiertas: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 h-full" data-testid="table-open">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><h3 className="font-oswald text-sm font-bold uppercase tracking-wider text-white/50">Mesas Abiertas</h3></div>
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
                      <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center"><span className="font-oswald text-sm font-bold text-green-400">{t.table_number}</span></div>
                      <div>
                        <p className="text-xs text-white/70">{t.waiter || 'Sin mesero'} {t.transaction_number ? <span className="text-green-400 font-mono">T-{t.transaction_number}</span> : ''}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock size={10} className="text-white/60" /><span className="text-xs text-white/60 font-mono">{timeStr}</span>
                          <span className="text-xs text-white/50">|</span><span className="text-xs text-white/60">{t.items_count} items</span>
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
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total en mesas</span>
              <span className="font-oswald font-black text-2xl text-green-400">{formatMoney(open_tables.reduce((s,t) => s + t.consumption, 0))}</span>
            </div>
          )}
        </div>
      ),
      mesas_cerradas: (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 h-full" data-testid="table-closed">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><CheckCircle2 size={12} className="text-blue-400" /><h3 className="font-oswald text-sm font-bold uppercase tracking-wider text-white/50">Mesas Cerradas Hoy</h3></div>
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
                      <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center"><span className="font-oswald text-sm font-bold text-blue-400">{t.table_number}</span></div>
                      <div>
                        <p className="text-xs text-white/70">{t.bills_count} factura{t.bills_count > 1 ? 's' : ''}</p>
                        {paidTime && <p className="text-xs text-white/60 font-mono mt-0.5">{paidTime}</p>}
                      </div>
                    </div>
                    <p className="font-oswald text-base font-bold text-blue-400">{formatMoney(t.total)}</p>
                  </div>
                );
              })}
            </div>
          )}
          {closed_tables.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total facturado</span>
              <span className="font-oswald font-black text-2xl text-primary">{formatMoney(closed_tables.reduce((s,t) => s + t.total, 0))}</span>
            </div>
          )}
        </div>
      ),
    };
    return cards[id] || null;
  };

  return (
    <div className="h-full flex flex-col" data-testid="dashboard-page">
      {/* Edit mode bar */}
      {screen.editMode && (
        <EditModeBar onSave={screen.save} onCancel={screen.cancel} onRestore={screen.restore} hasHiddenCards={hasAnyHidden} />
      )}

      {/* Header */}
      <div className={`px-4 py-3 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-between ${screen.editMode ? 'mt-11' : ''}`}>
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-orange-400" />
          <h1 className="font-oswald text-xl font-bold tracking-wide text-white">DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-xs ${jornada.status === 'open' ? 'animate-pulse border-green-400 text-green-400 bg-green-400/10' : 'border-orange-400 text-orange-400 bg-orange-400/10'}`}>
            {jornada.status === 'open' ? 'JORNADA ACTIVA' : 'SIN JORNADA'}
          </Badge>
          <span className="text-xs text-white/60 font-mono">{jornada.date || formatSystemDate(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
        </div>
      </div>

      <div className="flex-1 p-4 pb-28 sm:pb-4 overflow-auto" {...(screen.isAdmin && !screen.editMode ? longPress : {})}>
        <div className="max-w-6xl mx-auto space-y-4">

          {/* KPI Cards */}
          <EditableCardGrid
            editMode={screen.editMode}
            visibleCards={kpiSection.visibleCards}
            cardOrder={kpiSection.cardOrder}
            reorder={kpiSection.reorder}
            hideCard={kpiSection.hideCard}
            renderCard={renderKpi}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
            data-testid="kpi-cards"
          />

          {/* Payment Breakdown */}
          <EditableCardGrid
            editMode={screen.editMode}
            visibleCards={paySection.visibleCards}
            cardOrder={paySection.cardOrder}
            reorder={paySection.reorder}
            hideCard={paySection.hideCard}
            renderCard={renderPay}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
            data-testid="payment-breakdown"
          />

          {/* Operations */}
          <EditableCardGrid
            editMode={screen.editMode}
            visibleCards={opsSection.visibleCards}
            cardOrder={opsSection.cardOrder}
            reorder={opsSection.reorder}
            hideCard={opsSection.hideCard}
            renderCard={renderOps}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
            data-testid="operations-cards"
          />

          {/* Tables */}
          <EditableCardGrid
            editMode={screen.editMode}
            visibleCards={tableSection.visibleCards}
            cardOrder={tableSection.cardOrder}
            reorder={tableSection.reorder}
            hideCard={tableSection.hideCard}
            renderCard={renderTable}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
            data-testid="tables-section"
          />

          {/* Anulaciones — Single unified card (Jornada source) */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4" data-testid="voids-section">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <XCircle size={14} className="text-orange-400" />
                <h3 className="font-oswald text-sm font-bold uppercase tracking-wider text-white/50">Anulaciones</h3>
              </div>
            </div>
            <p className="text-[11px] text-white/40 mb-3">
              {jornada.status === 'open' && jornada.opened_at
                ? `Jornada activa desde ${new Date(jornada.opened_at).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : 'Sin jornada activa'}
            </p>
            {voidsJornada.count === 0 ? (
              <p className="text-xs text-white/30 text-center py-4">Sin anulaciones en esta jornada</p>
            ) : (
              <>
                {/* Summary row */}
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="font-oswald text-3xl font-bold text-white">{voidsJornada.count}</span>
                  <span className="text-xs text-white/50">anulaciones</span>
                  <span className="font-oswald text-xl font-bold text-orange-400 ml-auto">{formatMoney(voidsJornada.total)}</span>
                </div>
                {/* Detail list by reason */}
                {voidsJornada.by_reason.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {voidsJornada.by_reason.slice(0, 5).map((r, i) => (
                      <div key={i} className="flex items-center text-xs py-1 px-2 rounded bg-white/5 gap-2">
                        <span className="text-white/70 truncate flex-1">{r.reason}</span>
                        <span className="text-white/50 shrink-0">{r.count} {r.count === 1 ? 'anulacion' : 'anulaciones'}</span>
                        <span className="text-orange-400 font-mono font-bold shrink-0">{formatMoney(r.total)}</span>
                      </div>
                    ))}
                    {voidsJornada.by_reason.length > 5 && (
                      <p className="text-[11px] text-orange-400/70 text-right cursor-pointer hover:text-orange-300">Ver todas ({voidsJornada.by_reason.length})</p>
                    )}
                  </div>
                )}
                {/* Recent items */}
                {voidsJornada.items.length > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-1 max-h-[100px] overflow-y-auto">
                    {voidsJornada.items.slice(0, 5).map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-0.5" data-testid={`void-item-${i}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-red-400 font-mono shrink-0">x{item.quantity}</span>
                          <span className="text-white/60 truncate">{item.product_name}</span>
                          <span className="text-white/25 shrink-0">— {item.reason}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-white/40">{item.requested_by}</span>
                          <span className="text-red-400 font-mono">{formatMoney(item.unit_price * item.quantity)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <p className="text-[10px] text-white/20 mt-3 text-right">Actualizado en tiempo real</p>
          </div>

          {/* Hourly Sales Chart */}
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
              <div className="flex items-center justify-center h-40 text-white/60 text-sm">
                Las ventas del dia se mostraran aqui en tiempo real
              </div>
            )}
          </div>

          {/* Top Clientes Fieles */}
          <TopLoyaltyCustomers />
        </div>
      </div>
    </div>
  );
}
