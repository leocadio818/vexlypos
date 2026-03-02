import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { UserCheck, ArrowRightLeft, Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function TransferTableModal({ open, onClose, tableId, currentUserId, currentUserName }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [transferAll, setTransferAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');

  useEffect(() => {
    if (open) {
      // Load clocked-in users directly (no role filtering)
      axios.get(`${API}/attendance/clocked-in-users`, { headers: hdrs() }).then(r => {
        setUsers(r.data || []);
      }).catch(() => {});
      setSelectedUser(null);
      setTransferAll(false);
      setAdminPin('');
      setNeedsAuth(false);
    }
  }, [open, currentUserId]);

  const handleTransfer = async () => {
    if (!selectedUser) { toast.error('Selecciona un usuario destino'); return; }
    setLoading(true);
    try {
      const payload = {
        target_user_id: selectedUser.id,
        table_ids: transferAll ? [] : [tableId],
        transfer_all: transferAll,
        authorized_by_pin: adminPin || '',
      };
      const res = await axios.post(`${API}/tables/transfer`, payload, { headers: hdrs() });
      const data = res.data;
      const count = data.transferred?.length || 0;
      toast.success(`${count} mesa(s) transferida(s) a ${data.to_user}${data.authorized_by ? ` (Autorizado: ${data.authorized_by})` : ''}`);
      onClose(true);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al transferir';
      if (msg.includes('autorizacion') || msg.includes('PIN')) {
        setNeedsAuth(true);
      } else {
        toast.error(msg);
      }
    }
    setLoading(false);
  };

  const roleLabels = { admin: 'Admin', supervisor: 'Supervisor', cashier: 'Cajero', waiter: 'Mesero' };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-md" data-testid="transfer-table-modal">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-primary" />
            Transferir Mesa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Transfiere la titularidad de {transferAll ? 'todas tus mesas' : 'esta mesa'} a otro usuario activo.
          </p>

          {/* Transfer All Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted border border-border">
            <div>
              <p className="text-sm font-medium">Transferir todas mis mesas</p>
              <p className="text-xs text-muted-foreground">Incluye todas las mesas abiertas a tu nombre</p>
            </div>
            <Switch checked={transferAll} onCheckedChange={setTransferAll} data-testid="transfer-all-toggle" />
          </div>

          {/* User selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Seleccionar usuario destino</label>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No hay usuarios activos disponibles</p>
              ) : users.map(u => (
                <button key={u.id} onClick={() => u.clockedIn && setSelectedUser(u)}
                  disabled={!u.clockedIn}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    !u.clockedIn
                      ? 'opacity-40 cursor-not-allowed bg-muted border border-border'
                      : selectedUser?.id === u.id
                        ? 'bg-primary/20 border-2 border-primary active:scale-98'
                        : 'bg-card border border-border hover:border-primary/50 active:scale-98'
                  }`}
                  data-testid={`transfer-user-${u.id}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-oswald font-bold ${
                    u.clockedIn ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {u.name?.[0]}
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-medium text-sm">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[u.role] || u.role}
                      {u.clockedIn
                        ? <span className="ml-2 text-green-500 font-bold">En turno</span>
                        : <span className="ml-2 text-red-400">Sin entrada</span>
                      }
                    </p>
                  </div>
                  {selectedUser?.id === u.id && (
                    <UserCheck size={18} className="text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Admin PIN Auth (if needed) */}
          {needsAuth && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-amber-500" />
                <p className="text-sm font-bold text-amber-600">Autorizacion Requerida</p>
              </div>
              <p className="text-xs text-muted-foreground">Ingresa el PIN de un administrador o supervisor para autorizar esta transferencia.</p>
              <input
                type="password"
                value={adminPin}
                onChange={e => setAdminPin(e.target.value)}
                placeholder="PIN de administrador"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-center font-mono tracking-widest"
                data-testid="transfer-admin-pin"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onClose(false)} className="flex-1 h-11 font-oswald">
              Cancelar
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!selectedUser || loading}
              className="flex-1 h-11 bg-primary text-primary-foreground font-oswald font-bold"
              data-testid="confirm-transfer-btn"
            >
              {loading ? 'Transfiriendo...' : 'TRANSFERIR'}
            </Button>
          </div>

          {/* Info */}
          <p className="text-[10px] text-muted-foreground text-center">
            <Lock size={10} className="inline mr-1" />
            Esta accion queda registrada en el historial de auditoria de cada orden.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
