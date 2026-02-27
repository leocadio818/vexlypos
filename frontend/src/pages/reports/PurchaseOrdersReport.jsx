import { CustomTooltip, formatMoney, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from './reportUtils';

export default function PurchaseOrdersReport({ data }) {
  if (!data?.summary) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-purple-500/20 to-violet-600/10 border border-purple-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-purple-400 uppercase">Total Compras</p>
          <p className="font-oswald text-2xl font-bold text-purple-400">{formatMoney(data.summary.total_value)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Total Órdenes</p>
          <p className="font-oswald text-2xl font-bold">{data.summary.total_orders}</p>
        </div>
      </div>
      {data.by_supplier?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Proveedor</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.by_supplier.slice(0, 8)} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9, fill: '#999' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" fill="#8E24AA" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
