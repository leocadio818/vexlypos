import { useState, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { Printer, Building2, ShieldAlert, MapPin, Phone, Mail, FileText, Eye, EyeOff, RotateCcw, AlertTriangle, Globe, Clock, Trash2, Save, Key, CheckCircle2, XCircle } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidateTimezoneCache } from '@/lib/timezone';
import ThermalTicket from '@/components/ThermalTicket';
import EmailNotificationsCard from '@/components/EmailNotificationsCard';
import axios from 'axios';
import { PROVINCIAS, MUNICIPIOS_BY_PROVINCIA } from '@/data/dgii_territories';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// ── e-CF Credentials Form Component ──
function EcfCredentialsForm({ provider }) {
  const [creds, setCreds] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/system/ecf-credentials/${provider}`, { headers: hdrs() });
        if (r.ok) setCreds(await r.json());
      } catch {}
      setLoading(false);
    })();
  }, [provider]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { provider };
      if (provider === 'alanube') {
        if (creds.token && !creds.token.startsWith('****')) body.token = creds.token;
        body.rnc = creds.rnc || '';
        body.environment = creds.environment || 'sandbox';
      } else {
        body.user = creds.user || '';
        if (creds.password && !creds.password.startsWith('****')) body.password = creds.password;
        body.rnc = creds.rnc || '';
        body.company_name = creds.company_name || '';
        body.environment = creds.environment || 'sandbox';
      }
      const r = await fetch(`${API}/system/ecf-credentials`, {
        method: 'PUT', headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) notify.success(d.message || 'Credenciales guardadas');
      else notify.error('Error al guardar');
    } catch { notify.error('Error de conexión'); }
    setSaving(false);
  };

  if (loading) return <div className="bg-card border border-border rounded-xl p-4 mb-4 animate-pulse h-24" />;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4" data-testid="ecf-credentials-form">
      <div className="flex items-center gap-2 mb-3">
        <Key size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          Credenciales {provider === 'thefactory' ? 'The Factory HKA' : 'Alanube'}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {provider === 'thefactory'
          ? 'Ingresa las credenciales proporcionadas por The Factory HKA.'
          : 'Ingresa el API Token proporcionado por Alanube.'
        }
      </p>

      <div className="space-y-2">
        {provider === 'alanube' ? (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">API Token</label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={creds.token || ''}
                onChange={e => setCreds(p => ({ ...p, token: e.target.value }))}
                placeholder="Pega tu token de Alanube aquí"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                data-testid="ecf-alanube-token"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">RNC</label>
              <input
                value={creds.rnc || ''}
                onChange={e => setCreds(p => ({ ...p, rnc: e.target.value }))}
                placeholder="000000000"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                data-testid="ecf-alanube-rnc"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">TokenUsuario</label>
              <input
                value={creds.user || ''}
                onChange={e => setCreds(p => ({ ...p, user: e.target.value }))}
                placeholder="usuario_tfhka"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                data-testid="ecf-tf-user"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">TokenPassword</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={creds.password || ''}
                  onChange={e => setCreds(p => ({ ...p, password: e.target.value }))}
                  placeholder="Contraseña"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground pr-10"
                  data-testid="ecf-tf-password"
                />
                <button
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  type="button"
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">RNC</label>
                <input
                  value={creds.rnc || ''}
                  onChange={e => setCreds(p => ({ ...p, rnc: e.target.value }))}
                  placeholder="000000000"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  data-testid="ecf-tf-rnc"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nombre Empresa</label>
                <input
                  value={creds.company_name || ''}
                  onChange={e => setCreds(p => ({ ...p, company_name: e.target.value }))}
                  placeholder="Mi Empresa SRL"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  data-testid="ecf-tf-company"
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Ambiente</label>
          <div className="flex gap-2">
            {['sandbox', 'production'].map(env => (
              <button
                key={env}
                onClick={() => setCreds(p => ({ ...p, environment: env }))}
                className={`flex-1 py-1.5 px-3 text-xs rounded-lg border transition-all ${
                  (creds.environment || 'sandbox') === env
                    ? env === 'production' ? 'border-amber-500 bg-amber-500/10 text-amber-600 font-semibold' : 'border-emerald-500 bg-emerald-500/10 text-emerald-600 font-semibold'
                    : 'border-border text-muted-foreground'
                }`}
                data-testid={`ecf-env-${env}`}
              >
                {env === 'sandbox' ? 'Sandbox (Pruebas)' : 'Producción'}
              </button>
            ))}
          </div>
          {(creds.environment === 'production') && (
            <p className="text-xs text-amber-500 mt-1">Las facturas en producción son reales y se enviarán a la DGII.</p>
          )}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-3 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        data-testid="ecf-save-credentials"
      >
        <Save size={14} />
        {saving ? 'Guardando...' : 'Guardar Credenciales'}
      </button>
    </div>
  );
}

// ── Multiprod Credentials Form Component ──
function MultiprodCredentialsForm() {
  const [config, setConfig] = useState({ multiprod_endpoint: '', multiprod_token: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/ecf/config`, { headers: hdrs() });
        if (r.ok) {
          const d = await r.json();
          setConfig({
            multiprod_endpoint: d.has_multiprod_endpoint ? '****configurado****' : '',
            multiprod_token: d.has_multiprod_token ? '****configurado****' : '',
          });
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { provider: 'multiprod' };
      if (config.multiprod_endpoint && !config.multiprod_endpoint.startsWith('****'))
        body.multiprod_endpoint = config.multiprod_endpoint;
      if (config.multiprod_token && !config.multiprod_token.startsWith('****'))
        body.multiprod_token = config.multiprod_token;
      const r = await fetch(`${API}/ecf/config`, {
        method: 'PUT', headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) notify.success('Configuracion Multiprod guardada');
      else notify.error(d.detail || 'Error al guardar');
    } catch { notify.error('Error de conexion'); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/ecf/test-multiprod`, { method: 'POST', headers: hdrs() });
      const d = await r.json();
      setTestResult(d);
    } catch { setTestResult({ ok: false, message: 'Error de conexion' }); }
    setTesting(false);
  };

  if (!loaded) return <div className="bg-card border border-border rounded-xl p-4 mb-4 animate-pulse h-24" />;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4" data-testid="multiprod-credentials-form">
      <div className="flex items-center gap-2 mb-3">
        <Key size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-auto-foreground">Credenciales Multiprod AM SRL</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Ingresa la URL de endpoint y token proporcionados por Multiprod al completar la certificacion DGII.
      </p>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">URL Endpoint Multiprod</label>
          <input
            type="text"
            value={config.multiprod_endpoint}
            onChange={e => setConfig(p => ({ ...p, multiprod_endpoint: e.target.value }))}
            onFocus={() => { if (config.multiprod_endpoint.startsWith('****')) setConfig(p => ({ ...p, multiprod_endpoint: '' })); }}
            placeholder="https://portalmultiprod.com/api/ecf/enviar/..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            data-testid="multiprod-endpoint-input"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Token API (opcional si va embebido en la URL)</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={config.multiprod_token}
              onChange={e => setConfig(p => ({ ...p, multiprod_token: e.target.value }))}
              onFocus={() => { if (config.multiprod_token.startsWith('****')) setConfig(p => ({ ...p, multiprod_token: '' })); }}
              placeholder="Token proporcionado por Multiprod"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground"
              data-testid="multiprod-token-input"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
            >
              {showToken ? <EyeOff size={14} className="text-muted-foreground" /> : <Eye size={14} className="text-muted-foreground" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[40px]"
          data-testid="multiprod-save-btn"
        >
          <Save size={14} />
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[40px]"
          data-testid="multiprod-test-btn"
        >
          {testing ? <RotateCcw size={14} className="animate-spin" /> : <Globe size={14} />}
          {testing ? 'Probando...' : 'Probar conexion'}
        </button>
      </div>

      {/* Test Results */}
      {testResult && (
        <div className={`mt-3 border rounded-lg p-3 text-xs space-y-1.5 ${testResult.ok ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-red-500/50 bg-red-500/5'}`} data-testid="multiprod-test-result">
          <div className="flex items-center gap-1.5 font-semibold">
            {testResult.ok
              ? <><CheckCircle2 size={14} className="text-emerald-500" /> <span className="text-emerald-600 dark:text-emerald-400">Conexion exitosa</span></>
              : <><AlertTriangle size={14} className="text-red-500" /> <span className="text-red-600 dark:text-red-400">Error en la prueba</span></>
            }
          </div>
          <p className="text-muted-foreground">{testResult.message}</p>
          {testResult.results && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              {testResult.results.step0_local_validation && (
                <div className="flex items-center gap-1">
                  {testResult.results.step0_local_validation.ok ? <CheckCircle2 size={10} className="text-emerald-500" /> : <XCircle size={10} className="text-red-500" />}
                  <span>XSD Local: {testResult.results.step0_local_validation.message}</span>
                </div>
              )}
              {testResult.results.step1_validator && (
                <div className="flex items-center gap-1">
                  {testResult.results.step1_validator.ok ? <CheckCircle2 size={10} className="text-emerald-500" /> : <XCircle size={10} className="text-red-500" />}
                  <span>Megaplus: {testResult.results.step1_validator.message}</span>
                </div>
              )}
              {testResult.results.step2_multiprod && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    {testResult.results.step2_multiprod.ok ? <CheckCircle2 size={10} className="text-emerald-500" /> : <XCircle size={10} className="text-red-500" />}
                    <span>Multiprod: {testResult.results.step2_multiprod.motivo || (testResult.results.step2_multiprod.ok ? 'OK' : 'Error')}</span>
                  </div>
                  {testResult.results.step2_multiprod.diagnostics && (
                    <div className="ml-4 text-[10px] text-muted-foreground font-mono space-y-0.5 bg-background/50 rounded p-1.5 border border-border/50">
                      <div>HTTP Status: <strong>{testResult.results.step2_multiprod.diagnostics.http_status}</strong></div>
                      <div>Content-Type: {testResult.results.step2_multiprod.diagnostics.headers?.['Content-Type']}</div>
                      <div>Content-Length: {testResult.results.step2_multiprod.diagnostics.headers?.['Content-Length']}</div>
                      <div>Body ({testResult.results.step2_multiprod.diagnostics.body_length} bytes): <strong>{testResult.results.step2_multiprod.diagnostics.body_raw}</strong></div>
                      <div>Tiempo: {testResult.results.step2_multiprod.diagnostics.response_time_ms}ms</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Common IANA timezones relevant for the Americas
const IANA_TIMEZONES = [
  { value: 'America/Santo_Domingo', label: 'Rep. Dominicana (UTC-4)' },
  { value: 'America/New_York', label: 'Este EEUU / New York (UTC-5/-4)' },
  { value: 'America/Chicago', label: 'Centro EEUU / Chicago (UTC-6/-5)' },
  { value: 'America/Denver', label: 'Montana EEUU / Denver (UTC-7/-6)' },
  { value: 'America/Los_Angeles', label: 'Pacifico EEUU / Los Angeles (UTC-8/-7)' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico (UTC-4)' },
  { value: 'America/Bogota', label: 'Colombia / Bogota (UTC-5)' },
  { value: 'America/Mexico_City', label: 'Mexico / Ciudad de Mexico (UTC-6)' },
  { value: 'America/Panama', label: 'Panama (UTC-5)' },
  { value: 'America/Caracas', label: 'Venezuela / Caracas (UTC-4)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina / Buenos Aires (UTC-3)' },
  { value: 'America/Sao_Paulo', label: 'Brasil / Sao Paulo (UTC-3)' },
  { value: 'Europe/Madrid', label: 'Espana / Madrid (UTC+1/+2)' },
];

export default function SystemTab() {
  const { systemConfig, setSystemConfig, timezones, users } = useSettings();
  const { user: currentUser } = useAuth();
  const [showTicketPreview, setShowTicketPreview] = useState(false);
  const [resetDialog, setResetDialog] = useState(false);
  const [cleanupSelections, setCleanupSelections] = useState({});
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [keepUsers, setKeepUsers] = useState([]);
  const [systemTimezone, setSystemTimezone] = useState('America/Santo_Domingo');
  const [tzSaving, setTzSaving] = useState(false);
  const isSystemAdmin = (currentUser?.role_level || 0) >= 100;

  // Load current timezone from API
  useEffect(() => {
    axios.get(`${API}/timezone`).then(r => setSystemTimezone(r.data.timezone)).catch(() => {});
  }, []);

  // Initialize keepUsers with current admin
  useEffect(() => {
    if (currentUser?.id && keepUsers.length === 0) {
      setKeepUsers([currentUser.id]);
    }
  }, [currentUser]);
  
  const toggleKeepUser = (uid) => {
    // Don't allow removing the current admin user
    if (uid === currentUser?.id) return;
    setKeepUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleSystemReset = async () => {
    if (resetConfirmText !== 'RESETEAR_SISTEMA') {
      notify.error('Escribe RESETEAR_SISTEMA para confirmar');
      return;
    }
    if (keepUsers.length === 0) {
      notify.error('Selecciona al menos un usuario a mantener');
      return;
    }
    setResetLoading(true);
    try {
      const res = await axios.post(`${API}/system-reset`, { confirm: 'RESETEAR_SISTEMA', keep_user_ids: keepUsers }, { headers: hdrs() });
      notify.success(res.data.message || 'Sistema reseteado');
      setResetDialog(false);
      setResetConfirmText('');
      // Redirect to login after reset
      setTimeout(() => { localStorage.removeItem('pos_token'); window.location.href = '/'; }, 2000);
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error al resetear');
    }
    setResetLoading(false);
  };

  const handleSaveSystemConfig = async () => {
    try {
      await axios.put(`${API}/system/config`, systemConfig, { headers: hdrs() });
      // Soft-validate e-CF mandatory fields and warn (don't block save)
      const rnc = (systemConfig.ticket_rnc || systemConfig.rnc || '').replace(/-/g, '').trim();
      const razon = (systemConfig.ticket_razon_social
                     || systemConfig.ticket_legal_name
                     || systemConfig.ticket_business_name || '').trim();
      const direccion = (systemConfig.fiscal_address
                         || systemConfig.ticket_address_street
                         || systemConfig.business_address || '').trim();
      const missing = [];
      if (!rnc || rnc === '000000000') missing.push('RNC');
      if (!razon) missing.push('Razón Social');
      if (!direccion) missing.push('Dirección Fiscal');
      if (missing.length > 0) {
        notify.warning(
          `⚠️ Configuración guardada, pero faltan campos obligatorios para e-CF: ${missing.join(', ')}. ` +
          `La facturación electrónica no funcionará hasta que los complete.`
        );
      } else {
        notify.success('Configuración guardada');
      }
    }
    catch { notify.error('Error'); }
  };

  // Demo order for ticket preview
  const demoOrder = {
    items: [
      { name: 'Hamburguesa Clásica', quantity: 2, price: 450, notes: 'Sin cebolla' },
      { name: 'Papas Fritas', quantity: 1, price: 150 },
      { name: 'Refresco', quantity: 2, price: 100 },
    ],
    subtotal: 1250,
    itbis: 225,
    propina: 125,
    total: 1600,
    ncf: 'B0200000001',
    ncfType: 'B02',
    tableNumber: 5,
    waiterName: 'Carlos',
    paymentMethod: 'Efectivo',
    amountPaid: 2000,
    change: 400,
    createdAt: new Date().toISOString()
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-oswald text-base font-bold mb-4">Configuración del Sistema</h2>
        
        {/* Email Notifications — admin/propietario only */}
        {(currentUser?.permissions?.manage_email_notifications) && <EmailNotificationsCard />}
        
        {/* Restaurant Name */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3">Nombre del Restaurante</h3>
          <input 
            value={systemConfig.restaurant_name || ''} 
            onChange={e => setSystemConfig(p => ({ ...p, restaurant_name: e.target.value }))}
            placeholder="Mi Restaurante"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Logo Upload */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Logo del Restaurante</h3>
          <p className="text-xs text-muted-foreground mb-3">Se mostrará en la pantalla de login. Formato: PNG, JPG, WebP. Máx 5MB.</p>
          <div className="flex items-center gap-4">
            {systemConfig.logo_url && (
              <img src={`${API.replace('/api', '')}${systemConfig.logo_url}`} alt="Logo" className="w-16 h-16 rounded-xl object-contain border border-border bg-background" />
            )}
            <label className="flex-1">
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { notify.error('Logo debe ser menor a 5MB'); return; }
                const fd = new FormData();
                fd.append('file', file);
                try {
                  const res = await axios.post(`${API}/system/upload-logo`, fd, { headers: { ...hdrs(), 'Content-Type': 'multipart/form-data' } });
                  setSystemConfig(p => ({ ...p, logo_url: res.data.logo_url }));
                  notify.success('Logo actualizado');
                } catch { notify.error('Error al subir logo'); }
              }} />
              <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold cursor-pointer active:scale-95 transition-transform">
                <Building2 size={16} /> {systemConfig.logo_url ? 'Cambiar Logo' : 'Subir Logo'}
              </div>
            </label>
            {systemConfig.logo_url && (
              <button onClick={async () => {
                try {
                  await axios.put(`${API}/system/config`, { ...systemConfig, logo_url: '' }, { headers: hdrs() });
                  setSystemConfig(p => ({ ...p, logo_url: '' }));
                  notify.success('Logo eliminado');
                } catch { notify.error('Error'); }
              }} className="text-xs text-destructive hover:underline">Quitar</button>
            )}
          </div>
        </div>

        {/* RNC */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">RNC (Registro Nacional de Contribuyentes)</h3>
          <p className="text-xs text-muted-foreground mb-3">Este número aparecerá en los reportes exportados para validez fiscal.</p>
          <input 
            value={systemConfig.rnc || ''} 
            onChange={e => setSystemConfig(p => ({ ...p, rnc: e.target.value }))}
            placeholder="000-000000-0"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>

        {/* Provincia y Municipio (códigos DGII/ONE para e-CF) */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <MapPin size={14} className="text-blue-500" /> Ubicación Fiscal (DGII)
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Códigos oficiales ONE que DGII exige en el XML del e-CF. Selecciona provincia y municipio; el sistema guarda el código correcto automáticamente.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Provincia</label>
              <select
                value={systemConfig.province || ''}
                onChange={(e) => {
                  const newProv = e.target.value;
                  // Reset municipio si cambió de provincia. Comparamos por los primeros 2 dígitos
                  // (el municipio viene como "010101" y la provincia como "010000": comparten los primeros 2).
                  const provPrefix = (newProv || '').substring(0, 2);
                  const munPrefix = ((systemConfig.municipality) || '').substring(0, 2);
                  setSystemConfig((p) => ({
                    ...p,
                    province: newProv,
                    municipality: provPrefix && provPrefix === munPrefix ? p.municipality : '',
                  }));
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                data-testid="province-select"
              >
                <option value="">— Seleccionar provincia —</option>
                {PROVINCIAS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              {systemConfig.province && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Código XML: <span className="font-mono font-bold">{systemConfig.province}</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Municipio</label>
              <select
                value={systemConfig.municipality || ''}
                onChange={(e) => setSystemConfig((p) => ({ ...p, municipality: e.target.value }))}
                disabled={!systemConfig.province}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                data-testid="municipality-select"
              >
                <option value="">
                  {systemConfig.province ? '— Seleccionar municipio —' : '— Elige provincia primero —'}
                </option>
                {(MUNICIPIOS_BY_PROVINCIA[systemConfig.province] || []).map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              {systemConfig.municipality && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Código XML: <span className="font-mono font-bold">{systemConfig.municipality}</span>
                </p>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 italic">
            💡 Estos campos son opcionales en el XSD de DGII. Si los llenas, deben ser códigos válidos. Si los dejas vacíos, el e-CF se envía sin ellos y DGII igual lo acepta.
          </p>

          {/* Dirección Fiscal DGII — separada de la del ticket */}
          <div className="mt-4 pt-4 border-t border-border">
            <label className="text-xs text-muted-foreground mb-1 block font-semibold">
              Dirección Fiscal (DGII)
            </label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Dirección registrada en DGII para tu RNC. Se envía como <span className="font-mono">&lt;DireccionEmisor&gt;</span> en el e-CF. A veces no coincide con la dirección del ticket.
            </p>
            <input
              value={systemConfig.fiscal_address || ''}
              onChange={(e) => setSystemConfig((p) => ({ ...p, fiscal_address: e.target.value }))}
              placeholder="Ej: Av. 27 de Febrero #123, Ensanche Piantini, Santo Domingo"
              maxLength={100}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              data-testid="fiscal-address-input"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {(systemConfig.fiscal_address || '').length}/100 caracteres
            </p>
          </div>
        </div>

        {/* Email Automático */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Envío Automático de Facturas por Email</h3>
              <p className="text-xs text-muted-foreground mt-1">Si está activado, al cobrar una cuenta de un cliente con email registrado, la factura se envía automáticamente.</p>
            </div>
            <button
              onClick={() => setSystemConfig(p => ({ ...p, auto_email_invoice: !p.auto_email_invoice }))}
              className={`w-12 h-6 rounded-full transition-all relative ${systemConfig.auto_email_invoice ? 'bg-green-500' : 'bg-muted'}`}
              data-testid="toggle-auto-email"
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${systemConfig.auto_email_invoice ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Modo e-CF */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Facturación Electrónica (e-CF)</h3>
              <p className="text-xs text-muted-foreground mt-1">Si está activado, las facturas se envían automáticamente a la DGII al cobrar. El ticket impreso incluirá e-NCF y código de verificación.</p>
            </div>
            <button
              onClick={() => setSystemConfig(p => ({ ...p, ecf_enabled: !p.ecf_enabled }))}
              className={`w-12 h-6 rounded-full transition-all relative shrink-0 ml-3 ${systemConfig.ecf_enabled ? 'bg-emerald-500' : 'bg-muted'}`}
              data-testid="toggle-ecf"
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${systemConfig.ecf_enabled ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Proveedor e-CF */}
        {systemConfig.ecf_enabled && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2 text-auto-foreground">Proveedor e-CF</h3>
          <p className="text-xs text-muted-foreground mb-3">Selecciona el proveedor de facturación electrónica que procesará los e-CF ante la DGII.</p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'alanube', label: 'Alanube', desc: 'Alanube.co' },
              { id: 'thefactory', label: 'The Factory HKA', desc: 'TheFactoryHKA.com.do' },
              { id: 'multiprod', label: 'Multiprod AM SRL', desc: 'portalmultiprod.com' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setSystemConfig(prev => ({ ...prev, ecf_provider: p.id }))}
                className={`flex-1 min-w-[140px] p-3 rounded-lg border-2 transition-all text-left ${
                  (systemConfig.ecf_provider || 'alanube') === p.id
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
                data-testid={`ecf-provider-${p.id}`}
              >
                <div className="text-sm font-semibold text-auto-foreground">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.desc}</div>
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              try {
                const r = await fetch(`${API}/ecf/test-connection`, { method: 'POST', headers: hdrs() });
                const d = await r.json();
                if (d.ok) notify.success(d.message);
                else notify.error(d.message || 'Error de conexión');
              } catch { notify.error('Error de conexión'); }
            }}
            className="mt-3 text-xs text-blue-400 hover:underline"
            data-testid="ecf-test-connection"
          >
            Probar conexión con {(systemConfig.ecf_provider || 'alanube') === 'thefactory' ? 'The Factory HKA' : (systemConfig.ecf_provider || 'alanube') === 'multiprod' ? 'Multiprod' : 'Alanube'}
          </button>
        </div>
        )}

        {/* Credenciales Multiprod */}
        {systemConfig.ecf_enabled && (systemConfig.ecf_provider === 'multiprod') && (
          <MultiprodCredentialsForm />
        )}

        {/* Credenciales e-CF (Alanube/TheFactory) */}
        {systemConfig.ecf_enabled && (systemConfig.ecf_provider !== 'multiprod') && <EcfCredentialsForm provider={systemConfig.ecf_provider || 'alanube'} />}

        {/* Auto-retry e-CF */}
        {systemConfig.ecf_enabled && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Reintento Automático de e-CF</h3>
              <p className="text-xs text-muted-foreground mt-1">Si está activado, el sistema reintentará enviar las facturas en modo contingencia automáticamente cada 5 minutos.</p>
            </div>
            <button
              onClick={() => setSystemConfig(p => ({ ...p, ecf_auto_retry: !p.ecf_auto_retry }))}
              className={`w-12 h-6 rounded-full transition-all relative shrink-0 ml-3 ${systemConfig.ecf_auto_retry ? 'bg-emerald-500' : 'bg-muted'}`}
              data-testid="toggle-ecf-auto-retry"
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${systemConfig.ecf_auto_retry ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
        )}

        {/* Timezone - IANA Selector */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Globe size={14} className="text-blue-400" /> Zona Horaria del Sistema
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Todas las fechas, reportes y jornadas usan esta zona horaria. Cambiar reinicia los calculos de "hoy" en el Dashboard.
          </p>
          <select 
            value={systemTimezone} 
            onChange={e => setSystemTimezone(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            data-testid="timezone-selector"
          >
            {IANA_TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <Button 
            onClick={async () => {
              setTzSaving(true);
              try {
                await axios.put(`${API}/timezone`, { timezone: systemTimezone }, { headers: hdrs() });
                invalidateTimezoneCache();
                notify.success(`Zona horaria actualizada: ${systemTimezone}`);
              } catch (e) {
                notify.error(e.response?.data?.detail || 'Error al guardar timezone');
              }
              setTzSaving(false);
            }}
            disabled={tzSaving}
            className="w-full mt-3 h-10 bg-blue-600 hover:bg-blue-700 text-white font-oswald font-bold"
            data-testid="save-timezone-btn"
          >
            {tzSaving ? 'Guardando...' : 'GUARDAR ZONA HORARIA'}
          </Button>
        </div>

        {/* Time Format */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Clock size={14} className="text-purple-400" /> Formato de Hora
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Elige como se muestra la hora en todo el sistema. Los datos se guardan internamente en 24H.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setSystemConfig(p => ({ ...p, time_format: '12h' }))}
              className={`flex-1 py-2.5 rounded-lg font-oswald font-bold text-sm transition-all ${
                (systemConfig.time_format || '12h') === '12h' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              }`}
              data-testid="time-format-12h"
            >
              12H (AM/PM)
            </button>
            <button
              onClick={() => setSystemConfig(p => ({ ...p, time_format: '24h' }))}
              className={`flex-1 py-2.5 rounded-lg font-oswald font-bold text-sm transition-all ${
                systemConfig.time_format === '24h' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              }`}
              data-testid="time-format-24h"
            >
              24H
            </button>
          </div>
        </div>

        {/* Currency */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3">Moneda</h3>
          <select 
            value={systemConfig.currency || 'RD$'} 
            onChange={e => setSystemConfig(p => ({ ...p, currency: e.target.value }))}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="RD$">RD$ - Peso Dominicano</option>
            <option value="$">$ - Dólar (USD)</option>
            <option value="€">€ - Euro</option>
          </select>
        </div>

        <Button onClick={handleSaveSystemConfig} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold">
          GUARDAR CONFIGURACIÓN
        </Button>
      </div>

      {/* Ticket Business Data */}
      <div className="mt-8 pt-6 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
              <Printer size={20} className="text-green-500" />
            </div>
            <div>
              <h2 className="font-oswald text-base font-bold">Datos del Negocio para Ticket</h2>
              <p className="text-xs text-muted-foreground">Esta información aparecerá en los tickets impresos</p>
            </div>
          </div>
          <Button variant={showTicketPreview ? "default" : "outline"} size="sm"
            onClick={() => setShowTicketPreview(!showTicketPreview)}
            className={showTicketPreview ? "bg-green-600 hover:bg-green-700" : ""} data-testid="toggle-ticket-preview">
            {showTicketPreview ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />}
            {showTicketPreview ? "Ocultar Vista Previa" : "Ver Vista Previa"}
          </Button>
        </div>

        <div className={`grid gap-6 ${showTicketPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Form Fields */}
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Building2 size={14} className="text-primary" /> Nombre Comercial
              </h3>
              <input value={systemConfig.ticket_business_name || systemConfig.restaurant_name || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_business_name: e.target.value }))}
                placeholder="RESTAURANTE DEMO"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald uppercase" data-testid="ticket-business-name" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Razón Social</h3>
              <input value={systemConfig.ticket_legal_name || systemConfig.ticket_razon_social || ''}
                onChange={e => setSystemConfig(p => ({
                  ...p,
                  ticket_legal_name: e.target.value,
                  ticket_razon_social: e.target.value,
                }))}
                placeholder="RESTAURANTE DEMO SRL"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="ticket-legal-name" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <ShieldAlert size={14} className="text-yellow-500" /> RNC (Ticket)
              </h3>
              <input value={systemConfig.ticket_rnc || systemConfig.rnc || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_rnc: e.target.value }))}
                placeholder="1-31-12345-6"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" data-testid="ticket-rnc" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <MapPin size={14} className="text-blue-500" /> Dirección
              </h3>
              <input value={systemConfig.ticket_address_street || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_street: e.target.value }))}
                placeholder="Calle y número"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-address-street" />
              <input value={systemConfig.ticket_address_building || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_building: e.target.value }))}
                placeholder="Edificio / Local (opcional)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-address-building" />
              <input value={systemConfig.ticket_address_sector || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_sector: e.target.value }))}
                placeholder="Sector (ej: Jarabacoa)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-address-sector" />
              <input value={systemConfig.ticket_address_city || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_address_city: e.target.value }))}
                placeholder="Ciudad / Provincia (ej: La Vega)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="ticket-address-city" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Phone size={14} className="text-green-500" /> Contacto
              </h3>
              <input value={systemConfig.ticket_phone || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_phone: e.target.value }))}
                placeholder="809-555-1234"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" />
              <input value={systemConfig.ticket_email || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_email: e.target.value }))}
                placeholder="info@restaurante.com"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileText size={14} className="text-purple-500" /> Mensajes de Pie (4 lineas)
              </h3>
              <input value={systemConfig.ticket_footer_msg1 || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_footer_msg1: e.target.value }))}
                placeholder="Mensaje 1 (ej: Gracias por su visita!)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-footer-msg1" />
              <input value={systemConfig.ticket_footer_msg2 || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_footer_msg2: e.target.value }))}
                placeholder="Mensaje 2 (ej: Conserve para fines de DGII)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-footer-msg2" />
              <input value={systemConfig.ticket_footer_msg3 || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_footer_msg3: e.target.value }))}
                placeholder="Mensaje 3 (ej: @alonzocigar)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2" data-testid="ticket-footer-msg3" />
              <input value={systemConfig.ticket_footer_msg4 || ''} 
                onChange={e => setSystemConfig(p => ({ ...p, ticket_footer_msg4: e.target.value }))}
                placeholder="Mensaje 4 (opcional)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="ticket-footer-msg4" />
            </div>

            <Button onClick={handleSaveSystemConfig} className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-oswald font-bold">
              GUARDAR DATOS DEL TICKET
            </Button>
          </div>

          {/* Ticket Preview */}
          {showTicketPreview && (
            <div className="flex justify-center">
              <div className="sticky top-4">
                <div className="bg-white rounded-lg shadow-xl p-2 max-w-[320px]">
                  <div className="flex items-center justify-between px-2 py-1 bg-gray-100 rounded-t-lg mb-2">
                    <span className="text-xs text-gray-600 font-medium">Vista Previa del Ticket</span>
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Servidor</span>
                  </div>
                  <ThermalTicket
                    order={demoOrder}
                    businessConfig={{
                      business_name: systemConfig.ticket_business_name || systemConfig.restaurant_name || '',
                      legal_name: systemConfig.ticket_legal_name || '',
                      rnc: systemConfig.ticket_rnc || systemConfig.rnc || '000-000000-0',
                      address_street: systemConfig.ticket_address_street || '',
                      address_building: systemConfig.ticket_address_building || '',
                      address_sector: systemConfig.ticket_address_sector || '',
                      address_city: systemConfig.ticket_address_city || '',
                      phone: systemConfig.ticket_phone || '809-555-0000',
                      email: systemConfig.ticket_email || '',
                      footer_msg1: systemConfig.ticket_footer_msg1 || '',
                      footer_msg2: systemConfig.ticket_footer_msg2 || '',
                      footer_msg3: systemConfig.ticket_footer_msg3 || '',
                      footer_msg4: systemConfig.ticket_footer_msg4 || ''
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Reset - Only for System Admin */}
      {isSystemAdmin && (
        <div className="mt-8 pt-6 border-t border-red-500/30">
          {/* Selective Cleanup Panel */}
          <div className="bg-card border border-border rounded-xl p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Trash2 size={20} className="text-amber-500" />
              </div>
              <div>
                <h2 className="font-oswald text-base font-bold">Limpieza Selectiva</h2>
                <p className="text-xs text-muted-foreground">Elige qué datos quieres eliminar. Usuarios, productos y configuración NO se borran.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
              {[
                { key: 'bills', label: 'Ventas / Facturas', desc: 'bills, payments' },
                { key: 'orders', label: 'Órdenes', desc: 'orders' },
                { key: 'business_days', label: 'Jornadas', desc: 'business_days' },
                { key: 'pos_sessions', label: 'Turnos / Sesiones POS', desc: 'pos_sessions (Supabase)' },
                { key: 'attendance', label: 'Asistencia', desc: 'clock-in/out' },
                { key: 'reservations', label: 'Reservaciones', desc: 'reservations' },
                { key: 'print_queue', label: 'Cola de Impresión', desc: 'print_queue' },
                { key: 'audit_logs', label: 'Auditoría / Logs', desc: 'audit_logs, ecf_logs' },
                { key: 'ncf_reset', label: 'Secuencias NCF (resetear a 0)', desc: 'ncf_sequences' },
                { key: 'stock_movements', label: 'Movimientos de Inventario', desc: 'stock_movements' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border hover:border-primary/30 cursor-pointer transition-all">
                  <input type="checkbox" checked={!!cleanupSelections[item.key]}
                    onChange={e => setCleanupSelections(p => ({ ...p, [item.key]: e.target.checked }))}
                    className="w-4 h-4 rounded accent-amber-500" />
                  <div>
                    <span className="text-sm font-medium">{item.label}</span>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {Object.values(cleanupSelections).some(v => v) && (
              <Button variant="outline" className="font-oswald font-bold border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                onClick={async () => {
                  const selected = Object.entries(cleanupSelections).filter(([k,v]) => v).map(([k]) => k);
                  if (!selected.length) return;
                  if (!window.confirm(`¿Seguro que quieres eliminar: ${selected.join(', ')}?`)) return;
                  try {
                    const resp = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/system/selective-cleanup`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
                      body: JSON.stringify({ collections: selected })
                    });
                    const data = await resp.json();
                    if (data.ok) {
                      notify.success(`Limpieza completada: ${data.deleted} registros eliminados`);
                      setCleanupSelections({});
                    } else { notify.error(data.detail || 'Error'); }
                  } catch { notify.error('Error de conexión'); }
                }}
                data-testid="selective-cleanup-btn">
                <Trash2 size={16} className="mr-2" /> LIMPIAR SELECCIONADOS ({Object.values(cleanupSelections).filter(v => v).length})
              </Button>
            )}
          </div>

          {/* Cleanup Orphan Tables */}
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Trash2 size={20} className="text-amber-500" />
              </div>
              <div>
                <h2 className="font-oswald text-base font-bold text-amber-400">Limpiar Mesas Huérfanas</h2>
                <p className="text-xs text-muted-foreground">Libera mesas que quedaron ocupadas sin órdenes activas</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Corrige inconsistencias de datos: cierra órdenes pagadas que quedaron abiertas, elimina facturas huérfanas y libera mesas sin órdenes activas.
            </p>
            <Button 
              variant="outline" 
              className="font-oswald font-bold border-amber-500/50 text-amber-400 hover:bg-amber-500/10" 
              onClick={async () => {
                try {
                  const r = await fetch(`${API}/system/cleanup-orphan-tables`, { method: 'POST', headers: hdrs() });
                  const d = await r.json();
                  if (d.freed_tables?.length > 0 || d.orders_closed?.length > 0) {
                    notify.success(`Limpieza completada: ${d.total_freed || 0} mesas liberadas, ${d.orders_closed?.length || 0} órdenes cerradas`);
                  } else {
                    notify.info('No se encontraron inconsistencias');
                  }
                } catch { notify.error('Error al ejecutar limpieza'); }
              }}
              data-testid="cleanup-orphan-tables-btn"
            >
              <Trash2 size={16} className="mr-2" /> LIMPIAR MESAS
            </Button>
          </div>

          {/* Full System Reset */}
          <div className="bg-red-500/5 border-2 border-red-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <RotateCcw size={20} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-oswald text-base font-bold text-red-400">Resetear Sistema</h2>
                <p className="text-xs text-muted-foreground">Elimina TODOS los datos operativos y empieza desde cero</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Esta accion eliminara: ordenes, facturas, turnos, auditorias, inventario, productos, categorias, recetas, ingredientes, reservaciones y mas.
              Se mantendra la configuracion de mesas, impuestos, metodos de pago y los usuarios seleccionados.
            </p>
            <Button variant="destructive" className="font-oswald font-bold" onClick={() => setResetDialog(true)} data-testid="system-reset-btn">
              <AlertTriangle size={16} className="mr-2" /> RESETEAR SISTEMA
            </Button>
          </div>
        </div>
      )}

      {/* Version Info */}
      <div className="bg-card border border-border rounded-xl p-4 mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Versión del Sistema</h3>
            <p className="text-xs text-muted-foreground">VexlyPOS - Sistema de Punto de Venta</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-oswald font-bold text-primary">v1.0.0</span>
            <p className="text-xs text-muted-foreground">Abril 2026</p>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialog} onOpenChange={setResetDialog}>
        <DialogContent className="max-w-md bg-card border-red-500/30">
          <DialogHeader>
            <DialogTitle className="font-oswald text-red-400 flex items-center gap-2">
              <AlertTriangle size={20} /> Confirmar Reset del Sistema
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-300 font-semibold mb-1">ATENCION: Esta accion es irreversible</p>
              <p className="text-xs text-muted-foreground">Se eliminaran todas las ordenes, facturas, turnos, auditorias y datos operativos.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">Usuarios a mantener activos:</label>
              <div className="max-h-[180px] overflow-y-auto space-y-1">
                {(users || []).map(u => {
                  const isCurrentUser = u.id === currentUser?.id;
                  const isKept = keepUsers.includes(u.id);
                  return (
                    <label key={u.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${isKept ? 'bg-green-500/10 border border-green-500/30' : 'bg-background border border-border/50'} ${isCurrentUser ? 'opacity-80' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isKept}
                        onChange={() => toggleKeepUser(u.id)}
                        disabled={isCurrentUser}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">{u.name} {u.last_name || ''}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{u.role} (N{u.role_level || '?'})</span>
                      {isCurrentUser && <span className="text-[11px] text-green-400">(Tu)</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Escribe RESETEAR_SISTEMA para confirmar:</label>
              <input
                value={resetConfirmText}
                onChange={e => setResetConfirmText(e.target.value)}
                placeholder="RESETEAR_SISTEMA"
                className="w-full bg-background border border-red-500/30 rounded-lg px-3 py-2 text-sm font-mono uppercase"
                data-testid="reset-confirm-input"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setResetDialog(false); setResetConfirmText(''); }}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1 font-oswald font-bold"
                onClick={handleSystemReset}
                disabled={resetConfirmText !== 'RESETEAR_SISTEMA' || resetLoading}
                data-testid="confirm-reset-btn"
              >
                {resetLoading ? 'Reseteando...' : 'CONFIRMAR RESET'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
