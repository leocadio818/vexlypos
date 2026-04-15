import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, RefreshCw, Printer, AlertTriangle, CheckCircle2, Clock, XCircle, Search, Pencil, Loader2, Ban } from 'lucide-react';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';

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
    if (bill.ecf_reject_reason) return 'REJECTED';
    if (s === 'PROCESSING') return 'PROCESSING';
    if (s === 'CONTINGENCIA' && (bill.ecf_error || '').includes('contingencia_manual')) return 'CONTINGENCIA_MANUAL';
    return STATUS_MAP[s] ? s : 'ERROR';
  };

  const filteredBills = bills.filter(b => {
    if (onlyMine && user?.id && b.cashier_id !== user.id && b.waiter_id !== user.id) return false;
    if (filter === 'all') return true;
    return getStatus(b) === filter;
  });

  const handleRefreshStatus = async (billId) => {
    try {
      const r = await fetch(`${API}/api/ecf/refresh-status/${billId}`, { headers: hdrs() });
      const d = await r.json();
      if (d.ok) {
        notify.success(`Status: ${d.status}${d.reject_reason ? ' — ' + d.reject_reason : ''}`);
        // Refresh data
        const res = await fetch(`${API}/api/ecf/dashboard`, { headers: hdrs() });
        const fresh = await res.json();
        setBills(fresh.bills || []);
        setSummary(fresh.summary || {});
      } else {
        notify.error(d.message);
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

  const handleRetryAll = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/ecf/retry-all`, { method: 'POST', headers: hdrs() });
      const d = await r.json();
      notify.success(`Reintentos: ${d.success} exitosos, ${d.failed} fallidos de ${d.total}`);
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
          <Loader2 size={18} className="text-cyan-600 dark:text-cyan-400 mx-auto mb-1 animate-spin" />
          <p className="font-oswald text-xl font-bold text-cyan-600 dark:text-cyan-400">{bills.filter(b => getStatus(b) === 'PROCESSING').length}</p>
          <p className="text-[10px] font-bold text-slate-800 dark:text-cyan-100">Procesando</p>
        </button>
        <button onClick={() => setFilter('CONTINGENCIA')} className={`bg-amber-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'CONTINGENCIA' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-amber-500/30'}`}>
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-amber-600 dark:text-amber-400">{summary.contingencia || 0}</p>
          <p className="text-[10px] font-bold text-slate-800 dark:text-amber-100">Contingencia</p>
        </button>
        <button onClick={() => setFilter('CONTINGENCIA_MANUAL')} className={`bg-gray-500/10 border rounded-xl p-3 text-center transition-all ${filter === 'CONTINGENCIA_MANUAL' ? 'border-gray-500 ring-2 ring-gray-500/20' : 'border-gray-500/30'}`}>
          <Ban size={18} className="text-gray-500 dark:text-gray-400 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-gray-600 dark:text-gray-400">{bills.filter(b => getStatus(b) === 'CONTINGENCIA_MANUAL').length}</p>
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

      {/* Action buttons */}
      {(summary.contingencia > 0 || bills.some(b => getStatus(b) === 'CONTINGENCIA_MANUAL')) && (
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleRetryAll} disabled={loading} variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
            <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> Reintentar Todas las Contingencias ({summary.contingencia || 0})
          </Button>
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
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {b.ecf_reject_reason || b.ecf_error || (b.ecf_provider ? `via ${b.ecf_provider}` : '') || (b.ecf_security_code ? `Código: ${b.ecf_security_code}` : '—')}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleRefreshStatus(b.id)} title="Actualizar status" className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]">
                          <Search size={14} className="text-blue-500" />
                        </button>
                        {(status === 'CONTINGENCIA' || status === 'CONTINGENCIA_MANUAL') && (
                          <>
                            <button 
                              onClick={() => setEditDialog({ open: true, bill: b, newType: b.ncf?.replace('PENDING-', '') || 'E32' })} 
                              title="Editar tipo e-CF" 
                              className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]"
                              data-testid="edit-ecf-type-btn"
                            >
                              <Pencil size={14} className="text-purple-500" />
                            </button>
                            <button onClick={() => handleRetry(b.id)} title="Reintentar" disabled={loading} className="p-1.5 rounded-lg hover:bg-muted transition-all min-w-[32px] min-h-[32px]">
                              <RefreshCw size={14} className={`text-amber-500 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                          </>
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
