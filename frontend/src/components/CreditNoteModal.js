import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Search, FileX, Printer, ArrowRight, Lock, Receipt, CheckCircle } from 'lucide-react';
import { formatMoney } from '@/lib/api';

const CREDIT_NOTE_STEPS = {
  SEARCH: 'search',
  CONFIRM: 'confirm',
  REASON: 'reason',
  PROCESSING: 'processing',
  SUCCESS: 'success'
};

// Razones de anulación fiscal
const CREDIT_NOTE_REASONS = [
  { id: "cn-error-ncf", code: "ERROR_NCF", name: "Error en NCF", description: "NCF emitido con datos incorrectos", color: "blue" },
  { id: "cn-error-payment", code: "ERROR_PAGO", name: "Error en forma de pago", description: "Forma de pago registrada incorrectamente", color: "orange" },
  { id: "cn-return", code: "DEVOLUCION", name: "Devolución de productos", description: "Cliente devolvió productos", color: "purple" },
  { id: "cn-discount", code: "DESC_POST", name: "Descuento post-venta", description: "Descuento aplicado después del cierre", color: "green" },
  { id: "cn-duplicate", code: "DUPLICADO", name: "Factura duplicada", description: "Se emitió factura duplicada por error", color: "red" },
  { id: "cn-other", code: "OTRO", name: "Otro motivo", description: "Especificar en comentarios", color: "gray" }
];

export default function CreditNoteModal({ open, onOpenChange, API_BASE, initialTransactionNumber = null }) {
  const [step, setStep] = useState(CREDIT_NOTE_STEPS.SEARCH);
  const [transactionNumber, setTransactionNumber] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundBill, setFoundBill] = useState(null);
  const [selectedReason, setSelectedReason] = useState(null);
  const [comments, setComments] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdCreditNote, setCreatedCreditNote] = useState(null);
  
  // Cargar número de transacción inicial cuando se abre el modal
  useEffect(() => {
    if (open && initialTransactionNumber) {
      setTransactionNumber(initialTransactionNumber.toString());
    }
  }, [open, initialTransactionNumber]);

  const resetState = () => {
    setStep(CREDIT_NOTE_STEPS.SEARCH);
    setTransactionNumber('');
    setAdminPin('');
    setPinError('');
    setSearchError('');
    setFoundBill(null);
    setSelectedReason(null);
    setComments('');
    setCreatedCreditNote(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  // Verificar PIN de admin
  const handleVerifyPin = async () => {
    if (adminPin.length < 4) {
      setPinError('Ingrese PIN completo');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-manager`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({ pin: adminPin, permission: 'void_transaction' })
      });

      const data = await res.json();
      
      if (!res.ok) {
        setPinError(data.detail || 'PIN incorrecto o sin permisos');
        setAdminPin('');
        return;
      }

      if (data.role !== 'admin') {
        setPinError('Solo administradores pueden realizar esta acción');
        setAdminPin('');
        return;
      }

      // PIN válido, continuar con búsqueda
      setPinError('');
      handleSearchTransaction();
    } catch (e) {
      setPinError('Error de conexión');
      setAdminPin('');
    }
  };

  // Buscar transacción
  const handleSearchTransaction = async () => {
    if (!transactionNumber) {
      setSearchError('Ingrese el número de transacción');
      return;
    }

    setIsSearching(true);
    setSearchError('');

    try {
      const res = await fetch(`${API_BASE}/api/credit-notes/search-by-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({ transaction_number: parseInt(transactionNumber) })
      });

      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.detail || 'Error buscando transacción');
        return;
      }

      setFoundBill(data.bill);
      setStep(CREDIT_NOTE_STEPS.CONFIRM);
    } catch (e) {
      setSearchError('Error de conexión');
    } finally {
      setIsSearching(false);
    }
  };

  // Crear nota de crédito
  const handleCreateCreditNote = async () => {
    if (!selectedReason) {
      return;
    }

    setIsProcessing(true);
    setStep(CREDIT_NOTE_STEPS.PROCESSING);

    try {
      const res = await fetch(`${API_BASE}/api/credit-notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({
          original_bill_id: foundBill.id,
          reason_id: selectedReason.id,
          reason_text: selectedReason.name,
          notes: comments,
          is_full_reversal: true
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.detail || 'Error creando nota de crédito');
        setStep(CREDIT_NOTE_STEPS.REASON);
        return;
      }

      setCreatedCreditNote(data);
      setStep(CREDIT_NOTE_STEPS.SUCCESS);
    } catch (e) {
      setSearchError('Error de conexión');
      setStep(CREDIT_NOTE_STEPS.REASON);
    } finally {
      setIsProcessing(false);
    }
  };

  // Imprimir nota de crédito
  const handlePrintCreditNote = async () => {
    if (!createdCreditNote) return;

    try {
      await fetch(`${API_BASE}/api/credit-notes/${createdCreditNote.id}/print`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
        }
      });
    } catch (e) {
      console.error('Error printing credit note:', e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-slate-900/95 backdrop-blur-xl border border-white/20 text-white p-0 overflow-hidden">
        {/* Header con gradiente */}
        <div className="relative px-6 pt-6 pb-4 border-b border-white/10">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-transparent to-orange-500/20" />
          <DialogHeader className="relative">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <FileX size={24} className="text-red-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-oswald text-white">Re-abrir Transacción</DialogTitle>
                <DialogDescription className="text-white/60 text-sm">
                  Generar Nota de Crédito Fiscal (B04)
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6">
          {/* STEP: SEARCH */}
          {step === CREDIT_NOTE_STEPS.SEARCH && (
            <div className="space-y-6">
              {/* Security Notice */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Lock size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-amber-200 font-medium text-sm">Acción Restringida</p>
                  <p className="text-amber-200/70 text-xs mt-1">
                    Solo administradores pueden anular transacciones cerradas. Se generará NCF B04.
                  </p>
                </div>
              </div>

              {/* Transaction Number Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Número de Transacción</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">#</span>
                    <input
                      type="number"
                      value={transactionNumber}
                      onChange={(e) => setTransactionNumber(e.target.value)}
                      placeholder="Ej: 1025"
                      className="w-full pl-8 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                      data-testid="credit-note-transaction-input"
                    />
                  </div>
                </div>
              </div>

              {/* Admin PIN */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">PIN de Administrador</label>
                <div className="flex justify-center gap-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                        adminPin.length > i
                          ? 'bg-blue-500/20 border-blue-400 text-blue-400'
                          : 'bg-white/5 border-white/20 text-white/30'
                      }`}
                    >
                      {adminPin.length > i ? '•' : ''}
                    </div>
                  ))}
                </div>
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setAdminPin(val);
                    setPinError('');
                  }}
                  className="sr-only"
                  autoFocus
                  data-testid="credit-note-pin-input"
                />
                {pinError && (
                  <p className="text-red-400 text-sm text-center mt-2">{pinError}</p>
                )}
              </div>

              {searchError && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
                  {searchError}
                </div>
              )}

              {/* Numpad for PIN */}
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9,'C',0,'⌫'].map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === 'C') setAdminPin('');
                      else if (key === '⌫') setAdminPin(p => p.slice(0, -1));
                      else if (adminPin.length < 5) setAdminPin(p => p + key);
                    }}
                    className={`h-12 rounded-lg font-medium text-lg transition-all active:scale-95 ${
                      key === 'C' || key === '⌫'
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>

              <Button
                onClick={handleVerifyPin}
                disabled={adminPin.length < 5 || !transactionNumber || isSearching}
                className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-oswald font-bold"
                data-testid="credit-note-search-btn"
              >
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Buscando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Search size={18} />
                    Buscar Transacción
                  </span>
                )}
              </Button>
            </div>
          )}

          {/* STEP: CONFIRM - Show found bill */}
          {step === CREDIT_NOTE_STEPS.CONFIRM && foundBill && (
            <div className="space-y-5">
              {/* Found Bill Card */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    Factura Encontrada
                  </Badge>
                  <span className="text-white/50 text-sm">Trans. #{foundBill.transaction_number}</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/60">NCF:</span>
                    <span className="font-mono font-bold text-white">{foundBill.ncf}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Mesa:</span>
                    <span className="text-white">{foundBill.table_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Fecha:</span>
                    <span className="text-white">{foundBill.paid_at?.slice(0, 10)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Método Pago:</span>
                    <span className="text-white">{foundBill.payment_method_name || foundBill.payment_method}</span>
                  </div>
                  <div className="border-t border-white/10 my-2 pt-2">
                    <div className="flex justify-between text-lg">
                      <span className="text-white/60">Total:</span>
                      <span className="font-bold text-green-400">{formatMoney(foundBill.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <AlertTriangle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-200 font-medium text-sm">¿Anular esta factura?</p>
                  <p className="text-red-200/70 text-xs mt-1">
                    Se generará una Nota de Crédito B04 que afectará el NCF {foundBill.ncf}. Esta acción es irreversible y se reportará a la DGII.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(CREDIT_NOTE_STEPS.SEARCH)}
                  className="flex-1 border-white/20 text-white/70 hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => setStep(CREDIT_NOTE_STEPS.REASON)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-oswald"
                  data-testid="credit-note-continue-btn"
                >
                  Continuar
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP: REASON - Select reason */}
          {step === CREDIT_NOTE_STEPS.REASON && (
            <div className="space-y-5">
              <div>
                <h3 className="font-medium text-white mb-1">Seleccione la razón de anulación</h3>
                <p className="text-white/50 text-sm">Requerido para el reporte 607 de la DGII</p>
              </div>

              <ScrollArea className="h-[280px] pr-2">
                <div className="space-y-2">
                  {CREDIT_NOTE_REASONS.map((reason) => (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason)}
                      className={`w-full p-4 rounded-xl border transition-all text-left ${
                        selectedReason?.id === reason.id
                          ? 'bg-blue-500/20 border-blue-400'
                          : 'bg-white/5 border-white/10 hover:border-white/30'
                      }`}
                      data-testid={`credit-note-reason-${reason.code}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          selectedReason?.id === reason.id ? 'bg-blue-400' : 'bg-white/20'
                        }`} />
                        <div>
                          <p className="font-medium text-white">{reason.name}</p>
                          <p className="text-white/50 text-xs mt-0.5">{reason.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>

              {/* Comments */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Comentarios (opcional)</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Detalles adicionales..."
                  rows={2}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                />
              </div>

              {searchError && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
                  {searchError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(CREDIT_NOTE_STEPS.CONFIRM)}
                  className="flex-1 border-white/20 text-white/70 hover:bg-white/10"
                >
                  Atrás
                </Button>
                <Button
                  onClick={handleCreateCreditNote}
                  disabled={!selectedReason}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-oswald disabled:opacity-50"
                  data-testid="credit-note-create-btn"
                >
                  Generar B04
                </Button>
              </div>
            </div>
          )}

          {/* STEP: PROCESSING */}
          {step === CREDIT_NOTE_STEPS.PROCESSING && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
              <h3 className="text-lg font-medium text-white">Procesando Nota de Crédito</h3>
              <p className="text-white/50 text-sm mt-2">Generando NCF B04...</p>
            </div>
          )}

          {/* STEP: SUCCESS */}
          {step === CREDIT_NOTE_STEPS.SUCCESS && createdCreditNote && (
            <div className="space-y-5">
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle size={32} className="text-green-400" />
                </div>
                <h3 className="text-xl font-oswald font-bold text-white">Nota de Crédito Generada</h3>
              </div>

              {/* Credit Note Details */}
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                <div className="text-center mb-3">
                  <p className="text-white/60 text-sm">NOTA DE CRÉDITO</p>
                  <p className="text-2xl font-mono font-bold text-green-400">{createdCreditNote.ncf}</p>
                </div>
                <div className="border-t border-green-500/20 pt-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">NCF Afectado:</span>
                    <span className="font-mono text-white">{createdCreditNote.original_ncf}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Razón:</span>
                    <span className="text-white">{createdCreditNote.reason_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Total Crédito:</span>
                    <span className="font-bold text-red-400">-{formatMoney(Math.abs(createdCreditNote.total))}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handlePrintCreditNote}
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                >
                  <Printer size={16} className="mr-2" />
                  Imprimir B04
                </Button>
                <Button
                  onClick={handleClose}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-oswald"
                  data-testid="credit-note-done-btn"
                >
                  Finalizar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
