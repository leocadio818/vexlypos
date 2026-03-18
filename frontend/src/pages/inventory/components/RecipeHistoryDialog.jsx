import { useState, useEffect } from 'react';
import { History, Plus, Minus, Pencil, Trash2, Clock, User, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { recipesAPI } from '@/lib/api';

const ACTION_CONFIG = {
  created: { label: 'Creada', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: Plus },
  updated: { label: 'Modificada', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Pencil },
  deleted: { label: 'Eliminada', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Trash2 },
};

const CHANGE_ICON = {
  added: <Plus size={12} className="text-green-400 shrink-0" />,
  removed: <Minus size={12} className="text-red-400 shrink-0" />,
  modified: <Pencil size={12} className="text-blue-400 shrink-0" />,
  created: <Plus size={12} className="text-green-400 shrink-0" />,
  deleted: <Trash2 size={12} className="text-red-400 shrink-0" />,
};

function SnapshotPanel({ label, snapshot }) {
  const [open, setOpen] = useState(false);
  if (!snapshot) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {label}
      </button>
      {open && (
        <div className="mt-1 p-2 rounded-lg bg-background/50 border border-border/50 text-xs space-y-1">
          <div className="text-muted-foreground">Rendimiento: <span className="text-foreground font-mono">{snapshot.yield_quantity}</span></div>
          {snapshot.ingredients?.map((ing, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-medium">{ing.ingredient_name || '?'}</span>
              <span className="text-muted-foreground font-mono">{ing.quantity} {ing.unit}</span>
              {ing.waste_percentage > 0 && <span className="text-red-400 text-xs">+{ing.waste_percentage}%</span>}
            </div>
          ))}
          {snapshot.notes && <div className="text-muted-foreground italic">"{snapshot.notes}"</div>}
        </div>
      )}
    </div>
  );
}

export default function RecipeHistoryDialog({ open, onOpenChange, recipeId, recipeName }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && recipeId) {
      setLoading(true);
      recipesAPI.getHistory(recipeId)
        .then(res => setLogs(res.data || []))
        .catch(() => setLogs([]))
        .finally(() => setLoading(false));
    }
  }, [open, recipeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <History size={20} className="text-cyan-500" />
            Historial: {recipeName}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Registro de todos los cambios realizados a esta receta
          </DialogDescription>
        </DialogHeader>

        {loading && <div className="text-center py-8 text-muted-foreground text-sm">Cargando historial...</div>}

        {!loading && logs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <History size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin historial registrado aún</p>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="relative pl-6">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-4">
              {logs.map((log, idx) => {
                const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.updated;
                const Icon = cfg.icon;
                const ts = new Date(log.timestamp);
                const dateStr = ts.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = ts.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div key={log.id || idx} className="relative" data-testid={`history-entry-${idx}`}>
                    {/* Timeline dot */}
                    <div className="absolute -left-6 top-1 w-[22px] h-[22px] rounded-full bg-card border-2 border-border flex items-center justify-center z-10">
                      <Icon size={10} className={cfg.color.includes('green') ? 'text-green-400' : cfg.color.includes('red') ? 'text-red-400' : 'text-blue-400'} />
                    </div>

                    <div className="p-3 rounded-xl border border-border bg-card/50">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><User size={10} /> {log.user_name}</span>
                          <span className="flex items-center gap-1"><Clock size={10} /> {dateStr} {timeStr}</span>
                        </div>
                      </div>

                      {/* Changes */}
                      {log.changes?.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {log.changes.map((c, ci) => (
                            <div key={ci} className="flex items-start gap-2 text-xs">
                              {CHANGE_ICON[c.type] || CHANGE_ICON.modified}
                              <span>{c.detail}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Snapshots */}
                      <SnapshotPanel label="Ver estado anterior" snapshot={log.snapshot_before} />
                      <SnapshotPanel label="Ver estado nuevo" snapshot={log.snapshot_after} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button variant="outline" className="w-full mt-2" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
