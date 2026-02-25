import React, { useState, useEffect, useCallback, useRef } from 'react';
import { businessDaysAPI, formatMoney } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { FileText, Printer, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function RptRow({ label, value, bold, highlight, className = '' }) {
  return (
    <div className={`flex justify-between py-[2px] ${className}`}>
      <span className={`font-bold ${bold ? 'text-white' : 'text-white/80'}`}>{label}</span>
      <span className={`font-oswald font-bold ${highlight ? 'text-cyan-400 text-base' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

function RptSep() {
  return <div className="border-t border-dashed border-white/30 my-3" />;
}

function RptTitle({ children }) {
  return <p className="font-oswald font-bold text-white text-sm tracking-wide mb-2">{children}</p>;
}

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
  const [printMode, setPrintMode] = useState(null);
  const printRef = useRef(null);

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
    if (open && (sessionId || dayId)) {
      setPrintMode(null);
      fetchReport();
    }
  }, [open, fetchReport, sessionId, dayId]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Habilita ventanas emergentes'); return; }
    printWindow.document.write(`
      <html><head><title>${report?.session?.ref || 'Reporte'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 3mm; color: #000; font-weight: bold; }
        .center { text-align: center; }
        .sep { border-top: 1px dashed #000; margin: 5px 0; }
        .sep-double { border-top: 2px solid #000; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; padding: 1px 0; font-weight: bold; }
        .title { font-size: 13px; font-weight: bold; margin-bottom: 3px; }
        .big { font-size: 15px; font-weight: bold; }
        .ref { font-size: 11px; }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  const handleClose = () => {
    setPrintMode(null);
    onClose?.();
  };

  if (!open) return null;

  // ═══ PANTALLA DE PREGUNTA ═══
  if (!loading && !error && report && printMode === null) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-sm p-0" data-testid="report-mode-dialog">
          <div className="p-6 text-center">
            <FileText className="text-cyan-400 mx-auto mb-4" size={36} />
            <p className="font-oswald font-bold text-white text-lg mb-1">
              Reporte Detallado?
            </p>
            <p className="text-white/50 text-sm mb-6">
              {report.session?.opened_by || user?.name}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPrintMode('detailed')}
                data-testid="report-mode-detailed"
                className="flex-1 h-14 rounded-xl bg-cyan-500/20 border border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-300 font-oswald font-bold text-lg transition-all active:scale-95"
              >
                SI
              </button>
              <button
                onClick={() => setPrintMode('summary')}
                data-testid="report-mode-summary"
                className="flex-1 h-14 rounded-xl bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 text-amber-300 font-oswald font-bold text-lg transition-all active:scale-95"
              >
                NO
              </button>
              <button
                onClick={handleClose}
                data-testid="report-mode-cancel"
                className="flex-1 h-14 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white/70 font-oswald font-bold text-lg transition-all active:scale-95"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isDetailed = printMode === 'detailed';

  // ═══ REPORTE ═══
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-lg max-h-[85vh] flex flex-col p-0" data-testid="report-xz-dialog">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
          <DialogTitle className="font-oswald text-white flex items-center gap-2">
            <FileText className="text-cyan-400" size={18} />
            CIERRE DE TURNO (X)
            {!isDetailed && <span className="text-xs text-amber-400 font-normal ml-1">- Resumido</span>}
          </DialogTitle>
          <DialogDescription className="text-white/50 text-xs">
            {report?.session?.ref || ''}
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
            <div ref={printRef} className="text-sm pb-4 font-bold">
              
              {/* ═══ ENCABEZADO ═══ */}
              <div className="text-center mb-2">
                <p className="font-oswald font-bold text-white text-base">
                  {isDetailed ? 'CIERRE DE TURNO' : 'CIERRE DE CAJA'}
                </p>
                <p className="text-white/60 text-xs">{report.session?.ref}</p>
              </div>

              <Separator />

              <div className="space-y-1 mb-1">
                <Row label="Cajero:" value={report.session?.opened_by} />
                <Row label="Terminal:" value={report.session?.terminal || '-'} />
                <Row label="Fecha:" value={report.business_date} />
                <Row label="Apertura:" value={fmtDate(report.session?.opened_at)} />
                {report.session?.closed_at && <Row label="Cierre:" value={fmtDate(report.session?.closed_at)} />}
              </div>

              <Separator />

              {/* ═══ PRODUCTOS (si hay) ═══ */}
              {isDetailed && report.sales_by_category?.length > 0 && (
                <>
                  <SectionTitle>PRODUCTOS</SectionTitle>
                  {report.sales_by_category.map((c, i) => (
                    <Row key={i} label={`${c.category} (${c.quantity})`} value={formatMoney(c.subtotal)} />
                  ))}
                  <Row label="Total Productos:" value={formatMoney(report.sales_by_category.reduce((s, c) => s + c.subtotal, 0))} bold highlight />
                  <Separator />
                </>
              )}

              {/* ═══ DEVOLUCIONES (si hay) ═══ */}
              {report.voids?.count > 0 && (
                <>
                  <SectionTitle>DEVOLUCIONES</SectionTitle>
                  {isDetailed ? (
                    report.voids.list.map((v, i) => (
                      <Row key={i} label={`${v.reason} (${v.count})`} value={`-${formatMoney(v.total)}`} className="text-red-400" />
                    ))
                  ) : (
                    <Row label={`Total (${report.voids.count})`} value={`-${formatMoney(report.voids.total)}`} className="text-red-400" />
                  )}
                  <Separator />
                </>
              )}

              {/* ═══ VENTAS ═══ */}
              {isDetailed ? (
                <>
                  <SectionTitle>VENTAS</SectionTitle>
                  <Row label="Subtotal:" value={formatMoney(report.sales_summary?.subtotal)} />
                  <Row label="ITBIS:" value={formatMoney(report.sales_summary?.itbis)} />
                  <Row label="Propina Legal:" value={formatMoney(report.sales_summary?.propina)} />
                  <Row label="TOTAL:" value={formatMoney(report.sales_summary?.total)} bold highlight />
                  <Row label="Facturas:" value={report.sales_summary?.invoices_count || 0} />
                  {report.sales_summary?.avg_per_invoice > 0 && (
                    <Row label="Promedio/Factura:" value={formatMoney(report.sales_summary?.avg_per_invoice)} />
                  )}
                </>
              ) : (
                <>
                  <Row label="Facturas:" value={report.sales_summary?.invoices_count || 0} />
                  <Row label="Total Ventas:" value={formatMoney(report.sales_summary?.total)} bold highlight />
                </>
              )}

              <Separator />

              {/* ═══ FORMAS DE PAGO ═══ */}
              <SectionTitle>FORMAS DE PAGO</SectionTitle>
              {isDetailed && report.payment_breakdown?.length > 0 ? (
                report.payment_breakdown.map((p, i) => (
                  <Row key={i} label={`${p.method} (${p.count}):`} value={formatMoney(p.amount)} />
                ))
              ) : (
                <>
                  <Row label="Efectivo:" value={formatMoney(report.payment_totals?.efectivo)} />
                  <Row label="Tarjeta:" value={formatMoney(report.payment_totals?.tarjeta)} />
                  <Row label="Transferencia:" value={formatMoney(report.payment_totals?.transferencia)} />
                </>
              )}

              <Separator />

              {/* ═══ FLUJO DE CAJA (solo detallado) ═══ */}
              {isDetailed && (
                <>
                  <SectionTitle>FLUJO DE CAJA</SectionTitle>
                  <Row label="Fondo Inicial:" value={formatMoney(report.cash_reconciliation?.initial_fund)} />
                  <Row label="+ Ventas Efectivo:" value={formatMoney(report.cash_reconciliation?.cash_sales)} />
                  <Row label="+ Depositos:" value={formatMoney(report.cash_reconciliation?.deposits)} />
                  <Row label="- Retiros:" value={`-${formatMoney(report.cash_reconciliation?.withdrawals)}`} />
                  <Row label="TOTAL A ENTREGAR:" value={formatMoney(report.cash_reconciliation?.total_to_deliver)} bold highlight />
                  <Separator />
                </>
              )}

              {/* ═══ DECLARACION ═══ */}
              {(report.cash_reconciliation?.cash_declared > 0 || report.cash_reconciliation?.expected_cash > 0) && (
                <>
                  <SectionTitle>DECLARACION</SectionTitle>
                  <Row label="Esperado:" value={formatMoney(report.cash_reconciliation?.expected_cash)} />
                  <Row label="Declarado:" value={formatMoney(report.cash_reconciliation?.cash_declared)} />
                  <Row 
                    label="Diferencia:" 
                    value={`${report.cash_reconciliation?.difference > 0 ? '+' : ''}${formatMoney(report.cash_reconciliation?.difference)}`}
                    bold
                    className={Math.abs(report.cash_reconciliation?.difference || 0) < 1 ? 'text-green-400' : report.cash_reconciliation?.difference > 0 ? 'text-green-400' : 'text-red-400'}
                  />
                  <Separator />
                </>
              )}

              {/* ═══ TOTAL GENERAL ═══ */}
              <Row label="TOTAL GENERAL:" value={formatMoney(report.sales_summary?.total)} bold highlight />

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
          <Button onClick={() => setPrintMode(null)} variant="outline" className="border-white/20 text-white/70" data-testid="change-mode-btn">
            Cambiar
          </Button>
          <Button onClick={handleClose} variant="outline" className="border-white/20 text-white/70" data-testid="close-report-btn">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
