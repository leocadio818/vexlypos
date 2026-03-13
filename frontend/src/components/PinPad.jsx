import { useState, useEffect, useRef } from 'react';
import { Delete, Keyboard } from 'lucide-react';
import { useInputMode } from '@/hooks/useInputMode';

/**
 * PinPad — Hybrid PIN input (touch + physical keyboard)
 * forceKeypad: always shows on-screen keypad
 * Physical keyboard: 0-9 digits, Backspace, Enter — all work simultaneously
 */
export function PinPad({ value = '', onChange, onSubmit, maxLength = 10, placeholder = 'Ingresa PIN', label, forceKeypad = false }) {
  const { isTouchOnly } = useInputMode();
  const [showKeypad, setShowKeypad] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  const showTouchPad = forceKeypad || isTouchOnly || showKeypad;

  // Physical keyboard listener — works alongside touch buttons
  useEffect(() => {
    if (!showTouchPad) return;
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        if (value.length < maxLength) {
          onChange(value + e.key);
          setActiveKey(e.key);
          setTimeout(() => setActiveKey(null), 150);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onChange(value.slice(0, -1));
      } else if (e.key === 'Delete') {
        e.preventDefault();
        onChange('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (value.length > 0 && onSubmit) onSubmit(value);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTouchPad, value, maxLength, onChange, onSubmit]);

  const handleDigit = (d) => {
    if (value.length < maxLength) {
      onChange(value + d);
    }
  };
  const handleDelete = () => onChange(value.slice(0, -1));
  const handleClear = () => onChange('');

  // PIN dots display
  const PinDots = () => (
    <div className="flex justify-center gap-2 py-3 px-4 rounded-xl bg-muted border border-border min-h-[44px]">
      {value.length === 0 ? (
        <span className="text-muted-foreground text-sm">{placeholder}</span>
      ) : (
        Array.from({ length: value.length }).map((_, i) => (
          <div key={i} className="w-3 h-3 rounded-full bg-primary" />
        ))
      )}
    </div>
  );

  // Keypad grid with OK button
  const KeypadGrid = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} type="button" onClick={() => handleDigit(String(d))}
            className={`h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-90 hover:bg-muted ${activeKey === String(d) ? 'bg-primary/30 scale-95 border-primary' : ''}`}
            data-testid={`pin-pad-${d}`}>
            {d}
          </button>
        ))}
        <button type="button" onClick={handleClear}
          className="h-14 rounded-xl font-semibold text-xs bg-background border border-border text-muted-foreground transition-all active:scale-90 hover:bg-muted">
          CLR
        </button>
        <button type="button" onClick={() => handleDigit('0')}
          className={`h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-90 hover:bg-muted ${activeKey === '0' ? 'bg-primary/30 scale-95 border-primary' : ''}`}
          data-testid="pin-pad-0">
          0
        </button>
        <button type="button" onClick={handleDelete}
          className="h-14 rounded-xl bg-background border border-border text-muted-foreground transition-all active:scale-90 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center">
          <Delete size={20} />
        </button>
      </div>
      {onSubmit && (
        <button type="button" onClick={() => { if (value.length > 0) onSubmit(value); }}
          disabled={value.length === 0}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-oswald font-bold text-base transition-all active:scale-95 disabled:opacity-30"
          data-testid="pin-pad-submit">
          AUTORIZAR
        </button>
      )}
    </div>
  );

  // Has keyboard AND not forced → input field + optional keypad
  if (!showTouchPad) {
    return (
      <div className="space-y-3" data-testid="pin-pad-component">
        {label && <p className="text-sm font-medium text-center">{label}</p>}
        <div className="flex gap-1 items-center">
          <input
            type="password"
            value={value}
            onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, maxLength))}
            onKeyDown={e => { if (e.key === 'Enter' && onSubmit) onSubmit(); }}
            placeholder={placeholder}
            className="flex-1 h-12 bg-background border border-border rounded-xl px-4 text-center font-mono text-2xl tracking-[0.3em] focus:ring-2 focus:ring-primary/50 outline-none"
            autoFocus
            data-testid="pin-input-keyboard"
          />
          <button type="button" onClick={() => setShowKeypad(true)}
            className="shrink-0 w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            title="Abrir teclado táctil">
            <Keyboard size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Touch-only OR user clicked keypad icon → show full keypad
  return (
    <div className="space-y-3" data-testid="pin-pad-component">
      {label && <p className="text-sm font-medium text-center">{label}</p>}
      <PinDots />
      <KeypadGrid />
    </div>
  );
}
