import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Pencil, Sparkles, X, Clock, Calendar, Percent, Tag, Package, CheckCircle2, PauseCircle } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import axios from 'axios';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const DAYS = [
  { v: 0, label: 'D', full: 'Dom' },
  { v: 1, label: 'L', full: 'Lun' },
  { v: 2, label: 'M', full: 'Mar' },
  { v: 3, label: 'M', full: 'Mie' },
  { v: 4, label: 'J', full: 'Jue' },
  { v: 5, label: 'V', full: 'Vie' },
  { v: 6, label: 'S', full: 'Sab' },
];

const DISCOUNT_TYPES = [
  { v: 'percentage', label: 'Porcentaje', suffix: '%' },
  { v: 'fixed_amount', label: 'Monto Fijo (descuento)', suffix: 'RD$' },
  { v: 'fixed_price', label: 'Precio Fijo', suffix: 'RD$' },
  { v: '2x1', label: '2x1', suffix: '' },
];

const emptyForm = {
  id: null,
  name: '',
  description: '',
  is_active: true,
  days: [1, 2, 3, 4, 5],
  start_time: '16:00',
  end_time: '19:00',
  date_start: '',
  date_end: '',
  discount_type: 'percentage',
  discount_value: 20,
  apply_to: 'category',
  product_ids: [],
  category_ids: [],
  excluded_product_ids: [],
  area_ids: [],
};

function formatTime12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function getDiscountLabel(p) {
  const v = p.discount_value;
  switch (p.discount_type) {
    case 'percentage': return `${v}% off`;
    case 'fixed_amount': return `-RD$${v}`;
    case 'fixed_price': return `RD$${v} fijo`;
    case '2x1': return '2x1';
    default: return '';
  }
}

function PromotionCard({ p, onEdit, onDelete, onToggle, categories, products }) {
  const isActiveNow = p.is_active; // could compute currently-active via time, but backend handles it
  const catsLabel = p.apply_to === 'all'
    ? 'Todos los productos'
    : p.apply_to === 'category'
      ? `${(p.category_ids || []).length} categoría(s)`
      : `${(p.product_ids || []).length} producto(s)`;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2" data-testid={`promo-card-${p.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles size={16} className="text-orange-400 flex-shrink-0" />
            <h3 className="font-oswald font-bold text-base truncate">{p.name}</h3>
            <Badge className={isActiveNow ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}>
              {isActiveNow ? <CheckCircle2 size={10} className="mr-1" /> : <PauseCircle size={10} className="mr-1" />}
              {isActiveNow ? 'Activa' : 'Inactiva'}
            </Badge>
          </div>
          {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Switch checked={p.is_active} onCheckedChange={() => onToggle(p)} data-testid={`promo-toggle-${p.id}`} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(p)} data-testid={`promo-edit-${p.id}`}>
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(p)} data-testid={`promo-delete-${p.id}`}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {DAYS.map(d => (
          <span key={d.v} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
            (p.schedule?.days || []).includes(d.v)
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/50 text-muted-foreground/40'
          }`}>{d.label}</span>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><Clock size={11} /> {formatTime12h(p.schedule?.start_time)} - {formatTime12h(p.schedule?.end_time)}</span>
        <span className="flex items-center gap-1"><Percent size={11} /> {getDiscountLabel(p)}</span>
        <span className="flex items-center gap-1">
          {p.apply_to === 'category' ? <Tag size={11} /> : <Package size={11} />}
          {catsLabel}
        </span>
      </div>
    </div>
  );
}

function PromotionForm({ open, onClose, initial, categories, products, areas, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  const toggleDay = (v) => setForm(f => ({ ...f, days: f.days.includes(v) ? f.days.filter(d => d !== v) : [...f.days, v].sort() }));
  const toggleMulti = (key, id) => setForm(f => ({ ...f, [key]: f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id] }));

  const handleSave = async () => {
    if (!form.name.trim()) { notify.error('Nombre requerido'); return; }
    if (form.apply_to === 'category' && form.category_ids.length === 0) { notify.error('Selecciona al menos una categoría'); return; }
    if (form.apply_to === 'products' && form.product_ids.length === 0) { notify.error('Selecciona al menos un producto'); return; }
    if (form.discount_type !== '2x1' && (!form.discount_value || form.discount_value < 0)) { notify.error('Valor de descuento inválido'); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        is_active: form.is_active,
        schedule: {
          days: form.days,
          start_time: form.start_time,
          end_time: form.end_time,
          date_start: form.date_start || null,
          date_end: form.date_end || null,
        },
        discount_type: form.discount_type,
        discount_value: form.discount_type === '2x1' ? 0 : Number(form.discount_value || 0),
        apply_to: form.apply_to,
        product_ids: form.apply_to === 'products' ? form.product_ids : [],
        category_ids: form.apply_to === 'category' ? form.category_ids : [],
        excluded_product_ids: form.apply_to === 'category' ? form.excluded_product_ids : [],
        area_ids: form.area_ids.length > 0 ? form.area_ids : null,
      };
      if (form.id) {
        await axios.patch(`${API}/promotions/${form.id}`, payload, { headers: hdrs() });
        notify.success('Promoción actualizada');
      } else {
        await axios.post(`${API}/promotions`, payload, { headers: hdrs() });
        notify.success('Promoción creada');
      }
      onSaved();
      onClose();
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error guardando');
    } finally { setSaving(false); }
  };

  const dtype = DISCOUNT_TYPES.find(d => d.v === form.discount_type);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <Sparkles size={18} className="text-orange-400" /> {form.id ? 'Editar Promoción' : 'Nueva Promoción'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Programa descuentos automáticos por horario (Happy Hour, 2x1, precio fijo...).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Nombre + Descripción */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Nombre *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" placeholder="Happy Hour, Hora Loca..."
                data-testid="promo-name-input" />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="flex items-center gap-2 p-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} data-testid="promo-active-switch" />
                <span className="text-xs font-medium">Activa</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Descripción</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full p-2 rounded-lg bg-background border border-border text-sm" placeholder="Opcional..." />
          </div>

          {/* Días */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-2 block uppercase font-bold flex items-center gap-1">
              <Calendar size={11} /> Días de la Semana
            </label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map(d => (
                <button key={d.v} type="button" onClick={() => toggleDay(d.v)} data-testid={`promo-day-${d.v}`}
                  className={`w-10 h-10 rounded-lg text-xs font-bold transition-all ${
                    form.days.includes(d.v)
                      ? 'bg-primary text-primary-foreground shadow-lg'
                      : 'bg-background border border-border text-muted-foreground hover:border-primary/50'
                  }`}>{d.full}</button>
              ))}
            </div>
          </div>

          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold flex items-center gap-1">
                <Clock size={11} /> Hora Inicio
              </label>
              <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" data-testid="promo-start-time" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold flex items-center gap-1">
                <Clock size={11} /> Hora Fin
              </label>
              <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" data-testid="promo-end-time" />
            </div>
          </div>

          {/* Fechas opcionales */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Fecha Inicio (opcional)</label>
              <input type="date" value={form.date_start} onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Fecha Fin (opcional)</label>
              <input type="date" value={form.date_end} onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" />
            </div>
          </div>

          {/* Descuento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Tipo de Descuento</label>
              <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                className="w-full p-2 rounded-lg bg-background border border-border text-sm" data-testid="promo-discount-type">
                {DISCOUNT_TYPES.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </div>
            {form.discount_type !== '2x1' && (
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">
                  Valor {dtype?.suffix ? `(${dtype.suffix})` : ''}
                </label>
                <input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                  className="w-full p-2 rounded-lg bg-background border border-border text-sm" data-testid="promo-discount-value" />
              </div>
            )}
          </div>

          {/* Aplicar a */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Aplicar a</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: 'all', label: 'Todos los Productos' },
                { v: 'category', label: 'Categoría(s)' },
                { v: 'products', label: 'Productos Específicos' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => setForm(f => ({ ...f, apply_to: opt.v }))}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    form.apply_to === opt.v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background border border-border text-muted-foreground hover:border-primary/50'
                  }`} data-testid={`promo-applyto-${opt.v}`}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Selector de categorías */}
          {form.apply_to === 'category' && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Categorías</label>
              <div className="max-h-40 overflow-y-auto border border-border rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {categories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 px-2 py-1 rounded">
                    <input type="checkbox" checked={form.category_ids.includes(c.id)} onChange={() => toggleMulti('category_ids', c.id)}
                      data-testid={`promo-cat-${c.id}`} />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Selector de productos */}
          {form.apply_to === 'products' && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Productos</label>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {products.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 px-2 py-1 rounded">
                    <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleMulti('product_ids', p.id)}
                      data-testid={`promo-prod-${p.id}`} />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Productos excluidos (cuando aplica a categoría) */}
          {form.apply_to === 'category' && form.category_ids.length > 0 && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Productos Excluidos (opcional)</label>
              <div className="max-h-32 overflow-y-auto border border-border rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {products.filter(p => form.category_ids.includes(p.category_id)).map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 px-2 py-1 rounded">
                    <input type="checkbox" checked={form.excluded_product_ids.includes(p.id)} onChange={() => toggleMulti('excluded_product_ids', p.id)} />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Áreas */}
          {areas.length > 0 && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold">Áreas (opcional, vacío = todas)</label>
              <div className="flex gap-2 flex-wrap">
                {areas.map(a => (
                  <button key={a.id} type="button" onClick={() => toggleMulti('area_ids', a.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      form.area_ids.includes(a.id)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border border-border text-muted-foreground hover:border-primary/50'
                    }`}>{a.name}</button>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving}
            className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold"
            data-testid="promo-save-btn">
            {saving ? 'Guardando...' : (form.id ? 'GUARDAR CAMBIOS' : 'CREAR PROMOCIÓN')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PromotionsTab({ categories = [], products = [], areas = [] }) {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(emptyForm);
  const [confirmProps, showConfirm] = useConfirmDialog();

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/promotions`, { headers: hdrs() });
      setPromos(res.data || []);
    } catch {
      notify.error('Error cargando promociones');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  const handleNew = () => {
    setEditing(emptyForm);
    setDialogOpen(true);
  };

  const handleEdit = (p) => {
    setEditing({
      id: p.id,
      name: p.name || '',
      description: p.description || '',
      is_active: p.is_active,
      days: p.schedule?.days || [],
      start_time: p.schedule?.start_time || '00:00',
      end_time: p.schedule?.end_time || '23:59',
      date_start: p.schedule?.date_start || '',
      date_end: p.schedule?.date_end || '',
      discount_type: p.discount_type || 'percentage',
      discount_value: p.discount_value || 0,
      apply_to: p.apply_to || 'all',
      product_ids: p.product_ids || [],
      category_ids: p.category_ids || [],
      excluded_product_ids: p.excluded_product_ids || [],
      area_ids: p.area_ids || [],
    });
    setDialogOpen(true);
  };

  const handleToggle = async (p) => {
    try {
      await axios.patch(`${API}/promotions/${p.id}`, { is_active: !p.is_active }, { headers: hdrs() });
      notify.success(p.is_active ? 'Promoción pausada' : 'Promoción activada');
      fetchPromos();
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error');
    }
  };

  const handleDelete = async (p) => {
    showConfirm({
      title: 'Eliminar Promoción',
      message: `¿Eliminar "${p.name}"? Esta acción es permanente.`,
      confirmText: 'Eliminar',
      destructive: true,
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/promotions/${p.id}`, { headers: hdrs() });
          notify.success('Promoción eliminada');
          fetchPromos();
        } catch (e) {
          notify.error(e.response?.data?.detail || 'Error eliminando');
        }
      },
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-oswald text-base font-bold flex items-center gap-2">
          <Sparkles size={18} className="text-orange-400" />
          Promociones
          <Badge variant="secondary" className="text-xs">{promos.length}</Badge>
        </h2>
        <Button onClick={handleNew} size="sm" className="bg-primary text-primary-foreground font-bold"
          data-testid="add-promotion-btn">
          <Plus size={14} className="mr-1" /> Nueva Promoción
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
      ) : promos.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
          <Sparkles size={32} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay promociones configuradas</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Crea Happy Hour, 2x1, o descuentos programados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="promotions-list">
          {promos.map(p => (
            <PromotionCard key={p.id} p={p}
              onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle}
              categories={categories} products={products} />
          ))}
        </div>
      )}

      <PromotionForm open={dialogOpen} onClose={() => setDialogOpen(false)}
        initial={editing} categories={categories} products={products} areas={areas}
        onSaved={fetchPromos} />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
