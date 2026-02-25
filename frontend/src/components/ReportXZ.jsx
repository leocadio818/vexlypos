import React, { useState, useEffect, useCallback, useRef } from 'react';
import { businessDaysAPI, posSessionsAPI, formatMoney } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { 
  FileText, Download, Printer, Clock, Banknote, CreditCard, 
  TrendingUp, Package, AlertTriangle, X, RefreshCw, 
  DollarSign, Euro, Building2, ArrowDown, ArrowUp, Calculator,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Receipt
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * ReportXZ - Componente para visualizar Reportes X (Turno) y Z (Día)
 * 
 * Props:
 * - type: "X" | "Z" - Tipo de reporte
 * - dayId: string - ID de la jornada (para reporte Z)
 * - sessionId: string - ID de la sesión (para reporte X)
 * - onClose: function - Callback al cerrar
 */
export default function ReportXZ({ 
  type = "Z", 
  dayId, 
  sessionId,
  open = false,
  onClose 
}) {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    payments: true,
    categories: true,
    b04: false,
    voids: false
  });
  const printRef = useRef(null);

  // Cargar reporte
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let res;
      if (type === "Z") {
        if (dayId) {
          res = await businessDaysAPI.reportZ(dayId);
        } else {
          res = await businessDaysAPI.reportZCurrent();
        }
      } else {
        if (!sessionId) {
          throw new Error("Se requiere sessionId para reporte X");
        }
        res = await businessDaysAPI.reportX(sessionId);
      }
      
      setReport(res.data);
    } catch (err) {
      console.error('Error fetching report:', err);
      setError(err.response?.data?.detail || err.message || 'Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  }, [type, dayId, sessionId]);

  useEffect(() => {
    if (open) {
      fetchReport();
    }
  }, [open, fetchReport]);

  // Toggle sección expandible
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Imprimir reporte
  const handlePrint = () => {
    if (printRef.current) {
      const printContent = printRef.current.innerHTML;
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Reporte ${type} - ${report?.business_day?.ref || report?.session?.ref || ''}</title>
            <style>
              body { font-family: 'Courier New', monospace; font-size: 12px; margin: 20px; }
              .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
              .section { margin-bottom: 15px; }
              .section-title { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
              .row { display: flex; justify-content: space-between; margin: 3px 0; }
              .total-row { font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
              .formula { font-size: 10px; color: #666; margin-top: 10px; }
              table { width: 100%; border-collapse: collapse; }
              td { padding: 3px 0; }
              .right { text-align: right; }
            </style>
          </head>
          <body>${printContent}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="font-oswald text-white flex items-center gap-2">
            <FileText className="text-cyan-400" size={20} />
            {type === "Z" ? "REPORTE Z - CIERRE DE DÍA" : "REPORTE X - CIERRE DE TURNO"}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {report?.business_day?.business_date || report?.business_date || 'Cargando...'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="animate-spin text-cyan-400" size={32} />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <AlertTriangle className="text-red-400 mx-auto mb-4" size={48} />
              <p className="text-white/70">{error}</p>
              <Button onClick={fetchReport} className="mt-4" variant="outline">
                Reintentar
              </Button>
            </div>
          ) : report ? (
            <div className="space-y-4 pb-4" ref={printRef}>
              {/* Encabezado */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-white/50">Referencia:</span>
                    <p className="font-mono text-cyan-400">
                      {report.business_day?.ref || report.session?.ref}
                    </p>
                  </div>
                  <div>
                    <span className="text-white/50">Fecha Contable:</span>
                    <p className="text-white font-medium">
                      {report.business_day?.business_date || report.business_date}
                    </p>
                  </div>
                  <div>
                    <span className="text-white/50">Apertura:</span>
                    <p className="text-white/80 text-xs">
                      {new Date(report.business_day?.opened_at || report.session?.opened_at).toLocaleString('es-DO')}
                    </p>
                  </div>
                  <div>
                    <span className="text-white/50">Generado:</span>
                    <p className="text-white/80 text-xs">
                      {new Date(report.generated_at).toLocaleString('es-DO')}
                    </p>
                  </div>
                </div>
              </div>

              {/* ═══ RESUMEN DE VENTAS ═══ */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="font-oswald font-bold text-white mb-3">RESUMEN DE VENTAS</h3>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Subtotal:</span>
                    <span className="font-oswald text-white">{formatMoney(report.sales_summary?.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">ITBIS:</span>
                    <span className="font-oswald text-white">{formatMoney(report.sales_summary?.itbis)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Propina Legal:</span>
                    <span className="font-oswald text-white">{formatMoney(report.sales_summary?.propina)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 mt-2 border-t border-white/10">
                    <span className="text-white font-bold">TOTAL VENTAS:</span>
                    <span className="font-oswald font-bold text-lg text-green-400">{formatMoney(report.sales_summary?.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Facturas:</span>
                    <span className="font-oswald text-cyan-400">{report.sales_summary?.invoices_count || 0}</span>
                  </div>
                </div>
              </div>

              {/* ═══ VENTAS POR FORMA DE PAGO ═══ */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="font-oswald font-bold text-white mb-3">VENTAS POR FORMA DE PAGO</h3>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Efectivo:</span>
                    <span className="font-oswald text-white">{formatMoney(report.payment_totals?.efectivo)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Tarjeta:</span>
                    <span className="font-oswald text-white">{formatMoney(report.payment_totals?.tarjeta)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Transferencia:</span>
                    <span className="font-oswald text-white">{formatMoney(report.payment_totals?.transferencia)}</span>
                  </div>
                  {report.payment_totals?.dolar > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Dólar (equiv.):</span>
                      <span className="font-oswald text-white">{formatMoney(report.payment_totals?.dolar)}</span>
                    </div>
                  )}
                  {report.payment_totals?.euro > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Euro (equiv.):</span>
                      <span className="font-oswald text-white">{formatMoney(report.payment_totals?.euro)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ VENTAS POR CATEGORÍA ═══ */}
              {type === "Z" && report.sales_by_category?.length > 0 && (
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                  <button 
                    onClick={() => toggleSection('categories')}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <h3 className="font-oswald font-bold text-white flex items-center gap-2">
                      <Package size={18} className="text-orange-400" />
                      VENTAS POR CATEGORÍA
                    </h3>
                    {expandedSections.categories ? <ChevronUp size={18} className="text-white/50" /> : <ChevronDown size={18} className="text-white/50" />}
                  </button>
                  
                  {expandedSections.categories && (
                    <div className="px-4 pb-4">
                      {report.sales_by_category.map((cat, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                          <div>
                            <span className="text-white">{cat.category_name}</span>
                            <span className="text-white/40 text-xs ml-2">({cat.items_count} items)</span>
                          </div>
                          <span className="font-oswald text-orange-400">{formatMoney(cat.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ NOTAS DE CRÉDITO B04 ═══ */}
              {type === "Z" && report.credit_notes?.count > 0 && (
                <div className="bg-red-500/5 rounded-xl border border-red-500/20 overflow-hidden">
                  <button 
                    onClick={() => toggleSection('b04')}
                    className="w-full p-4 flex items-center justify-between hover:bg-red-500/10 transition-colors"
                  >
                    <h3 className="font-oswald font-bold text-white flex items-center gap-2">
                      <Receipt size={18} className="text-red-400" />
                      NOTAS DE CRÉDITO (B04)
                      <Badge className="bg-red-500/20 text-red-300 ml-2">{report.credit_notes.count}</Badge>
                    </h3>
                    {expandedSections.b04 ? <ChevronUp size={18} className="text-white/50" /> : <ChevronDown size={18} className="text-white/50" />}
                  </button>
                  
                  {expandedSections.b04 && (
                    <div className="px-4 pb-4">
                      {report.credit_notes.list.map((cn, i) => (
                        <div key={i} className="py-2 border-b border-white/5 last:border-0">
                          <div className="flex justify-between">
                            <span className="font-mono text-red-400 text-sm">{cn.ncf}</span>
                            <span className="font-oswald text-red-400">-{formatMoney(cn.amount)}</span>
                          </div>
                          <p className="text-white/50 text-xs mt-1">{cn.reason}</p>
                          <p className="text-white/30 text-xs">Afecta: {cn.original_ncf}</p>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 border-t border-red-500/20 mt-2">
                        <span className="text-white/60 font-bold">Total B04:</span>
                        <span className="font-oswald font-bold text-red-400">-{formatMoney(report.credit_notes.total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ ANULACIONES ═══ */}
              {type === "Z" && report.voids?.count > 0 && (
                <div className="bg-amber-500/5 rounded-xl border border-amber-500/20 overflow-hidden">
                  <button 
                    onClick={() => toggleSection('voids')}
                    className="w-full p-4 flex items-center justify-between hover:bg-amber-500/10 transition-colors"
                  >
                    <h3 className="font-oswald font-bold text-white flex items-center gap-2">
                      <XCircle size={18} className="text-amber-400" />
                      ANULACIONES
                      <Badge className="bg-amber-500/20 text-amber-300 ml-2">{report.voids.count}</Badge>
                    </h3>
                    {expandedSections.voids ? <ChevronUp size={18} className="text-white/50" /> : <ChevronDown size={18} className="text-white/50" />}
                  </button>
                  
                  {expandedSections.voids && (
                    <div className="px-4 pb-4">
                      {report.voids.list.map((v, i) => (
                        <div key={i} className="py-2 border-b border-white/5 last:border-0">
                          <div className="flex justify-between">
                            <span className="text-white/70 text-sm">{v.label} (#{v.transaction_number})</span>
                            <span className="font-oswald text-amber-400">{formatMoney(v.total)}</span>
                          </div>
                          <p className="text-white/50 text-xs mt-1">Razón: {v.cancellation_reason || 'No especificada'}</p>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 border-t border-amber-500/20 mt-2">
                        <span className="text-white/60 font-bold">Total Anulado:</span>
                        <span className="font-oswald font-bold text-amber-400">{formatMoney(report.voids.total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ CUADRE DE CAJA ═══ */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="font-oswald font-bold text-white mb-3">CUADRE DE CAJA</h3>
                
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">Fondo Inicial:</span>
                    <span className="font-oswald text-white">{formatMoney(report.cash_reconciliation?.initial_fund)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">+ Ventas Efectivo:</span>
                    <span className="font-oswald text-white">{formatMoney(report.cash_reconciliation?.cash_sales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">+ Depósitos:</span>
                    <span className="font-oswald text-white">{formatMoney(report.cash_reconciliation?.deposits)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">- Retiros:</span>
                    <span className="font-oswald text-white">-{formatMoney(report.cash_reconciliation?.withdrawals)}</span>
                  </div>
                  
                  <div className="flex justify-between pt-2 mt-2 border-t border-white/20">
                    <span className="font-bold text-white">TOTAL A ENTREGAR:</span>
                    <span className="font-oswald font-bold text-lg text-cyan-400">
                      {formatMoney(report.cash_reconciliation?.total_to_deliver)}
                    </span>
                  </div>
                  
                  {/* Comparación Declarado vs Esperado (solo si hay datos de cierre) */}
                  {(report.cash_reconciliation?.cash_declared > 0 || report.cash_reconciliation?.expected_cash > 0) && (
                    <>
                      <div className="flex justify-between pt-2 mt-2 border-t border-white/10">
                        <span className="text-white/60">Efectivo Esperado:</span>
                        <span className="font-oswald text-white">{formatMoney(report.cash_reconciliation?.expected_cash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Efectivo Declarado:</span>
                        <span className="font-oswald text-white">{formatMoney(report.cash_reconciliation?.cash_declared)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-white/10">
                        <span className="font-bold text-white">Diferencia:</span>
                        <span className={`font-oswald font-bold ${
                          Math.abs(report.cash_reconciliation?.difference || 0) < 1 
                            ? 'text-green-400' 
                            : report.cash_reconciliation?.difference > 0 
                              ? 'text-emerald-400' 
                              : 'text-red-400'
                        }`}>
                          {report.cash_reconciliation?.difference > 0 ? '+' : ''}
                          {formatMoney(report.cash_reconciliation?.difference)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                
                <p className="text-white/30 text-xs mt-3 text-center">
                  {report.cash_reconciliation?.formula}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer con acciones */}
        <div className="shrink-0 flex gap-2 px-6 pb-6 pt-4 border-t border-white/10">
          <Button
            onClick={handlePrint}
            disabled={loading || !report}
            className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30"
          >
            <Printer size={16} className="mr-2" />
            Imprimir
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            className="border-white/20 text-white/70"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
