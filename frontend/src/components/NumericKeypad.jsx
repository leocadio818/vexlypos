import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Delete, Check, X, Keyboard } from 'lucide-react';
import { useInputMode } from '@/hooks/useInputMode';

/**

function KeypadDialog({ open, setOpen, tempValue, setTempValue, handleDigit, handleDelete, handleClear, handleConfirm, allowDecimal, label }) {
  // Listen for physical keyboard input while dialog is open
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      else if (e.key === '.' && allowDecimal) handleDigit('.');
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Enter') handleConfirm();
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleDigit, handleDelete, handleConfirm, setOpen, allowDecimal]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xs p-4" data-testid="numeric-keypad-dialog">
        <DialogHeader>
          <DialogTitle className="font-oswald text-center text-base">{label || 'Ingrese valor'}</DialogTitle>
        </DialogHeader>
        <div className="rounded-2xl p-4 text-center mb-3 bg-muted border border-border">
          <span className="font-oswald font-bold text-3xl" data-testid="keypad-display">{tempValue || '0'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['7','8','9','4','5','6','1','2','3'].map(key => (
            <button key={key} type="button" onClick={() => handleDigit(key)}
              className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-95 hover:bg-muted">
              {key}
            </button>
          ))}
          {allowDecimal ? (
            <button type="button" onClick={() => handleDigit('.')}
              className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-95 hover:bg-muted">.</button>
          ) : (
            <button type="button" onClick={handleClear}
              className="h-14 rounded-xl font-semibold text-sm bg-background border border-border text-muted-foreground transition-all active:scale-95 hover:bg-muted">CLR</button>
          )}
          <button type="button" onClick={() => handleDigit('0')}
            className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-95 hover:bg-muted">0</button>
          <button type="button" onClick={handleDelete}
            className="h-14 rounded-xl bg-background border border-border text-muted-foreground transition-all active:scale-95 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center">
            <Delete size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button type="button" onClick={() => setOpen(false)}
            className="h-11 rounded-xl bg-muted font-oswald font-bold text-sm text-muted-foreground transition-all active:scale-95 flex items-center justify-center gap-1">
            <X size={16} /> Cancelar
          </button>
          <button type="button" onClick={handleConfirm}
            className="h-11 rounded-xl bg-primary text-primary-foreground font-oswald font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-1"
            data-testid="keypad-confirm">
            <Check size={16} /> Confirmar
          </button>
        </div>
        {allowDecimal && (
          <button type="button" onClick={handleClear}
            className="w-full h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-all">Limpiar todo</button>
        )}
      </DialogContent>
    </Dialog>
  );
}


 * NumericInput — Smart input that auto-detects keyboard vs touch
 * Touch-only → opens keypad modal on click
 * Has keyboard → renders normal input with optional keypad button
 */
export function NumericInput({
  value,
  onChange,
  label,
  placeholder = '0',
  className = '',
  disabled = false,
  step,
  min,
  max,
  allowDecimal = true,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const { isTouchOnly } = useInputMode();

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setTempValue(String(value ?? ''));
    setOpen(true);
  }, [disabled, value]);

  const handleDigit = useCallback((d) => {
    setTempValue(prev => {
      if (d === '.' && prev.includes('.')) return prev;
      if (d === '.' && !allowDecimal) return prev;
      return prev + d;
    });
  }, [allowDecimal]);

  const handleDelete = useCallback(() => {
    setTempValue(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => setTempValue(''), []);

  const handleConfirm = useCallback(() => {
    if (onChange) {
      onChange({ target: { value: tempValue } });
    }
    setOpen(false);
  }, [onChange, tempValue]);

  const displayValue = value !== undefined && value !== null && value !== '' ? value : '';

  // Has keyboard → render normal input with optional keypad button
  if (!isTouchOnly) {
    return (
      <div className="flex gap-1 items-center">
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={e => {
            const v = e.target.value.replace(/[^0-9.]/g, '');
            if (onChange) onChange({ target: { value: v } });
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          data-testid={rest['data-testid'] || 'numeric-input'}
        />
        <button type="button" onClick={handleOpen} disabled={disabled}
          className="shrink-0 w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
          title="Abrir teclado numérico">
          <Keyboard size={14} />
        </button>
        <KeypadDialog open={open} setOpen={setOpen} tempValue={tempValue} setTempValue={setTempValue}
          handleDigit={handleDigit} handleDelete={handleDelete} handleClear={handleClear} handleConfirm={handleConfirm}
          allowDecimal={allowDecimal} label={label} />
      </div>
    );
  }

  // Touch-only → show button that opens keypad
  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        data-testid={rest['data-testid'] || 'numeric-input'}
      >
        {displayValue !== '' ? displayValue : <span className="text-muted-foreground">{placeholder}</span>}
      </button>
      <KeypadDialog open={open} setOpen={setOpen} tempValue={tempValue} setTempValue={setTempValue}
        handleDigit={handleDigit} handleDelete={handleDelete} handleClear={handleClear} handleConfirm={handleConfirm}
        allowDecimal={allowDecimal} label={label} />
    </>
  );
}
