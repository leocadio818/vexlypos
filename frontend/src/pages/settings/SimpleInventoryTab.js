import { useState, useEffect, useMemo } from 'react';
import { simpleInventoryAPI, productsAPI } from '@/lib/api';
import { Boxes, Search, RefreshCw, Download, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const ACTION_LABELS = {
  sale: 'Venta',
  cancel: 'Cancelacion',
  manual_adjustment: 'Ajuste Manual',
  restock: 'Restock',
};

function StockBadge({ qty, alertQty }) {
  const bg = qty <= 0 ? '#6b7280' : qty <= alertQty ? (qty === 1 ? '#ef4444' : '#eab308') : '#22c55e';
  return (
    <span
      className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: bg }}
      data-testid="stock-badge"
    >
      {qty}
    </span>
  );
}

export default function SimpleInventoryTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Adjust dialog
  const [adjustDialog, setAdjustDialog] = useState({ open: false, product: null, newQty: 0, reason: '' });
  const [adjustSaving, setAdjustSaving] = useState(false);
  
  // Audit log
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ product_id: '', action_type: '', start_date: '', end_date: '' });
  const [allProducts, setAllProducts] = useState([]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await simpleInventoryAPI.list();
      setProducts(res.data || []);
    } catch (err) {
      notify.error('Error cargando inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // Load all products for audit filter dropdown
    productsAPI.list().then(r => setAllProducts(r.data || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => p.name?.toLowerCase().includes(q));
  }, [products, search]);

  const handleOpenAdjust = (product) => {
    setAdjustDialog({
      open: true,
      product,
      newQty: product.simple_inventory_qty || 0,
      reason: ''
    });
  };

  const handleConfirmAdjust = async () => {
    const { product, newQty, reason } = adjustDialog;
    setAdjustSaving(true);
    try {
      await simpleInventoryAPI.adjust(product.id, { new_qty: parseInt(newQty) || 0, reason: reason || null });
      notify.success(`Stock de "${product.name}" actualizado a ${newQty}`);
      setAdjustDialog({ open: false, product: null, newQty: 0, reason: '' });
      loadProducts();
    } catch (err) {
      notify.error(err?.response?.data?.detail || 'Error ajustando stock');
    } finally {
      setAdjustSaving(false);
    }
  };

  // Audit log
  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const params = {};
      if (auditFilters.product_id) params.product_id = auditFilters.product_id;
      if (auditFilters.action_type) params.action_type = auditFilters.action_type;
      if (auditFilters.start_date) params.start_date = auditFilters.start_date;
      if (auditFilters.end_date) params.end_date = auditFilters.end_date;
      const res = await simpleInventoryAPI.auditLog(params);
      setAuditLogs(res.data || []);
    } catch {
      notify.error('Error cargando logs');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (showAudit) loadAuditLogs();
  }, [showAudit]);

  const handleExportCsv = async () => {
    try {
      const params = {};
      if (auditFilters.product_id) params.product_id = auditFilters.product_id;
      if (auditFilters.action_type) params.action_type = auditFilters.action_type;
      if (auditFilters.start_date) params.start_date = auditFilters.start_date;
      if (auditFilters.end_date) params.end_date = auditFilters.end_date;
      const res = await simpleInventoryAPI.exportCsv(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'inventario_auditoria.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      notify.success('CSV exportado');
    } catch {
      notify.error('Error exportando CSV');
    }
  };

  return (
    <div className="space-y-4" data-testid="simple-inventory-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Boxes size={18} className="text-emerald-500" />
          <h3 className="font-oswald font-bold text-lg">Inventario Simple</h3>
          <span className="text-xs text-muted-foreground">({products.length} productos)</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadProducts} data-testid="refresh-inventory-btn">
            <RefreshCw size={14} className="mr-1" /> Refrescar
          </Button>
          <Button
            variant={showAudit ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAudit(!showAudit)}
            data-testid="toggle-audit-btn"
          >
            <Filter size={14} className="mr-1" /> {showAudit ? 'Ver Stock' : 'Reporte Auditoria'}
          </Button>
        </div>
      </div>

      {!showAudit ? (
        <>
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
              data-testid="inventory-search"
            />
          </div>

          {/* Products Table */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {products.length === 0
                ? 'No hay productos con inventario simple. Activa el inventario simple desde la configuracion del producto.'
                : 'No se encontraron resultados.'}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="inventory-table">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border text-left">
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold text-center">Stock</th>
                      <th className="px-3 py-2 font-semibold text-center">Alerta</th>
                      <th className="px-3 py-2 font-semibold hidden sm:table-cell">Ultima Mod.</th>
                      <th className="px-3 py-2 font-semibold text-right">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30" data-testid={`inv-row-${p.id}`}>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-center">
                          <StockBadge qty={p.simple_inventory_qty || 0} alertQty={p.simple_inventory_alert_qty || 3} />
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{p.simple_inventory_alert_qty || 3}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                          {p.last_modified_at ? (
                            <>
                              {p.last_modified_at.slice(0, 10)} - {p.last_modified_by || ''}
                              <span className="ml-1 text-primary/60">({ACTION_LABELS[p.last_action_type] || p.last_action_type})</span>
                            </>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => handleOpenAdjust(p)} data-testid={`adjust-btn-${p.id}`}>
                            Ajustar stock
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Audit Report Section */
        <div className="space-y-3" data-testid="audit-report-section">
          {/* Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              type="date"
              value={auditFilters.start_date}
              onChange={e => setAuditFilters(f => ({ ...f, start_date: e.target.value }))}
              className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm"
              data-testid="audit-start-date"
            />
            <input
              type="date"
              value={auditFilters.end_date}
              onChange={e => setAuditFilters(f => ({ ...f, end_date: e.target.value }))}
              className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm"
              data-testid="audit-end-date"
            />
            <select
              value={auditFilters.product_id}
              onChange={e => setAuditFilters(f => ({ ...f, product_id: e.target.value }))}
              className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm"
              data-testid="audit-product-filter"
            >
              <option value="">Todos los productos</option>
              {allProducts.filter(p => p.simple_inventory_enabled).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={auditFilters.action_type}
              onChange={e => setAuditFilters(f => ({ ...f, action_type: e.target.value }))}
              className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm"
              data-testid="audit-action-filter"
            >
              <option value="">Todas las acciones</option>
              <option value="sale">Venta</option>
              <option value="cancel">Cancelacion</option>
              <option value="manual_adjustment">Ajuste Manual</option>
              <option value="restock">Restock</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={loadAuditLogs} data-testid="apply-audit-filters-btn">
              <Filter size={14} className="mr-1" /> Aplicar Filtros
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCsv} data-testid="export-csv-btn">
              <Download size={14} className="mr-1" /> Exportar CSV
            </Button>
          </div>

          {/* Audit Table */}
          {auditLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Cargando logs...</div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No hay registros para los filtros seleccionados.</div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <ScrollArea className="max-h-[400px]">
                <table className="w-full text-sm" data-testid="audit-table">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b border-border text-left">
                      <th className="px-2 py-2 font-semibold">Fecha</th>
                      <th className="px-2 py-2 font-semibold">Producto</th>
                      <th className="px-2 py-2 font-semibold">Usuario</th>
                      <th className="px-2 py-2 font-semibold">Tipo</th>
                      <th className="px-2 py-2 font-semibold text-center">Antes</th>
                      <th className="px-2 py-2 font-semibold text-center">Despues</th>
                      <th className="px-2 py-2 font-semibold text-center">Cambio</th>
                      <th className="px-2 py-2 font-semibold hidden sm:table-cell">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30" data-testid={`audit-row-${log.id}`}>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                          {log.created_at?.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{log.product_name}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{log.user_name}</td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                            log.action_type === 'sale' ? 'bg-blue-500/20 text-blue-400' :
                            log.action_type === 'cancel' ? 'bg-orange-500/20 text-orange-400' :
                            log.action_type === 'restock' ? 'bg-green-500/20 text-green-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {ACTION_LABELS[log.action_type] || log.action_type}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center">{log.qty_before}</td>
                        <td className="px-2 py-1.5 text-center">{log.qty_after}</td>
                        <td className="px-2 py-1.5 text-center font-bold">
                          <span className={log.qty_change > 0 ? 'text-green-400' : log.qty_change < 0 ? 'text-red-400' : ''}>
                            {log.qty_change > 0 ? '+' : ''}{log.qty_change}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground hidden sm:table-cell">{log.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
        </div>
      )}

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={v => !v && setAdjustDialog(d => ({ ...d, open: false }))}>
        <DialogContent className="max-w-sm" data-testid="adjust-stock-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald">Ajustar Stock</DialogTitle>
          </DialogHeader>
          {adjustDialog.product && (
            <div className="space-y-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Producto:</span>{' '}
                <span className="font-semibold">{adjustDialog.product.name}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Stock actual:</span>{' '}
                <StockBadge qty={adjustDialog.product.simple_inventory_qty || 0} alertQty={adjustDialog.product.simple_inventory_alert_qty || 3} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nueva cantidad</label>
                <input
                  type="number"
                  min="0"
                  value={adjustDialog.newQty}
                  onChange={e => setAdjustDialog(d => ({ ...d, newQty: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                  data-testid="adjust-new-qty"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Motivo (opcional)</label>
                <input
                  value={adjustDialog.reason}
                  onChange={e => setAdjustDialog(d => ({ ...d, reason: e.target.value }))}
                  placeholder="Ej: Restock semanal, Conteo fisico..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
                  data-testid="adjust-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(d => ({ ...d, open: false }))}>Cancelar</Button>
            <Button onClick={handleConfirmAdjust} disabled={adjustSaving} data-testid="confirm-adjust-btn">
              {adjustSaving ? 'Guardando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
