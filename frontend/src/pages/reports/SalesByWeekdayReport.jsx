import { useState } from 'react';
import axios from 'axios';
import { formatMoney, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CustomTooltip } from './reportUtils';
import { FileDown, FileSpreadsheet, TrendingUp, TrendingDown, CalendarDays, BarChart3 } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function SalesByWeekdayReport({ data, dateRange }) {
  const [downloading, setDownloading] = useState(null);

  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p>;

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const summary = data.summary || {};
  const chartData = rows.map((r) => ({ weekday: r.short, total: r.total, bills: r.bills }));

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/sales-by-weekday/pdf'
        : '/api/reports/xlsx/sales-by-weekday/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `VentasPorDiaSemana_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-4" data-testid="sales-by-weekday-report">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4" data-testid="wd-kpi-peak">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <TrendingUp size={14} className="text-emerald-500" /> Día Pico
          </div>
          <p className="font-oswald text-2xl font-bold text-emerald-500">{summary.peak_weekday || '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatMoney(summary.peak_total)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="wd-kpi-valley">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <TrendingDown size={14} className="text-red-500" /> Día Valle
          </div>
          <p className="font-oswald text-2xl font-bold text-red-500">{summary.valley_weekday || '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatMoney(summary.valley_total)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="wd-kpi-best-avg">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase font-semibold">
            <CalendarDays size={14} className="text-primary" /> Mejor Promedio/Día
          </div>
          <p className="font-oswald text-2xl font-bold text-primary">{summary.best_avg_weekday || '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatMoney(summary.best_avg_per_day)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-muted-foreground" />
          <h4 className="text-xs font-bold uppercase">Distribución por Día de la Semana</h4>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="wd-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="wd-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="weekday-table">
            <thead>
              <tr className="bg-foreground text-background print:bg-black print:text-white">
                <th className="text-left p-2 font-semibold">Día</th>
                <th className="text-right p-2 font-semibold"># Facturas</th>
                <th className="text-right p-2 font-semibold">Total</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">Ticket Prom.</th>
                <th className="text-right p-2 font-semibold hidden sm:table-cell">Días Obs.</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">Prom./Día</th>
                <th className="text-right p-2 font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isPeak = r.weekday === summary.peak_weekday && r.bills > 0;
                const isEmpty = r.bills === 0;
                return (
                  <tr
                    key={i}
                    className={`border-t border-border/40 ${isPeak ? 'bg-emerald-500/5 font-semibold' : ''} ${isEmpty ? 'text-muted-foreground/60' : ''}`}
                    data-testid={`wd-row-${i}`}
                  >
                    <td className="p-2 font-semibold">{r.weekday}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{r.bills}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(r.total)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden md:table-cell">{formatMoney(r.avg_ticket)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden sm:table-cell">{r.days_observed}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular hidden md:table-cell">{formatMoney(r.avg_per_day)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{r.pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="wd-grand-total">
                <td className="p-3">TOTAL</td>
                <td className="p-3 text-right font-variant-numeric-tabular">{summary.grand_bills || 0}</td>
                <td className="p-3 text-right font-oswald text-primary font-variant-numeric-tabular">{formatMoney(summary.grand_total)}</td>
                <td className="p-3 text-right hidden md:table-cell">
                  {formatMoney((summary.grand_bills && summary.grand_total) ? summary.grand_total / summary.grand_bills : 0)}
                </td>
                <td className="p-3 hidden sm:table-cell" />
                <td className="p-3 hidden md:table-cell" />
                <td className="p-3 text-right">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-card border border-border rounded-xl p-4 print:hidden" data-testid="wd-chart">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ventas Totales por Día</h4>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <XAxis dataKey="weekday" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" fill="#FF6600" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
