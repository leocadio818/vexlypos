import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Tag, Clock, Shield, Percent, DollarSign, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NumericInput } from '@/components/NumericKeypad';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import axios from 'axios';
import { NeoDatePicker, NeoTimePicker } from '@/components/DateTimePicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const TYPES = [
  { value: 'PERCENTAGE', label: 'Porcentaje (%)', icon: Percent },
  { value: 'FIXED_AMOUNT', label: 'Monto Fijo (RD$)', icon: DollarSign },
  { value: 'NEW_PRICE', label: 'Nuevo Precio', icon: Hash },
];

const SCOPES = [
  { value: 'GLOBAL', label: 'Todas las categorias' },
  { value: 'CATEGORY', label: 'Categorias especificas' },
  { value: 'SPECIFIC_PRODUCTS', label: 'Productos especificos' },
];

const EMPTY_FORM = {
  name: '', description: '', type: 'PERCENTAGE', value: '',
  scope: 'GLOBAL', target_ids: [],
  authorization_level: 'CASHIER',
  active_from: '', active_to: '',
  schedule_start_time: '', schedule_end_time: '',
  active: true,
};

export default function DescuentosTab() {
  const [discounts, setDiscounts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dRes, cRes, pRes] = await Promise.all([
        axios.get(`${API}/discounts`, { headers: hdrs() }),
        axios.get(`${API}/categories`, { headers: hdrs() }),
        axios.get(`${API}/products`, { headers: hdrs() }),
      ]);
      setDiscounts(dRes.data);
      setCategories(cRes.data);
      setProducts(pRes.data);
    } catch { toast.error('Error cargando datos'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (d) => {
    setForm({
      name: d.name, description: d.description || '',
      type: d.type, value: d.value,
      scope: d.scope, target_ids: d.target_ids || [],
      authorization_level: d.authorization_level || 'CASHIER',
      active_from: d.active_from || '', active_to: d.active_to || '',
      schedule_start_time: d.schedule_start_time || '',
      schedule_end_time: d.schedule_end_time || '',
      active: d.active,
    });
    setEditingId(d.id);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    if (!form.value || parseFloat(form.value) <= 0) { toast.error('Valor debe ser mayor a 0'); return; }
    if (form.scope !== 'GLOBAL' && form.target_ids.length === 0) {
      toast.error('Selecciona al menos un item de destino'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, value: parseFloat(form.value) };
      if (editingId) {
        await axios.put(`${API}/discounts/${editingId}`, payload, { headers: hdrs() });
        toast.success('Descuento actualizado');
      } else {
        await axios.post(`${API}/discounts`, payload, { headers: hdrs() });
        toast.success('Descuento creado');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Eliminar este descuento?')) return;
    try {
      await axios.delete(`${API}/discounts/${id}`, { headers: hdrs() });
      toast.success('Descuento eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  const toggleTarget = (id) => {
    setForm(p => ({
      ...p,
      target_ids: p.target_ids.includes(id)
        ? p.target_ids.filter(x => x !== id)
        : [...p.target_ids, id]
    }));
  };

  const typeInfo = (t) => TYPES.find(x => x.value === t) || TYPES[0];
  const formatValue = (d) => {
    if (d.type === 'PERCENTAGE') return `${d.value}%`;
    return `RD$ ${d.value.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-oswald font-bold">Motor de Descuentos</h2>
          <p className="text-xs text-muted-foreground">Configura descuentos por porcentaje, monto fijo o nuevo precio</p>
        </div>
        <Button onClick={openNew} className="gap-2" data-testid="add-discount-btn">
          <Plus size={16} /> Nuevo Descuento
        </Button>
      </div>

      {/* List */}
      {discounts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="no-discounts">
          <Tag size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">No hay descuentos configurados</p>
        </div>
      ) : (
        <div className="grid gap-3" data-testid="discounts-list">
          {discounts.map(d => {
            const ti = typeInfo(d.type);
            const Icon = ti.icon;
            return (
              <div key={d.id} className="backdrop-blur-xl bg-card/80 border border-border rounded-xl p-4 flex items-center gap-4" data-testid={`discount-card-${d.id}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${d.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-oswald font-bold text-sm truncate">{d.name}</span>
                    <Badge variant={d.active ? 'default' : 'secondary'} className="text-[10px]">
                      {d.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {d.authorization_level === 'MANAGER_PIN_REQUIRED' && (
                      <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">
                        <Shield size={8} className="mr-1" /> PIN Gerente
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono font-bold text-primary">{formatValue(d)}</span>
                    <span>{SCOPES.find(s => s.value === d.scope)?.label}</span>
                    {d.schedule_start_time && d.schedule_end_time && (
                      <span className="flex items-center gap-1"><Clock size={10} /> {d.schedule_start_time}-{d.schedule_end_time}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d)} data-testid={`edit-discount-${d.id}`}>
                    <Edit2 size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300" data-testid={`delete-discount-${d.id}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal - Liquid Glass */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl backdrop-blur-2xl bg-background/95 border-white/10" data-testid="discount-modal">
          <DialogHeader>
            <DialogTitle className="font-oswald">{editingId ? 'Editar Descuento' : 'Nuevo Descuento'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
            {/* Name & Description */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej: Happy Hour 20%"
                  data-testid="discount-name-input"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripcion</label>
                <input
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Descripcion opcional"
                  data-testid="discount-desc-input"
                />
              </div>
            </div>

            {/* Type & Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Descuento *</label>
                <div className="flex gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm(p => ({ ...p, type: t.value }))}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-all
                        ${form.type === t.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      data-testid={`type-${t.value}`}
                    >
                      <t.icon size={12} /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Valor * {form.type === 'PERCENTAGE' ? '(%)' : '(RD$)'}
                </label>
                <NumericInput
                  value={form.value}
                  onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder={form.type === 'PERCENTAGE' ? 'Ej: 20' : 'Ej: 500'}
                  label={form.type === 'PERCENTAGE' ? 'Porcentaje (%)' : 'Monto (RD$)'}
                  data-testid="discount-value-input"
                />
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Alcance</label>
              <div className="flex gap-2">
                {SCOPES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setForm(p => ({ ...p, scope: s.value, target_ids: [] }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all
                      ${form.scope === s.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    data-testid={`scope-${s.value}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Selection - Multi-select */}
            {form.scope === 'CATEGORY' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Categorias ({form.target_ids.length} seleccionadas)
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-background/50 border border-border rounded-lg" data-testid="category-selector">
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => toggleTarget(c.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                        ${form.target_ids.includes(c.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                        }`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {categories.length === 0 && (
                    <span className="text-xs text-muted-foreground">No hay categorias</span>
                  )}
                </div>
              </div>
            )}

            {form.scope === 'SPECIFIC_PRODUCTS' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Productos ({form.target_ids.length} seleccionados)
                </label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-background/50 border border-border rounded-lg" data-testid="product-selector">
                  {products.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleTarget(p.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                        ${form.target_ids.includes(p.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                        }`}
                    >
                      {p.name}
                    </button>
                  ))}
                  {products.length === 0 && (
                    <span className="text-xs text-muted-foreground">No hay productos</span>
                  )}
                </div>
              </div>
            )}

            {/* Authorization Level */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nivel de Autorizacion</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setForm(p => ({ ...p, authorization_level: 'CASHIER' }))}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all
                    ${form.authorization_level === 'CASHIER'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-background border-border text-muted-foreground hover:border-emerald-500/50'
                    }`}
                  data-testid="auth-cashier"
                >
                  Cajero (libre)
                </button>
                <button
                  onClick={() => setForm(p => ({ ...p, authorization_level: 'MANAGER_PIN_REQUIRED' }))}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all
                    ${form.authorization_level === 'MANAGER_PIN_REQUIRED'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-background border-border text-muted-foreground hover:border-amber-500/50'
                    }`}
                  data-testid="auth-manager"
                >
                  <Shield size={12} /> Requiere PIN Gerente
                </button>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha Inicio (opcional)</label>
                <input
                  type="date"
                  value={form.active_from?.split('T')[0] || ''}
                  onChange={e => setForm(p => ({ ...p, active_from: e.target.value ? e.target.value + 'T00:00:00' : '' }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  data-testid="date-from-input"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha Fin (opcional)</label>
                <input
                  type="date"
                  value={form.active_to?.split('T')[0] || ''}
                  onChange={e => setForm(p => ({ ...p, active_to: e.target.value ? e.target.value + 'T23:59:59' : '' }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  data-testid="date-to-input"
                />
              </div>
            </div>

            {/* Happy Hour Schedule */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  <Clock size={10} className="inline mr-1" />Hora Inicio Happy Hour (opcional)
                </label>
                <input
                  type="time"
                  value={form.schedule_start_time}
                  onChange={e => setForm(p => ({ ...p, schedule_start_time: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  data-testid="schedule-start-input"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  <Clock size={10} className="inline mr-1" />Hora Fin Happy Hour (opcional)
                </label>
                <input
                  type="time"
                  value={form.schedule_end_time}
                  onChange={e => setForm(p => ({ ...p, schedule_end_time: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  data-testid="schedule-end-input"
                />
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-background/50 border border-border rounded-lg p-3">
              <div>
                <span className="text-sm font-medium">Descuento Activo</span>
                <p className="text-xs text-muted-foreground">Solo descuentos activos aparecen al cobrar</p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={v => setForm(p => ({ ...p, active: v }))}
                data-testid="active-toggle"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} data-testid="save-discount-btn">
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Descuento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
