import { useState, useEffect } from 'react';
import { authAPI } from '@/lib/api';
import { Users, LogOut, Shield, Clock, RefreshCw, Timer } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABELS = { admin: 'Admin', manager: 'Gerente', cashier: 'Cajero', waiter: 'Mesero' };

function timeSince(dateStr) {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function SessionsTab() {
  const { user: currentUser } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, session: null });

  // Auto-logout config
  const [autoLogout, setAutoLogout] = useState({ enabled: false, timeout_minutes: 30 });
  const [savingConfig, setSavingConfig] = useState(false);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const res = await authAPI.activeSessions();
      setSessions(res.data || []);
    } catch { notify.error('Error cargando sesiones'); }
    finally { setLoading(false); }
  };

  const loadConfig = async () => {
    try {
      const res = await authAPI.getAutoLogoutConfig();
      setAutoLogout(res.data || { enabled: false, timeout_minutes: 30 });
    } catch {}
  };

  useEffect(() => { loadSessions(); loadConfig(); }, []);

  const handleRevoke = async () => {
    const { session } = confirmDialog;
    if (!session) return;
    setRevoking(session.user_id);
    try {
      await authAPI.revokeSession(session.user_id);
      notify.success(`Sesion de ${session.user_name} cerrada`);
      loadSessions();
    } catch (err) {
      notify.error(err?.response?.data?.detail || 'Error cerrando sesion');
    } finally {
      setRevoking(null);
      setConfirmDialog({ open: false, session: null });
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await authAPI.updateAutoLogoutConfig(autoLogout);
      notify.success('Configuracion guardada');
    } catch (err) {
      notify.error(err?.response?.data?.detail || 'Error guardando');
    } finally { setSavingConfig(false); }
  };

  return (
    <div className="space-y-6" data-testid="sessions-tab">
      {/* Auto-logout config */}
      <div className="border border-border rounded-xl p-4 space-y-3" data-testid="auto-logout-section">
        <div className="flex items-center gap-2">
          <Timer size={18} className="text-primary" />
          <h3 className="font-oswald font-bold text-base text-auto-foreground">Auto-Logout por Inactividad</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Cierra la sesion automaticamente si el usuario no interactua con el sistema por un periodo de tiempo.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-auto-foreground">Activar auto-logout</span>
          <Switch
            checked={autoLogout.enabled}
            onCheckedChange={v => setAutoLogout(c => ({ ...c, enabled: v }))}
            data-testid="auto-logout-toggle"
          />
        </div>
        {autoLogout.enabled && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-auto-foreground whitespace-nowrap">Cerrar sesion despues de:</label>
            <select
              value={autoLogout.timeout_minutes}
              onChange={e => setAutoLogout(c => ({ ...c, timeout_minutes: parseInt(e.target.value) }))}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-auto-foreground"
              data-testid="auto-logout-timeout"
            >
              <option value={5}>5 minutos</option>
              <option value={10}>10 minutos</option>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={120}>2 horas</option>
              <option value={240}>4 horas</option>
              <option value={480}>8 horas</option>
            </select>
          </div>
        )}
        <Button size="sm" onClick={handleSaveConfig} disabled={savingConfig} data-testid="save-auto-logout-btn">
          {savingConfig ? 'Guardando...' : 'Guardar configuracion'}
        </Button>
      </div>

      {/* Active Sessions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            <h3 className="font-oswald font-bold text-base text-auto-foreground">Sesiones Activas</h3>
            <span className="text-xs text-muted-foreground">({sessions.length})</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadSessions} data-testid="refresh-sessions-btn">
            <RefreshCw size={14} className="mr-1" /> Refrescar
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No hay sesiones activas</div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => {
              const isMe = s.user_id === currentUser?.id;
              return (
                <div
                  key={s.user_id}
                  className={`border rounded-xl p-3 flex items-center justify-between gap-3 ${isMe ? 'border-primary/50 bg-primary/5' : 'border-border'}`}
                  data-testid={`session-${s.user_id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${s.role === 'admin' ? 'bg-primary' : s.role === 'manager' ? 'bg-blue-500' : s.role === 'cashier' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                      {(s.user_name || '?')[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-auto-foreground truncate">{s.user_name}</span>
                        {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">TU</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{ROLE_LABELS[s.role] || s.role}</span>
                        <span>|</span>
                        <Clock size={10} />
                        <span>Activo hace {timeSince(s.last_activity)}</span>
                      </div>
                    </div>
                  </div>
                  {!isMe && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDialog({ open: true, session: s })}
                      disabled={revoking === s.user_id}
                      className="shrink-0 min-h-[40px] min-w-[40px]"
                      data-testid={`revoke-btn-${s.user_id}`}
                    >
                      <LogOut size={14} className="sm:mr-1" />
                      <span className="hidden sm:inline">Cerrar</span>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={v => !v && setConfirmDialog({ open: false, session: null })}>
        <DialogContent className="max-w-sm" data-testid="confirm-revoke-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald">Cerrar sesion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-auto-foreground">
            Estas seguro que quieres cerrar la sesion de <strong>{confirmDialog.session?.user_name}</strong>?
          </p>
          <p className="text-xs text-muted-foreground">
            El usuario sera desconectado inmediatamente y debera volver a iniciar sesion.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, session: null })}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={!!revoking} data-testid="confirm-revoke-btn">
              {revoking ? 'Cerrando...' : 'Cerrar sesion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
