import { useState } from 'react';
import axios from 'axios';
import { FileDown, FileSpreadsheet, Clock, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { formatMoney, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CustomTooltip } from './reportUtils';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function HourlySalesReport({ data: reportData, dateRange }) {
  const data = Array.isArray(reportData) ? reportData : [];
  const [downloading, setDownloading] = useState(null);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12" data-testid="hourly-empty">Sin datos para este período</p>;
  }

  const grandTotal = data.reduce((s, r) => s + (r.total || 0), 0);
  const grandBills = data.reduce((s, r) => s + (r.bills || 0), 0);
  const hoursWithSales = data.filter((r) => (r.bills || 0) > 0);

  // Format with range label e.g. "08:00-09:00"
  const rows = data.map((r) => {
    const h = parseInt((r.hour || '00:00').slice(0, 2), 10);
    const next = (h + 1) % 24;
    const range = `${String(h).padStart(2, '0')}:00-${String(next).padStart(2, '0')}:00`;
    const avg = r.bills > 0 ? r.total / r.bills : 0;
    const pct = grandTotal > 0 ? (r.total / grandTotal) * 100 : 0;
    return { ...r, range, avg, pct };
  });

  // KPIs
  const peak = hoursWithSales.length
    ? hoursWithSales.reduce((a, b) => (b.total > a.total ? b : a))
    : null;
  const valley = hoursWithSales.length
    ? hoursWithSales.reduce((a, b) => (b.total < a.total ? b : a))
    : null;
  const avgPerHour = hoursWithSales.length ? grandTotal / hoursWithSales.length : 0;

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/hourly-sales/pdf'
        : '/api/reports/xlsx/hourly-sales/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `VentasPorHora_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  // Chart data: only hours with activity, shorter label for axis
  const chartData = rows.map((r) => ({ hour: r.range.slice(0, 5), total: r.total, bills: r.bills }));

  return (
    <div className="space-y-4" data-testid="hourly-sales-report">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4" data-testid="kpi-peak">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <TrendingUp size={14} className="text-emerald-500" /> Hora Pico
          </div>
          <p className="font-oswald text-2xl font-bold text-emerald-500">{peak ? peak.hour : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{peak ? formatMoney(peak.total) : '-'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="kpi-valley">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <TrendingDown size={14} className="text-red-500" /> Hora Valle
          </div>
          <p className="font-oswald text-2xl font-bold text-red-500">{valley ? valley.hour : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{valley ? formatMoney(valley.total) : '-'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="kpi-avg">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <Clock size={14} className="text-primary" /> Promedio por Hora
          </div>
          <p className="font-oswald text-2xl font-bold text-primary">{formatMoney(avgPerHour)}</p>
          <p className="text-xs text-muted-foreground mt-1">{hoursWithSales.length} hora(s) con actividad</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-muted-foreground" />
          <h4 className="text-xs font-bold uppercase">Distribución de Ventas por Hora</h4>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="hourly-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="hourly-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="hourly-sales-table">
            <thead>
              <tr className="bg-foreground text-background print:bg-black print:text-white">
                <th className="text-left p-2 font-semibold">Hora</th>
                <th className="text-right p-2 font-semibold"># Facturas</th>
                <th className="text-right p-2 font-semibold">Total Ventas</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">Ticket Prom.</th>
                <th className="text-right p-2 font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isPeak = peak && r.hour === peak.hour;
                const isEmpty = (r.bills || 0) === 0;
                return (
                  <tr
                    key={i}
                    className={`border-t border-border/40 ${isPeak ? 'bg-emerald-500/5 font-semibold' : ''} ${isEmpty ? 'text-muted-foreground/60' : ''}`}
                    data-testid={`hourly-row-${i}`}
                  >
                    <td className="p-2 font-mono text-xs">{r.range}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{r.bills || 0}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(r.total)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden md:table-cell">{formatMoney(r.avg)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{r.pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="hourly-grand-total">
                <td className="p-3">TOTAL GENERAL</td>
                <td className="p-3 text-right font-variant-numeric-tabular">{grandBills}</td>
                <td className="p-3 text-right font-oswald text-primary font-variant-numeric-tabular">{formatMoney(grandTotal)}</td>
                <td className="p-3 text-right font-variant-numeric-tabular hidden md:table-cell">
                  {formatMoney(grandBills > 0 ? grandTotal / grandBills : 0)}
                </td>
                <td className="p-3 text-right">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-card border border-border rounded-xl p-4 print:hidden" data-testid="hourly-chart">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Gráfico de Ventas por Hora</h4>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" fill="#FF6600" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
