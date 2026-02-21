import { useSettings } from './SettingsContext';
import { Palette, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Theme presets
const THEME_PRESETS = [
  { id: 'default', name: 'Clásico Naranja', primary: '#FF6600', accent: '#FF8533', bg: 'from-slate-900 to-slate-800' },
  { id: 'blue', name: 'Azul Profesional', primary: '#3B82F6', accent: '#60A5FA', bg: 'from-slate-900 to-blue-950' },
  { id: 'green', name: 'Verde Natural', primary: '#22C55E', accent: '#4ADE80', bg: 'from-slate-900 to-emerald-950' },
  { id: 'purple', name: 'Púrpura Elegante', primary: '#A855F7', accent: '#C084FC', bg: 'from-slate-900 to-purple-950' },
  { id: 'red', name: 'Rojo Intenso', primary: '#EF4444', accent: '#F87171', bg: 'from-slate-900 to-red-950' },
  { id: 'teal', name: 'Teal Moderno', primary: '#14B8A6', accent: '#2DD4BF', bg: 'from-slate-900 to-teal-950' },
];

export default function ThemeTab() {
  const { systemConfig, setSystemConfig } = useSettings();

  const handleSaveTheme = async () => {
    try { 
      await axios.put(`${API}/system/config`, systemConfig, { headers: hdrs() }); 
      toast.success('Tema guardado'); 
      // Apply theme to CSS variables
      if (systemConfig.theme_primary) {
        document.documentElement.style.setProperty('--primary', systemConfig.theme_primary);
      }
    } catch { 
      toast.error('Error'); 
    }
  };

  const applyPreset = (preset) => {
    setSystemConfig(p => ({
      ...p,
      theme_id: preset.id,
      theme_primary: preset.primary,
      theme_accent: preset.accent
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
          <Palette size={24} className="text-purple-500" />
        </div>
        <div>
          <h2 className="font-oswald text-lg font-bold">Personalización Visual</h2>
          <p className="text-xs text-muted-foreground">Elige los colores y estilo de tu punto de venta</p>
        </div>
      </div>

      {/* Theme Presets */}
      <div>
        <h3 className="font-oswald font-bold text-sm mb-3">Temas Predefinidos</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {THEME_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={`relative p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                systemConfig.theme_id === preset.id 
                  ? 'border-primary shadow-lg' 
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className={`h-16 rounded-lg bg-gradient-to-br ${preset.bg} mb-3 flex items-center justify-center gap-2`}>
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.primary }} />
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.accent }} />
              </div>
              <span className="text-sm font-medium">{preset.name}</span>
              {systemConfig.theme_id === preset.id && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check size={14} className="text-primary-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Colors */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-oswald font-bold text-sm mb-3">Colores Personalizados</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Color Primario</label>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={systemConfig.theme_primary || '#FF6600'} 
                onChange={e => setSystemConfig(p => ({ ...p, theme_primary: e.target.value, theme_id: 'custom' }))}
                className="w-12 h-10 rounded-lg border border-border cursor-pointer"
              />
              <input 
                type="text" 
                value={systemConfig.theme_primary || '#FF6600'} 
                onChange={e => setSystemConfig(p => ({ ...p, theme_primary: e.target.value, theme_id: 'custom' }))}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Color Acento</label>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={systemConfig.theme_accent || '#FF8533'} 
                onChange={e => setSystemConfig(p => ({ ...p, theme_accent: e.target.value, theme_id: 'custom' }))}
                className="w-12 h-10 rounded-lg border border-border cursor-pointer"
              />
              <input 
                type="text" 
                value={systemConfig.theme_accent || '#FF8533'} 
                onChange={e => setSystemConfig(p => ({ ...p, theme_accent: e.target.value, theme_id: 'custom' }))}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-oswald font-bold text-sm mb-3">Vista Previa</h3>
        <div className="flex gap-3">
          <button 
            className="px-4 py-2 rounded-lg font-bold text-sm text-white transition-transform active:scale-95"
            style={{ backgroundColor: systemConfig.theme_primary || '#FF6600' }}
          >
            Botón Primario
          </button>
          <button 
            className="px-4 py-2 rounded-lg font-bold text-sm text-white transition-transform active:scale-95"
            style={{ backgroundColor: systemConfig.theme_accent || '#FF8533' }}
          >
            Botón Secundario
          </button>
          <button className="px-4 py-2 rounded-lg font-bold text-sm bg-muted text-muted-foreground">
            Deshabilitado
          </button>
        </div>
      </div>

      <Button onClick={handleSaveTheme} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold">
        GUARDAR TEMA
      </Button>
    </div>
  );
}
