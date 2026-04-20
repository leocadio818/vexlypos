import { useState } from 'react';
import { COLORS, CustomTooltip, formatMoney, PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from './reportUtils';
import { FileDown, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ByCategoryReport({ data: reportData, dateRange }) {
  const data = Array.isArray(reportData) ? reportData : [];
  const [expanded, setExpanded] = useState({}); // { [categoryName]: boolean }
  const [downloading, setDownloading] = useState(null); // 'pdf' | 'xlsx' | null

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">Sin datos para este período</p>;
  }

  const toggle = (name) => setExpanded((p) => ({ ...p, [name]: !p[name] }));
  const expandAll = () => {
    const all = {};
    data.forEach((c) => { all[c.category] = true; });
    setExpanded(all);
  };
  const collapseAll = () => setExpanded({});

  const grandTotal = data.reduce((s, c) => s + (c.total || 0), 0);
  const grandQty = data.reduce((s, c) => s + (c.quantity || 0), 0);

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/ventas-por-categoria/pdf'
        : '/api/reports/xlsx/ventas-por-categoria/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `VentasPorCategoria_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-4" data-testid="by-category-report">
      {/* Toolbar with export buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-all"
            data-testid="expand-all-btn"
          >
            Expandir todo
          </button>
          <button
            onClick={collapseAll}
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-all"
            data-testid="collapse-all-btn"
          >
            Colapsar todo
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Distribución por Categoría</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={data} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80}
                   label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Hierarchical table */}
        <div className="bg-card border border-border rounded-xl p-4 lg:col-span-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle Jerárquico (Categoría → Productos)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="by-category-table">
              <thead>
                <tr className="text-left border-b border-border bg-muted/30">
                  <th className="py-2 px-2 font-semibold">Descripción</th>
                  <th className="py-2 px-2 font-semibold text-right">Total</th>
                  <th className="py-2 px-2 font-semibold text-right w-20">Cant.</th>
                </tr>
              </thead>
              <tbody>
                {data.map((cat, i) => {
                  const isOpen = expanded[cat.category];
                  const products = Array.isArray(cat.products) ? cat.products : [];
                  const catColor = COLORS[i % COLORS.length];
                  return (
                    <>
                      <tr
                        key={`cat-${i}`}
                        onClick={() => toggle(cat.category)}
                        className="border-t border-border cursor-pointer hover:bg-muted/20 transition-all"
                        data-testid={`category-row-${i}`}
                      >
                        <td className="py-2 px-2 font-bold flex items-center gap-2">
                          {products.length > 0 && (isOpen
                            ? <ChevronDown size={14} className="text-muted-foreground" />
                            : <ChevronRight size={14} className="text-muted-foreground" />)}
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: catColor }} />
                          <span>{cat.category}</span>
                          {products.length > 0 && <span className="text-[10px] text-muted-foreground">({products.length})</span>}
                        </td>
                        <td className="py-2 px-2 text-right font-bold font-oswald text-primary">{formatMoney(cat.total)}</td>
                        <td className="py-2 px-2 text-right font-bold">{cat.quantity}</td>
                      </tr>
                      {isOpen && products.map((p, j) => (
                        <tr
                          key={`prod-${i}-${j}`}
                          className="border-t border-border/50 bg-background/50"
                          data-testid={`product-row-${i}-${j}`}
                        >
                          <td className="py-1.5 px-2 pl-10 text-muted-foreground">{p.name}</td>
                          <td className="py-1.5 px-2 text-right font-variant-numeric-tabular">{formatMoney(p.total)}</td>
                          <td className="py-1.5 px-2 text-right font-variant-numeric-tabular">{p.quantity}</td>
                        </tr>
                      ))}
                    </>
                  );
                })}
                <tr className="border-t-2 border-foreground bg-muted/40" data-testid="grand-total-row">
                  <td className="py-3 px-2 font-bold text-base">TOTAL GENERAL</td>
                  <td className="py-3 px-2 text-right font-bold text-base font-oswald text-primary">{formatMoney(grandTotal)}</td>
                  <td className="py-3 px-2 text-right font-bold text-base">{grandQty}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
