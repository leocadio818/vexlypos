import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { formatMoney } from './reportUtils';
import { FileDown, FileSpreadsheet, ArrowRight, TrendingUp, TrendingDown, Minus, Calendar, RefreshCw } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Default: Period A = previous ISO month, Period B = current ISO month
const getDefaultPeriods = () => {
  const now = new Date();
  const yy = now.getFullYear();
  const mm = now.getMonth(); // 0-based
  const thisStart = new Date(yy, mm, 1);
  const thisEnd = new Date(yy, mm + 1, 0);
  const prevStart = new Date(yy, mm - 1, 1);
  const prevEnd = new Date(yy, mm, 0);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    a: { from: fmt(prevStart), to: fmt(prevEnd) },
    b: { from: fmt(thisStart), to: fmt(thisEnd) },
  };
};

export default function SalesComparativeReport({ dateRange }) {
  const defaults = getDefaultPeriods();
  // Period A = defaults.a; Period B defaults to dateRange (current filter) or defaults.b
  const [periodA, setPeriodA] = useState(defaults.a);
  const [periodB, setPeriodB] = useState({
    from: dateRange?.from || defaults.b.from,
    to: dateRange?.to || defaults.b.to,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/reports/sales-comparative`, {
        params: {
          period_a_from: periodA.from, period_a_to: periodA.to,
          period_b_from: periodB.from, period_b_to: periodB.to,
        },
        headers: headers(),
      });
      setData(res.data);
    } catch {
      notify.error('Error cargando comparativo');
    }
    setLoading(false);
  }, [periodA.from, periodA.to, periodB.from, periodB.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const download = async (format) => {
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/sales-comparative/pdf'
        : '/api/reports/xlsx/sales-comparative/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: {
          period_a_from: periodA.from, period_a_to: periodA.to,
          period_b_from: periodB.from, period_b_to: periodB.to,
        },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `VentasComparativas_A${periodA.from}_B${periodB.from}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  const fmt = (v, kind) => kind === 'int' ? new Intl.NumberFormat('es-DO').format(Math.round(v)) : formatMoney(v);

  return (
    <div className="space-y-4" data-testid="sales-comparative-report">
      {/* Period pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4" data-testid="sc-period-a">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-muted-foreground" />
            <h5 className="text-xs font-bold uppercase">Período A (base)</h5>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="date"
              value={periodA.from}
              onChange={(e) => setPeriodA((p) => ({ ...p, from: e.target.value }))}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
              data-testid="sc-a-from"
            />
            <span className="self-center text-xs text-muted-foreground">a</span>
            <input
              type="date"
              value={periodA.to}
              onChange={(e) => setPeriodA((p) => ({ ...p, to: e.target.value }))}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
              data-testid="sc-a-to"
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4" data-testid="sc-period-b">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-primary" />
            <h5 className="text-xs font-bold uppercase">Período B (comparado)</h5>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="date"
              value={periodB.from}
              onChange={(e) => setPeriodB((p) => ({ ...p, from: e.target.value }))}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
              data-testid="sc-b-from"
            />
            <span className="self-center text-xs text-muted-foreground">a</span>
            <input
              type="date"
              value={periodB.to}
              onChange={(e) => setPeriodB((p) => ({ ...p, to: e.target.value }))}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
              data-testid="sc-b-to"
            />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all"
          data-testid="sc-refresh-btn"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="sc-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="sc-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {!data ? (
        <p className="text-center text-muted-foreground py-8 text-sm" data-testid="sc-empty">
          {loading ? 'Cargando comparativo…' : 'Selecciona los dos períodos y pulsa Actualizar'}
        </p>
      ) : (
        <>
          {/* Side-by-side headline KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
            <div className="bg-card border border-border rounded-xl p-4" data-testid="sc-headline-a">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Período A</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {data.period_a?.date_from} → {data.period_a?.date_to}
              </p>
              <p className="font-oswald text-2xl font-bold mt-2">{formatMoney(data.period_a?.total_sales)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.period_a?.bills_count} facturas · Ticket {formatMoney(data.period_a?.avg_ticket)}</p>
            </div>
            <div className="flex items-center justify-center" data-testid="sc-vs-arrow">
              <ArrowRight size={32} className="text-muted-foreground" />
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/40 rounded-xl p-4" data-testid="sc-headline-b">
              <p className="text-xs text-primary uppercase font-semibold">Período B</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {data.period_b?.date_from} → {data.period_b?.date_to}
              </p>
              <p className="font-oswald text-2xl font-bold text-primary mt-2">{formatMoney(data.period_b?.total_sales)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.period_b?.bills_count} facturas · Ticket {formatMoney(data.period_b?.avg_ticket)}</p>
            </div>
          </div>

          {/* Metrics table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="sc-metrics-table">
                <thead>
                  <tr className="bg-foreground text-background print:bg-black print:text-white">
                    <th className="text-left p-2 font-semibold">Métrica</th>
                    <th className="text-right p-2 font-semibold">Período A</th>
                    <th className="text-right p-2 font-semibold">Período B</th>
                    <th className="text-right p-2 font-semibold">Diferencia</th>
                    <th className="text-right p-2 font-semibold">% Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.metrics || []).map((m, i) => {
                    const isUp = (m.diff || 0) > 0;
                    const isDown = (m.diff || 0) < 0;
                    const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
                    const colorCls = isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-muted-foreground';
                    return (
                      <tr key={m.key} className="border-t border-border/40" data-testid={`sc-metric-row-${i}`}>
                        <td className="p-2 font-semibold">{m.label}</td>
                        <td className="p-2 text-right font-variant-numeric-tabular">{fmt(m.period_a, m.kind)}</td>
                        <td className="p-2 text-right font-variant-numeric-tabular">{fmt(m.period_b, m.kind)}</td>
                        <td className={`p-2 text-right font-variant-numeric-tabular font-bold ${colorCls}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            <Icon size={12} /> {fmt(Math.abs(m.diff || 0), m.kind)}
                          </span>
                        </td>
                        <td className={`p-2 text-right font-variant-numeric-tabular font-bold ${colorCls}`}>
                          {m.pct === null ? 'N/A' : `${m.pct > 0 ? '+' : ''}${m.pct.toFixed(2)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
