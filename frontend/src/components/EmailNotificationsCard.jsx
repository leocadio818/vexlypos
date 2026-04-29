/**
 * EmailNotificationsCard
 * ---------------------------------------------
 * Per-tenant email notification configuration:
 * - Recipient list (add/remove)
 * - Toggles for shift-close, day-close, stock alerts
 * - "Send test" button
 *
 * Visible only when the user has `manage_email_notifications`.
 * Persists straight to system_config (id="main") so every pod
 * keeps its own list — no cross-tenant leakage.
 */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Bell, Plus, X, Send, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailNotificationsCard() {
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [toggles, setToggles] = useState({
    notify_shift_close: true,
    notify_day_close: true,
    notify_stock_alerts: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${API}/system/config`, { headers: hdrs() });
        const d = r.data || {};
        const arr = Array.isArray(d.notification_emails) ? d.notification_emails : [];
        setEmails(arr);
        setToggles({
          notify_shift_close: d.notify_shift_close !== false,
          notify_day_close: d.notify_day_close !== false,
          notify_stock_alerts: d.notify_stock_alerts !== false,
        });
      } catch {
        // silent — empty state is fine
      }
      setLoading(false);
    })();
  }, []);

  const persist = async (patch) => {
    setSaving(true);
    try {
      await axios.put(`${API}/system/config`, patch, { headers: hdrs() });
      notify.success('Notificaciones guardadas');
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error al guardar');
    }
    setSaving(false);
  };

  const handleAddEmail = () => {
    const e = (newEmail || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      notify.error('Email inválido');
      return;
    }
    if (emails.includes(e)) {
      notify.error('Ya existe en la lista');
      return;
    }
    const next = [...emails, e];
    setEmails(next);
    setNewEmail('');
    persist({ notification_emails: next });
  };

  const handleRemoveEmail = (e) => {
    const next = emails.filter((x) => x !== e);
    setEmails(next);
    persist({ notification_emails: next });
  };

  const handleToggle = (key) => {
    const next = { ...toggles, [key]: !toggles[key] };
    setToggles(next);
    persist({ [key]: next[key] });
  };

  const handleSendTest = async () => {
    if (emails.length === 0) {
      notify.error('Agrega al menos un email primero');
      return;
    }
    setTesting(true);
    try {
      const r = await axios.post(
        `${API}/email-notifications/test`,
        { email: emails[0] },
        { headers: hdrs() }
      );
      if (r.data?.ok) {
        notify.success(`Test enviado a ${r.data.sent_to}`);
      } else {
        notify.error('No se pudo enviar el test (revisa config Resend)');
      }
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error al enviar test');
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-4 animate-pulse h-32" />
    );
  }

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 mb-4"
      data-testid="email-notifications-card"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bell className="text-orange-500" size={20} />
          <h3 className="font-semibold text-foreground">Notificaciones por Email</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSendTest}
          disabled={testing || saving || emails.length === 0}
          data-testid="email-notifications-test-btn"
        >
          <Send size={14} className="mr-1" />
          {testing ? 'Enviando…' : 'Enviar Test'}
        </Button>
      </div>

      {/* Recipients */}
      <div className="mb-4">
        <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
          Destinatarios
        </label>
        <div className="flex gap-2 mb-2 flex-wrap">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
            placeholder="contador@empresa.com"
            className="flex-1 min-w-[180px] px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground"
            data-testid="email-notifications-input"
          />
          <Button
            onClick={handleAddEmail}
            disabled={saving}
            data-testid="email-notifications-add-btn"
          >
            <Plus size={14} className="mr-1" />
            Agregar
          </Button>
        </div>

        {emails.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-dashed border-border rounded-md px-3 py-2">
            <AlertTriangle size={14} className="text-amber-500" />
            Sin destinatarios — los reportes no se enviarán por email.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {emails.map((e) => (
              <div
                key={e}
                className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/30 text-orange-700 dark:text-orange-300 rounded-full pl-3 pr-1 py-1 text-xs"
                data-testid={`email-pill-${e}`}
              >
                <span>{e}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveEmail(e)}
                  className="hover:bg-orange-500/20 rounded-full p-0.5"
                  data-testid={`email-remove-${e}`}
                  aria-label={`Eliminar ${e}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="space-y-2 border-t border-border pt-3">
        {[
          { key: 'notify_shift_close', label: 'Enviar reporte al cerrar caja' },
          { key: 'notify_day_close', label: 'Enviar reporte al cerrar jornada' },
          { key: 'notify_stock_alerts', label: 'Enviar alerta de stock bajo (cada 6 horas)' },
        ].map((t) => (
          <label
            key={t.key}
            className="flex items-center justify-between cursor-pointer py-1.5"
            data-testid={`email-toggle-${t.key}`}
          >
            <span className="text-sm text-foreground">{t.label}</span>
            <button
              type="button"
              onClick={() => handleToggle(t.key)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                toggles[t.key] ? 'bg-orange-500' : 'bg-muted'
              }`}
              role="switch"
              aria-checked={toggles[t.key]}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                  toggles[t.key] ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}
