import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Mail, Crown, Info } from 'lucide-react';
import { notify } from '@/lib/notify';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Registry of flags rendered in the UI. Each entry matches
// a key returned by GET /api/features.
const FLAG_DEFINITIONS = [
  {
    key: 'email_marketing',
    icon: Mail,
    title: 'Email Marketing',
    description: 'Envío masivo de emails a clientes (botón Email en pantalla Clientes). Útil para campañas, promociones y noticias.',
    premium: true,
  },
  // Future:
  // { key: 'inventory', icon: Package, title: 'Inventario Maestro', description: '...' },
  // { key: 'reservations', icon: Calendar, title: 'Reservas', description: '...' },
];

export default function PlanTab() {
  const { user } = useAuth();
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // flag key currently being updated

  const isAdmin = ['admin', 'owner', 'propietario'].includes((user?.role || '').toLowerCase());

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/features`, { headers: headers() });
        setFlags(res.data || {});
      } catch {
        setFlags({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (key, next) => {
    if (!isAdmin) { notify.error('Solo administradores pueden cambiar flags'); return; }
    setSaving(key);
    const prev = flags[key];
    setFlags(f => ({ ...f, [key]: next }));
    try {
      const res = await axios.put(`${API}/features`, { [key]: next }, { headers: headers() });
      setFlags(res.data || {});
      notify.success(next ? `Función activada: ${FLAG_DEFINITIONS.find(f=>f.key===key)?.title}` : `Función desactivada`);
    } catch (e) {
      setFlags(f => ({ ...f, [key]: prev }));
      notify.error(e.response?.data?.detail || 'Error al actualizar');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>;

  return (
    <div className="space-y-4" data-testid="plan-tab">
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Crown size={20} className="text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-oswald text-lg font-bold">Plan y Funciones Premium</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Activa o desactiva funciones premium para tu restaurante. {isAdmin ? '' : 'Solo los administradores pueden modificar estos flags.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {FLAG_DEFINITIONS.map(def => {
          const Icon = def.icon;
          const active = !!flags[def.key];
          const isSaving = saving === def.key;
          return (
            <div
              key={def.key}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-3"
              data-testid={`plan-flag-${def.key}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{def.title}</h3>
                  {def.premium && <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">PREMIUM</Badge>}
                  {active
                    ? <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 text-[10px]">Activada</Badge>
                    : <Badge variant="secondary" className="text-[10px]">Inactiva</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{def.description}</p>
              </div>
              <div className="shrink-0">
                <Switch
                  checked={active}
                  onCheckedChange={(v) => handleToggle(def.key, v)}
                  disabled={!isAdmin || isSaving}
                  data-testid={`plan-toggle-${def.key}`}
                  aria-label={`Toggle ${def.title}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-muted/30 border border-border rounded-xl p-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info size={14} className="shrink-0 mt-0.5" />
        <p>
          Las funciones desactivadas no muestran su UI ni aceptan llamadas en el backend (HTTP 403). Los cambios se aplican inmediatamente a todos los usuarios.
        </p>
      </div>
    </div>
  );
}
