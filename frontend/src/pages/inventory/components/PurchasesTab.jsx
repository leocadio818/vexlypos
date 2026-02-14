import { useState, useMemo } from 'react';
import { 
  FileText, Plus, Pencil, Trash2, Check, X, Save, AlertCircle, ArrowLeftRight, Package,
  Calendar, Download, Filter, TrendingUp, Building2, BarChart3, List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { purchaseOrdersAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts';

const PO_STATUS = {
  draft: { label: 'Borrador', color: 'bg-gray-500' },
  pending: { label: 'Pendiente', color: 'bg-yellow-500' },
  partial: { label: 'Parcial', color: 'bg-blue-500' },
  received: { label: 'Recibida', color: 'bg-green-500' },
  cancelled: { label: 'Cancelada', color: 'bg-red-500' },
};

// Date helpers
const getToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getStartOfWeek = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getStartOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDateInput = (date) => {
  if (!date) return '';
  return date.toISOString().split('T')[0];
};

export default function PurchasesTab({ 
  purchaseOrders,
  suppliers,
  warehouses,
  ingredients,
  onRefreshAll
}) {
  const [poStatusFilter, setPOStatusFilter] = useState('');
  const [poDialog, setPODialog] = useState({ open: false, data: null });
  const [receiveDialog, setReceiveDialog] = useState({ open: false, po: null });
  
  // Date filters - default to today
  const [dateRange, setDateRange] = useState({
    start: getToday(),
    end: new Date()
  });
  const [activePeriod, setActivePeriod] = useState('today');
  
  // Supplier filter
  const [supplierFilter, setSupplierFilter] = useState('');

  // Apply quick period filter
  const applyPeriod = (period) => {
    setActivePeriod(period);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (period) {
      case 'today':
        setDateRange({ start: getToday(), end: today });
        break;
      case 'yesterday':
        const yesterdayEnd = getYesterday();
        yesterdayEnd.setHours(23, 59, 59, 999);
        setDateRange({ start: getYesterday(), end: yesterdayEnd });
        break;
      case 'week':
        setDateRange({ start: getStartOfWeek(), end: today });
        break;
      case 'month':
        setDateRange({ start: getStartOfMonth(), end: today });
        break;
      case 'all':
        setDateRange({ start: null, end: null });
        break;
      default:
        break;
    }
  };

  // Handle custom date change
  const handleDateChange = (field, value) => {
    setActivePeriod('custom');
    const date = value ? new Date(value + 'T00:00:00') : null;
    if (field === 'end' && date) {
      date.setHours(23, 59, 59, 999);
    }
    setDateRange(prev => ({ ...prev, [field]: date }));
  };

  // Filter POs by status, date range, and supplier
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      // Status filter
      if (poStatusFilter && po.status !== poStatusFilter) return false;
      
      // Supplier filter
      if (supplierFilter && po.supplier_id !== supplierFilter) return false;
      
      // Date filter
      if (dateRange.start || dateRange.end) {
        const poDate = new Date(po.created_at);
        if (dateRange.start && poDate < dateRange.start) return false;
        if (dateRange.end && poDate > dateRange.end) return false;
      }
      
      return true;
    });
  }, [purchaseOrders, poStatusFilter, supplierFilter, dateRange]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const total = filteredPOs.reduce((sum, po) => sum + (po.actual_total || po.total || 0), 0);
    const bySupplier = {};
    
    filteredPOs.forEach(po => {
      const supplierId = po.supplier_id || 'unknown';
      const supplierName = po.supplier_name || 'Sin proveedor';
      if (!bySupplier[supplierId]) {
        bySupplier[supplierId] = { name: supplierName, total: 0, count: 0 };
      }
      bySupplier[supplierId].total += po.actual_total || po.total || 0;
      bySupplier[supplierId].count++;
    });
    
    const byStatus = {};
    filteredPOs.forEach(po => {
      byStatus[po.status] = (byStatus[po.status] || 0) + 1;
    });
    
    return { total, bySupplier, byStatus, count: filteredPOs.length };
  }, [filteredPOs]);

  // Export to Excel
  const handleExport = () => {
    if (filteredPOs.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    
    const data = filteredPOs.map(po => ({
      'Fecha': new Date(po.created_at).toLocaleDateString(),
      'Proveedor': po.supplier_name,
      'Estado': PO_STATUS[po.status]?.label || po.status,
      'Items': po.items?.length || 0,
      'Total Estimado': po.total,
      'Total Real': po.actual_total || '',
      'Notas': po.notes || ''
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Órdenes de Compra');
    
    const dateStr = activePeriod === 'custom' 
      ? `${formatDateInput(dateRange.start)}_${formatDateInput(dateRange.end)}`
      : activePeriod;
    XLSX.writeFile(wb, `ordenes_compra_${dateStr}.xlsx`);
    toast.success('Archivo exportado');
  };

  // Get ingredients filtered by selected supplier
  const filteredIngredients = useMemo(() => {
    const supplierId = poDialog.data?.supplier_id;
    if (!supplierId) return [];
    
    return ingredients.filter(ing => ing.default_supplier_id === supplierId);
  }, [poDialog.data?.supplier_id, ingredients]);

  // Get unit label helper
  const getUnitLabel = (unitValue) => {
    const UNITS = [
      { value: 'unidad', label: 'Unidad' },
      { value: 'kg', label: 'Kilogramo' },
      { value: 'g', label: 'Gramo' },
      { value: 'lb', label: 'Libra' },
      { value: 'oz', label: 'Onza' },
      { value: 'lt', label: 'Litro' },
      { value: 'ml', label: 'Mililitro' },
      { value: 'gal', label: 'Galón' },
      { value: 'botella', label: 'Botella' },
      { value: 'caja', label: 'Caja' },
      { value: 'paquete', label: 'Paquete' },
    ];
    return UNITS.find(u => u.value === unitValue)?.label || unitValue || 'Unidad';
  };

  // ─── PURCHASE ORDER HANDLERS ───
  const handleSavePO = async () => {
    const d = poDialog.data;
    if (!d?.supplier_id) { toast.error('Proveedor requerido'); return; }
    if (!d?.warehouse_id) { toast.error('Almacén requerido'); return; }
    if (!d?.items?.length) { toast.error('Agrega items'); return; }
    try {
      if (d.id) {
        await purchaseOrdersAPI.update(d.id, d);
        toast.success('Orden actualizada');
      } else {
        await purchaseOrdersAPI.create(d);
        toast.success('Orden creada');
      }
      setPODialog({ open: false, data: null });
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleReceivePO = async () => {
    const po = receiveDialog.po;
    const items = receiveDialog.items || [];
    if (!items.some(i => i.received_quantity > 0)) {
      toast.error('Ingresa cantidades recibidas');
      return;
    }
    try {
      await purchaseOrdersAPI.receive(po.id, {
        warehouse_id: po.warehouse_id,
        items: items.filter(i => i.received_quantity > 0).map(i => ({
          ingredient_id: i.ingredient_id,
          received_quantity: parseFloat(i.received_quantity) || 0,
          actual_unit_price: parseFloat(i.actual_unit_price) || 0,
        })),
        notes: receiveDialog.notes || '',
      });
      toast.success('Mercancía recibida');
      setReceiveDialog({ open: false, po: null });
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleUpdatePOStatus = async (poId, status) => {
    try {
      await purchaseOrdersAPI.updateStatus(poId, status);
      toast.success('Estado actualizado');
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeletePO = async (id) => {
    if (!window.confirm('¿Eliminar orden?')) return;
    try {
      await purchaseOrdersAPI.delete(id);
      toast.success('Orden eliminada');
      onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div data-testid="purchases-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-lg font-bold">Órdenes de Compra</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={handleExport}
            disabled={filteredPOs.length === 0}
            data-testid="export-btn"
          >
            <Download size={14} className="mr-1" /> Exportar
          </Button>
          <Button 
            onClick={() => setPODialog({ open: true, data: { supplier_id: '', warehouse_id: '', items: [], notes: '', expected_date: '' } })}
            className="bg-primary text-primary-foreground font-oswald"
            data-testid="add-po-btn"
          >
            <Plus size={16} className="mr-1" /> Nueva Orden
          </Button>
        </div>
      </div>

      {/* ─── SUMMARY CARDS ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
          <div className="text-xs text-cyan-400 flex items-center gap-1 mb-1">
            <TrendingUp size={12} /> Total en Rango
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300">{formatMoney(summaryStats.total)}</div>
          <div className="text-xs text-muted-foreground">{summaryStats.count} orden(es)</div>
        </div>
        
        {supplierFilter && summaryStats.bySupplier[supplierFilter] && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
            <div className="text-xs text-purple-400 flex items-center gap-1 mb-1">
              <Building2 size={12} /> {summaryStats.bySupplier[supplierFilter].name}
            </div>
            <div className="text-2xl font-bold font-mono text-purple-300">
              {formatMoney(summaryStats.bySupplier[supplierFilter].total)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summaryStats.bySupplier[supplierFilter].count} orden(es)
            </div>
          </div>
        )}
        
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="text-xs text-muted-foreground mb-1">Por Estado</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(summaryStats.byStatus).map(([status, count]) => (
              <Badge key={status} className={`${PO_STATUS[status]?.color} text-white text-[10px]`}>
                {PO_STATUS[status]?.label}: {count}
              </Badge>
            ))}
            {Object.keys(summaryStats.byStatus).length === 0 && (
              <span className="text-xs text-muted-foreground">Sin órdenes</span>
            )}
          </div>
        </div>
        
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="text-xs text-muted-foreground mb-1">Periodo</div>
          <div className="text-sm font-medium">
            {activePeriod === 'today' && 'Hoy'}
            {activePeriod === 'yesterday' && 'Ayer'}
            {activePeriod === 'week' && 'Esta Semana'}
            {activePeriod === 'month' && 'Este Mes'}
            {activePeriod === 'all' && 'Todo el Historial'}
            {activePeriod === 'custom' && 'Personalizado'}
          </div>
          {dateRange.start && (
            <div className="text-xs text-muted-foreground">
              {dateRange.start.toLocaleDateString()} - {dateRange.end?.toLocaleDateString() || 'Hoy'}
            </div>
          )}
        </div>
      </div>

      {/* ─── ADVANCED FILTERS ─── */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border mb-4 space-y-3">
        {/* Quick Period Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar size={12} /> Periodo:
          </span>
          {[
            { id: 'today', label: 'Hoy' },
            { id: 'yesterday', label: 'Ayer' },
            { id: 'week', label: 'Esta Semana' },
            { id: 'month', label: 'Mes Actual' },
            { id: 'all', label: 'Todo' },
          ].map(period => (
            <Button
              key={period.id}
              variant={activePeriod === period.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPeriod(period.id)}
              className="h-7 text-xs"
              data-testid={`period-${period.id}`}
            >
              {period.label}
            </Button>
          ))}
        </div>

        {/* Date Range Picker + Status + Supplier Filters */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Custom Date Range */}
          <div className="flex items-center gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Desde</label>
              <input
                type="date"
                value={formatDateInput(dateRange.start)}
                onChange={e => handleDateChange('start', e.target.value)}
                className="block mt-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                data-testid="date-start"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hasta</label>
              <input
                type="date"
                value={formatDateInput(dateRange.end)}
                onChange={e => handleDateChange('end', e.target.value)}
                className="block mt-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                data-testid="date-end"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-xs text-muted-foreground">Estado</label>
            <select
              value={poStatusFilter}
              onChange={e => setPOStatusFilter(e.target.value)}
              className="block mt-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm min-w-[140px]"
              data-testid="po-status-filter"
            >
              <option value="">Todos los estados</option>
              {Object.entries(PO_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Supplier Filter */}
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 size={10} /> Proveedor
            </label>
            <select
              value={supplierFilter}
              onChange={e => setSupplierFilter(e.target.value)}
              className="block mt-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm min-w-[180px]"
              data-testid="supplier-filter"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.filter(s => s.active !== false).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {(poStatusFilter || supplierFilter || activePeriod === 'custom') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPOStatusFilter('');
                setSupplierFilter('');
                applyPeriod('today');
              }}
              className="h-8 text-xs"
            >
              <X size={12} className="mr-1" /> Limpiar filtros
            </Button>
          )}
        </div>

        {/* Active Filters Summary */}
        {(supplierFilter || poStatusFilter) && (
          <div className="flex items-center gap-2 text-xs">
            <Filter size={12} className="text-muted-foreground" />
            <span className="text-muted-foreground">Filtros activos:</span>
            {supplierFilter && (
              <Badge variant="outline" className="text-xs">
                Proveedor: {suppliers.find(s => s.id === supplierFilter)?.name}
              </Badge>
            )}
            {poStatusFilter && (
              <Badge variant="outline" className="text-xs">
                Estado: {PO_STATUS[poStatusFilter]?.label}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* PO list */}
      <div className="space-y-3">
        {filteredPOs.map(po => {
          const status = PO_STATUS[po.status] || PO_STATUS.draft;
          return (
            <div 
              key={po.id} 
              className="p-4 rounded-xl border border-border bg-card"
              data-testid={`po-${po.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-oswald font-bold">{po.supplier_name}</h3>
                    <Badge className={`${status.color} text-white text-[9px]`}>{status.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(po.created_at).toLocaleDateString()} • {po.items?.length} items • 
                    Total: {formatMoney(po.total)}
                    {po.actual_total && po.actual_total !== po.total && (
                      <span className="text-primary ml-1">Real: {formatMoney(po.actual_total)}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {po.status === 'draft' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleUpdatePOStatus(po.id, 'pending')}
                    >
                      Enviar
                    </Button>
                  )}
                  {['pending', 'partial'].includes(po.status) && (
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => setReceiveDialog({ 
                        open: true, 
                        po, 
                        items: po.items.map(i => ({ 
                          ...i, 
                          received_quantity: 0,
                          actual_unit_price: i.unit_price 
                        })),
                        notes: ''
                      })}
                    >
                      Recibir
                    </Button>
                  )}
                  {po.status === 'draft' && (
                    <>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => setPODialog({ open: true, data: { ...po } })}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDeletePO(po.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Items */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {po.items?.map((item, idx) => (
                  <div key={idx} className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm">
                    <div className="font-medium truncate">{item.ingredient_name}</div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>{item.quantity} × {formatMoney(item.unit_price)}</span>
                      {item.received_quantity > 0 && (
                        <span className="text-green-500">✓ {item.received_quantity}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {filteredPOs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay órdenes de compra</p>
          </div>
        )}
      </div>

      {/* Purchase Order Dialog */}
      <Dialog open={poDialog.open} onOpenChange={(o) => !o && setPODialog({ open: false, data: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{poDialog.data?.id ? 'Editar' : 'Nueva'} Orden de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Proveedor *</label>
                <select
                  value={poDialog.data?.supplier_id || ''}
                  onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, supplier_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="po-supplier-select"
                >
                  <option value="">Seleccionar...</option>
                  {suppliers.filter(s => s.active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Almacén destino *</label>
                <select
                  value={poDialog.data?.warehouse_id || ''}
                  onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, warehouse_id: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="po-warehouse-select"
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Items</label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (!poDialog.data?.supplier_id) {
                      toast.error('Primero selecciona un proveedor');
                      return;
                    }
                    setPODialog(p => ({
                      ...p,
                      data: {
                        ...p.data,
                        items: [...(p.data?.items || []), { 
                          ingredient_id: '', 
                          ingredient_name: '', 
                          quantity: 1, 
                          unit_price: 0,
                          purchase_unit: '',
                          dispatch_unit: '',
                          conversion_factor: 1
                        }]
                      }
                    }));
                  }}
                  disabled={!poDialog.data?.supplier_id}
                  data-testid="add-po-item-btn"
                >
                  <Plus size={14} className="mr-1" /> Agregar
                </Button>
              </div>
              
              {/* Supplier filter notice */}
              {poDialog.data?.supplier_id && filteredIngredients.length === 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-500">
                      No hay insumos asignados a este proveedor. Configura el "Proveedor Predeterminado" en la ficha de cada insumo.
                    </p>
                  </div>
                </div>
              )}
              
              {!poDialog.data?.supplier_id && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-400">
                      Selecciona un proveedor para ver los insumos disponibles.
                    </p>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                {(poDialog.data?.items || []).map((item, idx) => {
                  const selectedIng = ingredients.find(i => i.id === item.ingredient_id);
                  return (
                    <div key={idx} className="p-3 rounded-lg bg-background border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          value={item.ingredient_id}
                          onChange={e => {
                            const ing = ingredients.find(i => i.id === e.target.value);
                            setPODialog(p => ({
                              ...p,
                              data: {
                                ...p.data,
                                items: p.data.items.map((i, j) => j === idx ? { 
                                  ...i, 
                                  ingredient_id: e.target.value,
                                  ingredient_name: ing?.name || '',
                                  unit_price: ing?.avg_cost || 0,
                                  purchase_unit: ing?.purchase_unit || ing?.unit || 'unidad',
                                  dispatch_unit: ing?.unit || 'unidad',
                                  conversion_factor: ing?.conversion_factor || 1
                                } : i)
                              }
                            }));
                          }}
                          className="flex-1 px-2 py-1.5 bg-card border border-border rounded text-sm"
                        >
                          <option value="">Seleccionar insumo...</option>
                          {filteredIngredients.map(i => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({getUnitLabel(i.purchase_unit || i.unit)})
                            </option>
                          ))}
                        </select>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => {
                            setPODialog(p => ({
                              ...p,
                              data: {
                                ...p.data,
                                items: p.data.items.filter((_, j) => j !== idx)
                              }
                            }));
                          }}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">Cantidad ({getUnitLabel(item.purchase_unit || selectedIng?.purchase_unit)})</label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={e => {
                              setPODialog(p => ({
                                ...p,
                                data: {
                                  ...p.data,
                                  items: p.data.items.map((i, j) => j === idx ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i)
                                }
                              }));
                            }}
                            className="w-full px-2 py-1.5 bg-card border border-border rounded text-sm"
                            placeholder="Cant."
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">Precio por {getUnitLabel(item.purchase_unit || selectedIng?.purchase_unit)}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={e => {
                              setPODialog(p => ({
                                ...p,
                                data: {
                                  ...p.data,
                                  items: p.data.items.map((i, j) => j === idx ? { ...i, unit_price: parseFloat(e.target.value) || 0 } : i)
                                }
                              }));
                            }}
                            className="w-full px-2 py-1.5 bg-card border border-border rounded text-sm"
                            placeholder="Precio"
                          />
                        </div>
                        <div className="text-right min-w-[80px]">
                          <label className="text-[10px] text-muted-foreground">Subtotal</label>
                          <div className="font-oswald font-bold text-primary">
                            {formatMoney((item.quantity || 0) * (item.unit_price || 0))}
                          </div>
                        </div>
                      </div>
                      
                      {/* Conversion info */}
                      {selectedIng && selectedIng.conversion_factor > 1 && item.quantity > 0 && (
                        <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                          <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <ArrowLeftRight size={10} />
                            <span>
                              Al recibir: {item.quantity} {getUnitLabel(item.purchase_unit)} = {' '}
                              <span className="font-bold">
                                {(item.quantity * (item.conversion_factor || selectedIng.conversion_factor || 1)).toFixed(2)} {getUnitLabel(selectedIng.unit)}
                              </span>
                              {' '}en inventario
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {poDialog.data?.items?.length > 0 && (
                <div className="text-right mt-3 p-2 rounded-lg bg-primary/10 border border-primary/30">
                  <span className="text-sm text-muted-foreground mr-2">Total Orden:</span>
                  <span className="font-oswald font-bold text-lg text-primary">
                    {formatMoney((poDialog.data?.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0))}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Notas</label>
              <textarea
                value={poDialog.data?.notes || ''}
                onChange={e => setPODialog(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
              />
            </div>

            <Button onClick={handleSavePO} className="w-full bg-primary text-primary-foreground font-oswald" data-testid="save-po-btn">
              <Save size={16} className="mr-1" /> Guardar Orden
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive PO Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(o) => !o && setReceiveDialog({ open: false, po: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">Recibir Mercancía</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="font-semibold">{receiveDialog.po?.supplier_name}</div>
              <div className="text-sm text-muted-foreground">
                Almacén: {warehouses.find(w => w.id === receiveDialog.po?.warehouse_id)?.name}
              </div>
            </div>

            <div className="space-y-2">
              {(receiveDialog.items || []).map((item, idx) => {
                const ing = ingredients.find(i => i.id === item.ingredient_id);
                const pending = item.quantity - (item.received_quantity || 0);
                const conversionFactor = ing?.conversion_factor || 1;
                const purchaseUnit = ing?.purchase_unit || ing?.unit || 'unidad';
                const dispatchUnit = ing?.unit || 'unidad';
                const receivedInDispatchUnits = (receiveDialog.items[idx]?.received_quantity || 0) * conversionFactor;
                
                return (
                  <div key={idx} className="p-3 rounded-lg bg-background border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium">{item.ingredient_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({getUnitLabel(purchaseUnit)})
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Pedido: {item.quantity} {getUnitLabel(purchaseUnit)} | Pendiente: {pending}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Cantidad recibida ({getUnitLabel(purchaseUnit)})</label>
                        <input
                          type="number"
                          value={receiveDialog.items[idx]?.received_quantity || ''}
                          onChange={e => {
                            const items = [...receiveDialog.items];
                            items[idx] = { ...items[idx], received_quantity: parseFloat(e.target.value) || 0 };
                            setReceiveDialog(p => ({ ...p, items }));
                          }}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                          placeholder={`Max: ${pending}`}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Precio real (por {getUnitLabel(purchaseUnit)})</label>
                        <input
                          type="number"
                          step="0.01"
                          value={receiveDialog.items[idx]?.actual_unit_price || ''}
                          onChange={e => {
                            const items = [...receiveDialog.items];
                            items[idx] = { ...items[idx], actual_unit_price: parseFloat(e.target.value) || 0 };
                            setReceiveDialog(p => ({ ...p, items }));
                          }}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                          placeholder={item.unit_price}
                        />
                      </div>
                    </div>
                    
                    {/* Conversion preview */}
                    {conversionFactor > 1 && receiveDialog.items[idx]?.received_quantity > 0 && (
                      <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center gap-2 text-xs text-emerald-400">
                          <Package size={12} />
                          <span>
                            Se agregarán <span className="font-bold">{receivedInDispatchUnits.toFixed(2)} {getUnitLabel(dispatchUnit)}</span> al inventario
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Cálculo: {receiveDialog.items[idx]?.received_quantity} {getUnitLabel(purchaseUnit)} × {conversionFactor} = {receivedInDispatchUnits.toFixed(2)} {getUnitLabel(dispatchUnit)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <label className="text-sm font-medium">Notas de recepción</label>
              <textarea
                value={receiveDialog.notes || ''}
                onChange={e => setReceiveDialog(p => ({ ...p, notes: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
                placeholder="Observaciones..."
              />
            </div>

            <Button onClick={handleReceivePO} className="w-full bg-green-600 hover:bg-green-700 text-white font-oswald" data-testid="confirm-receive-btn">
              <Check size={16} className="mr-1" /> Confirmar Recepción
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
