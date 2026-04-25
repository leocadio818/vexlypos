import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import {
  Activity, Database, Printer, FileText, ShoppingCart, AlertTriangle,
  CheckCircle2, XCircle, Clock, GitCommit, RefreshCw, Heart
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const STATUS_STYLES = {
  ok: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'OK', Icon: CheckCircle2 },
  warning: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'Atención', Icon: AlertTriangle },
  error: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Error', Icon: XCircle },
  unknown: { color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-border', label: 'Sin datos', Icon: Clock },
  disabled: { color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-border', label: 'Desactivado', Icon: Clock },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.unknown;
  const { Icon } = s;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${s.bg} ${s.color} border ${s.border}`}>
      <Icon size={11} /> {s.label}
    </span>
  );
}

function HealthCard({ title, icon: Icon, iconColor, status, message, children, testId }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.unknown;
  return (
    <div className={`bg-card border rounded-xl p-4 ${s.border}`} data-testid={testId}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.bg}`}>
            <Icon size={16} className={iconColor || s.color} />
          </div>
          <h3 className="text-sm font-semibold truncate">{title}</h3>
        </div>
        <StatusPill status={status} />
      </div>
      <p className="text-xs text-muted-foreground mb-2">{message}</p>
      {children}
    </div>
  );
}

export default function HealthTab() {
  const { user } = useAuth();
  const isPrivileged = user?.is_super_admin === true || (user?.role || '').toLowerCase() === 'admin';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const intervalRef = useRef(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/system/health-check`, { headers: headers() });
      setData(res.data);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Error al obtener el estado del sistema');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPrivileged) { setLoading(false); return; }
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, 30000); // 30s polling
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPrivileged, fetchHealth]);

  if (!isPrivileged) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Heart size={32} className="mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Esta pestaña es exclusiva para Administradores.</p>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground animate-pulse">Cargando estado del sistema...</div>;
  }

  if (error && !data) {
    return (
      <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-6 text-center">
        <XCircle size={28} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-red-500 font-semibold mb-1">{error}</p>
        <button onClick={fetchHealth} className="mt-2 inline-flex items-center gap-1.5 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const global = STATUS_STYLES[data.global_status] || STATUS_STYLES.unknown;

  return (
    <div className="space-y-4" data-testid="health-tab">
      {/* Global status header */}
      <div className={`rounded-xl p-5 border-2 ${global.border} ${global.bg}`} data-testid="health-global-status">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${global.bg} border ${global.border}`}>
              <Heart size={22} className={global.color} />
            </div>
            <div>
              <h2 className="font-oswald text-lg font-bold">Estado del Sistema</h2>
              <div className="flex items-center gap-2 mt-1">
                <StatusPill status={data.global_status} />
                {lastRefresh && (
                  <span className="text-[11px] text-muted-foreground">
                    Actualizado: {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={fetchHealth}
            className="inline-flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-2 rounded-lg font-semibold hover:opacity-90"
            data-testid="health-refresh-btn"
          >
            <RefreshCw size={13} /> Refrescar
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Monitoreo en tiempo real de los subsistemas críticos. Se actualiza cada 30 segundos.
        </p>
      </div>

      {/* Grid de checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <HealthCard
          title="MongoDB"
          icon={Database}
          status={data.mongo.status}
          message={data.mongo.message}
          testId="health-mongo"
        >
          {data.mongo.latency_ms != null && (
            <div className="text-xs">
              <span className="text-muted-foreground">Latencia:</span>{' '}
              <span className="font-mono font-bold">{data.mongo.latency_ms}ms</span>
            </div>
          )}
        </HealthCard>

        <HealthCard
          title="Print Agent"
          icon={Printer}
          status={data.print_agent.status}
          message={data.print_agent.message}
          testId="health-print-agent"
        >
          <div className="flex gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Cola pendiente:</span>{' '}
              <span className="font-mono font-bold">{data.print_agent.pending}</span>
            </div>
            {data.print_agent.last_activity && (
              <div className="text-[11px] text-muted-foreground truncate">
                Último: {new Date(data.print_agent.last_activity).toLocaleString()}
              </div>
            )}
          </div>
        </HealthCard>

        <HealthCard
          title="e-CF (DGII)"
          icon={FileText}
          status={data.ecf.status}
          message={data.ecf.message}
          testId="health-ecf"
        >
          <div className="text-xs space-y-0.5">
            <div>
              <span className="text-muted-foreground">Proveedor:</span>{' '}
              <span className="font-semibold capitalize">{data.ecf.provider}</span>
            </div>
            {data.ecf.last_ncf && (
              <div>
                <span className="text-muted-foreground">Último NCF:</span>{' '}
                <span className="font-mono font-bold">{data.ecf.last_ncf}</span>
              </div>
            )}
          </div>
        </HealthCard>

        <HealthCard
          title="Órdenes Activas"
          icon={ShoppingCart}
          status={data.orders.status}
          message={data.orders.message}
          testId="health-orders"
        >
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Activas:</span>{' '}
              <span className="font-mono font-bold text-emerald-500">{data.orders.active}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Sin facturar:</span>{' '}
              <span className="font-mono font-bold text-amber-500">{data.orders.unbilled}</span>
            </div>
          </div>
        </HealthCard>

        <HealthCard
          title="Errores recientes (24h)"
          icon={AlertTriangle}
          status={data.errors.status}
          message={data.errors.message}
          testId="health-errors"
        >
          {data.errors.recent.length > 0 ? (
            <ul className="space-y-1 text-[11px] max-h-28 overflow-auto mt-1">
              {data.errors.recent.map((e, i) => (
                <li key={i} className="p-1.5 bg-muted/30 rounded border border-border">
                  <div className="font-mono truncate" title={e.message}>{e.message}</div>
                  <div className="text-muted-foreground text-[10px]">
                    {e.source} · {e.created_at}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-emerald-500">Sin errores registrados ✓</div>
          )}
        </HealthCard>

        <HealthCard
          title="Build / Versión"
          icon={GitCommit}
          status="ok"
          message={`VexlyPOS v${data.build.version}`}
          testId="health-build"
        >
          <div className="text-xs space-y-0.5 font-mono">
            <div>
              <span className="text-muted-foreground">Commit:</span>{' '}
              <span className="font-bold">{data.build.commit || 'N/A'}</span>
            </div>
            {data.build.build_date && (
              <div className="text-[11px] text-muted-foreground truncate" title={data.build.build_date}>
                {data.build.build_date}
              </div>
            )}
          </div>
        </HealthCard>
      </div>

      <div className="text-[11px] text-muted-foreground text-center pt-2">
        <Activity size={11} className="inline mr-1" />
        Polling cada 30s · Los datos provienen directamente de MongoDB en tiempo real
      </div>
    </div>
  );
}
