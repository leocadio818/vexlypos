import { useState, Fragment } from 'react';
import axios from 'axios';
import { formatMoney } from './reportUtils';
import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Clock, Users, Award, Hourglass } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => {
  const token = localStorage.getItem('pos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtDT = (iso) => {
  if (!iso) return '—';
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

const fmtHM = (minutes) => {
  if (minutes == null) return '—';
  const m = Math.round(Number(minutes) || 0);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, '0')}m`;
};

export default function HoursWorkedReport({ data, dateRange }) {
  const [expanded, setExpanded] = useState({});
  const [downloading, setDownloading] = useState(null);

  const toggle = (k) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p>;

  const employees = Array.isArray(data.employees) ? data.employees : [];
  const summary = data.summary || {};
  const longest = summary.longest_shift || {};

  const download = async (format) => {
    const df = dateRange?.from; const dt = dateRange?.to;
    if (!df || !dt) { notify.error('Selecciona un rango de fechas'); return; }
    setDownloading(format);
    try {
      const endpoint = format === 'pdf'
        ? '/api/reports/xlsx/hours-worked/pdf'
        : '/api/reports/xlsx/hours-worked/xlsx';
      const res = await axios.get(`${API}${endpoint}`, {
        params: { date_from: df, date_to: dt },
        headers: headers(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `HorasTrabajadas_${df}_al_${dt}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`${format.toUpperCase()} descargado`);
    } catch {
      notify.error(`Error generando ${format.toUpperCase()}`);
    }
    setDownloading(null);
  };

  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12" data-testid="hw-empty">Sin turnos registrados en este período</p>;
  }

  return (
    <div className="space-y-4" data-testid="hours-worked-report">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="hw-kpi-employees">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <Users size={14} /> Empleados
          </div>
          <p className="font-oswald text-2xl font-bold">{summary.employee_count || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary.shift_count || 0} turnos</p>
        </div>
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/40 rounded-xl p-4 text-center" data-testid="hw-kpi-total">
          <div className="flex items-center justify-center gap-1.5 text-xs text-primary uppercase font-semibold mb-1">
            <Clock size={14} /> Total de Horas
          </div>
          <p className="font-oswald text-2xl font-bold text-primary">{(summary.total_hours || 0).toFixed(2)}h</p>
          <p className="text-xs text-muted-foreground mt-1">{fmtHM(summary.total_minutes)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center" data-testid="hw-kpi-avg">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <Hourglass size={14} /> Promedio/Turno
          </div>
          <p className="font-oswald text-2xl font-bold">{fmtHM(summary.avg_shift_minutes)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-green-600/5 border border-emerald-500/40 rounded-xl p-4 text-center" data-testid="hw-kpi-top">
          <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-500 uppercase font-semibold mb-1">
            <Award size={14} /> Top Empleado
          </div>
          <p className="font-oswald text-xl font-bold text-emerald-500 truncate">{summary.top_employee || '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">Más largo: {fmtHM(longest.duration_minutes)} — {longest.employee || '—'}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase">Desglose Empleado → Turnos</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(Object.fromEntries(employees.map((e) => [`emp-${e.id}`, true])))}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/30"
            data-testid="hw-expand-all"
          >Expandir todo</button>
          <button
            onClick={() => setExpanded({})}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/30"
            data-testid="hw-collapse-all"
          >Colapsar todo</button>
          <button
            onClick={() => download('pdf')}
            disabled={downloading === 'pdf'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/15 transition-all disabled:opacity-50"
            data-testid="hw-download-pdf-btn"
          >
            <FileDown size={14} /> {downloading === 'pdf' ? 'Generando...' : 'PDF'}
          </button>
          <button
            onClick={() => download('xlsx')}
            disabled={downloading === 'xlsx'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
            data-testid="hw-download-xlsx-btn"
          >
            <FileSpreadsheet size={14} /> {downloading === 'xlsx' ? 'Generando...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Hierarchical table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="hours-worked-table">
            <thead>
              <tr className="bg-foreground text-background print:bg-black print:text-white">
                <th className="text-left p-2 font-semibold">Descripción</th>
                <th className="text-left p-2 font-semibold hidden md:table-cell">Estación</th>
                <th className="text-left p-2 font-semibold hidden md:table-cell">Inicio</th>
                <th className="text-left p-2 font-semibold hidden md:table-cell">Cierre</th>
                <th className="text-right p-2 font-semibold">Duración</th>
                <th className="text-right p-2 font-semibold hidden sm:table-cell">Ventas del Turno</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, ei) => {
                const key = `emp-${emp.id}`;
                const isOpen = expanded[key] !== false;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggle(key)}
                      className="border-t border-border cursor-pointer hover:bg-muted/20 transition-all"
                      data-testid={`hw-emp-row-${ei}`}
                    >
                      <td className="p-2 font-bold flex items-center gap-2">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{emp.name}</span>
                        <span className="text-[10px] text-muted-foreground">({emp.shift_count} turnos)</span>
                        {emp.open_count > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/40">
                            {emp.open_count} abierto
                          </span>
                        )}
                      </td>
                      <td className="p-2 hidden md:table-cell" />
                      <td className="p-2 hidden md:table-cell" />
                      <td className="p-2 hidden md:table-cell" />
                      <td className="p-2 text-right font-oswald text-primary font-variant-numeric-tabular font-semibold">{fmtHM(emp.total_minutes)}</td>
                      <td className="p-2 text-right hidden sm:table-cell font-variant-numeric-tabular" />
                    </tr>
                    {isOpen && emp.shifts.map((sh, si) => {
                      const isOpenShift = !sh.closed_at || sh.status === 'open';
                      return (
                        <tr
                          key={`s-${ei}-${si}`}
                          className={`border-t border-border/30 bg-background/50 ${isOpenShift ? 'font-semibold' : ''}`}
                          data-testid={`hw-shift-row-${ei}-${si}`}
                        >
                          <td className="p-1.5 pl-10 text-muted-foreground italic">
                            Turno {isOpenShift && <span className="text-yellow-500 not-italic">●</span>}
                          </td>
                          <td className="p-1.5 hidden md:table-cell">{sh.station}</td>
                          <td className="p-1.5 hidden md:table-cell text-xs font-mono">{fmtDT(sh.opened_at)}</td>
                          <td className="p-1.5 hidden md:table-cell text-xs font-mono">{sh.closed_at ? fmtDT(sh.closed_at) : <span className="text-yellow-500">Abierto</span>}</td>
                          <td className="p-1.5 text-right font-variant-numeric-tabular">{fmtHM(sh.duration_minutes)}</td>
                          <td className="p-1.5 text-right hidden sm:table-cell font-variant-numeric-tabular">{formatMoney(sh.total_sales)}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              <tr className="border-t-2 border-foreground bg-muted/40 font-bold" data-testid="hw-grand-total">
                <td className="p-3">TOTAL GENERAL [{summary.shift_count} turnos]</td>
                <td className="p-3 hidden md:table-cell" />
                <td className="p-3 hidden md:table-cell" />
                <td className="p-3 hidden md:table-cell" />
                <td className="p-3 text-right font-oswald text-primary font-variant-numeric-tabular">{fmtHM(summary.total_minutes)}</td>
                <td className="p-3 hidden sm:table-cell" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
