import { Sparkline, CustomTooltip, formatMoney, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ArrowUpRight, ArrowDownRight, Minus } from './reportUtils';

export default function DailySalesReport({ data, sparklineData }) {
  const sparkData = (sparklineData || []).map(d => d.total);
  const trend = sparkData.length > 1 ? ((sparkData[sparkData.length - 1] - sparkData[0]) / (sparkData[0] || 1) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-emerald-400 uppercase tracking-wider">Total Ventas</p>
          <p className="font-oswald text-2xl font-bold text-emerald-400">{formatMoney(data.total_sales)}</p>
          <div className="flex items-center justify-center gap-1 text-xs mt-1">
            <Sparkline data={sparkData} color="#10b981" />
            {trend > 0 ? <ArrowUpRight size={12} className="text-green-400" /> : trend < 0 ? <ArrowDownRight size={12} className="text-red-400" /> : <Minus size={12} />}
            <span className={trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-muted-foreground'}>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Facturas</p>
          <p className="font-oswald text-2xl font-bold">{data.total_bills}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">ITBIS 18%</p>
          <p className="font-oswald text-xl font-bold text-blue-400">{formatMoney(data.total_itbis)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Propinas</p>
          <p className="font-oswald text-xl font-bold text-yellow-400">{formatMoney(data.total_tips)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Efectivo</p>
          <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.cash_sales)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Tarjeta</p>
          <p className="font-oswald text-xl font-bold text-purple-400">{formatMoney(data.card_sales)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Tendencia 7 días</h4>
        {sparklineData?.length > 0 && (
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={sparklineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="day_name" tick={{ fontSize: 10, fill: '#666' }} />
              <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="total" stroke="#FF6600" fill="#FF6600" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
