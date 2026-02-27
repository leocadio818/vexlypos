import { formatMoney, Badge, Building2 } from './reportUtils';

export default function InventoryLevelsReport({ data: reportData }) {
  const data = Array.isArray(reportData) ? reportData : [];
  return (
    <div className="space-y-4">
      {data.map((wh, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              <h4 className="text-sm font-semibold">{wh.warehouse_name}</h4>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {wh.low_stock_count > 0 && <Badge variant="destructive">{wh.low_stock_count} bajo stock</Badge>}
              <span className="font-oswald text-primary">Valor: {formatMoney(wh.total_value)}</span>
            </div>
          </div>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2">Insumo</th>
                  <th className="text-right py-2">Stock</th>
                  <th className="text-right py-2">Mínimo</th>
                  <th className="text-right py-2">Valor</th>
                  <th className="text-center py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {wh.items?.slice(0, 20).map((item, j) => (
                  <tr key={j} className={`border-b border-border/30 ${item.is_low ? 'bg-red-500/5' : ''}`}>
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-right font-mono">{item.current_stock} {item.unit}</td>
                    <td className="py-2 text-right text-muted-foreground">{item.min_stock}</td>
                    <td className="py-2 text-right font-oswald">{formatMoney(item.value)}</td>
                    <td className="py-2 text-center">
                      {item.is_low ? <Badge variant="destructive" className="text-[9px]">Bajo</Badge> : <Badge variant="secondary" className="text-[9px]">OK</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">Sin datos de inventario</p>}
    </div>
  );
}
