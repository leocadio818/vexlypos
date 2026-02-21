import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Receipt, Search, RotateCcw, FileText, AlertTriangle, 
  ChevronDown, ChevronUp, Calendar, User, Printer, X, Check
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_BACKEND_URL;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const formatMoney = (v) => `RD$ ${Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BillHistory() {
  const [bills, setBills] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [returnReasons, setReturnReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('paid');
  const [dateRange, setDateRange] = useState('today');
  const [expandedBill, setExpandedBill] = useState(null);
  
  // Reversal dialog state
  const [reversalDialog, setReversalDialog] = useState({ open: false, bill: null });
  const [selectedReason, setSelectedReason] = useState(null);
  const [reversalNotes, setReversalNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [isFullReversal, setIsFullReversal] = useState(true);
  const [selectedItems, setSelectedItems] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [billsRes, cnRes, reasonsRes] = await Promise.all([
        fetch(`${API_BASE}/api/bills?status=${statusFilter}`, { headers: hdrs() }).then(r => r.json()),
        fetch(`${API_BASE}/api/credit-notes`, { headers: hdrs() }).then(r => r.json()),
        fetch(`${API_BASE}/api/credit-notes/return-reasons`, { headers: hdrs() }).then(r => r.json())
      ]);
      
      // Filter by date
      const now = new Date();
      const filtered = billsRes.filter(b => {
        const billDate = new Date(b.paid_at || b.created_at);
        if (dateRange === 'today') {
          return billDate.toDateString() === now.toDateString();
        } else if (dateRange === 'week') {
          const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
          return billDate >= weekAgo;
        } else if (dateRange === 'month') {
          const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
          return billDate >= monthAgo;
        }
        return true;
      });
      
      setBills(filtered);
      setCreditNotes(cnRes);
      setReturnReasons(reasonsRes);
    } catch (e) {
      toast.error('Error cargando datos');
    }
    setLoading(false);
  }, [statusFilter, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredBills = bills.filter(b => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      b.ncf?.toLowerCase().includes(s) ||
      b.label?.toLowerCase().includes(s) ||
      b.cashier_name?.toLowerCase().includes(s) ||
      b.id?.toLowerCase().includes(s)
    );
  });

  const openReversalDialog = (bill) => {
    if (bill.credit_note_id) {
      toast.error('Esta factura ya tiene una nota de crédito asociada');
      return;
    }
    setReversalDialog({ open: true, bill });
    setSelectedReason(null);
    setReversalNotes('');
    setIsFullReversal(true);
    setSelectedItems([]);
  };

  const handleReversal = async () => {
    if (!selectedReason) {
      toast.error('Selecciona un motivo de devolución');
      return;
    }
    if (!isFullReversal && selectedItems.length === 0) {
      toast.error('Selecciona al menos un item para reversión parcial');
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        original_bill_id: reversalDialog.bill.id,
        reason_id: selectedReason.id,
        reason_text: selectedReason.name,
        is_full_reversal: isFullReversal,
        items_to_reverse: isFullReversal ? null : selectedItems.map(itemId => {
          const item = reversalDialog.bill.items.find(i => i.item_id === itemId);
          return { item_id: itemId, quantity: item?.quantity || 1 };
        }),
        notes: reversalNotes || null
      };

      const res = await fetch(`${API_BASE}/api/credit-notes`, {
        method: 'POST',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error generando nota de crédito');
      }

      const creditNote = await res.json();
      toast.success(`Nota de Crédito ${creditNote.ncf} generada exitosamente`);
      setReversalDialog({ open: false, bill: null });
      fetchData();
    } catch (e) {
      toast.error(e.message || 'Error procesando reversión');
    }
    setProcessing(false);
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const getBillStatusColor = (bill) => {
    if (bill.status === 'reversed') return 'bg-red-500';
    if (bill.status === 'partially_reversed') return 'bg-amber-500';
    if (bill.status === 'paid') return 'bg-green-500';
    if (bill.status === 'open') return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  const getBillStatusLabel = (bill) => {
    if (bill.status === 'reversed') return 'Reversada';
    if (bill.status === 'partially_reversed') return 'Parcial';
    if (bill.status === 'paid') return 'Pagada';
    if (bill.status === 'open') return 'Abierta';
    return bill.status;
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" data-testid="bill-history-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-oswald text-2xl font-bold flex items-center gap-2">
            <Receipt className="text-primary" /> Historial de Facturas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestión de facturas y notas de crédito</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Range Filter */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[
              { key: 'today', label: 'Hoy' },
              { key: 'week', label: 'Semana' },
              { key: 'month', label: 'Mes' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === key ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
                }`}
                data-testid={`filter-${key}`}
              >
                {label}
              </button>
            ))}
          </div>
          
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs"
            data-testid="status-filter"
          >
            <option value="paid">Pagadas</option>
            <option value="reversed">Reversadas</option>
            <option value="partially_reversed">Parcialmente Reversadas</option>
            <option value="">Todas</option>
          </select>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por NCF, mesa, cajero..."
          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm"
          data-testid="search-input"
        />
      </div>

      {/* Bills List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredBills.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-oswald text-lg">No hay facturas</p>
          <p className="text-sm">Ajusta los filtros para ver más resultados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBills.map(bill => {
            const isExpanded = expandedBill === bill.id;
            const hasCreditNote = bill.credit_note_id || bill.status === 'reversed' || bill.status === 'partially_reversed';
            
            return (
              <div
                key={bill.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
                data-testid={`bill-${bill.id}`}
              >
                {/* Bill Header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedBill(isExpanded ? null : bill.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="font-oswald font-bold text-sm">{bill.ncf || 'Sin NCF'}</span>
                      <span className="text-xs text-muted-foreground">{bill.label}</span>
                    </div>
                    <Badge className={`${getBillStatusColor(bill)} text-white text-[10px]`}>
                      {getBillStatusLabel(bill)}
                    </Badge>
                    {hasCreditNote && (
                      <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-500">
                        <FileText size={10} className="mr-1" />
                        {bill.credit_note_ncf || 'NC'}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-oswald font-bold text-lg">{formatMoney(bill.total)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(bill.paid_at || bill.created_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
                
                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border p-4 bg-muted/30 space-y-4">
                    {/* Bill Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Mesa</span>
                        <span className="font-semibold">{bill.table_number || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Cajero</span>
                        <span className="font-semibold">{bill.cashier_name || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Tipo Venta</span>
                        <span className="font-semibold">{bill.sale_type_name || bill.sale_type || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Método Pago</span>
                        <span className="font-semibold">{bill.payment_method_name || bill.payment_method || '-'}</span>
                      </div>
                    </div>
                    
                    {/* Items */}
                    <div className="bg-background rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">ITEMS</h4>
                      <div className="space-y-1">
                        {bill.items?.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span>
                              <span className="font-oswald font-bold text-primary">{item.quantity}x</span> {item.product_name}
                            </span>
                            <span className="font-oswald">{formatMoney(item.total)}</span>
                          </div>
                        ))}
                      </div>
                      
                      {/* Totals */}
                      <div className="mt-3 pt-2 border-t border-border space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-oswald">{formatMoney(bill.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ITBIS</span>
                          <span className="font-oswald">{formatMoney(bill.itbis)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Propina Legal</span>
                          <span className="font-oswald">{formatMoney(bill.propina_legal)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-sm pt-1 border-t border-border">
                          <span>TOTAL</span>
                          <span className="font-oswald">{formatMoney(bill.total)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Credit Note Info */}
                    {hasCreditNote && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText size={16} className="text-red-500" />
                          <span className="font-semibold text-red-500 text-sm">Nota de Crédito Asociada</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground block">NCF</span>
                            <span className="font-semibold text-red-400">{bill.credit_note_ncf || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Fecha Reversión</span>
                            <span className="font-semibold">{bill.reversed_at ? new Date(bill.reversed_at).toLocaleString('es-DO') : '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          // Print receipt
                          window.open(`${API_BASE}/api/print/receipt/${bill.id}`, '_blank');
                        }}
                        data-testid={`print-${bill.id}`}
                      >
                        <Printer size={14} className="mr-1" /> Imprimir
                      </Button>
                      
                      {bill.status === 'paid' && !hasCreditNote && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs"
                          onClick={() => openReversalDialog(bill)}
                          data-testid={`reverse-${bill.id}`}
                        >
                          <RotateCcw size={14} className="mr-1" /> Reversar (B04)
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reversal Dialog */}
      <Dialog open={reversalDialog.open} onOpenChange={(open) => !open && setReversalDialog({ open: false, bill: null })}>
        <DialogContent className="max-w-lg bg-card border-border" data-testid="reversal-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2 text-red-500">
              <AlertTriangle size={20} />
              Generar Nota de Crédito (B04)
            </DialogTitle>
          </DialogHeader>
          
          {reversalDialog.bill && (
            <div className="space-y-4">
              {/* Warning */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs text-amber-500">
                  <strong>Advertencia:</strong> Esta acción generará un comprobante fiscal B04 (Nota de Crédito) 
                  que no se puede anular. La DGII registrará esta reversión.
                </p>
              </div>
              
              {/* Original Bill Info */}
              <div className="bg-background rounded-lg p-3">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">FACTURA ORIGINAL</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">NCF:</span>
                    <span className="font-semibold ml-1">{reversalDialog.bill.ncf}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-oswald font-bold ml-1 text-primary">{formatMoney(reversalDialog.bill.total)}</span>
                  </div>
                </div>
              </div>
              
              {/* Reversal Type */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">TIPO DE REVERSIÓN</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsFullReversal(true); setSelectedItems([]); }}
                    className={`flex-1 p-3 rounded-lg border text-xs font-semibold transition-all ${
                      isFullReversal ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-border hover:bg-muted'
                    }`}
                    data-testid="full-reversal-btn"
                  >
                    <RotateCcw size={16} className="mx-auto mb-1" />
                    Reversión Total
                  </button>
                  <button
                    onClick={() => setIsFullReversal(false)}
                    className={`flex-1 p-3 rounded-lg border text-xs font-semibold transition-all ${
                      !isFullReversal ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-border hover:bg-muted'
                    }`}
                    data-testid="partial-reversal-btn"
                  >
                    <FileText size={16} className="mx-auto mb-1" />
                    Reversión Parcial
                  </button>
                </div>
              </div>
              
              {/* Partial Reversal Item Selection */}
              {!isFullReversal && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    SELECCIONA ITEMS A REVERSAR ({selectedItems.length} seleccionados)
                  </h4>
                  <ScrollArea className="max-h-40">
                    <div className="space-y-1">
                      {reversalDialog.bill.items?.map((item, i) => (
                        <button
                          key={item.item_id || i}
                          onClick={() => toggleItemSelection(item.item_id)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                            selectedItems.includes(item.item_id)
                              ? 'border-red-500 bg-red-500/10 text-red-500'
                              : 'border-border bg-background hover:bg-muted'
                          }`}
                          data-testid={`select-item-${item.item_id}`}
                        >
                          <span>
                            <span className="font-oswald font-bold">{item.quantity}x</span> {item.product_name}
                          </span>
                          <span className="font-oswald">{formatMoney(item.total)}</span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {/* Reason Selection */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">MOTIVO DE REVERSIÓN *</h4>
                <div className="grid grid-cols-2 gap-2">
                  {returnReasons.map(reason => (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        selectedReason?.id === reason.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted'
                      }`}
                      data-testid={`reason-${reason.code}`}
                    >
                      <span className="font-semibold text-xs block">{reason.name}</span>
                      {reason.description && (
                        <span className="text-[10px] text-muted-foreground">{reason.description}</span>
                      )}
                      {reason.requires_authorization && (
                        <Badge variant="outline" className="mt-1 text-[8px]">Req. Autorización</Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Notes */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">NOTAS ADICIONALES</h4>
                <textarea
                  value={reversalNotes}
                  onChange={e => setReversalNotes(e.target.value)}
                  placeholder="Detalles adicionales sobre la reversión..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs resize-none h-20"
                  data-testid="reversal-notes"
                />
              </div>
              
              {/* Summary */}
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-red-500 font-semibold">Total a Reversar:</span>
                  <span className="font-oswald font-bold text-xl text-red-500">
                    {isFullReversal
                      ? formatMoney(reversalDialog.bill.total)
                      : formatMoney(
                          reversalDialog.bill.items
                            ?.filter(i => selectedItems.includes(i.item_id))
                            .reduce((sum, i) => sum + (i.total || 0), 0) || 0
                        )
                    }
                  </span>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setReversalDialog({ open: false, bill: null })}
                  className="flex-1"
                  disabled={processing}
                >
                  <X size={14} className="mr-1" /> Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReversal}
                  className="flex-1"
                  disabled={processing || !selectedReason || (!isFullReversal && selectedItems.length === 0)}
                  data-testid="confirm-reversal-btn"
                >
                  {processing ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <Check size={14} className="mr-1" /> Generar B04
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
