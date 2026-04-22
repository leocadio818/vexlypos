import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Trash2, Pencil, Package2, CheckCircle2, PauseCircle, Layers, ChevronDown, ChevronUp, X } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const emptyGroup = () => ({
  id: null,
  name: '',
  min_selections: 1,
  max_selections: 1,
  items: [],
});

const emptyForm = {
  id: null,
  name: '',
  description: '',
  combo_type: 'fixed',
  is_active: true,
  pricing_type: 'fixed_price',
  price: 0,
  discount_value: 0,
  groups: [emptyGroup()],
  category_id: null,
};

function formatMoney(n) {
  return `RD$ ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function computeIndividualPrice(combo, products) {
  if (combo.combo_type === 'configurable') return null;
  let sum = 0;
  for (const g of (combo.groups || [])) {
    for (const it of (g.items || [])) {
      const prod = products.find(p => p.id === it.product_id);
      sum += (prod?.price || 0) + (it.price_override || 0);
    }
  }
  return sum;
}

function ComboCard({ c, products, onEdit, onDelete, onToggle }) {
  const individual = computeIndividualPrice(c, products);
  const savings = individual && c.pricing_type === 'fixed_price' ? individual - (c.price || 0) : 0;
  const totalItems = (c.groups || []).reduce((acc, g) => acc + (g.items?.length || 0), 0);
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2" data-testid={`combo-card-${c.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Package2 size={16} className="text-purple-400 flex-shrink-0" />
            <h3 className="font-oswald font-bold text-base truncate">{c.name}</h3>
            <Badge className={c.is_active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}>
              {c.is_active ? <CheckCircle2 size={10} className="mr-1" /> : <PauseCircle size={10} className="mr-1" />}
              {c.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{c.combo_type === 'fixed' ? 'Fijo' : 'Configurable'}</Badge>
          </div>
          {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Switch checked={c.is_active} onCheckedChange={() => onToggle(c)} data-testid={`combo-toggle-${c.id}`} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)} data-testid={`combo-edit-${c.id}`}>
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(c)} data-testid={`combo-delete-${c.id}`}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span className="font-oswald text-lg font-bold text-purple-400">{formatMoney(c.price)}</span>
        {savings > 0 && (
          <span className="text-[11px] text-emerald-500 font-semibold">
            Ahorro {formatMoney(savings)} ({((savings / individual) * 100).toFixed(0)}%)
          </span>
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Layers size={11} /> {(c.groups || []).length} grupo(s) · {totalItems} opción(es)
        </span>
      </div>
    </div>
  );
}

function ComboForm({ open, onClose, initial, products, categories, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initial);
      const expanded = {};
      (initial.groups || []).forEach((_, i) => { expanded[i] = true; });
      setExpandedGroups(expanded);
    }
  }, [open, initial]);

  const updateGroup = (idx, patch) => {
    setForm(f => ({ ...f, groups: f.groups.map((g, i) => i === idx ? { ...g, ...patch } : g) }));
  };

  const addGroup = () => {
    setForm(f => ({ ...f, groups: [...f.groups, emptyGroup()] }));
    setExpandedGroups(p => ({ ...p, [form.groups.length]: true }));
  };

  const removeGroup = (idx) => {
    setForm(f => ({ ...f, groups: f.groups.filter((_, i) => i !== idx) }));
  };

  const addProductToGroup = (gIdx, product) => {
    const group = form.groups[gIdx];
    if (group.items.some(it => it.product_id === product.id)) {
      notify.info('Producto ya está en el grupo');
      return;
    }
    updateGroup(gIdx, {
      items: [...group.items, {
        product_id: product.id,
        product_name: product.name,
        is_default: false,
        price_override: null,
      }]
    });
    setProductSearch(s => ({ ...s, [gIdx]: '' }));
  };

  const removeProductFromGroup = (gIdx, pid) => {
    const group = form.groups[gIdx];
    updateGroup(gIdx, { items: group.items.filter(it => it.product_id !== pid) });
  };

  const updateProductInGroup = (gIdx, pid, patch) => {
    const group = form.groups[gIdx];
    updateGroup(gIdx, {
      items: group.items.map(it => it.product_id === pid ? { ...it, ...patch } : it)
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { notify.error('Nombre requerido'); return; }
    if (!form.groups.length) { notify.error('Agrega al menos 1 grupo'); return; }
    for (const [i, g] of form.groups.entries()) {
      if (!g.name.trim()) { notify.error(`Grupo ${i + 1}: nombre requerido`); return; }
      if (!g.items.length) { notify.error(`Grupo "${g.name}": agrega al menos 1 producto`); return; }
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.id) {
        await axios.patch(`${API}/combos/${form.id}`, payload, { headers: hdrs() });
        notify.success('Combo actualizado');
      } else {
        await axios.post(`${API}/combos`, payload, { headers: hdrs() });
        notify.success('Combo creado');
      }
      onSaved();
      onClose();
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error guardando');
    } finally { setSaving(false); }
  };

  const filteredProducts = (gIdx) => {
    const q = (productSearch[gIdx] || '').toLowerCase().trim();
    if (!q) return [];
    const usedIds = form.groups[gIdx].items.map(it => it.product_id);
    return products
      .filter(p => !usedIds.includes(p.id))
      .filter(p => p.name?.toLowerCase().includes(q))
      .slice(0, 6);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <Package2 size={18} className="text-purple-400" /> {form.id ? 'Editar Combo' : 'Nuevo Combo'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Agrupa productos del menú en paquetes con precio especial.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Básicos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Nombre *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" placeholder="Combo Hamburguesa..."
                data-testid="combo-name-input" />
            </div>
            <div className="flex items-end justify-start gap-2">
              <div className="flex items-center gap-2 p-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} data-testid="combo-active-switch" />
                <span className="text-xs font-medium">Activo</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Descripción</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full p-2 rounded-lg bg-background border border-border text-sm" placeholder="Opcional..." />
          </div>

          {/* Tipo de combo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Tipo de Combo</label>
              <select value={form.combo_type} onChange={e => setForm(f => ({ ...f, combo_type: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" data-testid="combo-type-select">
                <option value="fixed">Fijo (items obligatorios)</option>
                <option value="configurable">Configurable (cliente elige)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Categoría (donde mostrar)</label>
              <select value={form.category_id || ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm">
                <option value="">Sin categoría específica</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Tipo de Precio</label>
              <select value={form.pricing_type} onChange={e => setForm(f => ({ ...f, pricing_type: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" data-testid="combo-pricing-type">
                <option value="fixed_price">Precio Fijo</option>
                <option value="discount_percentage">Descuento % sobre suma de items</option>
                <option value="discount_amount">Descuento Monto sobre suma</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">
                {form.pricing_type === 'fixed_price' ? 'Precio del Combo (RD$)' : 'Valor del Descuento'}
              </label>
              <input type="number" min="0" step="0.01"
                value={form.pricing_type === 'fixed_price' ? form.price : form.discount_value}
                onChange={e => setForm(f => ({
                  ...f,
                  [f.pricing_type === 'fixed_price' ? 'price' : 'discount_value']: Number(e.target.value),
                }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" data-testid="combo-price-input" />
            </div>
          </div>

          {/* Groups */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase flex items-center gap-1"><Layers size={12} /> Grupos de Items</h4>
              <Button size="sm" variant="outline" onClick={addGroup} data-testid="add-group-btn">
                <Plus size={12} className="mr-1" /> Grupo
              </Button>
            </div>
            <div className="space-y-2">
              {form.groups.map((g, gIdx) => (
                <div key={gIdx} className="border border-border rounded-lg bg-background/50" data-testid={`combo-group-${gIdx}`}>
                  <button type="button" onClick={() => setExpandedGroups(p => ({ ...p, [gIdx]: !p[gIdx] }))}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Layers size={13} className="text-purple-400" />
                      <span className="text-sm font-semibold">{g.name || `Grupo ${gIdx + 1}`}</span>
                      <Badge variant="secondary" className="text-[10px]">{g.items.length} item(s)</Badge>
                    </div>
                    {expandedGroups[gIdx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {expandedGroups[gIdx] && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border/40">
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        <input type="text" value={g.name} onChange={e => updateGroup(gIdx, { name: e.target.value })}
                          placeholder="Nombre del grupo"
                          className="col-span-2 p-2 rounded-lg bg-background border border-border text-xs"
                          data-testid={`group-name-${gIdx}`} />
                        <input type="number" min="0" value={g.min_selections} onChange={e => updateGroup(gIdx, { min_selections: Number(e.target.value) })}
                          placeholder="Min" title="Selecciones mínimas"
                          className="p-2 rounded-lg bg-background border border-border text-xs" />
                        <input type="number" min="1" value={g.max_selections} onChange={e => updateGroup(gIdx, { max_selections: Number(e.target.value) })}
                          placeholder="Max" title="Selecciones máximas"
                          className="p-2 rounded-lg bg-background border border-border text-xs" />
                      </div>

                      {/* Items en el grupo */}
                      {g.items.map((it) => (
                        <div key={it.product_id} className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border/30">
                          <span className="flex-1 text-xs truncate font-medium">{it.product_name}</span>
                          <div className="flex items-center gap-1">
                            <input type="number" min="0" step="0.01" placeholder="Extra"
                              value={it.price_override || ''}
                              onChange={e => updateProductInGroup(gIdx, it.product_id, { price_override: e.target.value === '' ? null : Number(e.target.value) })}
                              title="Cargo extra (RD$) — deja vacío si es incluido"
                              className="w-16 p-1 rounded bg-background border border-border text-xs text-right" />
                          </div>
                          <label className="flex items-center gap-1 text-[10px] cursor-pointer" title="Pre-seleccionado por defecto">
                            <input type="checkbox" checked={it.is_default}
                              onChange={e => updateProductInGroup(gIdx, it.product_id, { is_default: e.target.checked })} />
                            <span>Default</span>
                          </label>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                            onClick={() => removeProductFromGroup(gIdx, it.product_id)}>
                            <X size={12} />
                          </Button>
                        </div>
                      ))}

                      {/* Buscador de productos */}
                      <div className="relative">
                        <input type="text" value={productSearch[gIdx] || ''}
                          onChange={e => setProductSearch(s => ({ ...s, [gIdx]: e.target.value }))}
                          placeholder="Buscar producto para agregar..."
                          className="w-full p-2 rounded-lg bg-background border border-border text-xs"
                          data-testid={`group-search-${gIdx}`} />
                        {filteredProducts(gIdx).length > 0 && (
                          <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredProducts(gIdx).map(p => (
                              <button key={p.id} type="button"
                                onClick={() => addProductToGroup(gIdx, p)}
                                className="w-full text-left px-3 py-2 hover:bg-muted/30 text-xs flex items-center justify-between">
                                <span className="truncate">{p.name}</span>
                                <span className="text-muted-foreground">{formatMoney(p.price)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {form.groups.length > 1 && (
                        <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => removeGroup(gIdx)}>
                          <Trash2 size={11} className="mr-1" /> Eliminar grupo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving}
            className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold"
            data-testid="combo-save-btn">
            {saving ? 'Guardando...' : (form.id ? 'GUARDAR CAMBIOS' : 'CREAR COMBO')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CombosTab({ products = [], categories = [] }) {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(emptyForm);
  const [confirmProps, showConfirm] = useConfirmDialog();

  const fetchCombos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/combos`, { headers: hdrs() });
      setCombos(res.data || []);
    } catch {
      notify.error('Error cargando combos');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCombos(); }, [fetchCombos]);

  const handleNew = () => { setEditing(emptyForm); setDialogOpen(true); };

  const handleEdit = (c) => {
    setEditing({
      id: c.id, name: c.name || '', description: c.description || '',
      combo_type: c.combo_type || 'fixed', is_active: c.is_active,
      pricing_type: c.pricing_type || 'fixed_price', price: c.price || 0,
      discount_value: c.discount_value || 0,
      groups: (c.groups || []).length ? c.groups : [emptyGroup()],
      category_id: c.category_id || null,
    });
    setDialogOpen(true);
  };

  const handleToggle = async (c) => {
    try {
      await axios.patch(`${API}/combos/${c.id}`, { is_active: !c.is_active }, { headers: hdrs() });
      notify.success(c.is_active ? 'Combo pausado' : 'Combo activado');
      fetchCombos();
    } catch (e) { notify.error(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = (c) => {
    showConfirm({
      title: 'Eliminar Combo',
      message: `¿Eliminar "${c.name}"? Esta acción es permanente.`,
      confirmText: 'Eliminar', destructive: true,
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/combos/${c.id}`, { headers: hdrs() });
          notify.success('Combo eliminado');
          fetchCombos();
        } catch (e) { notify.error(e.response?.data?.detail || 'Error eliminando'); }
      },
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-base font-bold flex items-center gap-2">
          <Package2 size={18} className="text-purple-400" />
          Combos
          <Badge variant="secondary" className="text-xs">{combos.length}</Badge>
        </h2>
        <Button onClick={handleNew} size="sm" className="bg-primary text-primary-foreground font-bold"
          data-testid="add-combo-btn">
          <Plus size={14} className="mr-1" /> Nuevo Combo
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
      ) : combos.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
          <Package2 size={32} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay combos configurados</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Crea paquetes y combos con precio especial</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="combos-list">
          {combos.map(c => (
            <ComboCard key={c.id} c={c} products={products}
              onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}

      <ComboForm open={dialogOpen} onClose={() => setDialogOpen(false)}
        initial={editing} products={products} categories={categories}
        onSaved={fetchCombos} />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
