import { formatMoney, Badge } from './reportUtils';
import { Receipt, CreditCard, Banknote, Users, AlertTriangle, Percent, FileText, Clock, Hash, PenLine } from 'lucide-react';

export default function CashCloseReport({ data }) {
  if (!data?.summary) return null;
  const s = data.summary;

  return (
    <div className="space-y-5" data-testid="cash-close-report">
      {/* Header Info */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Fecha del Cierre</p>
          <p className="font-oswald text-lg font-bold">{data.date}</p>
        </div>
        {data.cashiers?.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">Cajero(s)</p>
            <p className="font-semibold">{data.cashiers.join(', ')}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Total Facturas</p>
          <p className="font-oswald text-lg font-bold">{s.total_bills}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <Banknote size={20} className="text-emerald-500 mx-auto mb-1" />
          <p className="font-oswald text-2xl font-bold text-emerald-500">{formatMoney(s.total_sales)}</p>
          <p className="text-xs text-muted-foreground">Total Ventas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Banknote size={20} className="text-green-500 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-green-500">{formatMoney(s.cash_total)}</p>
          <p className="text-xs text-muted-foreground">Efectivo</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <CreditCard size={20} className="text-purple-500 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-purple-500">{formatMoney(s.card_total)}</p>
          <p className="text-xs text-muted-foreground">Tarjeta/Otros</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Receipt size={20} className="text-blue-500 mx-auto mb-1" />
          <p className="font-oswald text-xl font-bold text-blue-500">{formatMoney(s.net_sales || s.total_sales)}</p>
          <p className="text-xs text-muted-foreground">Venta Neta</p>
        </div>
      </div>

      {/* Ingresos por Forma de Pago */}
      {data.by_payment_method?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
            <CreditCard size={14} /> Ingresos por Forma de Pago
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left p-2">Forma de Pago</th>
                  <th className="text-center p-2">Tipo</th>
                  <th className="text-center p-2">Transacciones</th>
                  <th className="text-right p-2">Propinas</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.by_payment_method.map((pm, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="p-2 font-medium">{pm.name}</td>
                    <td className="p-2 text-center">
                      <Badge variant={pm.is_cash ? 'default' : 'secondary'} className="text-xs">
                        {pm.is_cash ? 'Efectivo' : 'Electrónico'}
                      </Badge>
                    </td>
                    <td className="p-2 text-center font-oswald">{pm.count}</td>
                    <td className="p-2 text-right text-muted-foreground">{formatMoney(pm.tips)}</td>
                    <td className="p-2 text-right font-oswald font-bold text-primary">{formatMoney(pm.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold">
                  <td className="p-2" colSpan={2}>TOTAL</td>
                  <td className="p-2 text-center font-oswald">{s.total_bills}</td>
                  <td className="p-2 text-right">{formatMoney(s.total_tips)}</td>
                  <td className="p-2 text-right font-oswald text-primary">{formatMoney(s.total_sales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Resumen Fiscal */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
          <FileText size={14} /> Resumen Fiscal
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
            <p className="text-xs text-muted-foreground">Subtotal</p>
            <p className="font-oswald font-bold">{formatMoney(s.subtotal)}</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
            <p className="text-xs text-muted-foreground">ITBIS</p>
            <p className="font-oswald font-bold text-blue-500">{formatMoney(s.total_itbis)}</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
            <p className="text-xs text-muted-foreground">Propina Legal</p>
            <p className="font-oswald font-bold text-amber-500">{formatMoney(s.total_tips)}</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
            <p className="text-xs text-muted-foreground">Descuentos</p>
            <p className="font-oswald font-bold text-red-500">-{formatMoney(s.total_discounts || 0)}</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-center">
            <p className="text-xs text-primary">Total Neto</p>
            <p className="font-oswald font-bold text-lg text-primary">{formatMoney(s.net_sales || s.total_sales)}</p>
          </div>
        </div>
      </div>

      {/* Auditoría de Excepciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" /> Anulaciones
          </h4>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-oswald font-bold text-red-500">{s.total_voids || 0}</p>
              <p className="text-xs text-muted-foreground">Anulaciones</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-oswald font-bold text-red-500">{formatMoney(s.total_void_amount || 0)}</p>
              <p className="text-xs text-muted-foreground">Monto Anulado</p>
            </div>
          </div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
            <Percent size={14} className="text-amber-500" /> Descuentos
          </h4>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-oswald font-bold text-amber-500">{s.discount_count || 0}</p>
              <p className="text-xs text-muted-foreground">Descuentos Aplicados</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-oswald font-bold text-amber-500">{formatMoney(s.total_discounts || 0)}</p>
              <p className="text-xs text-muted-foreground">Monto Descontado</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detalle de Facturas */}
      {data.bills_detail?.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
              <Receipt size={14} /> Detalle de Facturas ({data.bills_detail.length})
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left p-3"><Clock size={12} className="inline mr-1" />Hora</th>
                  <th className="text-center p-3"><Hash size={12} className="inline mr-1" />Trans.</th>
                  <th className="text-center p-3">Mesa</th>
                  <th className="text-left p-3">Mesero</th>
                  <th className="text-left p-3">Cajero</th>
                  <th className="text-left p-3">Forma de Pago</th>
                  <th className="text-right p-3">Subtotal</th>
                  <th className="text-right p-3">ITBIS</th>
                  <th className="text-right p-3">Propina</th>
                  <th className="text-right p-3 font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.bills_detail.map((b, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{b.time || '-'}</td>
                    <td className="p-3 text-center"><Badge variant="outline" className="text-xs font-mono">T-{b.transaction}</Badge></td>
                    <td className="p-3 text-center font-oswald">{b.table || '-'}</td>
                    <td className="p-3 text-xs">{b.waiter || '-'}</td>
                    <td className="p-3 text-xs">{b.cashier || '-'}</td>
                    <td className="p-3 text-xs">{b.payment_method || '-'}</td>
                    <td className="p-3 text-right text-xs">{formatMoney(b.subtotal)}</td>
                    <td className="p-3 text-right text-xs text-blue-500">{formatMoney(b.itbis)}</td>
                    <td className="p-3 text-right text-xs text-amber-500">{formatMoney(b.tips)}</td>
                    <td className="p-3 text-right font-oswald font-bold">{formatMoney(b.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold bg-muted/30">
                  <td className="p-3" colSpan={6}>TOTALES</td>
                  <td className="p-3 text-right">{formatMoney(s.subtotal)}</td>
                  <td className="p-3 text-right text-blue-500">{formatMoney(s.total_itbis)}</td>
                  <td className="p-3 text-right text-amber-500">{formatMoney(s.total_tips)}</td>
                  <td className="p-3 text-right font-oswald text-primary text-lg">{formatMoney(s.total_sales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Firmas */}
      <div className="bg-card border border-border rounded-xl p-6 print:mt-8">
        <h4 className="text-xs font-bold uppercase text-muted-foreground mb-6 flex items-center gap-2">
          <PenLine size={14} /> Firmas de Cierre
        </h4>
        <div className="grid grid-cols-2 gap-12">
          <div className="text-center">
            <div className="border-b-2 border-border mb-2 pb-8"></div>
            <p className="text-sm font-semibold">Firma Cajero</p>
            <p className="text-xs text-muted-foreground">{data.cashiers?.[0] || '________________'}</p>
          </div>
          <div className="text-center">
            <div className="border-b-2 border-border mb-2 pb-8"></div>
            <p className="text-sm font-semibold">Firma Supervisor</p>
            <p className="text-xs text-muted-foreground">________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}
