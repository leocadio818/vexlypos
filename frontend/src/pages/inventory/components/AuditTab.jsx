import { useState, useEffect } from 'react';
import { 
  History, Download, Filter, Search, X, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ingredientsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { toast } from 'sonner';
import { NeoDatePicker, NeoTimePicker } from '@/components/DateTimePicker';

const getFieldLabel = (field) => {
  const labels = {
    'unit': 'Unidad de Medida',
    'purchase_unit': 'Unidad de Compra',
    'conversion_factor': 'Factor de Conversión',
    'purchase_quantity': 'Cantidad de Compra',
    'dispatch_quantity': 'Equivalencia en Despacho',
    'avg_cost': 'Costo Promedio',
    'name': 'Nombre',
    'category': 'Categoría',
    'min_stock': 'Stock Mínimo',
  };
  return labels[field] || field;
};

export default function AuditTab() {
  const [allAuditLogs, setAllAuditLogs] = useState([]);
  const [auditStats, setAuditStats] = useState({ total_changes: 0, unique_ingredients: 0, changes_by_field: {} });
  const [auditFilters, setAuditFilters] = useState({ ingredient_name: '', start_date: '', end_date: '', field_changed: '' });
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Fetch audit logs
  const fetchAuditLogs = async (filters = auditFilters) => {
    setLoadingAudit(true);
    try {
      const params = {};
      if (filters.ingredient_name) params.ingredient_name = filters.ingredient_name;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.field_changed) params.field_changed = filters.field_changed;
      
      const res = await ingredientsAPI.getAllAuditLogs(params);
      setAllAuditLogs(res.data.logs || []);
      setAuditStats(res.data.stats || { total_changes: 0, unique_ingredients: 0, changes_by_field: {} });
    } catch (e) {
      toast.error('Error al cargar historial de auditoría');
    }
    setLoadingAudit(false);
  };

  // Export to Excel
  const exportAuditToExcel = () => {
    if (allAuditLogs.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    
    // Dynamic import xlsx
    import('xlsx').then(XLSX => {
      const exportData = allAuditLogs.map(log => ({
        'Fecha y Hora': new Date(log.timestamp).toLocaleString('es-DO'),
        'Usuario': log.changed_by_name || 'Sistema',
        'ID Usuario': log.changed_by_id || '-',
        'Insumo': log.ingredient_name,
        'Campo Editado': getFieldLabel(log.field_changed),
        'Valor Anterior': log.old_value,
        'Valor Nuevo': log.new_value,
      }));
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Historial de Auditoría');
      
      // Add stats sheet
      const statsData = [
        { 'Métrica': 'Total de Cambios', 'Valor': auditStats.total_changes },
        { 'Métrica': 'Insumos Únicos Afectados', 'Valor': auditStats.unique_ingredients },
        ...Object.entries(auditStats.changes_by_field || {}).map(([field, count]) => ({
          'Métrica': `Cambios en ${getFieldLabel(field)}`,
          'Valor': count
        }))
      ];
      const wsStats = XLSX.utils.json_to_sheet(statsData);
      XLSX.utils.book_append_sheet(wb, wsStats, 'Resumen');
      
      XLSX.writeFile(wb, `auditoria_insumos_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Historial exportado a Excel');
    });
  };

  // Load audit logs on mount
  useEffect(() => {
    fetchAuditLogs();
  }, []);

  return (
    <div data-testid="audit-tab">
      {/* Header con estilo Keep Money (Dorado y Oscuro) */}
      <div className="bg-gradient-to-r from-amber-900/30 via-amber-800/20 to-amber-900/30 border border-amber-600/30 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
              <History size={24} className="text-white" />
            </div>
            <div>
              <h2 className="font-oswald text-xl font-bold text-amber-100">Historial de Auditoría de Insumos</h2>
              <p className="text-amber-200/70 text-sm">Registro cronológico de todos los cambios realizados</p>
            </div>
          </div>
          <Button 
            onClick={exportAuditToExcel}
            className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-oswald"
            disabled={allAuditLogs.length === 0}
            data-testid="export-audit-btn"
          >
            <Download size={16} className="mr-2" /> Exportar Historial
          </Button>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-amber-950/50 rounded-lg p-3 border border-amber-700/30">
            <div className="text-amber-400 text-2xl font-oswald font-bold">{auditStats.total_changes}</div>
            <div className="text-amber-200/60 text-xs">Total de Cambios</div>
          </div>
          <div className="bg-amber-950/50 rounded-lg p-3 border border-amber-700/30">
            <div className="text-amber-400 text-2xl font-oswald font-bold">{auditStats.unique_ingredients}</div>
            <div className="text-amber-200/60 text-xs">Insumos Afectados</div>
          </div>
          <div className="bg-amber-950/50 rounded-lg p-3 border border-amber-700/30">
            <div className="text-amber-400 text-2xl font-oswald font-bold">
              {Object.keys(auditStats.changes_by_field || {}).length}
            </div>
            <div className="text-amber-200/60 text-xs">Tipos de Campo</div>
          </div>
        </div>
      </div>

      {/* Filtros de búsqueda */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-amber-500" />
          <span className="font-oswald font-medium text-sm">Filtros de Búsqueda</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Nombre del Insumo</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={auditFilters.ingredient_name}
                onChange={e => setAuditFilters(p => ({ ...p, ingredient_name: e.target.value }))}
                placeholder="Buscar insumo..."
                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm"
                data-testid="audit-filter-ingredient"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fecha Inicio</label>
            <NeoDatePicker value={auditFilters.start_date} onChange={e => setAuditFilters(p => ({ ...p, start_date: e.target.value }))}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fecha Fin</label>
            <NeoDatePicker value={auditFilters.end_date} onChange={e => setAuditFilters(p => ({ ...p, end_date: e.target.value }))}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Campo Editado</label>
            <select
              value={auditFilters.field_changed}
              onChange={e => setAuditFilters(p => ({ ...p, field_changed: e.target.value }))}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
              data-testid="audit-filter-field"
            >
              <option value="">Todos los campos</option>
              <option value="unit">Unidad de Medida</option>
              <option value="purchase_unit">Unidad de Compra</option>
              <option value="conversion_factor">Factor de Conversión</option>
              <option value="purchase_quantity">Cantidad de Compra</option>
              <option value="dispatch_quantity">Equivalencia en Despacho</option>
              <option value="avg_cost">Costo Promedio</option>
              <option value="name">Nombre</option>
              <option value="category">Categoría</option>
              <option value="min_stock">Stock Mínimo</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setAuditFilters({ ingredient_name: '', start_date: '', end_date: '', field_changed: '' });
              fetchAuditLogs({ ingredient_name: '', start_date: '', end_date: '', field_changed: '' });
            }}
            data-testid="clear-audit-filters-btn"
          >
            <X size={14} className="mr-1" /> Limpiar
          </Button>
          <Button 
            size="sm"
            onClick={() => fetchAuditLogs(auditFilters)}
            className="bg-amber-600 hover:bg-amber-500 text-white"
            data-testid="search-audit-btn"
          >
            <Search size={14} className="mr-1" /> Buscar
          </Button>
        </div>
      </div>

      {/* Tabla de Auditoría */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loadingAudit ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-amber-500" />
          </div>
        ) : allAuditLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay registros de auditoría</p>
            <p className="text-xs mt-1">Los cambios en insumos aparecerán aquí</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="audit-table">
              <thead className="bg-gradient-to-r from-amber-900/50 to-amber-800/50 text-amber-100">
                <tr>
                  <th className="px-4 py-3 text-left font-oswald font-medium">Fecha y Hora</th>
                  <th className="px-4 py-3 text-left font-oswald font-medium">Usuario</th>
                  <th className="px-4 py-3 text-left font-oswald font-medium">Insumo</th>
                  <th className="px-4 py-3 text-left font-oswald font-medium">Campo Editado</th>
                  <th className="px-4 py-3 text-left font-oswald font-medium">Valor Anterior</th>
                  <th className="px-4 py-3 text-left font-oswald font-medium">Valor Nuevo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allAuditLogs.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-amber-500/5 transition-colors" data-testid={`audit-row-${idx}`}>
                    <td className="px-4 py-3">
                      <div className="text-sm">{new Date(log.timestamp).toLocaleDateString('es-DO')}</div>
                      <div className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString('es-DO')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-600/20 flex items-center justify-center text-amber-500 text-xs font-bold">
                          {(log.changed_by_name || 'S')[0].toUpperCase()}
                        </div>
                        <span className="font-medium">{log.changed_by_name || 'Sistema'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{log.ingredient_name}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">
                        {getFieldLabel(log.field_changed)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs font-mono">
                        {log.old_value || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded bg-green-500/10 text-green-400 text-xs font-mono">
                        {log.new_value || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer info */}
      {allAuditLogs.length > 0 && (
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Mostrando {allAuditLogs.length} registro(s) de auditoría
        </div>
      )}
    </div>
  );
}
