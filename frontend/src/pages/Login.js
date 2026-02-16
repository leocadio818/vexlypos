import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Delete, LogIn } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user, ensureSeed } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate(user.permissions?.view_dashboard ? '/dashboard' : '/tables');
  }, [user, navigate]);

  useEffect(() => { ensureSeed(); }, [ensureSeed]);

  const handleDigit = (d) => {
    if (pin.length < 8) setPin(prev => prev + d);
  };

  const handleDelete = () => setPin(prev => prev.slice(0, -1));
  const handleClear = () => setPin('');

  const handleSubmit = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    try {
      const u = await login(pin);
      toast.success(`Bienvenido, ${u.name}`);
      const canDash = u.permissions?.view_dashboard;
      navigate(canDash ? '/dashboard' : '/tables');
    } catch {
      toast.error('PIN incorrecto');
      setPin('');
    }
    setLoading(false);
  };

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        setPin(prev => prev.length < 8 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        setPin('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const digits = [1,2,3,4,5,6,7,8,9];

  // Glassmorphism background style
  const bgStyle = {
    background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientMid1} 25%, ${theme.gradientMid2} 50%, ${theme.gradientEnd} 100%)`,
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={bgStyle}
      data-testid="login-page"
    >
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-40 -left-40 w-80 h-80 rounded-full blur-[100px] animate-pulse"
          style={{ backgroundColor: theme.orbColor1 }}
        />
        <div 
          className="absolute top-1/2 -right-20 w-60 h-60 rounded-full blur-[80px] animate-pulse"
          style={{ backgroundColor: theme.orbColor2, animationDelay: '1s' }}
        />
        <div 
          className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full blur-[90px] animate-pulse"
          style={{ backgroundColor: theme.orbColor3, animationDelay: '2s' }}
        />
        <div 
          className="absolute top-20 right-1/4 w-40 h-40 rounded-full blur-[60px] animate-pulse"
          style={{ backgroundColor: theme.orbColor1, animationDelay: '0.5s', opacity: 0.6 }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Brand - Glass effect */}
        <div className="text-center mb-10">
          <div 
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-[0_4px_24px_0_rgba(255,100,0,0.4)] backdrop-blur-xl border border-white/20"
            style={{ backgroundColor: theme.accentColor }}
          >
            <span className="font-oswald text-3xl font-bold text-white">RD</span>
          </div>
          <h1 className="font-oswald text-3xl font-bold tracking-wide text-white">MESA POS</h1>
          <p className="text-sm text-white/60 mt-1">Sistema de Punto de Venta</p>
        </div>

        {/* PIN Display - Glass effect (supports 1-8 digits) */}
        <div className="flex justify-center gap-2 mb-8" data-testid="pin-display">
          {[0,1,2,3,4,5,6,7].map(i => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border-2 transition-all ${
                i < pin.length
                  ? 'scale-110'
                  : 'border-white/40'
              }`}
              style={{
                backgroundColor: i < pin.length ? theme.accentColor : 'transparent',
                borderColor: i < pin.length ? theme.accentColor : 'rgba(255,255,255,0.4)',
                boxShadow: i < pin.length ? `0 0 12px ${theme.accentColor}` : 'none'
              }}
            />
          ))}
        </div>

        {/* PIN Pad - Glassmorphism */}
        <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto" data-testid="pin-pad">
          {digits.map(d => (
            <button
              key={d}
              onClick={() => handleDigit(String(d))}
              data-testid={`pin-key-${d}`}
              className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold backdrop-blur-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 transition-all active:scale-95 shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleClear}
            data-testid="pin-key-clear"
            className="h-16 w-full rounded-2xl text-sm font-semibold backdrop-blur-xl bg-white/5 border border-white/10 text-white/60 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-all active:scale-95"
          >
            CLR
          </button>
          <button
            onClick={() => handleDigit('0')}
            data-testid="pin-key-0"
            className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold backdrop-blur-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 transition-all active:scale-95 shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            data-testid="pin-key-delete"
            className="h-16 w-full rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 text-white/60 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-all active:scale-95 flex items-center justify-center"
          >
            <Delete size={22} />
          </button>
        </div>

        {/* Submit - Gradient button */}
        <button
          onClick={handleSubmit}
          disabled={pin.length < 4 || loading}
          data-testid="pin-submit"
          className="w-full max-w-[280px] mx-auto mt-6 h-14 rounded-xl font-oswald font-bold text-lg tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all block text-white shadow-[0_4px_20px_rgba(255,100,0,0.4)]"
          style={{ 
            background: `linear-gradient(135deg, ${theme.accentColor} 0%, ${theme.accentColor}dd 100%)`,
          }}
        >
          {loading ? (
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <LogIn size={20} />
              ENTRAR
            </>
          )}
        </button>

        {/* Demo PINs - Glass card */}
        <div className="mt-8 text-center">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-3 max-w-[280px] mx-auto">
            <p className="text-[10px] text-white/40 mb-1">PINs de Demo:</p>
            <p className="text-[11px] text-white/60">Admin: 10000 | Carlos: 1234 | Maria: 5678</p>
            <p className="text-[11px] text-white/60">Luis (Cajero): 4321 | Chef Pedro: 9999</p>
          </div>
        </div>
      </div>
    </div>
  );
}
