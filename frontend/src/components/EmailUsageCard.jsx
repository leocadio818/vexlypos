/**
 * EmailUsageCard
 * Admin-only (level 100) consumption dashboard for emails sent through Resend.
 * Reads from GET /api/email-logs/stats and GET /api/email-logs?page=...
 *
 * Displays:
 *  - 3 KPIs: Hoy / Semana / Mes
 *  - Breakdown by type (pills)
 *  - Recent 20 emails list (subject, recipient, status, time)
 *  - "Ver más" expands into the full paginated history
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Mail, FileText, ClipboardCheck, AlertTriangle, Send, Megaphone,
  CheckCircle2, XCircle, Loader2, Heart, Inbox
} from 'lucide-react';
import { notify } from '@/lib/notify';

const API = process.env.REACT_APP_BACKEND_URL;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const TYPE_META = {
  invoice:       { label: 'Facturas',     icon: FileText,       color: 'text-blue-500',    bg: 'bg-blue-500/10 border-blue-500/30' },
  shift_close:   { label: 'Cierre Caja',  icon: ClipboardCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  day_close:     { label: 'Cierre Día',   icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  daily_close:   { label: 'Cierre Día',   icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  shift_report:  { label: 'Rep. Turno',   icon: ClipboardCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  stock_alert:   { label: 'Stock',        icon: AlertTriangle,  color: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/30' },
  marketing:     { label: 'Marketing',    icon: Megaphone,      color: 'text-pink-500',    bg: 'bg-pink-500/10 border-pink-500/30' },
  loyalty_card:  { label: 'Fidelidad',    icon: Heart,          color: 'text-rose-500',    bg: 'bg-rose-500/10 border-rose-500/30' },
  generic:       { label: 'Genérico',     icon: Send,           color: 'text-muted-foreground', bg: 'bg-muted/40 border-border' },
  other:         { label: 'Otro',         icon: Send,           color: 'text-muted-foreground', bg: 'bg-muted/40 border-border' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export default function EmailUsageCard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [allLoading, setAllLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/email-logs/stats`, { headers: hdrs() });
      if (!r.ok) {
        if (r.status === 403) {
          // Silently hide for non-admins (component shouldn't have rendered, but defense-in-depth)
          setStats(null);
          return;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const data = await r.json();
      setStats(data);
    } catch (e) {
      notify.error('No se pudo cargar el consumo de emails');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async (p = 1) => {
    setAllLoading(true);
    try {
      const r = await fetch(`${API}/api/email-logs?page=${p}&limit=20`, { headers: hdrs() });
      const data = await r.json();
      setAllItems(data.items || []);
      setPage(data.page || 1);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (e) {
      notify.error('No se pudo cargar la lista completa');
    } finally {
      setAllLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (showAll) fetchAll(1);
  }, [showAll, fetchAll]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-4" data-testid="email-usage-card-loading">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Cargando consumo de emails…
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const today = stats.today || { sent: 0, failed: 0, total: 0 };
  const week = stats.this_week || { sent: 0, failed: 0, total: 0 };
  const month = stats.this_month || { sent: 0, failed: 0, total: 0 };
  const byType = stats.by_type || {};
  const recent = stats.recent || [];

  const items = showAll ? allItems : recent;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4" data-testid="email-usage-card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Mail size={16} className="text-primary" /> Consumo de Emails
        </h3>
        <button
          type="button"
          onClick={() => fetchStats()}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          data-testid="email-usage-refresh"
        >
          Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Kpi label="Hoy" data={today} testid="email-kpi-today" />
        <Kpi label="Semana" data={week} testid="email-kpi-week" />
        <Kpi label="Mes" data={month} testid="email-kpi-month" />
      </div>

      {/* Breakdown by type */}
      {Object.keys(byType).length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Por tipo (últimos 30 días)</p>
          <div className="flex flex-wrap gap-1.5" data-testid="email-by-type">
            {Object.entries(byType)
              .sort((a, b) => b[1] - a[1])
              .map(([t, count]) => {
                const meta = TYPE_META[t] || TYPE_META.other;
                const Icon = meta.icon;
                return (
                  <span
                    key={t}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] ${meta.bg}`}
                    data-testid={`email-type-pill-${t}`}
                  >
                    <Icon size={11} className={meta.color} />
                    <span className="font-medium">{meta.label}</span>
                    <span className="font-mono opacity-80">{count}</span>
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent list (or full when showAll) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {showAll ? `Todos los emails (${total})` : 'Últimos 20 enviados'}
          </p>
          {allLoading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="email-empty-state">
            <Inbox size={28} className="mx-auto mb-1 opacity-40" />
            <p className="text-xs">Aún no se han enviado emails</p>
          </div>
        ) : (
          <ul className="space-y-1.5" data-testid="email-list">
            {items.map((row) => {
              const meta = TYPE_META[row.type] || TYPE_META.other;
              const Icon = meta.icon;
              const isOk = row.status === 'sent';
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background/40 text-xs"
                  data-testid={`email-row-${row.id}`}
                >
                  <Icon size={14} className={`${meta.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate" title={row.subject}>{row.subject || '(sin asunto)'}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(row.created_at)}</span>
                    </div>
                    <div className="text-muted-foreground truncate" title={row.recipient}>
                      {row.recipient || '—'}
                      {row.error && (
                        <span className="ml-2 text-red-500 italic" title={row.error}>· {row.error.slice(0, 60)}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      isOk ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-500'
                    }`}
                    data-testid={`email-status-${row.id}`}
                  >
                    {isOk ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                    {isOk ? 'enviado' : 'falló'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-primary hover:underline"
            data-testid="email-toggle-all"
          >
            {showAll ? 'Ver solo recientes' : 'Ver más'}
          </button>
          {showAll && pages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || allLoading}
                onClick={() => fetchAll(page - 1)}
                className="px-2 py-1 rounded border border-border text-xs disabled:opacity-50"
                data-testid="email-prev-page"
              >
                ‹
              </button>
              <span className="text-xs text-muted-foreground">{page} / {pages}</span>
              <button
                type="button"
                disabled={page >= pages || allLoading}
                onClick={() => fetchAll(page + 1)}
                className="px-2 py-1 rounded border border-border text-xs disabled:opacity-50"
                data-testid="email-next-page"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, data, testid }) {
  const sent = data?.sent || 0;
  const failed = data?.failed || 0;
  const total = data?.total || 0;
  return (
    <div
      className="rounded-lg border border-border bg-background/40 p-2 flex flex-col gap-0.5"
      data-testid={testid}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-oswald text-2xl font-bold tabular-nums">{total}</span>
      <span className="text-[10px] text-muted-foreground">
        <span className="text-emerald-600">{sent} enviados</span>
        {failed > 0 && <span className="text-red-500"> · {failed} fallaron</span>}
      </span>
    </div>
  );
}
