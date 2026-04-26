import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';
import { GripVertical, Tag, Package, Pencil, Trash2, Sparkles, RotateCcw, Eye, EyeOff, Search, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { notify } from '@/lib/notify';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const VIRTUAL_IDS = ['__combos__', '__open_items__'];
const VIRTUAL_META = {
  __combos__: { label: 'Combos', subtitle: 'Tile virtual · Bundles activos', default_color: '#7C3AED' },
  __open_items__: { label: 'Artículos Libres', subtitle: 'Tile virtual · Off-menu', default_color: '#EA580C' },
};
const COLOR_PRESETS = [
  '#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED', '#DB2777',
  '#0891B2', '#CA8A04', '#4F46E5', '#E11D48', '#0D9488', '#EA580C',
];

function SortableTile({ id, children, disabled = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} data-testid={`tile-row-${id}`} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card">
      <button
        {...(disabled ? {} : attributes)}
        {...(disabled ? {} : listeners)}
        disabled={disabled}
        className={`p-1.5 rounded text-muted-foreground ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing hover:bg-muted'}`}
        data-testid={`tile-drag-${id}`}
        aria-label={disabled ? 'Arrastrar deshabilitado mientras hay filtro' : 'Mover'}
        title={disabled ? 'Limpia el filtro para reordenar' : 'Mover'}
      >
        {disabled ? <Lock size={16} /> : <GripVertical size={16} />}
      </button>
      {children}
    </div>
  );
}

export default function MenuTilesSorter({ categories, products, onEditCategory, onDeleteCategory }) {
  const [order, setOrder] = useState([]);
  const [virtualColors, setVirtualColors] = useState({ __combos__: '#7C3AED', __open_items__: '#EA580C' });
  const [virtualTextColors, setVirtualTextColors] = useState({}); // {tile_id: 'auto'|'#FFFFFF'|'#000000'}
  const [areaOverrides, setAreaOverrides] = useState({}); // {area_id: {hidden_tiles: [tile_id]}}
  const [areas, setAreas] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [colorPicker, setColorPicker] = useState(null); // tile id | null
  const [visibilityPicker, setVisibilityPicker] = useState(null); // tile id | null
  const [previewRole, setPreviewRole] = useState(''); // '' = no preview (admin view)
  const [previewArea, setPreviewArea] = useState(''); // '' = no area (virtual 'any')
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    (async () => {
      try {
        const [tileRes, areaRes, rolesRes] = await Promise.all([
          axios.get(`${API}/menu-tiles`, { headers: hdrs() }),
          axios.get(`${API}/areas`, { headers: hdrs() }),
          axios.get(`${API}/roles`, { headers: hdrs() }),
        ]);
        setOrder(tileRes.data.order || []);
        setVirtualColors({ __combos__: '#7C3AED', __open_items__: '#EA580C', ...(tileRes.data.virtual_colors || {}) });
        setVirtualTextColors(tileRes.data.virtual_text_colors || {});
        setAreaOverrides(tileRes.data.area_overrides || {});
        setAreas(Array.isArray(areaRes.data) ? areaRes.data : (areaRes.data?.items || []));
        setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
      } catch {
        setOrder([...(categories || []).map(c => c.id), ...VIRTUAL_IDS]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure newly created categories appear / deleted ones disappear in the local state
  useEffect(() => {
    setOrder(prev => {
      const catIds = new Set((categories || []).map(c => c.id));
      const filtered = prev.filter(id => catIds.has(id) || VIRTUAL_IDS.includes(id));
      const existing = new Set(filtered);
      (categories || []).forEach(c => { if (!existing.has(c.id)) filtered.push(c.id); });
      VIRTUAL_IDS.forEach(v => { if (!existing.has(v)) filtered.push(v); });
      return filtered;
    });
  }, [categories]);

  const persist = async (newOrder, newColors, newAreaOverrides, newTextColors = virtualTextColors) => {
    setSaving(true);
    try {
      await axios.put(`${API}/menu-tiles`,
        { order: newOrder, virtual_colors: newColors, virtual_text_colors: newTextColors, area_overrides: newAreaOverrides },
        { headers: hdrs() }
      );
      notify.success('Guardado');
    } catch (e) {
      notify.error('Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    persist(next, virtualColors, areaOverrides);
  };

  const changeVirtualColor = (id, color) => {
    const next = { ...virtualColors, [id]: color };
    setVirtualColors(next);
    persist(order, next, areaOverrides);
    setColorPicker(null);
  };

  const changeVirtualTextColor = (id, textColor) => {
    // textColor: 'auto' | '#FFFFFF' | '#000000'
    const next = { ...virtualTextColors };
    if (textColor === 'auto') delete next[id];
    else next[id] = textColor;
    setVirtualTextColors(next);
    persist(order, virtualColors, areaOverrides, next);
  };

  // Auto-contrast: returns black or white based on background luminance
  const autoTextColor = (bgHex) => {
    if (!bgHex || !bgHex.startsWith('#')) return '#FFFFFF';
    const hex = bgHex.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#FFFFFF';
  };

  const toggleAreaVisibility = (tileId, areaId) => {
    setAreaOverrides(prev => {
      const copy = JSON.parse(JSON.stringify(prev || {}));
      const entry = copy[areaId] || { hidden_tiles: [] };
      const hidden = new Set(entry.hidden_tiles || []);
      if (hidden.has(tileId)) hidden.delete(tileId); else hidden.add(tileId);
      const arr = Array.from(hidden);
      if (arr.length === 0) delete copy[areaId];
      else copy[areaId] = { hidden_tiles: arr };
      persist(order, virtualColors, copy);
      return copy;
    });
  };

  const isHiddenInArea = (tileId, areaId) => {
    const entry = (areaOverrides || {})[areaId];
    return !!(entry && (entry.hidden_tiles || []).includes(tileId));
  };

  const hiddenCount = (tileId) => {
    let n = 0;
    for (const a of areas) if (isHiddenInArea(tileId, a.id)) n++;
    return n;
  };

  const resetDefault = () => {
    const def = [...(categories || []).map(c => c.id), ...VIRTUAL_IDS];
    const defColors = { __combos__: '#7C3AED', __open_items__: '#EA580C' };
    setOrder(def);
    setVirtualColors(defColors);
    setAreaOverrides({});
    persist(def, defColors, {});
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Cargando…</div>;

  const catById = Object.fromEntries((categories || []).map(c => [c.id, c]));
  const countProducts = (catId) => (products || []).filter(p => p.category_id === catId).length;

  // Search filter — by tile display name (case-insensitive)
  const getTileName = (id) => {
    if (VIRTUAL_IDS.includes(id)) return VIRTUAL_META[id]?.label || '';
    return catById[id]?.name || '';
  };
  const searchActive = search.trim().length > 0;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOrder = searchActive
    ? order.filter(id => getTileName(id).toLowerCase().includes(normalizedSearch))
    : order;

  // Preview helpers — simulate what a role+area combo would see in OrderScreen
  const activeRole = roles.find(r => r.id === previewRole || r.code === previewRole);
  const rolePerms = (activeRole?.permissions) || {};
  const previewAreaHidden = new Set(((areaOverrides || {})[previewArea] || {}).hidden_tiles || []);

  const getPreviewStatus = (tileId) => {
    // Returns {hidden: bool, reason: string} — only evaluated when previewRole is set
    if (!previewRole) return { hidden: false, reason: '' };
    // Area override first
    if (previewArea && previewAreaHidden.has(tileId)) {
      const aName = areas.find(a => a.id === previewArea)?.name || 'área';
      return { hidden: true, reason: `Oculto en ${aName}` };
    }
    // Role-based permission for virtual tiles
    if (tileId === '__open_items__') {
      if (!rolePerms.create_open_items) return { hidden: true, reason: 'Falta permiso: create_open_items' };
    }
    // Categories: no per-role filter currently — always visible
    return { hidden: false, reason: '' };
  };

  const VisibilityControl = ({ tileId }) => {
    const count = hiddenCount(tileId);
    const hasHidden = count > 0;
    return (
      <div className="relative">
        <button
          onClick={() => setVisibilityPicker(visibilityPicker === tileId ? null : tileId)}
          className={`px-2 py-1 rounded-md border text-[11px] font-bold inline-flex items-center gap-1 hover:bg-muted ${hasHidden ? 'border-amber-500/60 text-amber-600' : 'border-border text-muted-foreground'}`}
          data-testid={`tile-visibility-btn-${tileId}`}
          title={hasHidden ? `Oculto en ${count} área(s)` : 'Visible en todas las áreas'}
        >
          {hasHidden ? <EyeOff size={12} /> : <Eye size={12} />}
          {hasHidden ? `${count}` : ''}
        </button>
        {visibilityPicker === tileId && (
          <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-border rounded-lg p-3 shadow-xl min-w-[200px]" data-testid={`tile-visibility-panel-${tileId}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Visible en áreas</div>
            {(areas || []).length === 0 && (
              <div className="text-xs text-muted-foreground py-1">No hay áreas configuradas.</div>
            )}
            <div className="space-y-1.5">
              {(areas || []).map(a => {
                const visible = !isHiddenInArea(tileId, a.id);
                return (
                  <label key={a.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5">
                    <Checkbox
                      checked={visible}
                      onCheckedChange={() => toggleAreaVisibility(tileId, a.id)}
                      data-testid={`tile-visibility-chk-${tileId}-${a.id}`}
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid="menu-tiles-sorter">
      {/* Preview bar */}
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 flex items-center gap-3 flex-wrap" data-testid="preview-bar">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1">
          <Eye size={12} /> Vista previa
        </span>
        <select
          value={previewRole}
          onChange={e => setPreviewRole(e.target.value)}
          className="bg-background border border-border rounded-md text-xs px-2 py-1"
          data-testid="preview-role-select"
        >
          <option value="">Admin (vista actual)</option>
          {roles.filter(r => (r.level || 0) < 100).map(r => (
            <option key={r.id || r.code} value={r.id || r.code}>{r.name}</option>
          ))}
        </select>
        <select
          value={previewArea}
          onChange={e => setPreviewArea(e.target.value)}
          className="bg-background border border-border rounded-md text-xs px-2 py-1"
          data-testid="preview-area-select"
          disabled={!previewRole}
        >
          <option value="">(cualquier área)</option>
          {areas.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {previewRole && (
          <button
            onClick={() => { setPreviewRole(''); setPreviewArea(''); }}
            className="text-[11px] text-muted-foreground hover:text-primary underline"
            data-testid="preview-clear"
          >
            limpiar
          </button>
        )}
        {previewRole && (() => {
          const visibleCount = order.filter(id => !getPreviewStatus(id).hidden).length;
          return (
            <span className="ml-auto text-[11px] text-muted-foreground" data-testid="preview-summary">
              {visibleCount} de {order.length} tiles visibles para este rol
            </span>
          );
        })()}
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">
          Arrastra para reordenar. Aplica al orden del menú en el POS.
          {saving && <span className="ml-2 text-primary">Guardando…</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={resetDefault} data-testid="reset-tile-order">
          <RotateCcw size={12} className="mr-1" /> Restablecer
        </Button>
      </div>

      {/* Smart Search */}
      <div className={`relative transition-all ${searchFocused ? 'scale-[1.005]' : ''}`} data-testid="category-search-wrapper">
        <div className={`relative flex items-center bg-background border-2 rounded-xl overflow-hidden transition-all ${searchFocused ? 'border-primary shadow-md' : 'border-border'}`}>
          <div className={`pl-3 ${searchFocused ? 'text-primary' : 'text-muted-foreground'}`}><Search size={18} /></div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Buscar categoría..."
            className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none text-foreground placeholder:text-muted-foreground"
            data-testid="category-search-input"
            aria-label="Buscar categoría"
          />
          {!search && !searchFocused && (
            <kbd className="hidden sm:inline-flex items-center justify-center mr-2 px-1.5 h-5 min-w-[20px] rounded border border-border bg-muted/60 text-[10px] font-mono text-muted-foreground pointer-events-none" title="Presiona / para enfocar">/</kbd>
          )}
          {search && (
            <button
              onClick={() => setSearch('')}
              className="p-1.5 mr-2 rounded-full hover:bg-muted text-muted-foreground"
              data-testid="category-search-clear"
              aria-label="Limpiar filtro"
              type="button"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {searchActive && (
          <div className="mt-1.5 px-1 flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-muted-foreground" data-testid="category-search-results-count">
              {filteredOrder.length} {filteredOrder.length === 1 ? 'resultado' : 'resultados'}
            </span>
            <span className="text-[11px] text-amber-600 inline-flex items-center gap-1" data-testid="category-search-drag-hint">
              <Lock size={10} /> Limpia el filtro para reordenar
            </span>
          </div>
        )}
      </div>

      {searchActive && filteredOrder.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border bg-muted/20" data-testid="category-search-empty">
          <Search size={24} className="mx-auto mb-2 opacity-40" />
          No se encontraron categorías
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filteredOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {filteredOrder.map(id => {
              const pv = getPreviewStatus(id);
              const wrapperClass = previewRole && pv.hidden ? 'opacity-40' : '';
              const previewBadge = previewRole && pv.hidden ? (
                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 text-[10px] font-bold" data-testid={`preview-hidden-badge-${id}`}>
                  <EyeOff size={10} /> {pv.reason}
                </span>
              ) : null;

              if (VIRTUAL_IDS.includes(id)) {
                const meta = VIRTUAL_META[id];
                const color = virtualColors[id] || meta.default_color;
                const textColorChoice = virtualTextColors[id] || 'auto';
                const effectiveTextColor = textColorChoice === 'auto' ? autoTextColor(color) : textColorChoice;
                const popoverOpen = colorPicker === id;
                return (
                  <div key={id} className={wrapperClass}>
                    <SortableTile id={id} disabled={searchActive}>
                      <Popover open={popoverOpen} onOpenChange={(o) => setColorPicker(o ? id : null)}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            data-testid={`tile-color-btn-${id}`}
                            aria-label={`Cambiar color de ${meta.label}`}
                            className="group relative w-10 h-10 rounded-lg flex items-center justify-center shadow-sm transition-all hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                            style={{ backgroundColor: color }}
                          >
                            <Sparkles size={18} style={{ color: effectiveTextColor }} />
                            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-card border border-border flex items-center justify-center shadow-sm">
                              <Pencil size={8} className="text-muted-foreground group-hover:text-primary transition-colors" />
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          side="right"
                          sideOffset={8}
                          className="w-56 p-3 space-y-3"
                          data-testid={`tile-color-palette-${id}`}
                        >
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Fondo</div>
                            <div className="grid grid-cols-6 gap-1.5">
                              {COLOR_PRESETS.map(c => (
                                <button
                                  key={c}
                                  onClick={() => changeVirtualColor(id, c)}
                                  className={`w-7 h-7 rounded-md transition-transform hover:scale-110 ${c === color ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                                  style={{ backgroundColor: c }}
                                  data-testid={`tile-color-opt-${id}-${c}`}
                                  aria-label={c}
                                  title={c}
                                />
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Texto</div>
                            <div className="flex items-center gap-1.5">
                              {[
                                { key: 'auto', label: 'Auto', preview: autoTextColor(color) },
                                { key: '#FFFFFF', label: 'Blanco', preview: '#FFFFFF' },
                                { key: '#000000', label: 'Negro', preview: '#000000' },
                              ].map(opt => {
                                const selected = textColorChoice === opt.key;
                                return (
                                  <button
                                    key={opt.key}
                                    onClick={() => changeVirtualTextColor(id, opt.key)}
                                    className={`flex-1 h-9 rounded-md border text-[11px] font-bold transition-all ${
                                      selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                                    }`}
                                    style={{ backgroundColor: color, color: opt.preview }}
                                    data-testid={`tile-text-color-${id}-${opt.key.replace('#', '')}`}
                                    aria-label={`Color de texto: ${opt.label}`}
                                    title={opt.label}
                                  >
                                    Aa
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <div className="flex-1 min-w-0">
                        <div className="font-oswald font-bold truncate inline-flex items-center">
                          {meta.label}
                          {previewBadge}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{meta.subtitle}</div>
                      </div>
                      <VisibilityControl tileId={id} />
                    </SortableTile>
                  </div>
                );
              }

              const cat = catById[id];
              if (!cat) return null;
              return (
                <div key={id} className={wrapperClass}>
                  <SortableTile id={id} disabled={searchActive}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm" style={{ backgroundColor: cat.color }}>
                      <Tag size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-oswald font-bold truncate inline-flex items-center">
                        {cat.name}
                        {previewBadge}
                      </div>
                      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <Package size={10} /> {countProducts(cat.id)} productos
                      </div>
                    </div>
                    <VisibilityControl tileId={id} />
                    {onEditCategory && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditCategory(cat)} data-testid={`tile-edit-${id}`}>
                        <Pencil size={14} />
                      </Button>
                    )}
                    {onDeleteCategory && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDeleteCategory(cat.id)} data-testid={`tile-delete-${id}`}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </SortableTile>
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
