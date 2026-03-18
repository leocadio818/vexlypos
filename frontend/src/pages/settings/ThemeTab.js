import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Palette, Check, Sun, Moon, Sparkles, RotateCcw, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import axios from 'axios';

// Glass theme presets (original)
const GLASS_PRESETS = [
  { id: 'default', name: 'Clasico Naranja', primary: '#FF6600', accent: '#FF8533', bg: 'from-slate-900 to-slate-800' },
  { id: 'blue', name: 'Azul Profesional', primary: '#3B82F6', accent: '#60A5FA', bg: 'from-slate-900 to-blue-950' },
  { id: 'green', name: 'Verde Natural', primary: '#22C55E', accent: '#4ADE80', bg: 'from-slate-900 to-emerald-950' },
  { id: 'purple', name: 'Purpura Elegante', primary: '#A855F7', accent: '#C084FC', bg: 'from-slate-900 to-purple-950' },
  { id: 'red', name: 'Rojo Intenso', primary: '#EF4444', accent: '#F87171', bg: 'from-slate-900 to-red-950' },
  { id: 'teal', name: 'Teal Moderno', primary: '#14B8A6', accent: '#2DD4BF', bg: 'from-slate-900 to-teal-950' },
];

function ColorPicker({ label, value, onChange, description }) {
  return (
    <div>
      <label className="text-xs font-semibold mb-1 block">{label}</label>
      {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-12 h-10 rounded-lg border border-border cursor-pointer"
          data-testid={`color-picker-${label.toLowerCase().replace(/\s/g, '-')}`}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
        />
      </div>
    </div>
  );
}

export default function ThemeTab() {
  const {
    theme, setTheme, activeThemeMode, setActiveThemeMode,
    neoColors, updateNeoColor, saveAllThemeSettings, isMinimalist,
    neoMode, setNeoMode, isNeoDark,
  } = useTheme();
  const { user } = useAuth();

  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveAllThemeSettings();
    setSaving(false);
    if (ok) toast.success('Tema guardado correctamente');
    else toast.error('Error al guardar el tema');
  };

  const handleSaveAsMyPreference = async () => {
    setSavingProfile(true);
    try {
      const API = process.env.REACT_APP_BACKEND_URL + '/api';
      const token = localStorage.getItem('pos_token');
      await axios.put(`${API}/users/me/ui-preferences`, {
        theme: activeThemeMode,
        color_mode: neoMode,
        neo_bg_color: neoColors.neoBgColor,
        neo_dark_bg: neoColors.neoDarkBg,
        neo_glow_color: neoColors.neoGlowColor,
        neo_accent_color: neoColors.neoAccentColor,
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`Preferencia guardada para ${user?.name || 'tu perfil'}`);
    } catch {
      toast.error('Error al guardar preferencia');
    }
    setSavingProfile(false);
  };

  const applyGlassPreset = (preset) => {
    setTheme(prev => ({ ...prev, accentColor: preset.primary, theme_id: preset.id }));
  };

  return (
    <div className="space-y-6" data-testid="appearance-tab">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
          <Palette size={24} className="text-purple-500" />
        </div>
        <div>
          <h2 className="font-oswald text-lg font-bold">Apariencia</h2>
          <p className="text-xs text-muted-foreground">Elige el estilo visual de tu punto de venta</p>
        </div>
      </div>

      {/* ═══ Theme Mode Toggle ═══ */}
      <div>
        <h3 className="font-oswald font-bold text-sm mb-3">Modo de Tema</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Original */}
          <button
            onClick={() => setActiveThemeMode('original')}
            data-testid="theme-mode-original"
            className={`relative p-5 rounded-2xl transition-all duration-300 ${
              !isMinimalist
                ? 'ring-2 ring-primary shadow-lg scale-[1.02]'
                : 'ring-1 ring-border hover:ring-primary/50 hover:scale-[1.01]'
            }`}
            style={{
              background: !isMinimalist
                ? 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #2d1b4e 100%)'
                : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Moon size={20} className="text-purple-400" />
              <span className="font-oswald font-bold text-white text-sm">Tema Original</span>
            </div>
            <p className="text-xs text-white/50">Glassmorphism oscuro con efectos de luz neon</p>
            <div className="flex gap-1.5 mt-3">
              <div className="w-4 h-4 rounded-full bg-purple-500/60" />
              <div className="w-4 h-4 rounded-full bg-blue-500/60" />
              <div className="w-4 h-4 rounded-full bg-cyan-500/60" />
              <div className="w-4 h-4 rounded-full bg-orange-500" />
            </div>
            {!isMinimalist && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check size={14} className="text-primary-foreground" />
              </div>
            )}
          </button>

          {/* Minimalist */}
          <button
            onClick={() => setActiveThemeMode('minimalist')}
            data-testid="theme-mode-minimalist"
            className={`relative p-5 rounded-2xl transition-all duration-300 ${
              isMinimalist
                ? 'ring-2 ring-primary shadow-lg scale-[1.02]'
                : 'ring-1 ring-border hover:ring-primary/50 hover:scale-[1.01]'
            }`}
            style={{
              background: isMinimalist
                ? neoColors.neoBgColor
                : '#e8eef4',
              boxShadow: isMinimalist
                ? `4px 4px 8px #c8cfd8, -4px -4px 8px #ffffff`
                : 'none',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Sun size={20} className="text-slate-700" />
              <span className="font-oswald font-bold text-slate-800 text-sm">Minimalista</span>
            </div>
            <p className="text-xs text-slate-500">Neumorfismo claro con botones 3D y luces tenues</p>
            <div className="flex gap-1.5 mt-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: neoColors.neoBgColor, boxShadow: '2px 2px 4px #c8cfd8, -2px -2px 4px #fff' }} />
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: neoColors.neoGlowColor }} />
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: neoColors.neoAccentColor }} />
            </div>
            {isMinimalist && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                <Check size={14} className="text-white" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ═══ Conditional Content ═══ */}
      {isMinimalist ? (
        /* ── Minimalist Color Customizer ── */
        <div className="space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-purple-500" />
            <h3 className="font-oswald font-bold text-sm">Personalizar Neumorfismo</h3>
          </div>

          {/* ── Light / Dark Toggle ── */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setNeoMode('light')}
              data-testid="neo-mode-light"
              className={`relative p-4 rounded-xl transition-all duration-200 ${
                !isNeoDark ? 'ring-2 ring-primary scale-[1.02]' : 'ring-1 ring-border hover:ring-primary/50'
              }`}
              style={{ background: '#f0f5f9', boxShadow: !isNeoDark ? '3px 3px 6px #c8cfd8, -3px -3px 6px #fff' : 'none' }}
            >
              <Sun size={18} className="text-amber-500 mb-1" />
              <span className="font-oswald font-bold text-xs text-slate-700 block">Claro</span>
              {!isNeoDark && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check size={12} className="text-white" /></div>}
            </button>
            <button
              onClick={() => setNeoMode('dark')}
              data-testid="neo-mode-dark"
              className={`relative p-4 rounded-xl transition-all duration-200 ${
                isNeoDark ? 'ring-2 ring-primary scale-[1.02]' : 'ring-1 ring-border hover:ring-primary/50'
              }`}
              style={{ background: '#0f172a', boxShadow: isNeoDark ? '3px 3px 6px #070d1a, -3px -3px 6px #1a2540, 0 6px 20px -5px rgba(167,139,250,0.5)' : 'none' }}
            >
              <Moon size={18} className="text-blue-400 mb-1" />
              <span className="font-oswald font-bold text-xs text-slate-300 block">Oscuro</span>
              {isNeoDark && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check size={12} className="text-white" /></div>}
            </button>
          </div>

          {/* Color Pickers */}
          {(() => {
            const bg = isNeoDark ? neoColors.neoDarkBg : neoColors.neoBgColor;
            const dk = adjustBrightness(bg, isNeoDark ? -20 : -40);
            const lt = adjustBrightness(bg, isNeoDark ? 20 : 15);
            const txt = isNeoDark ? '#e2e8f0' : neoColors.neoAccentColor;
            return (
              <>
                <div className="rounded-2xl p-5 space-y-4" style={{ background: bg, boxShadow: `6px 6px 12px ${dk}, -6px -6px 12px ${lt}` }}>
                  {isNeoDark ? (
                    <ColorPicker label="Fondo Oscuro" value={neoColors.neoDarkBg} onChange={v => updateNeoColor('neoDarkBg', v)} description="Tono base del fondo oscuro (navy, negro, etc.)" />
                  ) : (
                    <ColorPicker label="Fondo Claro" value={neoColors.neoBgColor} onChange={v => updateNeoColor('neoBgColor', v)} description="Tono base del fondo claro (off-white, gris suave)." />
                  )}
                  <ColorPicker label="Color de Brillo (Glow)" value={neoColors.neoGlowColor} onChange={v => updateNeoColor('neoGlowColor', v)} description="Color de las luces LED detras de los paneles." />
                  {!isNeoDark && (
                    <ColorPicker label="Color de Acento" value={neoColors.neoAccentColor} onChange={v => updateNeoColor('neoAccentColor', v)} description="Color de textos oscuros y elementos resaltados." />
                  )}
                </div>

                {/* Live Preview */}
                <div className="rounded-2xl p-5" style={{
                  background: bg,
                  boxShadow: `0 0 30px ${neoColors.neoGlowColor}50, 0 0 60px ${neoColors.neoGlowColor}25, 6px 6px 12px ${dk}, -6px -6px 12px ${lt}`,
                }}>
                  <h4 className="font-oswald font-bold text-xs mb-3" style={{ color: txt }}>Vista Previa en Vivo</h4>
                  <div className="flex gap-3 flex-wrap">
                    <button className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                      style={{ background: bg, color: txt, boxShadow: `4px 4px 8px ${dk}, -4px -4px 8px ${lt}, 0 6px 15px -5px ${neoColors.neoGlowColor}50` }}
                      data-testid="neo-preview-raised-btn"
                    >Boton 3D</button>
                    <button className="px-5 py-2.5 rounded-xl font-bold text-sm text-white"
                      style={{ backgroundColor: 'hsl(25 100% 50%)', boxShadow: `4px 4px 8px ${dk}, -4px -4px 8px ${lt}, 0 8px 20px -5px ${neoColors.neoGlowColor}60` }}
                    >Primario</button>
                    <button className="px-5 py-2.5 rounded-xl font-bold text-sm"
                      style={{ background: bg, color: txt, boxShadow: `inset 3px 3px 6px ${dk}, inset -3px -3px 6px ${lt}` }}
                    >Hundido</button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        /* ── Original Glass Presets ── */
        <div className="space-y-5">
          <h3 className="font-oswald font-bold text-sm">Temas Predefinidos</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {GLASS_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => applyGlassPreset(preset)}
                data-testid={`glass-preset-${preset.id}`}
                className={`relative p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                  theme.accentColor === preset.primary
                    ? 'border-primary shadow-lg'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className={`h-16 rounded-lg bg-gradient-to-br ${preset.bg} mb-3 flex items-center justify-center gap-2`}>
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.primary }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.accent }} />
                </div>
                <span className="text-sm font-medium">{preset.name}</span>
                {theme.accentColor === preset.primary && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check size={14} className="text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Custom colors for original */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-oswald font-bold text-sm mb-3">Colores Personalizados</h3>
            <div className="grid grid-cols-2 gap-4">
              <ColorPicker
                label="Color Primario"
                value={theme.accentColor || '#FF6600'}
                onChange={v => setTheme(prev => ({ ...prev, accentColor: v, theme_id: 'custom' }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Action Buttons ═══ */}
      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-11 bg-primary text-primary-foreground font-oswald font-bold"
          data-testid="save-theme-btn"
        >
          {saving ? 'Guardando...' : 'GUARDAR TEMA'}
        </Button>
        <Button
          onClick={() => {
            setActiveThemeMode('original');
            toast.info('Restaurado al tema original');
          }}
          variant="outline"
          className="h-11 px-4"
          data-testid="reset-theme-btn"
        >
          <RotateCcw size={16} />
        </Button>
      </div>

      {/* Save as personal preference */}
      <Button
        onClick={handleSaveAsMyPreference}
        disabled={savingProfile}
        variant="outline"
        className="w-full h-11 font-oswald font-bold gap-2"
        data-testid="save-user-preference-btn"
      >
        <User size={16} />
        {savingProfile ? 'Guardando...' : `Guardar como preferencia de ${user?.name || 'mi perfil'}`}
      </Button>
    </div>
  );
}

// Helper (duplicate for component scope)
function adjustBrightness(hex, amount) {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  } catch {
    return '#c8cfd8';
  }
}
