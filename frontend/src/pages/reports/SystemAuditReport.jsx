import { formatMoney, Badge } from './reportUtils';
import { Button } from '@/components/ui/button';
import { Filter, X } from 'lucide-react';

export default function SystemAuditReport({ data, auditEventFilter, onFilterChange, onReload }) {
  if (!data?.activities) return null;
  const eventTypes = data.available_event_types || [];
  return (
    <div className="space-y-4" data-testid="system-audit-report">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Total Actividades</p>
          <p className="font-oswald text-2xl font-bold">{data.summary?.total_activities || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Valor Total</p>
          <p className="font-oswald text-xl font-bold text-primary">{formatMoney(data.summary?.total_value || 0)}</p>
        </div>
      </div>

      {/* By Type Summary */}
      {data.by_type?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Tipo de Evento</h4>
          <div className="flex flex-wrap gap-2">
            {data.by_type.map((t, i) => (
              <Badge key={i} variant="outline" className="text-xs">{t.type}: {t.count}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Event Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-muted-foreground" />
        <Button
          size="sm"
          variant={!auditEventFilter || auditEventFilter === 'Todos' ? 'default' : 'outline'}
          className="h-7 px-3 text-xs"
          onClick={() => { onFilterChange('Todos'); onReload(); }}
        >
          Todos
        </Button>
        {eventTypes.map((et, i) => (
          <Button
            key={i}
            size="sm"
            variant={auditEventFilter === et ? 'default' : 'outline'}
            className="h-7 px-3 text-xs"
            onClick={() => { onFilterChange(et); onReload(); }}
          >
            {et}
          </Button>
        ))}
      </div>

      {/* Activities Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {data.activities?.length > 0 ? (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 px-3">Hora</th>
                  <th className="text-left py-2">Tipo</th>
                  <th className="text-left py-2">Descripción</th>
                  <th className="text-left py-2">Usuario</th>
                  <th className="text-left py-2">Autorizador</th>
                  <th className="text-right py-2 px-3">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.activities.map((act, i) => {
                  const isVoid = act.type?.includes('Anulación');
                  const isAdjust = act.type?.includes('Ajuste');
                  return (
                    <tr key={i} className={`border-b border-border/30 ${isVoid ? 'bg-red-500/5' : isAdjust ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                        {act.timestamp?.split('T')[1]?.slice(0, 8) || act.timestamp?.slice(11, 19) || ''}
                      </td>
                      <td className="py-2">
                        <Badge variant={isVoid ? 'destructive' : isAdjust ? 'secondary' : 'outline'} className="text-[9px] whitespace-nowrap">{act.type}</Badge>
                      </td>
                      <td className="py-2 max-w-[250px] truncate" title={act.description}>{act.description}</td>
                      <td className="py-2 font-medium">{act.user}</td>
                      <td className="py-2 text-muted-foreground">{act.authorizer}</td>
                      <td className="py-2 text-right font-oswald">{act.value > 0 ? formatMoney(act.value) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Sin actividades en el periodo</p>
        )}
      </div>
    </div>
  );
}
