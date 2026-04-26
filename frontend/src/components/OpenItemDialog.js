import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChefHat, Wine, Pencil, Plus, Minus, Shield } from 'lucide-react';
import { NumericInput } from '@/components/NumericKeypad';

export default function OpenItemDialog({
  open,
  channel, // "kitchen" | "bar"
  config,  // { require_supervisor, price_limit_rd, ... }
  onConfirm,
  onCancel,
  onSupervisorCheck, // async (pin) => boolean
}) {
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);
  const [indicator, setIndicator] = useState(1); // 1 bien, 2 servicio
  const [taxExempt, setTaxExempt] = useState(false);
  const [kitchenNote, setKitchenNote] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [supervisorError, setSupervisorError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const descRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDescription('');
      setPrice('');
      setQty(1);
      setIndicator(1);
      setTaxExempt(false);
      setKitchenNote('');
      setSupervisorPin('');
      setSupervisorError('');
      setTimeout(() => descRef.current?.focus(), 100);
    }
  }, [open]);

  const title = channel === 'bar' ? 'Artículo Libre — Bar' : 'Artículo Libre — Cocina';
  const Icon = channel === 'bar' ? Wine : ChefHat;
  const accent = channel === 'bar' ? 'text-purple-500' : 'text-orange-500';

  const priceNum = parseFloat(price) || 0;
  const priceLimit = Number(config?.price_limit_rd || 0);
  const needsSupervisor = (config?.require_supervisor === true) || (priceLimit > 0 && priceNum > priceLimit);
  const canSubmit = description.trim().length > 0 && priceNum > 0 && qty >= 1 && (!needsSupervisor || supervisorPin.length >= 4);

  const handleConfirm = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      if (needsSupervisor && onSupervisorCheck) {
        const ok = await onSupervisorCheck(supervisorPin);
        if (!ok) {
          setSupervisorError('PIN inválido o sin permiso');
          setSubmitting(false);
          return;
        }
      }
      onConfirm({
        description: description.trim(),
        price: priceNum,
        quantity: qty,
        indicator_bien_servicio: indicator,
        tax_exempt: taxExempt,
        kitchen_note: kitchenNote.trim(),
        channel,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md" data-testid="open-item-dialog">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <Icon size={22} className={accent} />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción *</label>
            <input
              ref={descRef}
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 80))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Ej: Arroz con camarones especial"
              maxLength={80}
              data-testid="open-item-description"
            />
            <span className="text-[10px] text-muted-foreground">{description.length}/80</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Precio (RD$) *</label>
              <NumericInput
                value={price}
                onChange={e => setPrice(e.target.value)}
                allowDecimal={true}
                label="Precio (RD$)"
                placeholder="0.00"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald text-base h-10 flex items-center"
                data-testid="open-item-price"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Cantidad</label>
              <div className="flex items-center gap-1 border border-border rounded-lg px-1 py-1 bg-background h-10">
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setQty(Math.max(1, qty - 1))} data-testid="open-item-qty-minus">
                  <Minus size={14} />
                </Button>
                <NumericInput
                  value={String(qty)}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setQty(Number.isFinite(v) && v >= 1 ? v : 1);
                  }}
                  allowDecimal={false}
                  label="Cantidad"
                  placeholder="1"
                  className="flex-1 bg-transparent text-center text-sm font-oswald outline-none"
                  data-testid="open-item-qty"
                />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setQty(qty + 1)} data-testid="open-item-qty-plus">
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo (DGII)</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIndicator(1)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${indicator === 1 ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                data-testid="open-item-type-bien"
              >Bien</button>
              <button
                type="button"
                onClick={() => setIndicator(2)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${indicator === 2 ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                data-testid="open-item-type-servicio"
              >Servicio</button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!taxExempt}
              onChange={e => setTaxExempt(!e.target.checked)}
              className="w-4 h-4 accent-primary"
              data-testid="open-item-itbis"
            />
            <span className="text-sm">Aplica ITBIS 18%</span>
            {taxExempt && <span className="ml-auto text-[10px] text-amber-600 font-bold">EXENTO</span>}
          </label>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nota para cocina/bar</label>
            <input
              value={kitchenNote}
              onChange={e => setKitchenNote(e.target.value.slice(0, 150))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Instrucciones especiales…"
              maxLength={150}
              data-testid="open-item-note"
            />
          </div>

          {needsSupervisor && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10" data-testid="open-item-supervisor-section">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-amber-600" />
                <span className="text-xs font-bold text-amber-700 uppercase">Requiere aprobación de supervisor</span>
              </div>
              {priceLimit > 0 && priceNum > priceLimit && (
                <p className="text-[11px] text-amber-700 mb-2">Precio supera el límite de RD${priceLimit.toFixed(2)}</p>
              )}
              <input
                type="password"
                inputMode="numeric"
                value={supervisorPin}
                onChange={e => { setSupervisorPin(e.target.value); setSupervisorError(''); }}
                className="w-full bg-background border border-amber-500/40 rounded-lg px-3 py-2 text-sm"
                placeholder="PIN de supervisor"
                data-testid="open-item-supervisor-pin"
              />
              {supervisorError && <p className="text-[11px] text-red-500 mt-1">{supervisorError}</p>}
            </div>
          )}

          <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="font-oswald text-2xl font-bold text-primary" data-testid="open-item-total">
              RD$ {(priceNum * qty).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} data-testid="open-item-cancel">Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || submitting} data-testid="open-item-confirm">
            <Pencil size={14} className="mr-1" /> Agregar a la Orden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
