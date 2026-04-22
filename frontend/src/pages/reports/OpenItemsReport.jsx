import { useState, useEffect } from 'react';
import axios from 'axios';
import { formatMoney } from './reportUtils';
import { Pencil, ChefHat, Wine, TrendingUp, Star, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function OpenItemsReport({ data }) {
  const rows = data?.rows || [];
  const summary = data?.summary || [];
  const candidates = summary.filter(s => s.is_conversion_candidate);

  const [categories, setCategories] = useState([]);
  const [convertDialog, setConvertDialog] = useState({ open: false, item: null });
  const [form, setForm] = useState({ name: '', price: 0, category_id: '', active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API}/categories`, { headers: hdrs() })
      .then(r => setCategories(r.data || []))
      .catch(() => setCategories([]));
  }, []);

  const openConvert = (summaryRow) => {
    setForm({
      name: summaryRow.description,
      price: summaryRow.avg_price,
      category_id: categories[0]?.id || '',
      active: true,
    });
    setConvertDialog({ open: true, item: summaryRow });
  };

  const handleConvert = async () => {
    if (!form.name.trim() || !form.category_id || form.price <= 0) {
      toast.error('Completa nombre, categoría y precio');
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/products`, {
        name: form.name.trim(),
        category_id: form.category_id,
        price: parseFloat(form.price) || 0,
        active: form.active,
        description: `Convertido desde Artículo Libre (${convertDialog.item.occurrences} ventas)`,
      }, { headers: hdrs() });
      toast.success(`Producto "${form.name}" creado exitosamente`);
      setConvertDialog({ open: false, item: null });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error creando producto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="open-items-report">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Artículos únicos</p>
          <p className="font-oswald text-2xl font-bold text-orange-500 mt-1" data-testid="oi-count">{data?.count || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Unidades vendidas</p>
          <p className="font-oswald text-2xl font-bold text-amber-500 mt-1" data-testid="oi-sold">{data?.total_sold || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Ingresos generados</p>
          <p className="font-oswald text-2xl font-bold text-cyan-500 mt-1" data-testid="oi-revenue">{formatMoney(data?.total_revenue)}</p>
        </div>
      </div>

      {/* Candidates section — strongly suggested conversions */}
      {candidates.length > 0 && (
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-2 border-amber-500/40 rounded-xl p-4" data-testid="oi-candidates-section">
          <div className="flex items-center gap-2 mb-3">
            <Star size={18} className="text-amber-500 fill-amber-500" />
            <h3 className="font-oswald text-sm font-bold uppercase tracking-wider">Candidatos a producto permanente</h3>
            <span className="text-[10px] text-muted-foreground">(≥3 ventas)</span>
          </div>
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <div key={i} className="flex items-center gap-3 bg-card rounded-lg p-3 border border-border" data-testid={`oi-candidate-${i}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{c.description}</p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1"><TrendingUp size={11} />{c.occurrences} ventas · {c.total_qty} uds</span>
                    <span>Precio prom: {formatMoney(c.avg_price)}</span>
                    <span>Total: {formatMoney(c.total_revenue)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => openConvert(c)}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  data-testid={`oi-convert-btn-${i}`}
                >
                  <Check size={14} className="mr-1" /> Convertir en Producto
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Pencil size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay artículos libres vendidos en el período.</p>
          <p className="text-xs mt-1 opacity-70">Estos son productos fuera del menú que el mesero crea en el momento.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="oi-table">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Fecha</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Descripción</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Canal</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Mesa/Orden</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Cant</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Precio</th>
                  <th className="text-right py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Total</th>
                  <th className="text-left py-2 px-3 text-[11px] font-bold uppercase text-muted-foreground">Creado por</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/20" data-testid={`oi-row-${i}`}>
                    <td className="py-2 px-3 text-xs">{(r.paid_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td className="py-2 px-3 font-bold" data-testid={`oi-desc-${i}`}>
                      {r.description}
                      {r.tax_exempt && <span className="ml-2 text-[9px] text-amber-600 font-bold">EXENTO</span>}
                      {r.kitchen_note && <p className="text-[10px] text-muted-foreground italic">"{r.kitchen_note}"</p>}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.channel === 'bar' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>
                        {r.channel === 'bar' ? <Wine size={10} /> : <ChefHat size={10} />}
                        {r.channel === 'bar' ? 'Bar' : 'Cocina'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{r.table_label || r.transaction_number}</td>
                    <td className="py-2 px-3 text-right font-oswald">{r.quantity}</td>
                    <td className="py-2 px-3 text-right font-oswald">{formatMoney(r.unit_price)}</td>
                    <td className="py-2 px-3 text-right font-oswald font-bold text-orange-600">{formatMoney(r.total)}</td>
                    <td className="py-2 px-3 text-xs">{r.created_by_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Convert to Product Dialog */}
      <Dialog open={convertDialog.open} onOpenChange={(o) => !o && setConvertDialog({ open: false, item: null })}>
        <DialogContent className="max-w-md" data-testid="oi-convert-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Star size={20} className="text-amber-500" />
              Convertir en Producto del Menú
            </DialogTitle>
          </DialogHeader>
          {convertDialog.item && (
            <div className="space-y-3">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-xs">
                Este artículo libre se ha vendido <b>{convertDialog.item.occurrences} veces</b> generando <b>{formatMoney(convertDialog.item.total_revenue)}</b>.
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre del producto *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  data-testid="oi-convert-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Precio sugerido *</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald"
                    data-testid="oi-convert-price"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Promedio histórico: {formatMoney(convertDialog.item.avg_price)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoría *</label>
                  <select
                    value={form.category_id}
                    onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    data-testid="oi-convert-category"
                  >
                    <option value="">Selecciona…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">Activo en el menú</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialog({ open: false, item: null })}>Cancelar</Button>
            <Button onClick={handleConvert} disabled={saving || !form.name.trim() || !form.category_id || form.price <= 0} className="bg-amber-500 hover:bg-amber-600" data-testid="oi-convert-confirm">
              {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />}
              Crear Producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
