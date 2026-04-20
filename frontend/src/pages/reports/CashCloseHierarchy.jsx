import { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Users } from 'lucide-react';
import { formatMoney } from './reportUtils';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtDateTime = (iso) => {
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

export default function CashCloseHierarchy({ dateRange }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('resumida'); // 'resumida' | 'detallada'
  const [expanded, setExpanded] = useState({}); // key -> bool
  const [downloading, setDownloading] = useState(null);

  const toggle = (k) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    let active = true;
    setLoading(true);
    axios.get(`${API}/api/reports/cash-close-hierarchical`, {
      params: { date_from: dateRange.from, date_to: dateRange.to },
      headers: headers(),
    })
      .then((r) => { if (active) setTree(r.data); })
      .catch(() => { if (active) setTree(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dateRange?.from, dateRange?.to]);

  const download = async (format) => {
    if (!dateRange?.from || !dateRange?.to) {
      notify.error('Selecciona un rango de fechas');
      return;
    }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/cierre-caja/pdf'
        : '/api/reports/xlsx/cierre-caja/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: dateRange.from, date_to: dateRange.to, view },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      const label = view === 'detallada' ? 'Detallada' : 'Resumida';
      a.download = `CierreCaja_${label}_${dateRange.from}_al_${dateRange.to}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center" data-testid="cch-loading">Cargando desglose jerárquico…</div>;
  }
  if (!tree || !tree.employees?.length) {
    return <div className="text-sm text-muted-foreground py-8 text-center" data-testid="cch-empty">Sin datos jerárquicos para este período</div>;
  }

  const detailed = view === 'detallada';
  const gt = tree.grand_totals || { count: 0, total: 0, tips: 0, total_with_tips: 0 };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="cash-close-hierarchy">
      {/* Toolbar */}
      <div className="p-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-muted-foreground" />
          <h4 className="text-xs font-bold uppercase">Desglose Jerárquico — Empleado · Turno · Método · Transacciones</h4>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Resumida / Detallada */}
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs" role="tablist">
            <button
              onClick={() => setView('resumida')}
              className={`px-3 py-1.5 transition-all ${view === 'resumida' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              data-testid="view-resumida-btn"
            >Resumida</button>
            <button
              onClick={() => setView('detallada')}
              className={`px-3 py-1.5 transition-all border-l border-border ${view === 'detallada' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              data-testid="view-detallada-btn"
            >Detallada</button>
          </div>
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="cch-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="cch-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Table — printable B/W */}
      <div className="overflow-x-auto print:overflow-visible">
        <table
          className="w-full text-sm text-foreground print:text-black"
          data-testid="cash-close-hierarchy-table"
        >
          <thead className="print:bg-black">
            <tr className="bg-foreground text-background print:bg-black print:text-white">
              <th className="text-left p-2 font-semibold">Descripción</th>
              <th className="text-left p-2 font-semibold hidden md:table-cell">Shift Start</th>
              <th className="text-left p-2 font-semibold hidden md:table-cell">Shift End</th>
              {detailed && <th className="text-center p-2 font-semibold">Trans #</th>}
              <th className="text-right p-2 font-semibold">Total</th>
              <th className="text-right p-2 font-semibold">Propinas</th>
              <th className="text-right p-2 font-semibold">Tot+Prop</th>
            </tr>
          </thead>
          <tbody>
            {tree.employees.map((emp, ei) => {
              const empKey = `emp-${emp.id}`;
              const empOpen = expanded[empKey] !== false; // open by default
              return (
                <Fragment key={empKey}>
                  <tr
                    onClick={() => toggle(empKey)}
                    className="border-t border-border cursor-pointer hover:bg-muted/20 transition-all"
                    data-testid={`emp-row-${ei}`}
                  >
                    <td className="p-2 font-bold flex items-center gap-2">
                      {empOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>{emp.name}</span>
                    </td>
                    <td className="p-2 hidden md:table-cell" />
                    <td className="p-2 hidden md:table-cell" />
                    {detailed && <td />}
                    <td className="p-2" />
                    <td className="p-2" />
                    <td className="p-2" />
                  </tr>
                  {empOpen && emp.shifts.map((sh, si) => {
                    const shKey = `sh-${emp.id}-${si}`;
                    const shOpen = expanded[shKey] !== false;
                    return (
                      <Fragment key={shKey}>
                        <tr
                          onClick={() => toggle(shKey)}
                          className="cursor-pointer hover:bg-muted/10 border-t border-border/40"
                          data-testid={`shift-row-${ei}-${si}`}
                        >
                          <td className="p-2 pl-8 font-semibold flex items-center gap-1.5">
                            {shOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span className="italic text-muted-foreground">Turno</span>
                          </td>
                          <td className="p-2 text-xs hidden md:table-cell">{fmtDateTime(sh.shift_start)}</td>
                          <td className="p-2 text-xs hidden md:table-cell">{fmtDateTime(sh.shift_end)}</td>
                          {detailed && <td />}
                          <td className="p-2" />
                          <td className="p-2" />
                          <td className="p-2" />
                        </tr>
                        {shOpen && sh.payment_methods.map((pm, pi) => {
                          const pmKey = `pm-${emp.id}-${si}-${pi}`;
                          const pmOpen = expanded[pmKey] !== false;
                          return (
                            <Fragment key={pmKey}>
                              {detailed ? (
                                <tr
                                  onClick={() => toggle(pmKey)}
                                  className="cursor-pointer hover:bg-muted/10"
                                  data-testid={`pm-row-${ei}-${si}-${pi}`}
                                >
                                  <td className="p-1.5 pl-14 font-medium flex items-center gap-1.5">
                                    {pmOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                    <strong>{pm.name}</strong>
                                  </td>
                                  <td className="p-1.5 hidden md:table-cell" />
                                  <td className="p-1.5 hidden md:table-cell" />
                                  <td />
                                  <td className="p-1.5" />
                                  <td className="p-1.5" />
                                  <td className="p-1.5" />
                                </tr>
                              ) : null}
                              {detailed && pmOpen && pm.transactions.map((tx, ti) => (
                                <tr
                                  key={`tx-${emp.id}-${si}-${pi}-${ti}`}
                                  className="text-xs text-muted-foreground"
                                  data-testid={`tx-row-${ei}-${si}-${pi}-${ti}`}
                                >
                                  <td className="p-1.5 pl-20">{fmtDateTime(tx.paid_at)}</td>
                                  <td className="p-1.5 hidden md:table-cell" />
                                  <td className="p-1.5 hidden md:table-cell" />
                                  <td className="p-1.5 text-center font-mono">{tx.trans_number}</td>
                                  <td className="p-1.5 text-right font-variant-numeric-tabular">{formatMoney(tx.total)}</td>
                                  <td className="p-1.5 text-right font-variant-numeric-tabular">{formatMoney(tx.tips)}</td>
                                  <td className="p-1.5 text-right font-variant-numeric-tabular">{formatMoney(tx.total_with_tips)}</td>
                                </tr>
                              ))}
                              {/* PM subtotal row */}
                              <tr
                                className="border-t border-border/70 font-semibold"
                                data-testid={`pm-subtotal-${ei}-${si}-${pi}`}
                              >
                                <td className="p-1.5 pl-14">{pm.name} [{pm.subtotal.count}]</td>
                                <td className="p-1.5 hidden md:table-cell" />
                                <td className="p-1.5 hidden md:table-cell" />
                                {detailed && <td />}
                                <td className="p-1.5 text-right font-variant-numeric-tabular">{formatMoney(pm.subtotal.total)}</td>
                                <td className="p-1.5 text-right font-variant-numeric-tabular">{formatMoney(pm.subtotal.tips)}</td>
                                <td className="p-1.5 text-right font-variant-numeric-tabular">{formatMoney(pm.subtotal.total_with_tips)}</td>
                              </tr>
                            </Fragment>
                          );
                        })}
                        {/* Shift totals */}
                        {shOpen && (
                          <tr
                            className="border-t border-b border-border font-bold bg-muted/20"
                            data-testid={`shift-totals-${ei}-${si}`}
                          >
                            <td className="p-2 pl-8">Shift Totals [{sh.shift_totals.count}]</td>
                            <td className="p-2 hidden md:table-cell" />
                            <td className="p-2 hidden md:table-cell" />
                            {detailed && <td />}
                            <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(sh.shift_totals.total)}</td>
                            <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(sh.shift_totals.tips)}</td>
                            <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(sh.shift_totals.total_with_tips)}</td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {/* Employee total */}
                  <tr
                    className="border-t-2 border-foreground font-bold"
                    data-testid={`emp-total-${ei}`}
                  >
                    <td className="p-2">TOTAL EMPLEADO [{emp.employee_totals.count}]</td>
                    <td className="p-2 hidden md:table-cell" />
                    <td className="p-2 hidden md:table-cell" />
                    {detailed && <td />}
                    <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(emp.employee_totals.total)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(emp.employee_totals.tips)}</td>
                    <td className="p-2 text-right font-variant-numeric-tabular">{formatMoney(emp.employee_totals.total_with_tips)}</td>
                  </tr>
                  <tr><td colSpan={detailed ? 7 : 6} className="p-1" /></tr>
                </Fragment>
              );
            })}
            {/* Grand total */}
            <tr
              className="border-t-2 border-foreground bg-muted/40 font-bold text-base"
              data-testid="cch-grand-total"
            >
              <td className="p-3">TOTAL GENERAL [{gt.count}]</td>
              <td className="p-3 hidden md:table-cell" />
              <td className="p-3 hidden md:table-cell" />
              {detailed && <td />}
              <td className="p-3 text-right font-oswald text-primary font-variant-numeric-tabular">{formatMoney(gt.total)}</td>
              <td className="p-3 text-right font-variant-numeric-tabular">{formatMoney(gt.tips)}</td>
              <td className="p-3 text-right font-oswald text-primary font-variant-numeric-tabular">{formatMoney(gt.total_with_tips)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
