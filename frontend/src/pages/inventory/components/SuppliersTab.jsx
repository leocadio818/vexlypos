import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { 
  Truck, Plus, Pencil, Trash2, Save, Search, X, Package, Wine, Cigarette, 
  UtensilsCrossed, Box, ShoppingCart, BarChart3, List, TrendingUp, 
  AlertTriangle, DollarSign, Users, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { suppliersAPI, formatMoney } from '@/lib/api';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Category configuration
const CATEGORIES = [
  { id: 'all', label: 'Todos', icon: Package, color: 'bg-muted' },
  { id: 'licores', label: 'Licores', icon: Wine, color: 'bg-purple-600' },
  { id: 'tabaco', label: 'Tabaco', icon: Cigarette, color: 'bg-amber-600' },
  { id: 'alimentos', label: 'Alimentos', icon: UtensilsCrossed, color: 'bg-green-600' },
  { id: 'general', label: 'Generales', icon: Box, color: 'bg-blue-600' },
];

// Chart colors
const CHART_COLORS = ['#FF6B35', '#7C3AED', '#059669', '#0EA5E9', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6'];

export default function SuppliersTab({ 
  suppliers: initialSuppliers, 
  onRefreshAll 
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers || []);
  const [supplierDialog, setSupplierDialog] = useState({ open: false, data: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'dashboard'
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Fetch suppliers with active orders count
  useEffect(() => {
    const fetchSuppliersWithOrders = async () => {
      try {
        const res = await axios.get(`${API}/suppliers/with-active-orders`, { headers: headers() });
        setSuppliers(res.data);
      } catch (e) {
        if (initialSuppliers) {
          setSuppliers(initialSuppliers);
        }
      }
    };
    fetchSuppliersWithOrders();
  }, [initialSuppliers]);

  // Fetch analytics when switching to dashboard view
  useEffect(() => {
    if (viewMode === 'dashboard' && !analytics) {
      fetchAnalytics();
    }
  }, [viewMode]);

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await axios.get(`${API}/suppliers/analytics`, { headers: headers() });
      setAnalytics(res.data);
    } catch (e) {
      toast.error('Error al cargar analíticas');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Filter suppliers based on search query and category
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      if (s.active === false) return false;
      
      if (activeCategory !== 'all') {
        const supplierCategory = s.category || 'general';
        if (supplierCategory !== activeCategory) return false;
      }
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = (s.name || '').toLowerCase().includes(query);
        const matchesContact = (s.contact_name || '').toLowerCase().includes(query);
        const matchesRNC = (s.rnc || '').toLowerCase().includes(query);
        if (!matchesName && !matchesContact && !matchesRNC) return false;
      }
      
      return true;
    });
  }, [suppliers, searchQuery, activeCategory]);

  // Stats for header
  const stats = useMemo(() => {
    const activeSuppliers = suppliers.filter(s => s.active !== false);
    return {
      total: activeSuppliers.length,
      filtered: filteredSuppliers.length,
      withActiveOrders: activeSuppliers.filter(s => (s.active_orders || 0) > 0).length,
      totalActiveOrders: activeSuppliers.reduce((sum, s) => sum + (s.active_orders || 0), 0)
    };
  }, [suppliers, filteredSuppliers]);

  // ─── SUPPLIER HANDLERS ───
  const handleSaveSupplier = async () => {
    const d = supplierDialog.data;
    if (!d?.name?.trim()) { 
      toast.error('Nombre requerido'); 
      return; 
    }
    try {
      if (d.id) {
        await suppliersAPI.update(d.id, d);
        toast.success('Proveedor actualizado');
      } else {
        await suppliersAPI.create(d);
        toast.success('Proveedor creado');
      }
      setSupplierDialog({ open: false, data: null });
      onRefreshAll?.();
      const res = await axios.get(`${API}/suppliers/with-active-orders`, { headers: headers() });
      setSuppliers(res.data);
      // Refresh analytics if in dashboard mode
      if (viewMode === 'dashboard') {
        fetchAnalytics();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('¿Eliminar proveedor?')) return;
    try {
      await suppliersAPI.delete(id);
      toast.success('Proveedor eliminado');
      onRefreshAll?.();
      const res = await axios.get(`${API}/suppliers/with-active-orders`, { headers: headers() });
      setSuppliers(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const openEditDialog = (supplier) => {
    setSupplierDialog({ 
      open: true, 
      data: { 
        ...supplier,
        category: supplier.category || 'general'
      } 
    });
  };

  const getCategoryConfig = (categoryId) => {
    return CATEGORIES.find(c => c.id === categoryId) || CATEGORIES.find(c => c.id === 'general');
  };

  // ─── DASHBOARD VIEW ───
  const renderDashboard = () => {
    if (loadingAnalytics) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      );
    }

    if (!analytics) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay datos de analíticas disponibles</p>
        </div>
      );
    }

    const { summary, top_suppliers, inactive_suppliers, monthly_spending, spending_by_supplier } = analytics;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                <DollarSign size={20} className="text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Gastado</p>
                <p className="font-oswald text-lg font-bold text-green-500">{formatMoney(summary.total_spent)}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                <ShoppingCart size={20} className="text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Promedio por Orden</p>
                <p className="font-oswald text-lg font-bold text-blue-500">{formatMoney(summary.avg_per_order)}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                <Users size={20} className="text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Proveedores Activos</p>
                <p className="font-oswald text-lg font-bold text-purple-500">
                  {summary.active_suppliers} <span className="text-xs text-muted-foreground font-normal">de {summary.total_suppliers}</span>
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <TrendingUp size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Más Usado</p>
                <p className="font-oswald text-sm font-bold text-primary truncate">
                  {summary.most_used_supplier || 'N/A'}
                </p>
                <p className="text-[10px] text-muted-foreground">{summary.most_used_count} órdenes</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly Spending Area Chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-oswald text-sm font-bold mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-primary" />
              Gasto Mensual por Proveedor
            </h3>
            {monthly_spending.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={monthly_spending}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#888" 
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickFormatter={(v) => {
                      const [y, m] = v.split('-');
                      return `${m}/${y.slice(2)}`;
                    }}
                  />
                  <YAxis 
                    stroke="#888" 
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }}
                    formatter={(value) => formatMoney(value)}
                  />
                  <Legend />
                  {spending_by_supplier.slice(0, 5).map((supplier, i) => (
                    <Area 
                      key={supplier.name}
                      type="monotone" 
                      dataKey={supplier.name} 
                      stackId="1"
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.6}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No hay datos de gastos mensuales
              </div>
            )}
          </div>

          {/* Top Suppliers Bar Chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-oswald text-sm font-bold mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-primary" />
              Top 5 Proveedores por Gasto
            </h3>
            {top_suppliers.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={top_suppliers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis 
                    type="number" 
                    stroke="#888" 
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                  />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#888" 
                    tick={{ fill: '#888', fontSize: 10 }}
                    width={100}
                  />
                  <Tooltip 
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }}
                    formatter={(value) => formatMoney(value)}
                  />
                  <Bar dataKey="total" fill="#FF6B35" radius={[0, 4, 4, 0]}>
                    {top_suppliers.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No hay datos de proveedores
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Spending Table + Inactive Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Spending by Supplier Table */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
            <h3 className="font-oswald text-sm font-bold mb-4 flex items-center gap-2">
              <DollarSign size={16} className="text-primary" />
              Gasto por Proveedor
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Proveedor</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Total</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">% del Total</th>
                  </tr>
                </thead>
                <tbody>
                  {spending_by_supplier.map((supplier, i) => {
                    const percentage = summary.total_spent > 0 
                      ? ((supplier.total / summary.total_spent) * 100).toFixed(1) 
                      : 0;
                    return (
                      <tr key={supplier.supplier_id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          {supplier.name}
                        </td>
                        <td className="py-2 text-right font-oswald">{formatMoney(supplier.total)}</td>
                        <td className="py-2 text-right text-muted-foreground">{percentage}%</td>
                      </tr>
                    );
                  })}
                  {spending_by_supplier.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-muted-foreground">
                        No hay datos de gastos
                      </td>
                    </tr>
                  )}
                </tbody>
                {spending_by_supplier.length > 0 && (
                  <tfoot>
                    <tr className="font-bold">
                      <td className="py-2">Total</td>
                      <td className="py-2 text-right font-oswald text-primary">{formatMoney(summary.total_spent)}</td>
                      <td className="py-2 text-right">100%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Inactive Suppliers Alert */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-oswald text-sm font-bold mb-4 flex items-center gap-2">
              <AlertTriangle size={16} className="text-yellow-500" />
              Proveedores Inactivos
              {inactive_suppliers.length > 0 && (
                <Badge variant="secondary" className="ml-auto bg-yellow-600/20 text-yellow-500">
                  {inactive_suppliers.length}
                </Badge>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">Sin órdenes en los últimos 30 días</p>
            
            {inactive_suppliers.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {inactive_suppliers.map(supplier => {
                  const catConfig = getCategoryConfig(supplier.category);
                  return (
                    <div 
                      key={supplier.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-yellow-600/10 border border-yellow-600/20"
                    >
                      <span className="text-sm truncate">{supplier.name}</span>
                      <Badge className={`${catConfig.color} text-white text-[9px]`}>
                        {catConfig.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <TrendingUp size={24} className="mx-auto mb-2 text-green-500" />
                <p className="text-sm">¡Todos los proveedores están activos!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── LIST VIEW ───
  const renderListView = () => (
    <>
      {/* Search and Filters */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, contacto o RNC..."
              className="w-full pl-9 pr-9 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              data-testid="supplier-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="clear-search-btn"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <Button 
            onClick={() => setSupplierDialog({ 
              open: true, 
              data: { name: '', contact_name: '', phone: '', email: '', address: '', rnc: '', category: 'general' } 
            })}
            className="bg-primary text-primary-foreground font-oswald shrink-0"
            data-testid="add-supplier-btn"
          >
            <Plus size={16} className="mr-1" /> Nuevo Proveedor
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <Button
                key={cat.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
                className={`font-oswald text-xs ${isActive ? cat.color + ' text-white border-transparent' : ''}`}
                data-testid={`filter-${cat.id}`}
              >
                <Icon size={14} className="mr-1.5" />
                {cat.label}
              </Button>
            );
          })}
          
          <div className="ml-auto flex items-center gap-2">
            {stats.totalActiveOrders > 0 && (
              <Badge variant="secondary" className="font-oswald text-xs">
                <ShoppingCart size={12} className="mr-1" />
                {stats.totalActiveOrders} OC activas
              </Badge>
            )}
            <Badge variant="outline" className="font-oswald text-xs">
              {filteredSuppliers.length} de {stats.total} proveedores
            </Badge>
          </div>
        </div>
      </div>

      {/* Suppliers List */}
      <div className="space-y-2">
        {filteredSuppliers.map(sup => {
          const catConfig = getCategoryConfig(sup.category || 'general');
          const CatIcon = catConfig.icon;
          
          return (
            <div 
              key={sup.id} 
              className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
              data-testid={`supplier-${sup.id}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-12 h-12 rounded-lg ${catConfig.color} flex items-center justify-center shrink-0`}>
                  <CatIcon size={20} className="text-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => openEditDialog(sup)}
                    className="font-semibold text-left hover:text-primary transition-colors cursor-pointer"
                    data-testid={`supplier-name-${sup.id}`}
                  >
                    {sup.name}
                  </button>
                  
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    {sup.contact_name && <span>{sup.contact_name}</span>}
                    {sup.phone && <span>• {sup.phone}</span>}
                    {sup.rnc && <span>• RNC: {sup.rnc}</span>}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                {(sup.active_orders || 0) > 0 && (
                  <Badge 
                    className="bg-blue-600 text-white font-oswald text-[10px] px-2"
                    data-testid={`active-orders-${sup.id}`}
                  >
                    <ShoppingCart size={10} className="mr-1" />
                    {sup.active_orders} OC
                  </Badge>
                )}
                
                <Badge 
                  variant="secondary" 
                  className={`${catConfig.color} text-white text-[10px] px-2`}
                >
                  {catConfig.label}
                </Badge>
                
                <div className="flex gap-1 ml-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => openEditDialog(sup)}
                    data-testid={`edit-supplier-${sup.id}`}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDeleteSupplier(sup.id)}
                    data-testid={`delete-supplier-${sup.id}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        
        {filteredSuppliers.length === 0 && suppliers.length > 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p>No se encontraron proveedores</p>
            <p className="text-xs mt-1">Intenta con otro término de búsqueda o categoría</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
            >
              Limpiar filtros
            </Button>
          </div>
        )}
        
        {suppliers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay proveedores</p>
            <p className="text-xs mt-1">Agrega tu primer proveedor para empezar</p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div data-testid="suppliers-tab">
      {/* Header with View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-lg font-bold">Proveedores</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={`font-oswald text-xs ${viewMode === 'list' ? 'bg-primary text-white' : ''}`}
              data-testid="view-list-btn"
            >
              <List size={14} className="mr-1" /> Lista
            </Button>
            <Button
              variant={viewMode === 'dashboard' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('dashboard')}
              className={`font-oswald text-xs ${viewMode === 'dashboard' ? 'bg-primary text-white' : ''}`}
              data-testid="view-dashboard-btn"
            >
              <BarChart3 size={14} className="mr-1" /> Dashboard
            </Button>
          </div>
          {viewMode === 'dashboard' && (
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAnalytics}
              className="font-oswald text-xs"
              data-testid="refresh-analytics-btn"
            >
              Actualizar
            </Button>
          )}
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'list' ? renderListView() : renderDashboard()}

      {/* ─── SUPPLIER DIALOG ─── */}
      <Dialog open={supplierDialog.open} onOpenChange={(o) => !o && setSupplierDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{supplierDialog.data?.id ? 'Editar' : 'Nuevo'} Proveedor</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {supplierDialog.data?.id ? 'Modifica los datos del proveedor' : 'Ingresa los datos del nuevo proveedor'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={supplierDialog.data?.name || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="supplier-name-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Categoría</label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {CATEGORIES.filter(c => c.id !== 'all').map(cat => {
                  const Icon = cat.icon;
                  const isSelected = (supplierDialog.data?.category || 'general') === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSupplierDialog(p => ({ ...p, data: { ...p.data, category: cat.id } }))}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        isSelected 
                          ? `${cat.color} text-white border-transparent` 
                          : 'border-border hover:border-primary/50'
                      }`}
                      data-testid={`category-select-${cat.id}`}
                    >
                      <Icon size={18} />
                      <span className="text-[10px] font-medium">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Contacto</label>
                <input
                  type="text"
                  value={supplierDialog.data?.contact_name || ''}
                  onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, contact_name: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="supplier-contact-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Teléfono</label>
                <input
                  type="text"
                  value={supplierDialog.data?.phone || ''}
                  onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, phone: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  data-testid="supplier-phone-input"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={supplierDialog.data?.email || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, email: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="supplier-email-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">RNC</label>
              <input
                type="text"
                value={supplierDialog.data?.rnc || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, rnc: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                data-testid="supplier-rnc-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Dirección</label>
              <textarea
                value={supplierDialog.data?.address || ''}
                onChange={e => setSupplierDialog(p => ({ ...p, data: { ...p.data, address: e.target.value } }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                rows={2}
                data-testid="supplier-address-input"
              />
            </div>
            <Button onClick={handleSaveSupplier} className="w-full bg-primary text-primary-foreground font-oswald" data-testid="save-supplier-btn">
              <Save size={16} className="mr-1" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
