import { useState } from 'react';
import axios from 'axios';
import { formatMoney } from './reportUtils';
import { FileDown, FileSpreadsheet, AlertTriangle, Receipt } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function TaxesReport({ data, dateRange }) {
  const [downloading, setDownloading] = useState(null);
  if (!data?.summary) return null;

  const breakdown = Array.isArray(data.breakdown_by_rate) ? data.breakdown_by_rate : [];
  const integrity = data.breakdown_integrity || { ok: true };
  const baseGravable = Number(data.summary.total_subtotal || 0);
  const propina10 = Math.round(baseGravable * 0.10 * 100) / 100;

  const totalBase = breakdown.reduce((s, r) => s + Number(r.base || 0), 0);
  const totalItbis = breakdown.reduce((s, r) => s + Number(r.itbis || 0), 0);
  const totalInvoices = breakdown.reduce((s, r) => s + Number(r.invoice_count || 0), 0);

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/taxes/pdf'
        : '/api/reports/xlsx/taxes/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ReporteImpuestos_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-4" data-testid="taxes-report">
      {/* Integrity warning (only when backend reports mismatch) */}
      {!integrity.ok && (
        <div
          className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-600 dark:text-red-400"
          data-testid="taxes-integrity-warning"
          role="alert"
        >
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Inconsistencia detectada en cálculo de ITBIS</p>
            <p className="text-xs opacity-80 mt-0.5">
              Suma por tasa: {formatMoney(integrity.sum_by_rate)} · Total ITBIS registrado: {formatMoney(integrity.total_itbis)} · Diferencia: {formatMoney(integrity.diff)}. Contactar soporte.
            </p>
          </div>
        </div>
      )}

      {/* Top KPIs (preserved from the previous layout) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Subtotal</p>
          <p className="font-oswald text-xl font-bold">{formatMoney(data.summary.total_subtotal)}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-blue-400 uppercase">ITBIS Total</p>
          <p className="font-oswald text-xl font-bold text-blue-400">{formatMoney(data.summary.total_itbis)}</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-yellow-400 uppercase">Propina Legal 10%</p>
          <p className="font-oswald text-xl font-bold text-yellow-400">{formatMoney(data.summary.total_tips)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-emerald-400 uppercase">Total Recaudado</p>
          <p className="font-oswald text-xl font-bold text-emerald-400">{formatMoney(data.summary.total_sales)}</p>
        </div>
      </div>

      {/* Toolbar with download buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-muted-foreground" />
          <h4 className="text-xs font-bold uppercase">Desglose Fiscal DGII (IT-1)</h4>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="taxes-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="taxes-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {/* NEW: Resumen por Tasa de ITBIS */}
      <div className="bg-card border border-border rounded-xl p-4" data-testid="taxes-by-rate">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Resumen por Tasa de ITBIS</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="taxes-by-rate-table">
            <thead>
              <tr className="bg-foreground text-background print:bg-black print:text-white">
                <th className="text-left p-2 font-semibold">Tasa</th>
                <th className="text-right p-2 font-semibold">Base Imponible</th>
                <th className="text-right p-2 font-semibold">ITBIS Recaudado</th>
                <th className="text-right p-2 font-semibold"># Facturas</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-4 text-xs">
                    Sin datos para este período
                  </td>
                </tr>
              ) : breakdown.map((r, i) => (
                <tr key={i} className="border-t border-border/40" data-testid={`taxes-rate-row-${i}`}>
                  <td className="p-2 font-semibold">{r.rate_label}</td>
                  <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(r.base)}</td>
                  <td className="p-2 text-right font-variant-numeric-tabular text-blue-500">{formatMoney(r.itbis)}</td>
                  <td className="p-2 text-right font-variant-numeric-tabular">{r.invoice_count}</td>
                </tr>
              ))}
              {breakdown.length > 0 && (
                <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="taxes-rate-total">
                  <td className="p-3">TOTAL GENERAL</td>
                  <td className="p-3 text-right font-variant-numeric-tabular">{formatMoney(totalBase)}</td>
                  <td className="p-3 text-right font-variant-numeric-tabular text-blue-500">{formatMoney(totalItbis)}</td>
                  <td className="p-3 text-right font-variant-numeric-tabular">{totalInvoices}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Propina Legal 10% detail (preserved, with computed formula shown) */}
      <div className="bg-card border border-border rounded-xl p-4" data-testid="taxes-tips-box">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Propina Legal 10%</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-background border border-border/50">
            <p className="text-xs text-muted-foreground">Base gravable</p>
            <p className="font-oswald text-lg font-bold">{formatMoney(baseGravable)}</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border/50">
            <p className="text-xs text-muted-foreground">Propina 10% calculada</p>
            <p className="font-oswald text-lg font-bold text-yellow-500">{formatMoney(propina10)}</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border/50">
            <p className="text-xs text-muted-foreground">Propina registrada en facturas</p>
            <p className="font-oswald text-lg font-bold text-yellow-500">{formatMoney(data.summary.total_tips)}</p>
          </div>
        </div>
      </div>

      {/* Desglose Diario (preserved) */}
      {data.daily?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Desglose Diario</h4>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-right py-2">Subtotal</th>
                  <th className="text-right py-2">ITBIS</th>
                  <th className="text-right py-2">Propinas</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 font-mono">{d.date}</td>
                    <td className="py-2 text-right">{formatMoney(d.subtotal)}</td>
                    <td className="py-2 text-right text-blue-400">{formatMoney(d.itbis)}</td>
                    <td className="py-2 text-right text-yellow-400">{formatMoney(d.tips)}</td>
                    <td className="py-2 text-right font-oswald text-primary">{formatMoney(d.total)}</td>
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
