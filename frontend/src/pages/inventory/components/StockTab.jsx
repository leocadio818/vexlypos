import { 
  Package, RefreshCw, Bell, ArrowLeftRight, AlertTriangle, Send, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/api';

// Category label helper
const CATEGORY_LABELS = {
  proteina: 'Proteína',
  vegetales: 'Vegetales',
  lacteos: 'Lácteos',
  granos: 'Granos',
  bebidas: 'Bebidas',
  condimentos: 'Condimentos',
  otros: 'Otros'
};

const getCategoryLabel = (cat) => CATEGORY_LABELS[cat] || cat || 'Sin categoría';

export default function StockTab({ 
  multilevelStock,
  stockMovements,
  ingredients,
  warehouses,
  loadingMultilevel,
  sendingAlert,
  alertConfig,
  onFetchMultilevelStock,
  onSendAlert,
  onOpenAlertDialog,
  onOpenTransferDialog,
  onOpenAdjustDialog,
  onOpenDifferenceDialog
}) {
  return (
    <div data-testid="stock-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-lg font-bold">Stock Multinivel & Diferencias</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={onFetchMultilevelStock}
            disabled={loadingMultilevel}
            data-testid="refresh-stock-btn"
          >
            <RefreshCw size={16} className={`mr-1 ${loadingMultilevel ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button 
            variant="outline"
            onClick={onOpenAlertDialog}
            data-testid="alert-config-btn"
          >
            <Bell size={16} className="mr-1" /> Alertas
          </Button>
          <Button 
            variant="outline"
            onClick={onOpenTransferDialog}
            data-testid="transfer-btn"
          >
            <ArrowLeftRight size={16} className="mr-1" /> Transferir
          </Button>
          <Button 
            variant="outline"
            onClick={onOpenAdjustDialog}
            data-testid="adjust-btn"
          >
            <Package size={16} className="mr-1" /> Ajustar
          </Button>
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {multilevelStock.filter(s => s.is_low_stock).length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between" data-testid="low-stock-alert">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-500" size={24} />
            <div>
              <span className="font-oswald font-bold text-red-500">
                {multilevelStock.filter(s => s.is_low_stock).length} insumos con stock bajo
              </span>
              <p className="text-xs text-muted-foreground">Revisa los items marcados en rojo</p>
            </div>
          </div>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={onSendAlert}
            disabled={sendingAlert || !alertConfig.emails?.length}
            data-testid="send-alert-btn"
          >
            {sendingAlert ? <RefreshCw size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
            Enviar Alerta
          </Button>
        </div>
      )}

      {/* Multilevel Stock Table */}
      {loadingMultilevel ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <table className="w-full text-sm" data-testid="multilevel-stock-table">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-oswald font-medium">Insumo</th>
                <th className="px-4 py-3 text-left font-oswald font-medium">Almacén</th>
                <th className="px-4 py-3 text-left font-oswald font-medium">Stock Detallado</th>
                <th className="px-4 py-3 text-right font-oswald font-medium">Stock Base</th>
                <th className="px-4 py-3 text-right font-oswald font-medium">Valor</th>
                <th className="px-4 py-3 text-center font-oswald font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {multilevelStock.map((item, idx) => (
                <tr 
                  key={item.id || idx} 
                  className={`hover:bg-muted/30 transition-colors ${item.is_low_stock ? 'bg-red-500/5' : ''}`}
                  data-testid={`stock-row-${idx}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.ingredient_name}</span>
                      {item.is_low_stock && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                          Stock Bajo
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getCategoryLabel(item.category)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.warehouse_name}
                  </td>
                  <td className="px-4 py-3">
                    {/* Multi-level Stock Breakdown */}
                    <div className="flex items-center gap-1">
                      {item.stock_in_purchase_units > 0 && (
                        <>
                          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-oswald font-bold text-sm">
                            {item.stock_in_purchase_units}
                          </span>
                          <span className="text-xs text-blue-400">{item.purchase_unit}</span>
                          {item.stock_remainder_dispatch > 0 && (
                            <ChevronRight size={14} className="text-muted-foreground" />
                          )}
                        </>
                      )}
                      {(item.stock_remainder_dispatch > 0 || item.stock_in_purchase_units === 0) && (
                        <>
                          <span className={`px-2 py-0.5 rounded font-oswald font-bold text-sm ${item.is_low_stock ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {item.stock_remainder_dispatch > 0 ? item.stock_remainder_dispatch.toFixed(2).replace(/\.?0+$/, '') : item.current_stock.toFixed(2).replace(/\.?0+$/, '')}
                          </span>
                          <span className={`text-xs ${item.is_low_stock ? 'text-red-400' : 'text-emerald-400'}`}>{item.dispatch_unit}</span>
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      1 {item.purchase_unit} = {item.conversion_factor} {item.dispatch_unit}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono ${item.is_low_stock ? 'text-red-400' : ''}`}>
                      {item.current_stock.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">{item.dispatch_unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-oswald font-bold text-emerald-400">
                      {formatMoney(item.stock_value)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                      onClick={() => onOpenDifferenceDialog({
                        ingredient_id: item.ingredient_id,
                        ingredient_name: item.ingredient_name,
                        warehouse_id: item.warehouse_id,
                        warehouse_name: item.warehouse_name,
                        purchase_unit: item.purchase_unit,
                        dispatch_unit: item.dispatch_unit,
                        conversion_factor: item.conversion_factor,
                        dispatch_unit_cost: item.dispatch_unit_cost,
                        current_stock: item.current_stock,
                        stock_detailed: item.stock_detailed,
                        quantity: 0,
                        input_unit: item.dispatch_unit,
                        difference_type: 'faltante',
                        reason: '',
                        observations: ''
                      })}
                      title="Registrar Diferencia"
                      data-testid={`difference-btn-${idx}`}
                    >
                      <AlertTriangle size={14} className="mr-1" /> Diferencia
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {multilevelStock.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="no-stock">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay registros de stock</p>
            </div>
          )}
        </div>
      )}

      {/* Recent movements */}
      <div className="mt-8" data-testid="recent-movements">
        <h3 className="font-oswald text-sm font-bold text-muted-foreground mb-2">Movimientos Recientes</h3>
        <div className="space-y-1">
          {stockMovements.slice(0, 20).map(mov => {
            const ing = ingredients.find(i => i.id === mov.ingredient_id);
            const wh = warehouses.find(w => w.id === mov.warehouse_id);
            const movType = mov.movement_type === 'waste' ? 'diferencia' : mov.movement_type;
            return (
              <div key={mov.id} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-border/50 text-sm" data-testid={`movement-${mov.id}`}>
                <div className="flex items-center gap-2">
                  <Badge variant={mov.quantity > 0 ? 'default' : 'destructive'} className="text-[9px]">
                    {movType}
                  </Badge>
                  <span>{ing?.name || '?'}</span>
                  <span className="text-muted-foreground">@ {wh?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-oswald font-bold ${mov.quantity > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(mov.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
          {stockMovements.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No hay movimientos recientes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
