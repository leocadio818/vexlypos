import { useState } from 'react';
import axios from 'axios';
import { formatMoney } from './reportUtils';
import { FileDown, FileSpreadsheet, AlertTriangle, Clock, Receipt, Users, TrendingUp } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtDT = (iso) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${dd}/${mm}/${yyyy} ${h}:${m} ${ampm}`;
  } catch { return iso; }
};

const ageBadgeClass = (min) => {
  if (min >= 120) return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40';
  if (min >= 60) return 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/40';
  return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40';
};

export default function OpenChecksReport({ data, dateRange }) {
  const [downloading, setDownloading] = useState(null);

  if (!data?.summary) {
    return <p className="text-sm text-muted-foreground text-center py-12" data-testid="open-checks-empty">Cargando…</p>;
  }

  const bills = Array.isArray(data.bills) ? data.bills : [];
  const summary = data.summary || {};
  const byWaiter = Array.isArray(data.by_waiter) ? data.by_waiter : [];

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/open-checks/pdf'
        : '/api/reports/xlsx/open-checks/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `CuentasAbiertas_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-4" data-testid="open-checks-report">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="oc-kpi-count">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <Receipt size={14} /> Cuentas Abiertas
          </div>
          <p className="font-oswald text-2xl font-bold">{summary.count || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500/15 to-rose-600/10 border border-red-500/30 rounded-xl p-4 text-center" data-testid="oc-kpi-value">
          <div className="flex items-center justify-center gap-1.5 text-xs text-red-400 uppercase font-semibold mb-1">
            <AlertTriangle size={14} /> Monto en Riesgo
          </div>
          <p className="font-oswald text-2xl font-bold text-red-500">{formatMoney(summary.total_value)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="oc-kpi-oldest">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <Clock size={14} /> Más Antigua
          </div>
          <p className="font-oswald text-2xl font-bold">{summary.oldest_minutes || 0} min</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="oc-kpi-avg">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <TrendingUp size={14} /> Promedio
          </div>
          <p className="font-oswald text-2xl font-bold">{summary.avg_minutes_open || 0} min</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase">Detalle de Cuentas Abiertas</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="oc-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="oc-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="oc-bills-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="open-checks-table">
            <thead>
              <tr className="bg-foreground text-background print:bg-black print:text-white">
                <th className="text-left p-2 font-semibold"># Trans</th>
                <th className="text-left p-2 font-semibold">Mesa</th>
                <th className="text-left p-2 font-semibold hidden sm:table-cell">Mesero</th>
                <th className="text-left p-2 font-semibold hidden md:table-cell">Abierta desde</th>
                <th className="text-right p-2 font-semibold">Minutos</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell"># Items</th>
                <th className="text-right p-2 font-semibold">Total</th>
                <th className="text-center p-2 font-semibold hidden sm:table-cell">Estado</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-6 text-xs">
                    No hay cuentas abiertas en este período ✅
                  </td>
                </tr>
              ) : bills.map((b, i) => (
                <tr key={b.id || i} className="border-t border-border/40" data-testid={`oc-row-${i}`}>
                  <td className="p-2 font-mono text-xs">{b.transaction_number}</td>
                  <td className="p-2">{b.table}</td>
                  <td className="p-2 hidden sm:table-cell">{b.waiter}</td>
                  <td className="p-2 hidden md:table-cell text-xs font-mono">{fmtDT(b.opened_at)}</td>
                  <td className="p-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${ageBadgeClass(b.minutes_open)}`}>
                      {b.minutes_open}
                    </span>
                  </td>
                  <td className="p-2 text-right hidden md:table-cell font-variant-numeric-tabular">{b.items_count}</td>
                  <td className="p-2 text-right font-variant-numeric-tabular font-semibold">{formatMoney(b.total)}</td>
                  <td className="p-2 text-center hidden sm:table-cell">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-muted/60 border border-border">
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
              {bills.length > 0 && (
                <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="oc-grand-total">
                  <td className="p-3" colSpan={4}>TOTAL [{bills.length}]</td>
                  <td className="p-3 text-right">{bills.reduce((s, r) => s + (r.minutes_open || 0), 0)}</td>
                  <td className="p-3 text-right hidden md:table-cell">{bills.reduce((s, r) => s + (r.items_count || 0), 0)}</td>
                  <td className="p-3 text-right font-oswald text-primary font-variant-numeric-tabular">
                    {formatMoney(bills.reduce((s, r) => s + (r.total || 0), 0))}
                  </td>
                  <td className="p-3 hidden sm:table-cell" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Waiter summary */}
      {byWaiter.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4" data-testid="oc-by-waiter">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-muted-foreground" />
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Resumen por Mesero</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-foreground text-background print:bg-black print:text-white">
                  <th className="text-left p-2 font-semibold">Mesero</th>
                  <th className="text-right p-2 font-semibold"># Cuentas</th>
                  <th className="text-right p-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {byWaiter.map((w, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="p-2">{w.waiter}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{w.count}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(w.total)}</td>
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
