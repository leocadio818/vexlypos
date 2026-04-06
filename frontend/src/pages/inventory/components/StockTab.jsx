import { useState, useMemo } from 'react';
import { 
  Package, RefreshCw, Bell, ArrowLeftRight, AlertTriangle, Send, ChevronRight,
  Search, Filter, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

const CATEGORY_LABELS = {
  general: 'General', proteina: 'Proteína', vegetales: 'Vegetales', lacteos: 'Lácteos',
  granos: 'Granos', bebidas: 'Bebidas', licores: 'Licores', condimentos: 'Condimentos',
  empaque: 'Empaque', limpieza: 'Limpieza', carnes: 'Carnes', frutas: 'Frutas', otros: 'Otros'
};
const getCategoryLabel = (cat) => CATEGORY_LABELS[cat] || cat || 'Sin categoría';

export default function StockTab({ 
  multilevelStock, stockMovements, ingredients, warehouses,
  loadingMultilevel, sendingAlert, alertConfig,
  onFetchMultilevelStock, onSendAlert, onOpenAlertDialog,
  onOpenTransferDialog, onOpenAdjustDialog, onOpenDifferenceDialog
}) {
  // Theme context for light/dark mode styling
  const { isMinimalist, isNeoDark } = useTheme();
  const isLightMode = isMinimalist && !isNeoDark;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Filtered stock
  const filteredStock = useMemo(() => {
    let items = multilevelStock;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(s =>
        s.ingredient_name?.toLowerCase().includes(q) ||
        s.warehouse_name?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
      );
    }
    if (filterWarehouse) {
      items = items.filter(s => s.warehouse_id === filterWarehouse);
    }
    if (filterCategory) {
      items = items.filter(s => s.category === filterCategory);
    }
    return items;
  }, [multilevelStock, searchQuery, filterWarehouse, filterCategory]);

  // Filtered movements
  const filteredMovements = useMemo(() => {
    if (!searchQuery.trim()) return stockMovements.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return stockMovements.filter(m => {
      const ing = ingredients.find(i => i.id === m.ingredient_id);
      return ing?.name?.toLowerCase().includes(q) || m.movement_type?.toLowerCase().includes(q);
    }).slice(0, 20);
  }, [stockMovements, searchQuery, ingredients]);

  const hasFilters = searchQuery || filterWarehouse || filterCategory;

  // Categories present in data
  const activeCategories = useMemo(() => {
    const cats = new Set(multilevelStock.map(s => s.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [multilevelStock]);

  return (
    <div data-testid="stock-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="font-oswald text-lg font-bold">Stock Multinivel</h2>
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onFetchMultilevelStock} disabled={loadingMultilevel} data-testid="refresh-stock-btn">
            <RefreshCw size={14} className={loadingMultilevel ? 'animate-spin' : ''} />
            <span className="hidden sm:inline ml-1">Actualizar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenAlertDialog} data-testid="alert-config-btn">
            <Bell size={14} />
            <span className="hidden sm:inline ml-1">Alertas</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenTransferDialog} data-testid="transfer-btn">
            <ArrowLeftRight size={14} />
            <span className="hidden sm:inline ml-1">Transferir</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenAdjustDialog} data-testid="adjust-btn">
            <Package size={14} />
            <span className="hidden sm:inline ml-1">Ajustar</span>
          </Button>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-card border border-border rounded-xl p-3 mb-4" data-testid="stock-filters">
        <div className="flex flex-col gap-2">
          {/* Search input */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar insumo, almacén..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              data-testid="stock-search-input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Warehouse filter */}
            <select
              value={filterWarehouse}
              onChange={e => setFilterWarehouse(e.target.value)}
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
              data-testid="stock-filter-warehouse"
            >
              <option value="">Todos almacenes</option>
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>{wh.name}</option>
              ))}
            </select>
            {/* Category filter */}
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
              data-testid="stock-filter-category"
            >
              <option value="">Todas categorías</option>
              {activeCategories.map(cat => (
                <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
              ))}
            </select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setFilterWarehouse(''); setFilterCategory(''); }} className="text-muted-foreground shrink-0">
                <X size={14} className="mr-1" /> Limpiar
              </Button>
            )}
          </div>
        </div>
        {hasFilters && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Filter size={12} />
            <span>Mostrando {filteredStock.length} de {multilevelStock.length} registros</span>
          </div>
        )}
      </div>

      {/* Low Stock Alert Banner */}
      {filteredStock.filter(s => s.is_low_stock).length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between" data-testid="low-stock-alert">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-500" size={24} />
            <div>
              <span className="font-oswald font-bold text-red-500">
                {filteredStock.filter(s => s.is_low_stock).length} insumos con stock bajo
              </span>
              <p className="text-xs text-muted-foreground">Revisa los items marcados en rojo</p>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={onSendAlert} disabled={sendingAlert || !alertConfig.emails?.length} data-testid="send-alert-btn">
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]" data-testid="multilevel-stock-table">
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
              {filteredStock.map((item, idx) => (
                <tr 
                  key={item.id || idx} 
                  className={`hover:bg-muted/30 transition-colors ${item.is_low_stock ? 'bg-red-500/5' : ''}`}
                  data-testid={`stock-row-${idx}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span 
                        className="font-medium"
                        style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}
                      >
                        {item.ingredient_name}
                      </span>
                      {item.is_low_stock && (
                        <Badge 
                          className="text-xs"
                          style={isLightMode 
                            ? { backgroundColor: '#FEE2E2', color: '#DC2626', WebkitTextFillColor: '#DC2626', border: '1px solid #FCA5A5' } 
                            : { backgroundColor: 'rgb(239 68 68 / 0.2)', color: '#F87171', border: '1px solid rgb(239 68 68 / 0.3)' }
                          }
                        >
                          Stock Bajo
                        </Badge>
                      )}
                    </div>
                    <div 
                      className="text-xs"
                      style={isLightMode ? { color: '#64748B', WebkitTextFillColor: '#64748B' } : {}}
                    >
                      {getCategoryLabel(item.category)}
                    </div>
                  </td>
                  <td 
                    className="px-4 py-3"
                    style={isLightMode ? { color: '#64748B', WebkitTextFillColor: '#64748B' } : {}}
                  >
                    {item.warehouse_name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {item.stock_in_purchase_units > 0 && (
                        <>
                          <span 
                            className="px-2 py-0.5 rounded font-oswald font-bold text-sm"
                            style={isLightMode 
                              ? { backgroundColor: '#DBEAFE', color: '#1D4ED8', WebkitTextFillColor: '#1D4ED8' } 
                              : { backgroundColor: 'rgb(59 130 246 / 0.2)', color: '#60A5FA' }
                            }
                          >
                            {item.stock_in_purchase_units}
                          </span>
                          <span 
                            className="text-xs"
                            style={isLightMode ? { color: '#1D4ED8', WebkitTextFillColor: '#1D4ED8' } : { color: '#60A5FA' }}
                          >
                            {item.purchase_unit}
                          </span>
                          {item.stock_remainder_dispatch > 0 && <ChevronRight size={14} className="text-muted-foreground" />}
                        </>
                      )}
                      {(item.stock_remainder_dispatch > 0 || item.stock_in_purchase_units === 0) && (
                        <>
                          <span 
                            className="px-2 py-0.5 rounded font-oswald font-bold text-sm"
                            style={isLightMode 
                              ? { 
                                  backgroundColor: item.is_low_stock ? '#FEE2E2' : '#D1FAE5', 
                                  color: item.is_low_stock ? '#DC2626' : '#047857', 
                                  WebkitTextFillColor: item.is_low_stock ? '#DC2626' : '#047857' 
                                } 
                              : { 
                                  backgroundColor: item.is_low_stock ? 'rgb(239 68 68 / 0.2)' : 'rgb(16 185 129 / 0.2)', 
                                  color: item.is_low_stock ? '#F87171' : '#34D399' 
                                }
                            }
                          >
                            {item.stock_remainder_dispatch > 0 ? item.stock_remainder_dispatch.toFixed(2).replace(/\.?0+$/, '') : item.current_stock.toFixed(2).replace(/\.?0+$/, '')}
                          </span>
                          <span 
                            className="text-xs"
                            style={isLightMode 
                              ? { color: item.is_low_stock ? '#DC2626' : '#047857', WebkitTextFillColor: item.is_low_stock ? '#DC2626' : '#047857' } 
                              : { color: item.is_low_stock ? '#F87171' : '#34D399' }
                            }
                          >
                            {item.dispatch_unit}
                          </span>
                        </>
                      )}
                    </div>
                    <div 
                      className="text-xs mt-0.5"
                      style={isLightMode ? { color: '#64748B', WebkitTextFillColor: '#64748B' } : {}}
                    >
                      1 {item.purchase_unit} = {item.conversion_factor} {item.dispatch_unit}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span 
                      className="font-mono"
                      style={isLightMode 
                        ? { color: item.is_low_stock ? '#DC2626' : '#1E293B', WebkitTextFillColor: item.is_low_stock ? '#DC2626' : '#1E293B' } 
                        : { color: item.is_low_stock ? '#F87171' : 'inherit' }
                      }
                    >
                      {item.current_stock.toFixed(2)}
                    </span>
                    <span 
                      className="text-xs ml-1"
                      style={isLightMode ? { color: '#64748B', WebkitTextFillColor: '#64748B' } : {}}
                    >
                      {item.dispatch_unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span 
                      className="font-oswald font-bold"
                      style={isLightMode ? { color: '#047857', WebkitTextFillColor: '#047857' } : { color: '#34D399' }}
                    >
                      {formatMoney(item.stock_value)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="ghost" size="sm"
                      className="hover:bg-amber-500/10"
                      style={isLightMode 
                        ? { color: '#D97706', WebkitTextFillColor: '#D97706' } 
                        : { color: '#F59E0B' }
                      }
                      onClick={() => onOpenDifferenceDialog({
                        ingredient_id: item.ingredient_id, ingredient_name: item.ingredient_name,
                        warehouse_id: item.warehouse_id, warehouse_name: item.warehouse_name,
                        purchase_unit: item.purchase_unit, dispatch_unit: item.dispatch_unit,
                        conversion_factor: item.conversion_factor, dispatch_unit_cost: item.dispatch_unit_cost,
                        current_stock: item.current_stock, stock_detailed: item.stock_detailed,
                        quantity: 0, input_unit: item.dispatch_unit, difference_type: 'faltante',
                        reason: '', observations: ''
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
          </div>
          {filteredStock.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="no-stock">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>{hasFilters ? 'No se encontraron resultados con los filtros aplicados' : 'No hay registros de stock'}</p>
            </div>
          )}
        </div>
      )}

      {/* Recent movements */}
      <div className="mt-8" data-testid="recent-movements">
        <h3 className="font-oswald text-sm font-bold text-muted-foreground mb-2">Movimientos Recientes</h3>
        <div className="space-y-1">
          {filteredMovements.map(mov => {
            const ing = ingredients.find(i => i.id === mov.ingredient_id);
            const wh = warehouses.find(w => w.id === mov.warehouse_id);
            const typeLabels = { purchase: 'compra', sale: 'venta', waste: 'merma', difference: 'diferencia', adjustment: 'ajuste', transfer_in: 'entrada', transfer_out: 'salida', production_consume: 'producción', production_output: 'producción' };
            const movLabel = typeLabels[mov.movement_type] || mov.movement_type;
            return (
              <div key={mov.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded-lg bg-card/50 border border-border/50 text-sm" data-testid={`movement-${mov.id}`}>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Badge variant={mov.quantity > 0 ? 'default' : 'destructive'} className="text-[11px] shrink-0">{movLabel}</Badge>
                  <span className="truncate">{ing?.name || mov.ingredient_name || '?'}</span>
                  <span className="text-muted-foreground text-xs truncate">@ {wh?.name || '?'}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-oswald font-bold ${mov.quantity > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(mov.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
          {filteredMovements.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">No hay movimientos recientes</div>
          )}
        </div>
      </div>
    </div>
  );
}
