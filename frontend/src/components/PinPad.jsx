import { useState, useEffect } from 'react';
import { Delete } from 'lucide-react';

/**
 * PinPad — Teclado numérico táctil para ingreso de PIN
 * Drop-in replacement for <input type="password"> en campos de PIN
 * Props: value, onChange, onSubmit, maxLength, placeholder, label
 */
export function PinPad({ value = '', onChange, onSubmit, maxLength = 8, placeholder = 'Ingresa PIN', label }) {
  const handleDigit = (d) => {
    if (value.length < maxLength) {
      const newVal = value + d;
      onChange(newVal);
    }
  };

  const handleDelete = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="space-y-3" data-testid="pin-pad-component">
      {label && <p className="text-sm font-medium text-center">{label}</p>}
      
      {/* PIN Display */}
      <div className="flex justify-center gap-2 py-3 px-4 rounded-xl bg-muted border border-border">
        {value.length === 0 ? (
          <span className="text-muted-foreground text-sm">{placeholder}</span>
        ) : (
          Array.from({ length: value.length }).map((_, i) => (
            <div key={i} className="w-3 h-3 rounded-full bg-primary" />
          ))
        )}
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} type="button" onClick={() => handleDigit(String(d))}
            className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-90 hover:bg-muted"
            data-testid={`pin-pad-${d}`}
          >
            {d}
          </button>
        ))}
        <button type="button" onClick={handleClear}
          className="h-14 rounded-xl font-semibold text-xs bg-background border border-border text-muted-foreground transition-all active:scale-90 hover:bg-muted">
          CLR
        </button>
        <button type="button" onClick={() => handleDigit('0')}
          className="h-14 rounded-xl font-oswald font-bold text-xl bg-background border border-border transition-all active:scale-90 hover:bg-muted"
          data-testid="pin-pad-0"
        >
          0
        </button>
        <button type="button" onClick={handleDelete}
          className="h-14 rounded-xl bg-background border border-border text-muted-foreground transition-all active:scale-90 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center">
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}
