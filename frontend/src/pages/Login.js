import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Delete, LogIn } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user, ensureSeed } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  useEffect(() => { ensureSeed(); }, [ensureSeed]);

  const handleDigit = (d) => {
    if (pin.length < 6) setPin(prev => prev + d);
  };

  const handleDelete = () => setPin(prev => prev.slice(0, -1));
  const handleClear = () => setPin('');

  const handleSubmit = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    try {
      const u = await login(pin);
      toast.success(`Bienvenido, ${u.name}`);
      navigate('/dashboard');
    } catch {
      toast.error('PIN incorrecto');
      setPin('');
    }
    setLoading(false);
  };

  const digits = [1,2,3,4,5,6,7,8,9];

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4 grid-bg"
      data-testid="login-page"
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center mb-4 shadow-[0_4px_24px_0_rgba(255,100,0,0.4)]">
            <span className="font-oswald text-3xl font-bold text-primary-foreground">RD</span>
          </div>
          <h1 className="font-oswald text-3xl font-bold tracking-wide text-foreground">MESA POS</h1>
          <p className="text-sm text-muted-foreground mt-1">Sistema de Punto de Venta</p>
        </div>

        {/* PIN Display */}
        <div className="flex justify-center gap-3 mb-8" data-testid="pin-display">
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                i < pin.length
                  ? 'bg-primary border-primary scale-110 pin-dot-filled'
                  : 'border-muted-foreground/40'
              }`}
            />
          ))}
        </div>

        {/* PIN Pad */}
        <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto" data-testid="pin-pad">
          {digits.map(d => (
            <button
              key={d}
              onClick={() => handleDigit(String(d))}
              data-testid={`pin-key-${d}`}
              className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold bg-card border border-border text-foreground hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleClear}
            data-testid="pin-key-clear"
            className="h-16 w-full rounded-2xl text-sm font-semibold bg-card border border-border text-muted-foreground hover:bg-destructive hover:text-white transition-colors active:scale-95"
          >
            CLR
          </button>
          <button
            onClick={() => handleDigit('0')}
            data-testid="pin-key-0"
            className="h-16 w-full rounded-2xl text-2xl font-oswald font-bold bg-card border border-border text-foreground hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            data-testid="pin-key-delete"
            className="h-16 w-full rounded-2xl bg-card border border-border text-muted-foreground hover:bg-destructive/80 hover:text-white transition-colors active:scale-95 flex items-center justify-center"
          >
            <Delete size={22} />
          </button>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={pin.length < 4 || loading}
          data-testid="pin-submit"
          className="w-full max-w-[280px] mx-auto mt-6 h-14 rounded-xl bg-primary text-primary-foreground font-oswald font-bold text-lg tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-[0_4px_14px_0_rgba(255,100,0,0.39)] block"
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

        {/* Demo PINs */}
        <div className="mt-8 text-center text-xs text-muted-foreground/60">
          <p className="mb-1">PINs de Demo:</p>
          <p>Admin: 0000 | Carlos: 1234 | Maria: 5678</p>
          <p>Luis (Cajero): 4321 | Chef Pedro: 9999</p>
        </div>
      </div>
    </div>
  );
}
