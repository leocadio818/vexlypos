import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Delete, LogIn, Clock, LogOut as LogOutIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { notify } from '@/lib/notify';

// Neon glow colors for PIN dots
const DOT_COLORS = [
  '#ff69b4', '#ff00ff', '#c840e9', '#8a2be2',
  '#4169e1', '#00bfff', '#1e90ff', '#9370db'
];

export default function Login() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [postLoginRoute, setPostLoginRoute] = useState(null);
  const [askClockIn, setAskClockIn] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [branding, setBranding] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_branding')) || { restaurant_name: '', logo_url: '' }; }
    catch { return { restaurant_name: '', logo_url: '' }; }
  });
  const { login, user, ensureSeed } = useAuth();
  const { theme, isMinimalist, neoColors, isNeoDark } = useTheme();
  const navigate = useNavigate();
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    fetch(`${API_BASE}/api/system/branding`).then(r => r.json()).then(d => {
      setBranding(d);
      localStorage.setItem('pos_branding', JSON.stringify(d));
    }).catch(() => {});
  }, [API_BASE]);

  // Auto-navigate ONLY if user was already logged in (page refresh with valid token)
  // NOT during fresh login flow (loggedInUser handles that)
  useEffect(() => {
    if (attendanceResult || askClockIn || loggedInUser) return;
    if (user) navigate(user.permissions?.view_dashboard ? '/dashboard' : '/tables');
  }, [user, navigate, attendanceResult, askClockIn, loggedInUser]);

  useEffect(() => { ensureSeed(); }, [ensureSeed]);

  const [hasActiveClock, setHasActiveClock] = useState(null);
  useEffect(() => { setHasActiveClock(null); }, []);

  const handleDigit = (d) => {
    if (pin.length < 8) setPin(prev => prev + d);
  };
  const handleDelete = () => setPin(prev => prev.slice(0, -1));
  const handleClear = () => setPin('');

  const handleSubmit = useCallback(async () => {
    if (pin.length < 1 || loading) return;
    setLoading(true);
    const savedPin = pin;
    try {
      const u = await login(savedPin);
      setLoggedInUser(u);
      const route = u.permissions?.view_dashboard ? '/dashboard' : '/tables';

      let needsClockIn = false;
      try {
        const r = await fetch(`${API_BASE}/api/attendance/check-status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: savedPin }),
        });
        if (r.ok) { const d = await r.json(); needsClockIn = !d.clocked_in; }
      } catch {}

      setLoading(false);
      if (needsClockIn) {
        setAskClockIn({ user_name: u.name, route, pin: savedPin });
      } else {
        navigate(route);
      }
    } catch (err) {
      setLoading(false);
      setLoggedInUser(null);
      notify.error('PIN incorrecto');
      setPin('');
    }
  }, [pin, loading, login, navigate, API_BASE]);

  const handleConfirmClockIn = async (doClockIn) => {
    const route = askClockIn?.route || '/dashboard';
    if (doClockIn && askClockIn?.pin) {
      try {
        const res = await fetch(`${API_BASE}/api/attendance/clock-in`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: askClockIn.pin }),
        });
        if (res.ok) {
          const data = await res.json();
          setAskClockIn(null);
          setAttendanceResult(data);
          setPostLoginRoute(route);
          return;
        }
      } catch {}
    }
    // "No" → clear session, back to login
    setAskClockIn(null);
    setLoggedInUser(null);
    if (!doClockIn) {
      localStorage.removeItem('pos_token');
      window.location.href = '/login';
      return;
    }
    navigate(route);
  };

  const handleAttendance = async (action) => {
    if (pin.length < 1) { notify.error('Ingresa tu PIN primero'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/attendance/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      
      const clone = res.clone();
      let data = {};
      try { data = await clone.json(); } catch { try { data = { detail: await res.text() }; } catch {} }
      
      if (!res.ok) {
        notify.error(data.detail || 'Error al procesar la solicitud', { duration: 6000 });
        setPin('');
        setLoading(false);
        return;
      }
      setAttendanceResult(data);
      setPin('');
    } catch (err) {
      notify.error(`No se pudo conectar al servidor`, { duration: 6000 });
    }
    setLoading(false);
  };


  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') setPin(prev => prev.length < 8 ? prev + e.key : prev);
      else if (e.key === 'Backspace') setPin(prev => prev.slice(0, -1));
      else if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
      else if (e.key === 'Escape') setPin('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  const digits = [1,2,3,4,5,6,7,8,9];

  // ═══ NEUMORPHIC LOGIN ═══
  if (isMinimalist) {
    const bg = isNeoDark ? neoColors.neoDarkBg : neoColors.neoBgColor;
    const dk = adjustHex(bg, isNeoDark ? -20 : -40);
    const lt = adjustHex(bg, isNeoDark ? 20 : 15);
    const accent = isNeoDark ? '#e2e8f0' : neoColors.neoAccentColor;
    const glow = neoColors.neoGlowColor;
    const glowStrong = isNeoDark ? '80' : '30';
    const glowSoft = isNeoDark ? '50' : '15';

    return (
      <>
      <div
        className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
        style={{ background: bg }}
        data-testid="login-page"
      >
        {/* Subtle glow orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full blur-[120px]" style={{ backgroundColor: glow, opacity: isNeoDark ? 0.5 : 0.4 }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-[140px]" style={{ backgroundColor: glow, opacity: isNeoDark ? 0.4 : 0.3 }} />
          {isNeoDark && <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full blur-[100px]" style={{ backgroundColor: glow, opacity: 0.25 }} />}
        </div>

        <div className="w-full max-w-sm relative z-10">
          {/* Neumorphic Card with Glow */}
          <div
            className="rounded-3xl p-8"
            style={{
              background: bg,
              boxShadow: `0 0 40px ${glow}${glowStrong}, 0 0 80px ${glow}${glowSoft}, 10px 10px 20px ${dk}, -10px -10px 20px ${lt}`,
            }}
          >
            {/* Brand */}
            <div className="text-center mb-8">
              {branding.logo_url ? (
                <img src={`${API_BASE}${branding.logo_url}`} alt="Logo" className="w-32 h-32 rounded-2xl mx-auto mb-4 object-contain" style={{ boxShadow: `6px 6px 12px ${dk}, -6px -6px 12px ${lt}` }} />
              ) : (
                <div
                  className="w-32 h-32 rounded-2xl mx-auto flex items-center justify-center mb-4"
                  style={{ background: bg, boxShadow: `6px 6px 12px ${dk}, -6px -6px 12px ${lt}`, color: accent }}
                >
                  <span className="font-oswald text-4xl font-bold">{(branding.restaurant_name || 'POS').substring(0, 3).toUpperCase()}</span>
                </div>
              )}
              <h1 className="font-oswald text-2xl font-bold tracking-wide" style={{ color: accent }}>{branding.restaurant_name || 'POS'}</h1>
              <p className="text-sm mt-1" style={{ color: accent + '80' }}>Sistema de Punto de Venta</p>
            </div>

            {/* PIN Dots */}
            <div className="flex justify-center gap-2.5 mb-8" data-testid="pin-display">
              {[0,1,2,3,4,5,6,7].map(i => {
                const active = i < pin.length;
                return (
                  <div
                    key={i}
                    className="w-3.5 h-3.5 rounded-full transition-all duration-300"
                    style={{
                      background: active ? accent : bg,
                      boxShadow: active
                        ? `0 0 8px ${accent}80, inset 2px 2px 4px ${dk}`
                        : `inset 2px 2px 4px ${dk}, inset -2px -2px 4px ${lt}`,
                      transform: active ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                );
              })}
            </div>

            {/* PIN Pad - Neumorphic 3D Buttons */}
            <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto" data-testid="pin-pad">
              {digits.map(d => (
                <button
                  key={d}
                  onClick={() => handleDigit(String(d))}
                  data-testid={`pin-key-${d}`}
                  className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold transition-all duration-150"
                  style={{
                    background: bg,
                    color: accent,
                    boxShadow: `5px 5px 10px ${dk}, -5px -5px 10px ${lt}`,
                  }}
                  onMouseDown={e => e.currentTarget.style.boxShadow = `inset 4px 4px 8px ${dk}, inset -4px -4px 8px ${lt}`}
                  onMouseUp={e => e.currentTarget.style.boxShadow = `5px 5px 10px ${dk}, -5px -5px 10px ${lt}`}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = `5px 5px 10px ${dk}, -5px -5px 10px ${lt}`}
                >
                  {d}
                </button>
              ))}
              <button
                onClick={handleClear}
                data-testid="pin-key-clear"
                className="h-16 w-full rounded-2xl text-sm font-semibold transition-all duration-150"
                style={{
                  background: bg,
                  color: accent + '60',
                  boxShadow: `3px 3px 6px ${dk}, -3px -3px 6px ${lt}`,
                }}
                onMouseDown={e => e.currentTarget.style.boxShadow = `inset 3px 3px 6px ${dk}, inset -3px -3px 6px ${lt}`}
                onMouseUp={e => e.currentTarget.style.boxShadow = `3px 3px 6px ${dk}, -3px -3px 6px ${lt}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = `3px 3px 6px ${dk}, -3px -3px 6px ${lt}`}
              >
                CLR
              </button>
              <button
                onClick={() => handleDigit('0')}
                data-testid="pin-key-0"
                className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold transition-all duration-150"
                style={{
                  background: bg,
                  color: accent,
                  boxShadow: `5px 5px 10px ${dk}, -5px -5px 10px ${lt}`,
                }}
                onMouseDown={e => e.currentTarget.style.boxShadow = `inset 4px 4px 8px ${dk}, inset -4px -4px 8px ${lt}`}
                onMouseUp={e => e.currentTarget.style.boxShadow = `5px 5px 10px ${dk}, -5px -5px 10px ${lt}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = `5px 5px 10px ${dk}, -5px -5px 10px ${lt}`}
              >
                0
              </button>
              <button
                onClick={handleDelete}
                data-testid="pin-key-delete"
                className="h-16 w-full rounded-2xl transition-all duration-150 flex items-center justify-center"
                style={{
                  background: bg,
                  color: accent + '60',
                  boxShadow: `3px 3px 6px ${dk}, -3px -3px 6px ${lt}`,
                }}
                onMouseDown={e => e.currentTarget.style.boxShadow = `inset 3px 3px 6px ${dk}, inset -3px -3px 6px ${lt}`}
                onMouseUp={e => e.currentTarget.style.boxShadow = `3px 3px 6px ${dk}, -3px -3px 6px ${lt}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = `3px 3px 6px ${dk}, -3px -3px 6px ${lt}`}
              >
                <Delete size={22} />
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={pin.length < 1 || loading}
              data-testid="pin-submit"
              className="w-full max-w-[280px] mx-auto mt-7 h-14 rounded-full font-oswald font-bold text-lg tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 block"
              style={{
                background: pin.length > 0 ? `hsl(25 100% 50%)` : bg,
                color: pin.length > 0 ? '#fff' : accent + '50',
                boxShadow: pin.length > 0
                  ? `0 0 15px hsl(25 100% 50% / 0.4), 5px 5px 10px ${dk}, -5px -5px 10px ${lt}`
                  : `3px 3px 6px ${dk}, -3px -3px 6px ${lt}`,
              }}
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  <span>ENTRAR</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
      
      {/* Version Footer - Fixed at bottom of screen */}
      <div className="fixed bottom-4 left-0 right-0 text-center z-10">
        <span className="text-sm font-medium px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm" style={{ color: '#e4e4e7' }}>VexlyPOS v1.0.0</span>
      </div>

      {/* Clock-In Modal - Neumorphic */}
      {askClockIn && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="clock-in-overlay">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full mx-4 p-8 text-center shadow-2xl">
            <div className="w-24 h-24 rounded-full mx-auto mb-5 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30">
              <Clock size={48} className="text-green-500" />
            </div>
            <h2 className="font-oswald text-2xl font-bold mb-1 text-foreground">Bienvenido, {askClockIn?.user_name}!</h2>
            <p className="text-muted-foreground mb-6 text-sm">No tienes un turno activo. Para acceder al sistema debes marcar tu entrada.</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => handleConfirmClockIn(true)} className="w-full h-14 rounded-xl bg-green-600 text-white font-oswald font-bold text-lg transition-all active:scale-95 hover:bg-green-700 flex items-center justify-center gap-2" data-testid="confirm-clock-in-btn"><Clock size={20} /> Marcar Entrada</button>
              <button onClick={() => handleConfirmClockIn(false)} className="w-full h-10 rounded-xl text-muted-foreground text-sm transition-all active:scale-95 hover:bg-muted" data-testid="skip-clock-in-btn">No</button>
            </div>
          </div>
        </div>
      )}
      {attendanceResult && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full mx-4 p-8 text-center shadow-2xl">
            <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${attendanceResult?.action === 'clock_in' ? 'bg-green-500/20' : 'bg-orange-500/20'}`}>
              {attendanceResult?.action === 'clock_in' ? <Clock size={40} className="text-green-500" /> : <LogOutIcon size={40} className="text-orange-500" />}
            </div>
            <h2 className="font-oswald text-2xl font-bold mb-2 text-foreground">{attendanceResult?.action === 'clock_in' ? 'Entrada Registrada!' : 'Salida Registrada!'}</h2>
            <p className="text-lg mb-1 text-foreground">{attendanceResult?.action === 'clock_in' ? 'Bienvenido' : 'Hasta luego'}, <strong>{attendanceResult?.user_name}</strong></p>
            <p className="font-oswald text-3xl font-bold text-primary my-3">{attendanceResult?.time}</p>
            <button onClick={() => { setAttendanceResult(null); if (postLoginRoute) { navigate(postLoginRoute); setPostLoginRoute(null); } }} className="mt-6 w-full h-12 rounded-xl bg-primary text-primary-foreground font-oswald font-bold text-lg transition-all active:scale-95">OK</button>
          </div>
        </div>
      )}
    </>);
  }

  // ═══ ORIGINAL GLASS LOGIN ═══
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
      }}
      data-testid="login-page"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full blur-[100px] neon-orb-pulse" style={{ backgroundColor: 'rgba(255,0,255,0.15)' }} />
        <div className="absolute top-1/2 -right-20 w-60 h-60 rounded-full blur-[80px] neon-orb-pulse" style={{ backgroundColor: 'rgba(0,191,255,0.12)', animationDelay: '1s' }} />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full blur-[90px] neon-orb-pulse" style={{ backgroundColor: 'rgba(138,43,226,0.12)', animationDelay: '2s' }} />
        <div className="absolute top-20 right-1/4 w-40 h-40 rounded-full blur-[60px] neon-orb-pulse" style={{ backgroundColor: 'rgba(255,105,180,0.1)', animationDelay: '0.5s' }} />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div
          className="rounded-3xl p-8 relative overflow-hidden"
          style={{
            background: 'rgba(10, 10, 20, 0.75)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 0 40px rgba(138,43,226,0.08), 0 0 80px rgba(0,191,255,0.05), 0 20px 60px rgba(0,0,0,0.4)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none rounded-3xl"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.02) 100%)' }}
          />

          <div className="text-center mb-8 relative z-10">
            {branding.logo_url ? (
              <img src={`${API_BASE}${branding.logo_url}`} alt="Logo" className="w-32 h-32 rounded-2xl mx-auto mb-4 object-contain neon-logo-glow" />
            ) : (
              <div
                className="w-32 h-32 rounded-2xl mx-auto flex items-center justify-center mb-4 neon-logo-glow"
                style={{ backgroundColor: theme.accentColor, boxShadow: `0 0 20px ${theme.accentColor}80, 0 0 40px ${theme.accentColor}40` }}
              >
                <span className="font-oswald text-4xl font-bold text-white">{(branding.restaurant_name || 'POS').substring(0, 3).toUpperCase()}</span>
              </div>
            )}
            <h1 className="font-oswald text-2xl font-bold tracking-wide text-white">{branding.restaurant_name || 'POS'}</h1>
            <p className="text-sm text-white/50 mt-1">Sistema de Punto de Venta</p>
          </div>

          <div className="flex justify-center gap-2.5 mb-8 relative z-10" data-testid="pin-display">
            {[0,1,2,3,4,5,6,7].map(i => {
              const active = i < pin.length;
              const color = DOT_COLORS[i];
              return (
                <div key={i} className="w-3.5 h-3.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: active ? color : 'transparent',
                    border: `2px solid ${active ? color : 'rgba(255,255,255,0.2)'}`,
                    boxShadow: active ? `0 0 8px ${color}, 0 0 16px ${color}60` : 'none',
                    transform: active ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto relative z-10" data-testid="pin-pad">
            {digits.map(d => (
              <button key={d} onClick={() => handleDigit(String(d))} data-testid={`pin-key-${d}`}
                className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold text-white/90 transition-all duration-200 active:scale-90 neon-key"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
              >{d}</button>
            ))}
            <button onClick={handleClear} data-testid="pin-key-clear"
              className="h-16 w-full rounded-2xl text-sm font-semibold text-white/40 transition-all duration-200 active:scale-90 neon-key-danger"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >CLR</button>
            <button onClick={() => handleDigit('0')} data-testid="pin-key-0"
              className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold text-white/90 transition-all duration-200 active:scale-90 neon-key"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
            >0</button>
            <button onClick={handleDelete} data-testid="pin-key-delete"
              className="h-16 w-full rounded-2xl text-white/40 transition-all duration-200 active:scale-90 flex items-center justify-center neon-key-danger"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            ><Delete size={22} /></button>
          </div>

          <button onClick={handleSubmit} disabled={pin.length < 1 || loading} data-testid="pin-submit"
            className="w-full max-w-[280px] mx-auto mt-7 h-14 rounded-full font-oswald font-bold text-lg tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all duration-200 block text-white relative z-10 neon-submit-btn"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `2px solid ${theme.accentColor}80`,
              boxShadow: pin.length > 0 ? `0 0 15px ${theme.accentColor}40, 0 0 30px ${theme.accentColor}20, inset 0 0 15px ${theme.accentColor}10` : 'none',
            }}
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={20} style={{ color: theme.accentColor }} />
                <span style={{ color: pin.length > 0 ? '#fff' : 'rgba(255,255,255,0.4)' }}>ENTRAR</span>
              </>
            )}
          </button>
        </div>

      </div>

      <style>{`
        .neon-orb-pulse { animation: orbPulse 4s ease-in-out infinite alternate; }
        @keyframes orbPulse { 0% { opacity: 0.6; transform: scale(1); } 100% { opacity: 1; transform: scale(1.1); } }
        .neon-logo-glow { animation: logoGlow 3s ease-in-out infinite alternate; }
        @keyframes logoGlow { 0% { box-shadow: 0 0 20px rgba(255,102,0,0.5), 0 0 40px rgba(255,102,0,0.25); } 100% { box-shadow: 0 0 30px rgba(255,102,0,0.7), 0 0 60px rgba(255,102,0,0.35); } }
        .neon-key:hover { background: rgba(255,255,255,0.08) !important; border-color: rgba(138,43,226,0.4) !important; box-shadow: 0 0 12px rgba(138,43,226,0.2), 0 0 24px rgba(0,191,255,0.1), 0 2px 8px rgba(0,0,0,0.2) !important; }
        .neon-key:active { border-color: rgba(255,0,255,0.5) !important; box-shadow: 0 0 16px rgba(255,0,255,0.3), 0 0 32px rgba(138,43,226,0.15) !important; }
        .neon-key-danger:hover { background: rgba(239,68,68,0.08) !important; border-color: rgba(239,68,68,0.3) !important; box-shadow: 0 0 10px rgba(239,68,68,0.15) !important; color: rgba(248,113,113,0.8) !important; }
        .neon-submit-btn:hover:not(:disabled) { box-shadow: 0 0 20px rgba(255,102,0,0.5), 0 0 40px rgba(255,102,0,0.25), inset 0 0 20px rgba(255,102,0,0.15) !important; border-color: rgba(255,102,0,0.7) !important; background: rgba(255,102,0,0.08) !important; }
      `}</style>

      {/* Ask Clock-In Modal - Inline overlay (not Dialog portal) */}
      {askClockIn && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="clock-in-overlay">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full mx-4 p-8 text-center shadow-2xl">
            <div className="w-24 h-24 rounded-full mx-auto mb-5 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30">
              <Clock size={48} className="text-green-500" />
            </div>
            <h2 className="font-oswald text-2xl font-bold mb-1 text-foreground">
              Bienvenido, {askClockIn?.user_name}!
            </h2>
            <p className="text-muted-foreground mb-6 text-sm">
              No tienes un turno activo. Para acceder al sistema debes marcar tu entrada.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => handleConfirmClockIn(true)}
                className="w-full h-14 rounded-xl bg-green-600 text-white font-oswald font-bold text-lg transition-all active:scale-95 hover:bg-green-700 flex items-center justify-center gap-2"
                data-testid="confirm-clock-in-btn">
                <Clock size={20} /> Marcar Entrada
              </button>
              <button onClick={() => handleConfirmClockIn(false)}
                className="w-full h-10 rounded-xl text-muted-foreground text-sm transition-all active:scale-95 hover:bg-muted"
                data-testid="skip-clock-in-btn">
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Result Modal - Inline overlay */}
      {attendanceResult && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full mx-4 p-8 text-center shadow-2xl">
            <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
              attendanceResult?.action === 'clock_in' ? 'bg-green-500/20' : 'bg-orange-500/20'
            }`}>
              {attendanceResult?.action === 'clock_in' 
                ? <Clock size={40} className="text-green-500" />
                : <LogOutIcon size={40} className="text-orange-500" />
              }
            </div>
            <h2 className="font-oswald text-2xl font-bold mb-2 text-foreground">
              {attendanceResult?.action === 'clock_in' ? 'Entrada Registrada!' : 'Salida Registrada!'}
            </h2>
            <p className="text-lg mb-1 text-foreground">
              {attendanceResult?.action === 'clock_in' ? 'Bienvenido' : 'Hasta luego'}, <strong>{attendanceResult?.user_name}</strong>
            </p>
            <p className="font-oswald text-3xl font-bold text-primary my-3">
              {attendanceResult?.time}
            </p>
            {attendanceResult?.hours_display && (
              <p className="text-sm text-muted-foreground">
                Horas trabajadas: <strong>{attendanceResult.hours_display}</strong>
                <br />Entrada: {attendanceResult.clock_in_time}
              </p>
            )}
            <button onClick={() => { setAttendanceResult(null); if (postLoginRoute) { navigate(postLoginRoute); setPostLoginRoute(null); } }}
              className="mt-6 w-full h-12 rounded-xl bg-primary text-primary-foreground font-oswald font-bold text-lg transition-all active:scale-95">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function adjustHex(hex, amount) {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  } catch { return '#c8cfd8'; }
}
