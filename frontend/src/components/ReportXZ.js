import React, { useState, useEffect, useCallback } from 'react';
import { businessDaysAPI, formatMoney } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function buildPrintHTML(report, isDetailed, reportType) {
  const fmtDate = (d) => d ? new Date(d).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '-';
  const fmtMoney = (v) => formatMoney(v);
  const row = (label, value) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
  const sep = () => '<div class="sep"></div>';
  const title = (t) => `<div class="title">${t}</div>`;

  let html = '';

  // ENCABEZADO
  html += `<div class="center big">${isDetailed ? (reportType === 'Z' ? 'CIERRE DE DIA' : 'CIERRE DE TURNO') : 'CIERRE DE CAJA'}</div>`;
  html += `<div class="center ref">${report.session?.ref || ''}</div>`;
  html += sep();
  html += row('Cajero:', report.session?.opened_by || '-');
  html += row('Terminal:', report.session?.terminal || '-');
  html += row('Fecha:', report.business_date || '-');
  html += row('Apertura:', fmtDate(report.session?.opened_at));
  if (report.session?.closed_at) html += row('Cierre:', fmtDate(report.session?.closed_at));
  html += sep();

  // PRODUCTOS (solo detallado)
  if (isDetailed && report.sales_by_category?.length > 0) {
    html += title('PRODUCTOS');
    for (const c of report.sales_by_category) {
      html += row(`${c.category || c.category_name} (${c.quantity})`, fmtMoney(c.subtotal));
    }
    const prodTotal = report.sales_by_category.reduce((s, c) => s + c.subtotal, 0);
    html += `<div class="row big"><span>Total Productos:</span><span>${fmtMoney(prodTotal)}</span></div>`;
    html += sep();
  }

  // DEVOLUCIONES
  if (report.voids?.count > 0) {
    html += title('DEVOLUCIONES');
    if (isDetailed && report.voids.list) {
      for (const v of report.voids.list) {
        const reason = v.reason || v.cancellation_reason || 'Sin razon';
        html += row(`${reason} (${v.count || 1})`, `-${fmtMoney(v.total)}`);
      }
    } else {
      html += row(`Total (${report.voids.count})`, `-${fmtMoney(report.voids.total)}`);
    }
    html += sep();
  }

  // VENTAS
  if (isDetailed) {
    html += title('VENTAS');
    html += row('Subtotal:', fmtMoney(report.sales_summary?.subtotal));
    html += row('ITBIS:', fmtMoney(report.sales_summary?.itbis));
    html += row('Propina Legal:', fmtMoney(report.sales_summary?.propina));
    html += `<div class="row big"><span>TOTAL:</span><span>${fmtMoney(report.sales_summary?.total)}</span></div>`;
    html += row('Facturas:', report.sales_summary?.invoices_count || 0);
    if (report.sales_summary?.avg_per_invoice > 0) {
      html += row('Promedio/Factura:', fmtMoney(report.sales_summary?.avg_per_invoice));
    }
  } else {
    html += row('Facturas:', report.sales_summary?.invoices_count || 0);
    html += `<div class="row big"><span>Total Ventas:</span><span>${fmtMoney(report.sales_summary?.total)}</span></div>`;
  }
  html += sep();

  // FORMAS DE PAGO
  html += title('FORMAS DE PAGO');
  if (isDetailed && report.payment_breakdown?.length > 0) {
    for (const p of report.payment_breakdown) {
      html += row(`${p.method} (${p.count}):`, fmtMoney(p.amount));
    }
  } else {
    html += row('Efectivo:', fmtMoney(report.payment_totals?.efectivo));
    html += row('Tarjeta:', fmtMoney(report.payment_totals?.tarjeta));
    html += row('Transferencia:', fmtMoney(report.payment_totals?.transferencia));
  }
  html += sep();

  // FLUJO DE CAJA (solo detallado)
  if (isDetailed) {
    html += title('FLUJO DE CAJA');
    html += row('Fondo Inicial:', fmtMoney(report.cash_reconciliation?.initial_fund));
    html += row('+ Ventas Efectivo:', fmtMoney(report.cash_reconciliation?.cash_sales));
    html += row('+ Depositos:', fmtMoney(report.cash_reconciliation?.deposits));
    html += row('- Retiros:', `-${fmtMoney(report.cash_reconciliation?.withdrawals)}`);
    html += `<div class="row big"><span>TOTAL A ENTREGAR:</span><span>${fmtMoney(report.cash_reconciliation?.total_to_deliver)}</span></div>`;
    html += sep();
  }

  // DECLARACION
  if (report.cash_reconciliation?.cash_declared > 0 || report.cash_reconciliation?.expected_cash > 0) {
    html += title('DECLARACION');
    html += row('Esperado:', fmtMoney(report.cash_reconciliation?.expected_cash));
    html += row('Declarado:', fmtMoney(report.cash_reconciliation?.cash_declared));
    html += `<div class="row big"><span>Diferencia:</span><span>${report.cash_reconciliation?.difference > 0 ? '+' : ''}${fmtMoney(report.cash_reconciliation?.difference)}</span></div>`;
    html += sep();
  }

  // TOTAL GENERAL
  html += `<div class="row big"><span>TOTAL GENERAL:</span><span>${fmtMoney(report.sales_summary?.total)}</span></div>`;
  html += '<div class="center ref" style="margin-top:8px">--- Fin de Reporte ---</div>';

  return html;
}

function printReport(report, isDetailed, reportType) {
  const content = buildPrintHTML(report, isDetailed, reportType);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Habilita ventanas emergentes para imprimir');
    return;
  }
  printWindow.document.write(`
    <html><head><title>${report?.session?.ref || 'Reporte'}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 3mm; color: #000; font-weight: bold; }
      .center { text-align: center; }
      .sep { border-top: 1px dashed #000; margin: 5px 0; }
      .row { display: flex; justify-content: space-between; padding: 1px 0; font-weight: bold; }
      .title { font-size: 13px; font-weight: bold; margin-bottom: 3px; margin-top: 2px; }
      .big { font-size: 14px; font-weight: bold; }
      .ref { font-size: 11px; }
    </style></head><body>
    ${content}
    </body></html>
  `);
  printWindow.document.close();
  printWindow.print();
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

  const handleSelect = (mode) => {
    if (!report) return;
    const isDetailed = mode === 'detailed';
    printReport(report, isDetailed, type);
    onClose?.();
  };

  const handleClose = () => {
    onClose?.();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-sm p-0" data-testid="report-mode-dialog">
        <div className="p-6 text-center">
          {loading ? (
            <div className="py-8">
              <RefreshCw className="animate-spin text-cyan-400 mx-auto" size={32} />
              <p className="text-white/50 text-sm mt-3">Preparando reporte...</p>
            </div>
          ) : error ? (
            <div className="py-8">
              <AlertTriangle className="text-red-400 mx-auto mb-3" size={36} />
              <p className="text-white/70 text-sm">{error}</p>
              <Button onClick={fetchReport} className="mt-3" variant="outline" size="sm">Reintentar</Button>
            </div>
          ) : (
            <>
              <FileText className="text-cyan-400 mx-auto mb-4" size={36} />
              <p className="font-oswald font-bold text-white text-lg mb-1">
                Reporte Detallado?
              </p>
              <p className="text-white/50 text-sm mb-6">
                {report?.session?.opened_by || user?.name}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSelect('detailed')}
                  data-testid="report-mode-detailed"
                  className="flex-1 h-14 rounded-xl bg-cyan-500/20 border border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-300 font-oswald font-bold text-lg transition-all active:scale-95"
                >
                  SI
                </button>
                <button
                  onClick={() => handleSelect('summary')}
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
