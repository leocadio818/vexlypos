import { useState } from 'react';
import axios from 'axios';
import { formatMoney } from './reportUtils';
import { FileDown, FileSpreadsheet, MapPin, Award, Users2 } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Deterministic area color palette (badge color) — theme-aware via opacity
const AREA_PALETTE = [
  'bg-primary/15 text-primary border-primary/40',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/40',
  'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/40',
  'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/40',
  'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/40',
];

const areaColor = (areas, name) => {
  const idx = areas.indexOf(name);
  return AREA_PALETTE[(idx >= 0 ? idx : 0) % AREA_PALETTE.length];
};

export default function SalesByTableReport({ data, dateRange }) {
  const [downloading, setDownloading] = useState(null);

  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p>;

  const summary = data.summary || {};
  const topTables = Array.isArray(data.top_tables) ? data.top_tables : [];
  const byArea = Array.isArray(data.by_area) ? data.by_area : [];
  const areaNames = byArea.map((a) => a.area);

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/sales-by-table/pdf'
        : '/api/reports/xlsx/sales-by-table/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `RankingMesas_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  if (topTables.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12" data-testid="sbt-empty">Sin datos para este período</p>;
  }

  return (
    <div className="space-y-4" data-testid="sales-by-table-report">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="sbt-kpi-tables">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <Users2 size={14} /> Mesas con Ventas
          </div>
          <p className="font-oswald text-2xl font-bold">{summary.tables_with_sales || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="sbt-kpi-areas">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <MapPin size={14} /> Áreas Activas
          </div>
          <p className="font-oswald text-2xl font-bold">{summary.areas_with_sales || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/40 rounded-xl p-4 text-center" data-testid="sbt-kpi-top-table">
          <div className="flex items-center justify-center gap-1.5 text-xs text-primary uppercase font-semibold mb-1">
            <Award size={14} /> Mesa Top
          </div>
          <p className="font-oswald text-xl font-bold text-primary truncate">{summary.top_table || '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatMoney(summary.top_table_total)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-green-600/5 border border-emerald-500/40 rounded-xl p-4 text-center" data-testid="sbt-kpi-top-area">
          <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-500 uppercase font-semibold mb-1">
            <MapPin size={14} /> Área Top
          </div>
          <p className="font-oswald text-xl font-bold text-emerald-500 truncate">{summary.top_area || '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatMoney(summary.top_area_total)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase">Ranking de Mesas por Ingreso</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="sbt-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="sbt-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {/* Top Tables */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="top-tables-table">
            <thead>
              <tr className="bg-foreground text-background print:bg-black print:text-white">
                <th className="text-center p-2 font-semibold">#</th>
                <th className="text-left p-2 font-semibold">Mesa</th>
                <th className="text-left p-2 font-semibold hidden sm:table-cell">Área</th>
                <th className="text-right p-2 font-semibold"># Tickets</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">Comensales</th>
                <th className="text-right p-2 font-semibold">Total</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">Ticket Prom.</th>
                <th className="text-right p-2 font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {topTables.map((t, i) => (
                <tr key={i} className="border-t border-border/40" data-testid={`sbt-row-${i}`}>
                  <td className="p-2 text-center font-bold text-muted-foreground">{i + 1}</td>
                  <td className="p-2 font-semibold">{t.table}</td>
                  <td className="p-2 hidden sm:table-cell">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${areaColor(areaNames, t.area)}`}>
                      {t.area}
                    </span>
                  </td>
                  <td className="p-2 text-right font-variant-numeric-tabular">{t.bills}</td>
                  <td className="p-2 text-right hidden md:table-cell font-variant-numeric-tabular">{t.guests}</td>
                  <td className="p-2 text-right font-oswald text-primary font-variant-numeric-tabular font-semibold">{formatMoney(t.total)}</td>
                  <td className="p-2 text-right hidden md:table-cell font-variant-numeric-tabular">{formatMoney(t.avg_ticket)}</td>
                  <td className="p-2 text-right font-variant-numeric-tabular">{t.pct.toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="sbt-grand-total">
                <td />
                <td className="p-3" colSpan={2}>TOTAL ({topTables.length})</td>
                <td className="p-3 text-right">{topTables.reduce((s, r) => s + (r.bills || 0), 0)}</td>
                <td className="p-3 text-right hidden md:table-cell">{topTables.reduce((s, r) => s + (r.guests || 0), 0)}</td>
                <td className="p-3 text-right font-oswald text-primary">{formatMoney(topTables.reduce((s, r) => s + (r.total || 0), 0))}</td>
                <td className="p-3 hidden md:table-cell" />
                <td className="p-3 text-right">
                  {formatMoney(0).replace('$0.00', '')}{topTables.reduce((s, r) => s + (r.pct || 0), 0).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* By Area */}
      {byArea.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4" data-testid="sbt-by-area">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ranking por Área</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-foreground text-background print:bg-black print:text-white">
                  <th className="text-left p-2 font-semibold">Área</th>
                  <th className="text-right p-2 font-semibold"># Tickets</th>
                  <th className="text-right p-2 font-semibold hidden sm:table-cell"># Mesas</th>
                  <th className="text-right p-2 font-semibold">Total</th>
                  <th className="text-right p-2 font-semibold hidden md:table-cell">Ticket Prom.</th>
                  <th className="text-left p-2 font-semibold hidden md:table-cell">Mesa Top</th>
                  <th className="text-right p-2 font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {byArea.map((a, i) => (
                  <tr key={i} className="border-t border-border/40" data-testid={`sbt-area-row-${i}`}>
                    <td className="p-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${areaColor(areaNames, a.area)}`}>
                        {a.area}
                      </span>
                    </td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{a.bills}</td>
                    <td className="p-2 text-right hidden sm:table-cell font-variant-numeric-tabular">{a.tables_count}</td>
                    <td className="p-2 text-right font-oswald text-primary font-variant-numeric-tabular font-semibold">{formatMoney(a.total)}</td>
                    <td className="p-2 text-right hidden md:table-cell font-variant-numeric-tabular">{formatMoney(a.avg_ticket)}</td>
                    <td className="p-2 hidden md:table-cell text-xs">{a.top_table}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{a.pct.toFixed(1)}%</td>
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
