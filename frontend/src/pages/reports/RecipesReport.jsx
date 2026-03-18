import { COLORS, formatMoney, Badge } from './reportUtils';

export default function RecipesReport({ data }) {
  if (!data) return null;
  const items = data.items || [];
  const byCategory = data.by_category || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-teal-500/20 to-cyan-600/10 border border-teal-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-teal-400 uppercase">Valor Total Inventario</p>
          <p className="font-oswald text-2xl font-bold text-teal-400">{formatMoney(data.total_value || 0)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Total Ingredientes</p>
          <p className="font-oswald text-2xl font-bold">{items.length}</p>
        </div>
      </div>
      {byCategory.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Categoria</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {byCategory.map((cat, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-sm font-medium capitalize">{cat.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{cat.items} items</Badge>
                  <span className="font-oswald text-primary font-bold text-sm">{formatMoney(cat.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ingredientes</h4>
        {items.length > 0 ? (
          <div className="overflow-x-auto max-h-[350px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2">Ingrediente</th>
                  <th className="text-left py-2">Categoria</th>
                  <th className="text-right py-2">Stock</th>
                  <th className="text-left py-2">Unidad</th>
                  <th className="text-right py-2">Costo/U</th>
                  <th className="text-right py-2">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-background/50">
                    <td className="py-2 font-medium">{item.name}</td>
                    <td className="py-2 capitalize text-muted-foreground">{item.category}</td>
                    <td className="py-2 text-right font-oswald">{item.stock}</td>
                    <td className="py-2 text-muted-foreground">{item.unit}</td>
                    <td className="py-2 text-right font-oswald">{formatMoney(item.cost_per_unit)}</td>
                    <td className="py-2 text-right font-oswald text-primary font-bold">{formatMoney(item.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted-foreground text-center py-8">Sin ingredientes registrados</p>}
      </div>
    </div>
  );
}
