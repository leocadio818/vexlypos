import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Delete, Check, X } from 'lucide-react';

/**
 * NumericInput — Drop-in replacement for <input type="number">
 * Renders as an input-like field. Opens a neumorphic keypad modal on click.
 * Compatible with existing onChange handlers: passes { target: { value } }
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

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        data-testid={rest['data-testid'] || 'numeric-input'}
        {...rest}
      >
        {displayValue !== '' ? displayValue : <span className="text-muted-foreground">{placeholder}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs p-4" data-testid="numeric-keypad-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-center text-base">
              {label || 'Ingrese valor'}
            </DialogTitle>
          </DialogHeader>

          {/* Display */}
          <div className="rounded-2xl p-4 text-center mb-3 bg-muted border border-border">
            <span className="font-oswald font-bold text-3xl" data-testid="keypad-display">
              {tempValue || '0'}
            </span>
          </div>

          {/* Keypad Grid */}
          <div className="grid grid-cols-3 gap-2">
            {['7','8','9','4','5','6','1','2','3'].map(key => (
              <button
                key={key}
                type="button"
                onClick={() => handleDigit(key)}
                className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-95 hover:bg-muted"
                data-testid={`keypad-${key}`}
              >
                {key}
              </button>
            ))}
            {allowDecimal ? (
              <button
                type="button"
                onClick={() => handleDigit('.')}
                className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-95 hover:bg-muted"
                data-testid="keypad-dot"
              >
                .
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClear}
                className="h-14 rounded-xl font-semibold text-sm bg-background border border-border text-muted-foreground transition-all active:scale-95 hover:bg-muted"
              >
                CLR
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-95 hover:bg-muted"
              data-testid="keypad-0"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="h-14 rounded-xl bg-background border border-border text-muted-foreground transition-all active:scale-95 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
              data-testid="keypad-delete"
            >
              <Delete size={20} />
            </button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 rounded-xl bg-muted font-oswald font-bold text-sm text-muted-foreground transition-all active:scale-95 flex items-center justify-center gap-1"
            >
              <X size={16} /> Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-oswald font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-1"
              data-testid="keypad-confirm"
            >
              <Check size={16} /> Confirmar
            </button>
          </div>

          {/* Clear button */}
          {allowDecimal && (
            <button
              type="button"
              onClick={handleClear}
              className="w-full h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
            >
              Limpiar todo
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
