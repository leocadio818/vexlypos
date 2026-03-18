import { formatMoney, Badge } from './reportUtils';
import { Percent } from 'lucide-react';

export default function DiscountsReport({ data }) {
  if (!data?.rows) return null;
  const { rows, summary } = data;
  return (
    <div className="space-y-4" data-testid="discounts-report">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-amber-400 uppercase">Total Descuentos</p>
          <p className="font-oswald text-2xl font-bold text-amber-400">{formatMoney(summary?.total_descuentos)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Facturas con Descuento</p>
          <p className="font-oswald text-2xl font-bold">{summary?.cantidad_facturas || 0}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay descuentos en el período seleccionado</p>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm" data-testid="discounts-table">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Fecha</th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground">NCF</th>
                <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Mesa</th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Mesero</th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Descuento</th>
                <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Subtotal</th>
                <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Monto Desc.</th>
                <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Total Final</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-3 text-xs font-mono text-muted-foreground">{row.Fecha}</td>
                  <td className="p-3 text-xs font-mono">{row.NCF || '-'}</td>
                  <td className="p-3 text-center text-xs">{row.Mesa}</td>
                  <td className="p-3 text-xs">{row.Mesero}</td>
                  <td className="p-3">
                    <Badge className="bg-amber-500/20 text-amber-300 text-xs">
                      <Percent size={10} className="mr-1" />{row.Descuento}
                    </Badge>
                  </td>
                  <td className="p-3 text-right text-xs font-mono">{formatMoney(row.Subtotal)}</td>
                  <td className="p-3 text-right text-xs font-mono text-red-400">-{formatMoney(row['Monto Descuento'])}</td>
                  <td className="p-3 text-right text-xs font-oswald font-bold">{formatMoney(row['Total Final'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
