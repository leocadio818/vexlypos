import { useState } from 'react';
import axios from 'axios';
import { formatMoney, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CustomTooltip } from './reportUtils';
import { FileDown, FileSpreadsheet, Sparkles, TrendingUp, Flame, PiggyBank, Award, BarChart3 } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function PromotionsAnalyticsReport({ data, dateRange }) {
  const [downloading, setDownloading] = useState(null);

  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p>;

  const summary = data.summary || {};
  const promotions = Array.isArray(data.promotions) ? data.promotions : [];
  const topProducts = Array.isArray(data.top_products) ? data.top_products : [];
  const chartData = promotions.slice(0, 8).map(p => ({
    name: (p.promotion_name || '—').slice(0, 14),
    net: p.net_sold,
    discount: p.discount_given,
  }));

  const download = async (format) => {
    const df = dateRange?.from;
    const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/promotions-analytics/pdf'
        : '/api/reports/xlsx/promotions-analytics/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `AnalyticsPromociones_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-4" data-testid="promotions-analytics-report">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4" data-testid="pa-kpi-net-sold">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <TrendingUp size={14} className="text-emerald-500" /> Ventas con Promo
          </div>
          <p className="font-oswald text-2xl font-bold text-emerald-500">{formatMoney(summary.total_net_sold)}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary.total_bills_with_promo || 0} facturas · {summary.pct_bills_with_promo?.toFixed(1) || '0.0'}%</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="pa-kpi-discount">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <PiggyBank size={14} className="text-orange-400" /> Ahorro Entregado
          </div>
          <p className="font-oswald text-2xl font-bold text-orange-400">{formatMoney(summary.total_discount_given)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatMoney(summary.avg_savings_per_bill)} / factura prom.</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="pa-kpi-winner">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <Award size={14} className="text-yellow-500" /> Promo Ganadora
          </div>
          <p className="font-oswald text-lg font-bold text-yellow-500 truncate">{summary.winner_name || '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatMoney(summary.winner_net)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="pa-kpi-items">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <Flame size={14} className="text-red-500" /> Items Vendidos
          </div>
          <p className="font-oswald text-2xl font-bold text-red-500">{Math.round(summary.total_items_with_promo || 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary.active_promotions_count || 0} promo(s) activa(s)</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-orange-400" />
          <h4 className="text-xs font-bold uppercase">Desglose por Promoción</h4>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => download('pdf')} disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="pa-download-pdf-btn">
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'PDF'}
          </button>
          <button onClick={() => download('xlsx')} disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="pa-download-xlsx-btn">
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Promotions table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="promos-table">
            <thead>
              <tr className="bg-foreground text-background">
                <th className="text-left p-2 font-semibold">Promoción</th>
                <th className="text-right p-2 font-semibold">Facturas</th>
                <th className="text-right p-2 font-semibold hidden sm:table-cell">Items</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">Bruto</th>
                <th className="text-right p-2 font-semibold">Descuento</th>
                <th className="text-right p-2 font-semibold">Neto</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">Ticket Prom.</th>
                <th className="text-right p-2 font-semibold hidden lg:table-cell">Desc. %</th>
              </tr>
            </thead>
            <tbody>
              {promotions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground text-xs">
                    No hay ventas con promociones en el período seleccionado
                  </td>
                </tr>
              ) : (
                promotions.map((p, i) => (
                  <tr key={i} className="border-t border-border/40 hover:bg-muted/20" data-testid={`promo-row-${i}`}>
                    <td className="p-2 font-semibold flex items-center gap-1.5">
                      <span className="text-orange-400">🔥</span>
                      <span className="truncate">{p.promotion_name}</span>
                    </td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{p.bills_count}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden sm:table-cell">{Math.round(p.items_count)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden md:table-cell text-muted-foreground">{formatMoney(p.gross_sold)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular text-orange-400">-{formatMoney(p.discount_given)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular font-bold text-emerald-500">{formatMoney(p.net_sold)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden md:table-cell">{formatMoney(p.avg_ticket)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden lg:table-cell">{p.avg_discount_pct?.toFixed(1) || '0.0'}%</td>
                  </tr>
                ))
              )}
              {promotions.length > 0 && (
                <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="promos-grand-total">
                  <td className="p-3">TOTAL</td>
                  <td className="p-3 text-right font-variant-numeric-tabular">{summary.total_bills_with_promo || 0}</td>
                  <td className="p-3 text-right font-variant-numeric-tabular hidden sm:table-cell">{Math.round(summary.total_items_with_promo || 0)}</td>
                  <td className="p-3 text-right font-variant-numeric-tabular hidden md:table-cell text-muted-foreground">{formatMoney(summary.total_gross_sold)}</td>
                  <td className="p-3 text-right font-variant-numeric-tabular text-orange-400">-{formatMoney(summary.total_discount_given)}</td>
                  <td className="p-3 text-right font-oswald text-emerald-500 font-variant-numeric-tabular">{formatMoney(summary.total_net_sold)}</td>
                  <td className="p-3 hidden md:table-cell" />
                  <td className="p-3 hidden lg:table-cell" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 print:hidden" data-testid="pa-chart">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
            <BarChart3 size={12} /> Ventas Netas por Promoción
          </h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="net" fill="#10b981" radius={[4, 4, 0, 0]} name="Neto" />
              <Bar dataKey="discount" fill="#f97316" radius={[4, 4, 0, 0]} name="Descuento" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top products */}
      {topProducts.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <Flame size={14} className="text-red-500" />
            <h4 className="text-xs font-bold uppercase">Top 20 Productos Vendidos con Promoción</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="top-products-table">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left p-2 font-semibold">#</th>
                  <th className="text-left p-2 font-semibold">Producto</th>
                  <th className="text-right p-2 font-semibold">Cant.</th>
                  <th className="text-right p-2 font-semibold hidden sm:table-cell">Bruto</th>
                  <th className="text-right p-2 font-semibold">Descuento</th>
                  <th className="text-right p-2 font-semibold">Neto</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i} className="border-t border-border/40" data-testid={`top-product-row-${i}`}>
                    <td className="p-2 text-muted-foreground font-variant-numeric-tabular">{i + 1}</td>
                    <td className="p-2 font-medium truncate">{p.product_name}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{Math.round(p.qty_sold)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden sm:table-cell text-muted-foreground">{formatMoney(p.gross_sold)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular text-orange-400">-{formatMoney(p.discount_given)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular font-semibold text-emerald-500">{formatMoney(p.net_sold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
