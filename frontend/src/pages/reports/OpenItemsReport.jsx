import { formatMoney } from './reportUtils';
import { Pencil, ChefHat, Wine } from 'lucide-react';

export default function OpenItemsReport({ data }) {
  const rows = data?.rows || [];
  return (
    <div className="space-y-4" data-testid="open-items-report">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Artículos únicos</p>
          <p className="font-oswald text-2xl font-bold text-orange-500 mt-1" data-testid="oi-count">{data?.count || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Unidades vendidas</p>
          <p className="font-oswald text-2xl font-bold text-amber-500 mt-1" data-testid="oi-sold">{data?.total_sold || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Ingresos generados</p>
          <p className="font-oswald text-2xl font-bold text-cyan-500 mt-1" data-testid="oi-revenue">{formatMoney(data?.total_revenue)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Pencil size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay artículos libres vendidos en el período.</p>
          <p className="text-xs mt-1 opacity-70">Estos son productos fuera del menú que el mesero crea en el momento.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="oi-table">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Fecha</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Descripción</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Canal</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Mesa/Orden</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Cant</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Precio</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Total</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Creado por</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/20" data-testid={`oi-row-${i}`}>
                    <td className="py-2 px-3 text-xs">{(r.paid_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td className="py-2 px-3 font-bold" data-testid={`oi-desc-${i}`}>
                      {r.description}
                      {r.tax_exempt && <span className="ml-2 text-[9px] text-amber-600 font-bold">EXENTO</span>}
                      {r.kitchen_note && <p className="text-[10px] text-muted-foreground italic">“{r.kitchen_note}”</p>}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.channel === 'bar' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>
                        {r.channel === 'bar' ? <Wine size={10} /> : <ChefHat size={10} />}
                        {r.channel === 'bar' ? 'Bar' : 'Cocina'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{r.table_label || r.transaction_number}</td>
                    <td className="py-2 px-3 text-right font-oswald">{r.quantity}</td>
                    <td className="py-2 px-3 text-right font-oswald">{formatMoney(r.unit_price)}</td>
                    <td className="py-2 px-3 text-right font-oswald font-bold text-orange-600">{formatMoney(r.total)}</td>
                    <td className="py-2 px-3 text-xs">{r.created_by_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
