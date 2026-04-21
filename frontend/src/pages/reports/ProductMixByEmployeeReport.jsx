import { useState, Fragment } from 'react';
import axios from 'axios';
import { formatMoney } from './reportUtils';
import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Users, Award } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtInt = (n) => new Intl.NumberFormat('es-DO').format(Math.round(Number(n) || 0));

export default function ProductMixByEmployeeReport({ data, dateRange }) {
  const [expanded, setExpanded] = useState({});
  const [downloading, setDownloading] = useState(null);

  const toggle = (k) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  if (!data) return <p className="text-sm text-muted-foreground py-10 text-center">Cargando…</p>;

  const employees = Array.isArray(data.employees) ? data.employees : [];
  const summary = data.summary || {};
  const topProducts = Array.isArray(data.top_products) ? data.top_products : [];

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/product-mix-by-employee/pdf'
        : '/api/reports/xlsx/product-mix-by-employee/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ProductMixEmpleado_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12" data-testid="pm-empty">Sin datos para este período</p>;
  }

  return (
    <div className="space-y-4" data-testid="product-mix-report">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="pm-kpi-employees">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <Users size={14} /> Empleados
          </div>
          <p className="font-oswald text-2xl font-bold">{summary.employee_count || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="pm-kpi-products">
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Productos Distintos</p>
          <p className="font-oswald text-2xl font-bold">{summary.product_count || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/40 rounded-xl p-4 text-center" data-testid="pm-kpi-top-employee">
          <div className="flex items-center justify-center gap-1.5 text-xs text-primary uppercase font-semibold mb-1">
            <Award size={14} /> Top Empleado
          </div>
          <p className="font-oswald text-xl font-bold text-primary truncate">{summary.top_employee || '—'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="pm-kpi-total">
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Total Vendido</p>
          <p className="font-oswald text-2xl font-bold text-emerald-500">{formatMoney(summary.grand_total)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase">Desglose Empleado → Productos</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(Object.fromEntries(employees.map((e) => [`emp-${e.name}`, true])))}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/30"
            data-testid="pm-expand-all"
          >Expandir todo</button>
          <button
            onClick={() => setExpanded({})}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/30"
            data-testid="pm-collapse-all"
          >Colapsar todo</button>
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="pm-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="pm-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Hierarchical table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="product-mix-table">
            <thead>
              <tr className="bg-foreground text-background print:bg-black print:text-white">
                <th className="text-left p-2 font-semibold">Descripción</th>
                <th className="text-right p-2 font-semibold">Cantidad</th>
                <th className="text-right p-2 font-semibold">Total</th>
                <th className="text-right p-2 font-semibold hidden md:table-cell">% Empleado</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, ei) => {
                const key = `emp-${emp.name}`;
                const isOpen = expanded[key] !== false;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggle(key)}
                      className="border-t border-border cursor-pointer hover:bg-muted/20 transition-all"
                      data-testid={`pm-emp-row-${ei}`}
                    >
                      <td className="p-2 font-bold flex items-center gap-2">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{emp.name}</span>
                        <span className="text-[10px] text-muted-foreground">({emp.product_count})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hidden sm:inline">
                          Top: {emp.top_product}
                        </span>
                      </td>
                      <td className="p-2 text-right font-variant-numeric-tabular">{fmtInt(emp.qty)}</td>
                      <td className="p-2 text-right font-oswald text-primary font-variant-numeric-tabular">{formatMoney(emp.total)}</td>
                      <td className="p-2 text-right hidden md:table-cell font-variant-numeric-tabular">{emp.pct_of_grand}%</td>
                    </tr>
                    {isOpen && emp.products.map((p, pi) => (
                      <tr
                        key={`p-${ei}-${pi}`}
                        className="border-t border-border/30 bg-background/50"
                        data-testid={`pm-prod-row-${ei}-${pi}`}
                      >
                        <td className="p-1.5 pl-10 text-muted-foreground">{p.name}</td>
                        <td className="p-1.5 text-right font-variant-numeric-tabular">{fmtInt(p.qty)}</td>
                        <td className="p-1.5 text-right font-variant-numeric-tabular">{formatMoney(p.total)}</td>
                        <td className="p-1.5 text-right hidden md:table-cell font-variant-numeric-tabular">{p.pct_of_employee}%</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="pm-grand-total">
                <td className="p-3">TOTAL GENERAL</td>
                <td className="p-3 text-right font-variant-numeric-tabular">{fmtInt(summary.grand_qty)}</td>
                <td className="p-3 text-right font-oswald text-primary font-variant-numeric-tabular">{formatMoney(summary.grand_total)}</td>
                <td className="p-3 text-right hidden md:table-cell">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Top products across all employees */}
      {topProducts.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4" data-testid="pm-top-products">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Top 10 Productos (globales)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-background/50 rounded px-3 py-1.5 text-sm">
                <span className="truncate"><span className="text-muted-foreground mr-2">{i + 1}.</span>{p.name}</span>
                <span className="font-variant-numeric-tabular text-emerald-500 font-semibold ml-2">{formatMoney(p.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
