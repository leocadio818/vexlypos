import { formatMoney, Badge, Clock } from './reportUtils';

export default function TransfersReport({ data: reportData }) {
  const data = reportData?.transfers || [];
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Transferencias Recientes</h4>
        {data.length > 0 ? (
          <div className="space-y-2">
            {data.slice(0, 20).map((t, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50">
                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t.from_warehouse} → {t.to_warehouse}</p>
                    <p className="text-[10px] text-muted-foreground">{t.created_at?.split('T')[0]} por {t.user_name}</p>
                  </div>
                </div>
                <Badge variant="outline">{t.items?.length || 0} items</Badge>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground text-center py-8">Sin transferencias en el período</p>}
      </div>
    </div>
  );
}
