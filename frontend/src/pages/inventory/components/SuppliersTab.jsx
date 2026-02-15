import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Truck, Plus, Pencil, Trash2, Save, Search, X, Package, Wine, Cigarette, UtensilsCrossed, Box, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { suppliersAPI } from '@/lib/api';
import axios from 'axios';

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

export default function SuppliersTab({ 
  suppliers: initialSuppliers, 
  onRefreshAll 
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers || []);
  const [supplierDialog, setSupplierDialog] = useState({ open: false, data: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // Fetch suppliers with active orders count
  useEffect(() => {
    const fetchSuppliersWithOrders = async () => {
      try {
        const res = await axios.get(`${API}/suppliers/with-active-orders`, { headers: headers() });
        setSuppliers(res.data);
      } catch (e) {
        // Fallback to initial suppliers if endpoint fails
        if (initialSuppliers) {
          setSuppliers(initialSuppliers);
        }
      }
    };
    fetchSuppliersWithOrders();
  }, [initialSuppliers]);

  // Filter suppliers based on search query and category
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      if (s.active === false) return false;
      
      // Category filter
      if (activeCategory !== 'all') {
        const supplierCategory = s.category || 'general';
        if (supplierCategory !== activeCategory) return false;
      }
      
      // Search filter (name, contact_name, rnc)
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
      // Refresh local state
      const res = await axios.get(`${API}/suppliers/with-active-orders`, { headers: headers() });
      setSuppliers(res.data);
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

  // Open edit dialog when clicking on supplier name
  const openEditDialog = (supplier) => {
    setSupplierDialog({ 
      open: true, 
      data: { 
        ...supplier,
        category: supplier.category || 'general'
      } 
    });
  };

  // Get category config by id
  const getCategoryConfig = (categoryId) => {
    return CATEGORIES.find(c => c.id === categoryId) || CATEGORIES.find(c => c.id === 'general');
  };

  return (
    <div data-testid="suppliers-tab">
      {/* Header with search and filters */}
      <div className="space-y-3 mb-4">
        {/* Top row: Search + Add button */}
        <div className="flex items-center gap-3">
          {/* Search Bar - Left side */}
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
          
          {/* Add Button - Right side */}
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

        {/* Category Filter Buttons */}
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
          
          {/* Stats badge */}
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
                {/* Category Icon */}
                <div className={`w-12 h-12 rounded-lg ${catConfig.color} flex items-center justify-center shrink-0`}>
                  <CatIcon size={20} className="text-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  {/* Clickable Name */}
                  <button
                    onClick={() => openEditDialog(sup)}
                    className="font-semibold text-left hover:text-primary transition-colors cursor-pointer"
                    data-testid={`supplier-name-${sup.id}`}
                  >
                    {sup.name}
                  </button>
                  
                  {/* Info row */}
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    {sup.contact_name && <span>{sup.contact_name}</span>}
                    {sup.phone && <span>• {sup.phone}</span>}
                    {sup.rnc && <span>• RNC: {sup.rnc}</span>}
                  </div>
                </div>
              </div>
              
              {/* Right side: Active Orders + Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Active Orders Badge */}
                {(sup.active_orders || 0) > 0 && (
                  <Badge 
                    className="bg-blue-600 text-white font-oswald text-[10px] px-2"
                    data-testid={`active-orders-${sup.id}`}
                  >
                    <ShoppingCart size={10} className="mr-1" />
                    {sup.active_orders} OC
                  </Badge>
                )}
                
                {/* Category Badge */}
                <Badge 
                  variant="secondary" 
                  className={`${catConfig.color} text-white text-[10px] px-2`}
                >
                  {catConfig.label}
                </Badge>
                
                {/* Action Buttons */}
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
        
        {/* Empty States */}
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

      {/* ─── SUPPLIER DIALOG ─── */}
      <Dialog open={supplierDialog.open} onOpenChange={(o) => !o && setSupplierDialog({ open: false, data: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{supplierDialog.data?.id ? 'Editar' : 'Nuevo'} Proveedor</DialogTitle>
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
            
            {/* Category Selector */}
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
