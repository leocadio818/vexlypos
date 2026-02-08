import { useState, useEffect, useCallback } from 'react';
import { formatMoney } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, ShoppingCart, DollarSign, Utensils, AlertTriangle, Clock, CreditCard, Banknote, BarChart3, Heart } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function Dashboard() {
  const [data, setData] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
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

  const { today, operations, loyalty, hourly_sales } = data;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="font-mono text-muted-foreground">{payload[0]?.payload?.hour}</p>
        <p className="font-oswald text-primary text-base font-bold">{formatMoney(payload[0]?.value)}</p>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col" data-testid="dashboard-page">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs animate-pulse border-primary text-primary">EN VIVO</Badge>
          <span className="text-xs text-muted-foreground font-mono">{new Date().toLocaleDateString('es-DO')}</span>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Top KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="kpi-cards">
            <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full" />
              <DollarSign size={16} className="text-primary mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ventas Hoy</p>
              <p className="font-oswald text-2xl font-bold text-primary mt-1">{formatMoney(today.total_sales)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{today.bills_count} facturas | Promedio: {formatMoney(today.avg_ticket)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/5 rounded-bl-full" />
              <Banknote size={16} className="text-green-400 mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Efectivo</p>
              <p className="font-oswald text-2xl font-bold text-green-400 mt-1">{formatMoney(today.cash)}</p>
              <div className="flex items-center gap-2 mt-1">
                <CreditCard size={10} className="text-blue-400" />
                <span className="text-[10px] text-blue-400 font-oswald">Tarjeta: {formatMoney(today.card)}</span>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-bl-full" />
              <TrendingUp size={16} className="text-blue-400 mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ITBIS Recaudado</p>
              <p className="font-oswald text-2xl font-bold text-blue-400 mt-1">{formatMoney(today.itbis)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Propinas: {formatMoney(today.tips)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/5 rounded-bl-full" />
              <Utensils size={16} className="text-yellow-400 mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ocupacion</p>
              <p className="font-oswald text-2xl font-bold text-yellow-400 mt-1">{operations.occupancy_pct}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">{operations.occupied_tables}/{operations.total_tables} mesas ocupadas</p>
            </div>
          </div>

          {/* Operations Row */}
          <div className="grid grid-cols-4 gap-3" data-testid="operations-cards">
            <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart size={18} className="text-primary" />
              </div>
              <div>
                <p className="font-oswald text-xl font-bold">{operations.active_orders}</p>
                <p className="text-[10px] text-muted-foreground">Ordenes Activas</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Clock size={18} className="text-green-400" />
              </div>
              <div>
                <p className="font-oswald text-xl font-bold">{operations.open_shifts}</p>
                <p className="text-[10px] text-muted-foreground">Turnos Abiertos</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${operations.inventory_alerts > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                <AlertTriangle size={18} className={operations.inventory_alerts > 0 ? 'text-destructive' : 'text-muted-foreground'} />
              </div>
              <div>
                <p className={`font-oswald text-xl font-bold ${operations.inventory_alerts > 0 ? 'text-destructive' : ''}`}>{operations.inventory_alerts}</p>
                <p className="text-[10px] text-muted-foreground">Alertas Inventario</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                <Heart size={18} className="text-pink-400" />
              </div>
              <div>
                <p className="font-oswald text-xl font-bold">{loyalty.total_customers}</p>
                <p className="text-[10px] text-muted-foreground">Clientes Fidelidad</p>
              </div>
            </div>
          </div>

          {/* Hourly Sales Chart */}
          <div className="bg-card border border-border rounded-xl p-4" data-testid="hourly-chart">
            <h3 className="font-oswald text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground">Ventas por Hora - Hoy</h3>
            {hourly_sales.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={hourly_sales}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6600" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FF6600" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="total" stroke="#FF6600" strokeWidth={2} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Las ventas del dia se mostraran aqui en tiempo real
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
