import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, RefreshCw, Printer, AlertTriangle, CheckCircle2, Clock, XCircle, Search, Pencil, Loader2, Ban, Activity, ChevronDown, ChevronUp, Zap, TrendingUp, Repeat } from 'lucide-react';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const STATUS_MAP = {
  FINISHED: { label: 'Aprobada', color: 'bg-green-500/20 text-green-600 dark:text-green-400', icon: CheckCircle2 },
  REGISTERED: { label: 'Pendiente', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', icon: Clock },
  PROCESSING: { label: 'Procesando', color: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400', icon: Loader2 },
  CONTINGENCIA: { label: 'Contingencia', color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', icon: AlertTriangle },
  CONTINGENCIA_MANUAL: { label: 'Cont. Manual', color: 'bg-gray-500/20 text-gray-600 dark:text-gray-400', icon: Ban },
  REJECTED: { label: 'Rechazada', color: 'bg-red-500/20 text-red-600 dark:text-red-400', icon: XCircle },
  ERROR: { label: 'Error', color: 'bg-red-500/20 text-red-600 dark:text-red-400', icon: XCircle },
};

const ECF_TYPES = [
  { value: 'E31', label: 'E31 - Crédito Fiscal' },
  { value: 'E32', label: 'E32 - Consumo Final' },
  { value: 'E34', label: 'E34 - Nota de Crédito' },
  { value: 'E44', label: 'E44 - Regímenes Especiales' },
  { value: 'E45', label: 'E45 - Gubernamental' },
];

export default function EcfDashboard({ data }) {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState({});
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, bill: null, newType: '' });
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    if (data?.bills) {
      setBills(data.bills);
      setSummary(data.summary || {});
    }
  }, [data]);

  const getStatus = (bill) => {
    const s = (bill.ecf_status || '').toUpperCase();
    if (s === 'REJECTED') return 'REJECTED';
    if (s === 'FINISHED') return 'FINISHED';
    if (s === 'PROCESSING') return 'PROCESSING';
    if (s === 'REGISTERED') return 'REGISTERED';
    if (s === 'CONTINGENCIA') {
      const err = (bill.ecf_error || '').toLowerCase();
      const forcedByPayment = Array.isArray(bill.payments) && bill.payments.some(
        (p) => p && (p.skip_ecf === true || p.force_contingency === true)
      );
      if (err.includes('contingencia_manual') || bill.force_contingency === true || forcedByPayment) {
        return 'CONTINGENCIA_MANUAL';
      }
      return 'CONTINGENCIA';
    }
    if (bill.ecf_reject_reason && s !== 'FINISHED') return 'REJECTED';
    return STATUS_MAP[s] ? s : 'ERROR';
  };

  const filteredBills = bills.filter(b => {
    if (onlyMine && user?.id && b.cashier_id !== user.id && b.waiter_id !== user.id) return false;
    if (filter === 'all') return true;
    return getStatus(b) === filter;
  });

  const handleRefreshStatus = async (billId) => {
    const bill = bills.find(b => b.id === billId);
    const provider = bill?.ecf_provider || '';

    // If bill has no provider set (ERROR bills), or provider is multiprod/thefactory, the backend
    // will fallback to system provider. We still call it so ERROR bills get a clear message.
    if (provider === 'multiprod' || provider === 'thefactory') {
      notify.info(`Status actual: ${bill?.ecf_status || 'Sin status'} (via ${provider})`);
      return;
    }
    
    try {
      const r = await fetch(`${API}/api/ecf/refresh-status/${billId}`, { headers: hdrs() });
      const d = await r.json();
      if (d.ok) {
        const msg = d.message || `Status: ${d.status}${d.reject_reason ? ' — ' + d.reject_reason : ''}`;
        notify.success(msg);
        const res = await fetch(`${API}/api/ecf/dashboard`, { headers: hdrs() });
        const fresh = await res.json();
        setBills(fresh.bills || []);
        setSummary(fresh.summary || {});
      } else {
        notify.error(d.message || 'Error consultando status');
      }
    } catch { notify.error('Error de conexión'); }
  };

  const handleRetry = async (billId) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/ecf/retry/${billId}`, { method: 'POST', headers: hdrs() });
      const d = await r.json();
      if (d.ok) {
        notify.success(`e-CF reenviado: ${d.encf}`);
        const res = await fetch(`${API}/api/ecf/dashboard`, { headers: hdrs() });
        const fresh = await res.json();
        setBills(fresh.bills || []);
        setSummary(fresh.summary || {});
      } else {
        notify.error(d.message);
      }
    } catch { notify.error('Error de conexión'); }
    setLoading(false);
  };

  const handleResendRotate = async (billId) => {
    if (!window.confirm('¿Reenviar con una NUEVA secuencia? El e-NCF actual quedará marcado como consumido y se asignará el siguiente disponible.')) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/ecf/resend-rotate/${billId}`, { method: 'POST', headers: hdrs() });
      const d = await r.json();
      if (d.ok && d.status === 'aceptado') {
        const fromMsg = d.rotated_from ? ` (rotado desde ${d.rotated_from})` : '';
        notify.success(`e-CF aceptado con nuevo NCF: ${d.ecf_encf}${fromMsg}`, { duration: 8000 });
      } else if (d.status === 'rechazado') {
        notify.error(`Rechazado por DGII: ${d.motivo || 'Sin motivo'}`);
      } else if (d.status === 'contingencia') {
        notify.warning(`En contingencia: ${d.motivo || 'Reintentar más tarde'}`);
      } else {
        notify.error(d.message || d.motivo || 'Error en re-envío con rotación');
      }
      const res = await fetch(`${API}/api/ecf/dashboard`, { headers: hdrs() });
      const fresh = await res.json();
      setBills(fresh.bills || []);
      setSummary(fresh.summary || {});
    } catch { notify.error('Error de conexión'); }
    setLoading(false);
  };

  const handleRetryAll = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/ecf/retry-all`, { method: 'POST', headers: hdrs() });
      const d = await r.json();
      let msg = `Reintentos: ${d.success} exitosos, ${d.failed} fallidos de ${d.total}`;
      if (d.skipped_manual > 0) {
        msg += ` · ${d.skipped_manual} omitida(s) (contingencia manual — reintentar individualmente)`;
      }
      notify.success(msg, { duration: 8000 });
      const res = await fetch(`${API}/api/ecf/dashboard`, { headers: hdrs() });
      const fresh = await res.json();
      setBills(fresh.bills || []);
      setSummary(fresh.summary || {});
    } catch { notify.error('Error de conexión'); }
    setLoading(false);
  };

  const handleReprint = async (billId) => {
    // First refresh status from Alanube
    try {
      await fetch(`${API}/api/ecf/refresh-status/${billId}`, { headers: hdrs() });
    } catch {}
    // Then print
    try {
      await fetch(`${API}/api/print/receipt/${billId}/send`, { method: 'POST', headers: hdrs() });
      notify.success('Factura enviada a impresora');
    } catch { notify.error('Error al imprimir'); }
  };

  const handleEditEcfType = async () => {
    if (!editDialog.bill || !editDialog.newType) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/bills/${editDialog.bill.id}/ecf-type`, {
        method: 'PATCH',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecf_type: editDialog.newType })
      });
      const d = await r.json();
      if (d.ok) {
        notify.success(d.message || 'Tipo de e-CF actualizado');
        setEditDialog({ open: false, bill: null, newType: '' });
        // Refresh data
        const res = await fetch(`${API}/api/ecf/dashboard`, { headers: hdrs() });
        const fresh = await res.json();
        setBills(fresh.bills || []);
        setSummary(fresh.summary || {});
      } else {
        notify.error(d.detail || d.message || 'Error al actualizar');
      }
    } catch { notify.error('Error de conexión'); }
    setLoading(false);
  };

  const formatDate = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }); } catch { return d.slice(0, 16); }
  };

  if (!data) return <p className="text-center text-muted-foreground py-8">Sin datos</p>;

  return (
    <div className="space-y-5" data-testid="ecf-dashboard">
      {/* 🚨 Rechazos DGII — Alerta visible al tope con motivo completo y botón Reintentar */}
      {(() => {
        const rejectedBills = bills.filter((b) => getStatus(b) === 'REJECTED');
        if (rejectedBills.length === 0) return null;
        return (
          <div
            className="rounded-xl border border-red-500/40 bg-red-500/5 overflow-hidden"
            data-testid="ecf-rejections-alert-card"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-500/30 bg-red-500/10">
              <XCircle size={18} className="text-red-500" />
              <h3 className="font-oswald font-bold text-red-600 dark:text-red-400 text-sm uppercase tracking-wide">
                Rechazos DGII · Acción requerida
              </h3>
              <span className="ml-auto text-xs font-bold text-red-500">
                {rejectedBills.length} rechazada{rejectedBills.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="divide-y divide-red-500/20">
              {rejectedBills.slice(0, 5).map((b) => {
                const arStatus = b.ecf_auto_retry_status;
                const arAttempt = b.ecf_auto_retry_attempt || 0;
                const arMax = b.ecf_auto_retry_max || 5;
                const arNextAt = b.ecf_auto_retry_next_at;
                const isAutoRetrying = arStatus === 'pending' && arNextAt;
                let autoRetryLabel = '';
                if (isAutoRetrying) {
                  try {
                    const ms = new Date(arNextAt) - new Date();
                    if (ms > 0) {
                      const mins = Math.floor(ms / 60000);
                      const secs = Math.floor((ms % 60000) / 1000);
                      autoRetryLabel = mins >= 1 ? `${mins}m ${secs}s` : `${secs}s`;
                    } else {
                      autoRetryLabel = 'pronto';
                    }
                  } catch { autoRetryLabel = ''; }
                }
                return (
                <li
                  key={b.id}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-red-500/5 transition-all"
                  data-testid={`ecf-rejection-item-${b.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm">T-{b.transaction_number}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {b.ecf_type || '—'}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {b.ecf_encf || '—'}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs font-semibold">
                        RD$ {(b.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </span>
                      {isAutoRetrying && (
                        <Badge
                          className="text-[10px] bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30"
                          data-testid={`auto-retry-badge-${b.id}`}
                        >
                          <RefreshCw size={9} className="mr-1 animate-spin" />
                          Auto-retry {arAttempt}/{arMax}{autoRetryLabel ? ` · en ${autoRetryLabel}` : ''}
                        </Badge>
                      )}
                      {arStatus === 'exhausted' && (
                        <Badge className="text-[10px] bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30">
                          Auto-retry agotado ({arAttempt}/{arMax})
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs mt-1 text-red-600 dark:text-red-400 break-words">
                      <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
                      {b.ecf_reject_reason || 'Rechazado por DGII sin motivo especificado'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDate(b.ecf_sent_at || b.paid_at)}
                      {b.ecf_provider ? ` · via ${b.ecf_provider}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleRetry(b.id)}
                    disabled={loading}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
                    data-testid={`ecf-rejection-retry-${b.id}`}
                  >
                    <RefreshCw size={12} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Reintentar
                  </Button>
                </li>
                );
              })}
            </ul>
            {rejectedBills.length > 5 && (
              <div className="px-4 py-2 text-[11px] text-center text-muted-foreground border-t border-red-500/20">
                + {rejectedBills.length - 5} rechazo(s) adicional(es) — filtra por "Rechazadas" abajo para verlos todos
              </div>
            )}
          </div>
        );
      })()}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <button onClick={() => setFilter('all')} className={`bg-card border rounded-xl p-3 text-center transition-all ${filter === 'all' ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
          <FileText size={18} className="text-primary mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold">{summary.total || 0}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </button>
        <button onClick={() => setFilter('FINISHED')} className={`bg-green-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'FINISHED' ? 'border-green-500 ring-2 ring-green-500/20' : 'border-green-500/30'}`}>
          <CheckCircle2 size={18} className="text-green-600 dark:text-green-400 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-green-600 dark:text-green-400">{summary.approved || 0}</p>
          <p className="text-[10px] font-bold text-slate-800 dark:text-green-100">Aprobadas</p>
        </button>
        <button onClick={() => setFilter('REGISTERED')} className={`bg-blue-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'REGISTERED' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-blue-500/30'}`}>
          <Clock size={18} className="text-blue-600 dark:text-blue-400 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-blue-600 dark:text-blue-400">{summary.registered || 0}</p>
          <p className="text-[10px] font-bold text-slate-800 dark:text-blue-100">Pendientes</p>
        </button>
        <button onClick={() => setFilter('PROCESSING')} className={`bg-cyan-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'PROCESSING' ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'border-cyan-500/30'}`}>
          {(() => {
            const count = bills.filter(b => getStatus(b) === 'PROCESSING').length;
            return (
              <>
                <Loader2 size={18} className={`text-cyan-600 dark:text-cyan-400 mx-auto mb-1 ${count > 0 ? 'animate-spin' : ''}`} />
                <p className="font-oswald text-xl font-bold text-cyan-600 dark:text-cyan-400">{count}</p>
              </>
            );
          })()}
          <p className="text-[10px] font-bold text-slate-800 dark:text-cyan-100">Procesando</p>
        </button>
        <button onClick={() => setFilter('CONTINGENCIA')} className={`bg-amber-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'CONTINGENCIA' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-amber-500/30'}`}>
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-amber-600 dark:text-amber-400">{summary.contingencia || 0}</p>
          <p className="text-[10px] font-bold text-slate-800 dark:text-amber-100">Contingencia</p>
        </button>
        <button onClick={() => setFilter('CONTINGENCIA_MANUAL')} className={`bg-gray-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'CONTINGENCIA_MANUAL' ? 'border-gray-500 ring-2 ring-gray-500/20' : 'border-gray-500/30'}`}>
          <Ban size={18} className="text-gray-500 dark:text-gray-400 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-gray-600 dark:text-gray-400">{summary.contingencia_manual ?? bills.filter(b => getStatus(b) === 'CONTINGENCIA_MANUAL').length}</p>
          <p className="text-[10px] font-bold text-slate-800 dark:text-gray-300">Cont. Manual</p>
        </button>
        <button onClick={() => setFilter('REJECTED')} className={`bg-red-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'REJECTED' ? 'border-red-500 ring-2 ring-red-500/20' : 'border-red-500/30'}`}>
          <XCircle size={18} className="text-red-600 dark:text-red-400 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-red-600 dark:text-red-400">{summary.rejected || 0}</p>
          <p className="text-[10px] font-bold text-slate-800 dark:text-red-100">Rechazadas</p>
        </button>
      </div>

      {/* Filter: Only mine */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} className="rounded" data-testid="only-mine-filter" />
          Solo mis facturas en proceso
        </label>
      </div>

      {/* Action buttons — "Reintentar Todas" EXCLUYE contingencia manual (Uber Eats/PedidosYa) */}
      {summary.contingencia > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleRetryAll}
              disabled={loading}
              variant="outline"
              className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              data-testid="retry-all-contingencias-btn"
            >
              <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> Reintentar Todas las Contingencias ({summary.contingencia || 0})
            </Button>
          </div>
          {(summary.contingencia_manual || 0) > 0 && (
            <p className="text-[10px] text-muted-foreground">
              <Ban size={10} className="inline mr-1" />
              {summary.contingencia_manual} contingencia(s) manual(es) (Uber Eats / PedidosYa) NO se incluyen en el lote — reintentarlas individualmente si aplica.
            </p>
          )}
        </div>
      )}

      {/* Bills Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left p-3">Trans.</th>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">e-NCF</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Detalle</th>
                <th className="text-center p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.map((b, i) => {
                const status = getStatus(b);
                const statusInfo = STATUS_MAP[status] || STATUS_MAP.ERROR;
                const StatusIcon = statusInfo.icon;
                return (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="p-3 font-mono font-bold">T-{b.transaction_number}</td>
                    <td className="p-3 text-xs">{formatDate(b.paid_at)}</td>
                    <td className="p-3 font-mono text-xs">{b.ecf_encf || '—'}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{b.ecf_type || '—'}</Badge></td>
                    <td className="p-3 text-right font-oswald font-bold">RD$ {(b.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">
                      <Badge className={`text-xs ${statusInfo.color}`}>
                        <StatusIcon size={10} className={`mr-1 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />{statusInfo.label}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[220px] truncate">
                      {(() => {
                        const reason = b.ecf_reject_reason || b.ecf_error || '';
                        const isBurned = /ya han sido utilizados|ya utilizada|c[óo]digo.*75|"codigo":\s*"75"/i.test(reason);
                        const rotations = b.ecf_ncf_rotations || 0;
                        if (isBurned) {
                          return (
                            <span className="text-amber-600 dark:text-amber-400 font-medium" title={reason}>
                              🔄 NCF ya usada — pendiente reasignación
                              {rotations > 0 ? ` (rotaciones: ${rotations})` : ''}
                            </span>
                          );
                        }
                        return reason || (b.ecf_provider ? `via ${b.ecf_provider}` : '') || (b.ecf_security_code ? `Código: ${b.ecf_security_code}` : '—');
                      })()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleRefreshStatus(b.id)} title="Actualizar status" className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]">
                          <Search size={14} className="text-blue-500" />
                        </button>
                        {(status === 'CONTINGENCIA' || status === 'REJECTED') && (
                          <>
                            <button 
                              onClick={() => setEditDialog({ open: true, bill: b, newType: b.ncf?.replace('PENDING-', '') || 'E32' })} 
                              title="Editar tipo e-CF" 
                              className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]"
                              data-testid="edit-ecf-type-btn"
                            >
                              <Pencil size={14} className="text-purple-500" />
                            </button>
                            <button onClick={() => handleRetry(b.id)} title="Reintentar (mismo NCF)" disabled={loading} className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]" data-testid={`retry-btn-${b.id}`}>
                              <RefreshCw size={14} className={`text-amber-500 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                          </>
                        )}
                        {status === 'CONTINGENCIA_MANUAL' && (
                          <>
                            <span
                              className="text-[10px] px-2 py-1 rounded bg-gray-500/10 text-gray-500 dark:text-gray-400"
                              title="Plataforma externa (Uber Eats/PedidosYa) — no se envía en lote. Usa el botón Reintentar solo si decides forzar el envío manualmente."
                              data-testid="manual-contingency-note"
                            >
                              Plataforma externa
                            </span>
                            <button
                              onClick={() => handleRetry(b.id)}
                              title="Reintentar manualmente (forzar envío a DGII)"
                              disabled={loading}
                              className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]"
                              data-testid={`retry-btn-${b.id}`}
                            >
                              <RefreshCw size={14} className={`text-amber-500 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                          </>
                        )}
                        {status !== 'FINISHED' && status !== 'REGISTERED' && (
                          <button
                            onClick={() => handleResendRotate(b.id)}
                            title="Reenviar con NUEVA secuencia (rota al siguiente NCF disponible)"
                            disabled={loading}
                            className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]"
                            data-testid={`resend-rotate-btn-${b.id}`}
                          >
                            <Repeat size={14} className={`text-teal-500 ${loading ? 'animate-pulse' : ''}`} />
                          </button>
                        )}
                        <button onClick={() => handleReprint(b.id)} title="Reimprimir" className="p-1.5 rounded-lg hover:bg-muted transition-all">
                          <Printer size={14} className="text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredBills.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No hay facturas electrónicas en este filtro</p>
          )}
        </div>
      </div>

      {/* 📊 Panel de Diagnóstico Multiprod — solo visible para admin */}
      {user?.role === 'admin' && <EcfHealthPanel />}

      {/* Edit e-CF Type Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, bill: null, newType: '' })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-oswald">Editar Tipo de e-CF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Factura <span className="font-bold text-foreground">T-{editDialog.bill?.transaction_number}</span> — 
              RD$ {(editDialog.bill?.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">
              Tipo actual: <span className="font-mono font-bold">{editDialog.bill?.ncf || '—'}</span>
            </p>
            <div>
              <label className="text-sm font-medium">Nuevo Tipo de e-CF</label>
              <select 
                value={editDialog.newType} 
                onChange={(e) => setEditDialog({ ...editDialog, newType: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm"
                data-testid="ecf-type-select"
              >
                {ECF_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialog({ open: false, bill: null, newType: '' })} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleEditEcfType} disabled={loading} className="flex-1 bg-purple-600 hover:bg-purple-700" data-testid="save-ecf-type-btn">
                {loading ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Después de guardar, presiona <RefreshCw size={10} className="inline mx-0.5 text-amber-500" /> Reenviar para enviar a DGII
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// 🔒 EcfHealthPanel — Admin-only diagnostic panel for Multiprod health
// ══════════════════════════════════════════════════════════════════
function EcfHealthPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/ecf/health-metrics`, { headers: hdrs() });
      if (r.ok) {
        const d = await r.json();
        setData(d);
      } else if (r.status !== 403) {
        notify.error('Error cargando métricas');
      }
    } catch {
      notify.error('Error de conexión');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && !data) fetchMetrics();
  }, [open]); // eslint-disable-line

  const tierColor = {
    excellent: 'text-emerald-500',
    good: 'text-green-500',
    warning: 'text-amber-500',
    critical: 'text-red-500',
    unknown: 'text-muted-foreground',
  }[data?.health_tier || 'unknown'];

  const tierBg = {
    excellent: 'bg-emerald-500/10 border-emerald-500/30',
    good: 'bg-green-500/10 border-green-500/30',
    warning: 'bg-amber-500/10 border-amber-500/30',
    critical: 'bg-red-500/10 border-red-500/30',
    unknown: 'bg-muted/20 border-border',
  }[data?.health_tier || 'unknown'];

  const tierEmoji = {
    excellent: '🟢',
    good: '🟢',
    warning: '🟡',
    critical: '🔴',
    unknown: '⚪',
  }[data?.health_tier || 'unknown'];

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden"
      data-testid="ecf-health-panel"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-all"
        data-testid="ecf-health-panel-toggle"
      >
        <Activity size={18} className="text-indigo-500" />
        <div className="flex-1 text-left">
          <h3 className="font-oswald font-bold text-sm uppercase tracking-wide">
            Diagnóstico Multiprod · Últimas 24h
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Panel exclusivo para administradores
          </p>
        </div>
        {data && (
          <Badge className={`${tierBg} ${tierColor} text-xs font-bold`}>
            {tierEmoji} {data.acceptance_rate !== null ? `${data.acceptance_rate}%` : 'Sin datos'}
          </Badge>
        )}
        {open ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 py-4 border-t border-border space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-indigo-500" />
              <span className="ml-2 text-sm text-muted-foreground">Cargando métricas...</span>
            </div>
          )}

          {!loading && data && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className={`rounded-lg border p-3 ${tierBg}`} data-testid="metric-acceptance-rate">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tasa de aceptación</p>
                  <p className={`font-oswald text-2xl font-bold ${tierColor}`}>
                    {data.acceptance_rate !== null ? `${data.acceptance_rate}%` : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {data.accepted} de {data.total_sends} envíos
                  </p>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3" data-testid="metric-rejected">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rechazadas DGII</p>
                  <p className="font-oswald text-2xl font-bold text-red-500">{data.rejected}</p>
                  <p className="text-[10px] text-muted-foreground">Requieren acción manual</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="metric-transient">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Errores transitorios</p>
                  <p className="font-oswald text-2xl font-bold text-amber-500">{data.transient_errors}</p>
                  <p className="text-[10px] text-muted-foreground">Reintentados automáticamente</p>
                </div>
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3" data-testid="metric-response-time">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tiempo respuesta</p>
                  <p className="font-oswald text-2xl font-bold text-blue-500">
                    {data.response_times?.avg_ms || 0}<span className="text-sm">ms</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    P95: {data.response_times?.p95_ms || 0}ms · {data.response_times?.samples || 0} muestras
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={14} className="text-indigo-500" />
                  <h4 className="font-semibold text-xs uppercase tracking-wide">Actividad por hora (24h)</h4>
                </div>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.hourly_series || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.15)" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                      <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                      <Bar dataKey="accepted" stackId="a" fill="#10b981" name="Aceptadas" />
                      <Bar dataKey="rejected" stackId="a" fill="#ef4444" name="Rechazadas" />
                      <Bar dataKey="retry" stackId="a" fill="#3b82f6" name="Retry" />
                      <Bar dataKey="error" stackId="a" fill="#f59e0b" name="Error" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-background/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-red-500" />
                    <h4 className="font-semibold text-xs uppercase tracking-wide">
                      Top motivos de rechazo
                    </h4>
                  </div>
                  {(data.top_reject_reasons || []).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      Sin rechazos en las últimas 24h 🎉
                    </p>
                  ) : (
                    <ul className="space-y-1.5" data-testid="top-reject-list">
                      {data.top_reject_reasons.map((r, i) => (
                        <li key={i} className="text-[11px] flex items-start gap-2">
                          <span className="font-bold font-mono text-red-500 min-w-[24px]">
                            {r.count}×
                          </span>
                          <span className="text-foreground/80 break-words">{r.motivo}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-background/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-amber-500" />
                    <h4 className="font-semibold text-xs uppercase tracking-wide">
                      Cola de auto-retry
                    </h4>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const count = data.queue_state?.[`attempt_${n}`] || 0;
                      return (
                        <div
                          key={n}
                          className={`rounded p-2 text-center ${count > 0 ? 'bg-blue-500/15 border border-blue-500/30' : 'bg-muted/20 border border-border'}`}
                          data-testid={`queue-attempt-${n}`}
                        >
                          <p className="font-oswald font-bold text-lg">{count}</p>
                          <p className="text-[9px] text-muted-foreground">#{n}</p>
                        </div>
                      );
                    })}
                  </div>
                  {(data.queue_state?.exhausted || 0) > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <Ban size={10} className="inline mr-1" />
                      {data.queue_state.exhausted} agotadas (5/5 intentos fallidos)
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
                <span>
                  Generado: {data.generated_at ? new Date(data.generated_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
                </span>
                <Button
                  onClick={fetchMetrics}
                  disabled={loading}
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  data-testid="refresh-health-metrics"
                >
                  <RefreshCw size={11} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refrescar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
