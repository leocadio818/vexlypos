import React, { useState, useEffect, useCallback, useRef } from 'react';
import { businessDaysAPI, formatMoney } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { FileText, Printer, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  const printRef = useRef(null);

  const Row = ({ label, value, bold, highlight, className = '' }) => (
    <div className={`flex justify-between py-[2px] ${className}`}>
      <span className={`${bold ? 'font-bold text-white' : 'text-white/60'}`}>{label}</span>
      <span className={`font-oswald ${bold ? 'font-bold' : ''} ${highlight ? 'text-cyan-400 text-base' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (type === "X" && sessionId) {
        res = await businessDaysAPI.reportX(sessionId);
      } else if (type === "Z" && dayId) {
        res = await businessDaysAPI.reportZ(dayId);
      }
      if (res?.data) setReport(res.data);
      else setError('No se pudo obtener el reporte');
    } catch (err) {
      setError(err.response?.data?.detail || 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }, [type, dayId, sessionId]);

  useEffect(() => {
    if (open && (sessionId || dayId)) fetchReport();
  }, [open, fetchReport, sessionId, dayId]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Habilita ventanas emergentes'); return; }
    printWindow.document.write(`
      <html><head><title>${report?.session?.ref || 'Reporte'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 4mm; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        .double-line { border-top: 2px solid #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; padding: 1px 0; }
        .row-indent { display: flex; justify-content: space-between; padding: 1px 0; padding-left: 8px; }
        .section-title { font-weight: bold; font-size: 13px; margin: 6px 0 3px; }
        .big { font-size: 14px; font-weight: bold; }
        .right { text-align: right; }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-lg max-h-[85vh] flex flex-col p-0" data-testid="report-xz-dialog">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
          <DialogTitle className="font-oswald text-white flex items-center gap-2">
            <FileText className="text-cyan-400" size={18} />
            {type === "Z" ? "CIERRE DE DIA (Z)" : "CIERRE DE TURNO (X)"}
          </DialogTitle>
          <DialogDescription className="text-white/50 text-xs">
            {report?.session?.ref || report?.business_date || ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="animate-spin text-cyan-400" size={28} />
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <AlertTriangle className="text-red-400 mx-auto mb-3" size={36} />
              <p className="text-white/70 text-sm">{error}</p>
              <Button onClick={fetchReport} className="mt-3" variant="outline" size="sm">Reintentar</Button>
            </div>
          ) : report ? (
            <div ref={printRef} className="text-sm pb-4">
              
              {/* ═══ ENCABEZADO ═══ */}
              <div className="text-center mb-3 pb-3 border-b border-dashed border-white/20">
                <p className="font-oswald font-bold text-white text-base">
                  {type === "Z" ? "CIERRE DE DIA" : "CIERRE DE TURNO"}
                </p>
                <p className="text-white/50 text-xs mt-1">{report.session?.ref}</p>
              </div>

              <div className="space-y-1 mb-3 pb-3 border-b border-dashed border-white/20">
                <Row label="Cajero:" value={report.session?.opened_by} />
                <Row label="Terminal:" value={report.session?.terminal || '-'} />
                <Row label="Fecha:" value={report.business_date} />
                <Row label="Apertura:" value={fmtDate(report.session?.opened_at)} />
                {report.session?.closed_at && (
                  <Row label="Cierre:" value={fmtDate(report.session?.closed_at)} />
                )}
              </div>

              {/* ═══ VENTAS POR CATEGORÍA ═══ */}
              {report.sales_by_category?.length > 0 && (
                <div className="mb-3 pb-3 border-b border-dashed border-white/20">
                  <p className="font-oswald font-bold text-white mb-2">PRODUCTOS</p>
                  {report.sales_by_category.map((c, i) => (
                    <Row key={i} label={`${c.category} (${c.quantity})`} value={formatMoney(c.subtotal)} />
                  ))}
                  <div className="border-t border-white/10 mt-1 pt-1">
                    <Row label="Producto Total:" value={formatMoney(report.sales_by_category.reduce((s, c) => s + c.subtotal, 0))} bold />
                  </div>
                </div>
              )}

              {/* ═══ ANULACIONES ═══ */}
              {report.voids?.count > 0 && (
                <div className="mb-3 pb-3 border-b border-dashed border-white/20">
                  <p className="font-oswald font-bold text-white mb-2">DEVOLUCIONES</p>
                  {report.voids.list.map((v, i) => (
                    <Row key={i} label={`${v.reason} (${v.count})`} value={`-${formatMoney(v.total)}`} className="text-red-400" />
                  ))}
                  <div className="border-t border-white/10 mt-1 pt-1">
                    <Row label="Total Devoluciones:" value={`-${formatMoney(report.voids.total)}`} bold className="text-red-400" />
                  </div>
                </div>
              )}

              {/* ═══ RESUMEN DE VENTAS ═══ */}
              <div className="mb-3 pb-3 border-b border-dashed border-white/20">
                <p className="font-oswald font-bold text-white mb-2">RESUMEN DE VENTAS</p>
                <Row label="Subtotal:" value={formatMoney(report.sales_summary?.subtotal)} />
                <Row label="ITBIS:" value={formatMoney(report.sales_summary?.itbis)} />
                <Row label="Propina Legal:" value={formatMoney(report.sales_summary?.propina)} />
                <div className="border-t border-white/10 mt-1 pt-1">
                  <Row label="TOTAL VENTAS:" value={formatMoney(report.sales_summary?.total)} bold highlight />
                </div>
                <Row label="Facturas:" value={report.sales_summary?.invoices_count || 0} />
                {report.sales_summary?.avg_per_invoice > 0 && (
                  <Row label="Promedio/Factura:" value={formatMoney(report.sales_summary?.avg_per_invoice)} />
                )}
              </div>

              {/* ═══ DETALLE POR FORMA DE PAGO ═══ */}
              <div className="mb-3 pb-3 border-b border-dashed border-white/20">
                <p className="font-oswald font-bold text-white mb-2">VENTAS POR FORMA DE PAGO</p>
                {report.payment_breakdown?.map((p, i) => (
                  <Row key={i} label={`${p.method} (${p.count})`} value={formatMoney(p.amount)} />
                ))}
                {(!report.payment_breakdown || report.payment_breakdown.length === 0) && (
                  <>
                    <Row label="Efectivo:" value={formatMoney(report.payment_totals?.efectivo)} />
                    <Row label="Tarjeta:" value={formatMoney(report.payment_totals?.tarjeta)} />
                    <Row label="Transferencia:" value={formatMoney(report.payment_totals?.transferencia)} />
                  </>
                )}
              </div>

              {/* ═══ CUADRE DE CAJA ═══ */}
              <div className="mb-3 pb-3 border-b border-dashed border-white/20">
                <p className="font-oswald font-bold text-white mb-2">CUADRE DE CAJA</p>
                <Row label="Fondo Inicial:" value={formatMoney(report.cash_reconciliation?.initial_fund)} />
                <Row label="+ Ventas Efectivo:" value={formatMoney(report.cash_reconciliation?.cash_sales)} />
                <Row label="+ Depositos:" value={formatMoney(report.cash_reconciliation?.deposits)} />
                <Row label="- Retiros:" value={`-${formatMoney(report.cash_reconciliation?.withdrawals)}`} />
                <div className="border-t border-white/10 mt-1 pt-1">
                  <Row label="TOTAL A ENTREGAR:" value={formatMoney(report.cash_reconciliation?.total_to_deliver)} bold highlight />
                </div>
              </div>

              {/* ═══ DECLARACIÓN (solo si hay datos de cierre) ═══ */}
              {(report.cash_reconciliation?.cash_declared > 0 || report.cash_reconciliation?.expected_cash > 0) && (
                <div className="mb-3 pb-3 border-b border-dashed border-white/20">
                  <p className="font-oswald font-bold text-white mb-2">DECLARACION DE CAJA</p>
                  <Row label="Efectivo Esperado:" value={formatMoney(report.cash_reconciliation?.expected_cash)} />
                  <Row label="Efectivo Declarado:" value={formatMoney(report.cash_reconciliation?.cash_declared)} />
                  <div className="border-t border-white/10 mt-1 pt-1">
                    <Row 
                      label="Diferencia:" 
                      value={`${report.cash_reconciliation?.difference > 0 ? '+' : ''}${formatMoney(report.cash_reconciliation?.difference)}`}
                      bold
                      className={
                        Math.abs(report.cash_reconciliation?.difference || 0) < 1 
                          ? 'text-green-400' 
                          : report.cash_reconciliation?.difference > 0 
                            ? 'text-green-400' 
                            : 'text-red-400'
                      }
                    />
                  </div>
                </div>
              )}

              {/* ═══ RESUMEN FINAL ═══ */}
              <div className="mb-2">
                <p className="font-oswald font-bold text-white mb-2">RESUMEN</p>
                <Row label="Efectivo:" value={formatMoney(report.payment_totals?.efectivo)} />
                <Row label="Tarjetas:" value={formatMoney(report.payment_totals?.tarjeta)} />
                <Row label="Transferencias:" value={formatMoney(report.payment_totals?.transferencia)} />
                <div className="border-t border-white/10 mt-1 pt-1">
                  <Row label="VENTA TOTAL:" value={formatMoney(report.sales_summary?.total)} bold highlight />
                </div>
                {report.voids?.total > 0 && (
                  <Row label="Devoluciones:" value={`-${formatMoney(report.voids.total)}`} className="text-red-400" />
                )}
                <div className="border-t border-white/10 mt-1 pt-1">
                  <Row 
                    label="VENTA NETA:" 
                    value={formatMoney((report.sales_summary?.total || 0) - (report.voids?.total || 0))} 
                    bold highlight 
                  />
                </div>
              </div>

              <p className="text-center text-white/30 text-xs mt-4">--- Fin de Reporte ---</p>

            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-2 px-5 pb-5 pt-3 border-t border-white/10">
          <Button
            onClick={handlePrint}
            disabled={loading || !report}
            data-testid="print-report-btn"
            className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30"
          >
            <Printer size={16} className="mr-2" />
            Imprimir
          </Button>
          <Button onClick={onClose} variant="outline" className="border-white/20 text-white/70" data-testid="close-report-btn">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, highlight, className = '' }) {
  return (
    <div className={`flex justify-between py-[2px] ${className}`}>
      <span className={`${bold ? 'font-bold text-white' : 'text-white/60'}`}>{label}</span>
      <span className={`font-oswald ${bold ? 'font-bold' : ''} ${highlight ? 'text-cyan-400 text-base' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}
