import { formatMoney, Badge, Clock } from './reportUtils';

export default function TableMovementsReport({ data: reportData }) {
  const data = Array.isArray(reportData) ? reportData : [];
  return (
    <div className="space-y-4">
      {data.length > 0 ? (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Historial de Movimientos</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2">Hora</th>
                  <th className="text-left py-2">Usuario</th>
                  <th className="text-left py-2">Origen</th>
                  <th className="text-left py-2">Destino</th>
                  <th className="text-left py-2">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 font-mono"><Clock size={10} className="inline mr-1" />{m.created_at?.split('T')[1]?.slice(0, 5) || '--:--'}</td>
                    <td className="py-2"><span className="font-medium">{m.user_name}</span><Badge variant="outline" className="ml-1 text-[8px]">{m.user_role}</Badge></td>
                    <td className="py-2"><Badge variant="secondary">Mesa {m.source_table_number}</Badge></td>
                    <td className="py-2"><Badge className="bg-primary/20 text-primary">Mesa {m.target_table_number}</Badge></td>
                    <td className="py-2">{m.merged ? <Badge className="bg-yellow-500/20 text-yellow-400">Unión</Badge> : <Badge className="bg-blue-500/20 text-blue-400">Movimiento</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground text-center py-12">Sin movimientos en el período</p>}
    </div>
  );
}
