import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Search, FileX, Printer, ArrowRight, Lock, Receipt, CheckCircle } from 'lucide-react';
import { formatMoney } from '@/lib/api';
import { NumericInput } from '@/components/NumericKeypad';
import { PinPad } from '@/components/PinPad';
import axios from 'axios';

const CREDIT_NOTE_STEPS = {
  SEARCH: 'search',
  CONFIRM: 'confirm',
  REASON: 'reason',
  PROCESSING: 'processing',
  SUCCESS: 'success'
};

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
  // Fetch return reasons from API instead of using hardcoded values
  const [returnReasons, setReturnReasons] = useState([]);
  const [loadingReasons, setLoadingReasons] = useState(false);
  
  // Fetch return reasons from API when modal opens
  useEffect(() => {
    const fetchReasons = async () => {
      if (!open || returnReasons.length > 0) return;
      setLoadingReasons(true);
      try {
        const res = await fetch(`${API_BASE}/api/credit-notes/return-reasons`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setReturnReasons(data);
        }
      } catch (e) {
        console.error('Error fetching return reasons:', e);
      } finally {
        setLoadingReasons(false);
      }
    };
    fetchReasons();
  }, [open, API_BASE, returnReasons.length]);
  
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
      const hdrs = { Authorization: `Bearer ${localStorage.getItem('pos_token')}` };
      const { data } = await axios.post(`${API_BASE}/api/auth/verify-manager`, 
        { pin: adminPin, permission: 'void_transaction' }, { headers: hdrs });

      if (!data.authorized) {
        setPinError('No tienes permisos para esta accion');
        setAdminPin('');
        return;
      }

      setPinError('');
      handleSearchTransaction();
    } catch (e) {
      setPinError(e.response?.data?.detail || 'PIN incorrecto o sin permisos');
      setAdminPin('');
    }
  };

  const handleSearchTransaction = async () => {
    if (!transactionNumber) {
      setSearchError('Ingrese el número de transacción');
      return;
    }

    setIsSearching(true);
    setSearchError('');

    try {
      const hdrs = { Authorization: `Bearer ${localStorage.getItem('pos_token')}` };
      const { data } = await axios.post(`${API_BASE}/api/credit-notes/search-by-transaction`,
        { transaction_number: parseInt(transactionNumber) }, { headers: hdrs });

      setFoundBill(data.bill);
      setStep(CREDIT_NOTE_STEPS.CONFIRM);
    } catch (e) {
      setSearchError(e.response?.data?.detail || 'Error buscando transacción');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateCreditNote = async () => {
    if (!selectedReason) return;

    setIsProcessing(true);
    setStep(CREDIT_NOTE_STEPS.PROCESSING);

    try {
      const hdrs = { Authorization: `Bearer ${localStorage.getItem('pos_token')}` };
      const { data } = await axios.post(`${API_BASE}/api/credit-notes`, {
        original_bill_id: foundBill.id,
        reason_id: selectedReason.id,
        reason_text: selectedReason.name,
        notes: comments,
        is_full_reversal: true
      }, { headers: hdrs });

      setCreatedCreditNote(data);
      setStep(CREDIT_NOTE_STEPS.SUCCESS);
    } catch (e) {
      setSearchError(e.response?.data?.detail || `Error: ${e.message}`);
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
                    <NumericInput label="Valor"
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
                <PinPad value={adminPin} onChange={(val) => { setAdminPin(val.slice(0, 5)); setPinError(''); }} label="PIN de Administrador" placeholder="Ingresa PIN" maxLength={5} />
                {pinError && (
                  <p className="text-red-400 text-sm text-center mt-2">{pinError}</p>
                )}
              </div>

              {searchError && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
                  {searchError}
                </div>
              )}

              {/* Verify PIN Button */}
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
                  {loadingReasons ? (
                    <div className="text-center text-white/50 py-4">Cargando razones...</div>
                  ) : returnReasons.length === 0 ? (
                    <div className="text-center text-white/50 py-4">No hay razones disponibles</div>
                  ) : returnReasons.map((reason) => (
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
