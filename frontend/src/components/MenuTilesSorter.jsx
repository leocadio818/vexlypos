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
import { GripVertical, Tag, Package, Pencil, Trash2, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

function SortableTile({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} data-testid={`tile-row-${id}`} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-muted text-muted-foreground"
        data-testid={`tile-drag-${id}`}
        aria-label="Mover"
      >
        <GripVertical size={16} />
      </button>
      {children}
    </div>
  );
}

export default function MenuTilesSorter({ categories, products, onEditCategory, onDeleteCategory }) {
  const [order, setOrder] = useState([]);
  const [virtualColors, setVirtualColors] = useState({ __combos__: '#7C3AED', __open_items__: '#EA580C' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [colorPicker, setColorPicker] = useState(null); // __combos__ | __open_items__ | null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/menu-tiles`, { headers: hdrs() });
        setOrder(r.data.order || []);
        setVirtualColors({ __combos__: '#7C3AED', __open_items__: '#EA580C', ...(r.data.virtual_colors || {}) });
      } catch {
        // default: categories in their order + virtuals at end
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

  const persist = async (newOrder, newColors) => {
    setSaving(true);
    try {
      await axios.put(`${API}/menu-tiles`,
        { order: newOrder, virtual_colors: newColors },
        { headers: hdrs() }
      );
      notify.success('Orden guardado');
    } catch (e) {
      notify.error('Error guardando el orden');
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
    persist(next, virtualColors);
  };

  const changeVirtualColor = (id, color) => {
    const next = { ...virtualColors, [id]: color };
    setVirtualColors(next);
    persist(order, next);
    setColorPicker(null);
  };

  const resetDefault = () => {
    const def = [...(categories || []).map(c => c.id), ...VIRTUAL_IDS];
    const defColors = { __combos__: '#7C3AED', __open_items__: '#EA580C' };
    setOrder(def);
    setVirtualColors(defColors);
    persist(def, defColors);
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Cargando…</div>;

  const catById = Object.fromEntries((categories || []).map(c => [c.id, c]));
  const countProducts = (catId) => (products || []).filter(p => p.category_id === catId).length;

  return (
    <div className="space-y-2" data-testid="menu-tiles-sorter">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">
          Arrastra para reordenar. Aplica al orden del menú en el POS.
          {saving && <span className="ml-2 text-primary">Guardando…</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={resetDefault} data-testid="reset-tile-order">
          <RotateCcw size={12} className="mr-1" /> Restablecer
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {order.map(id => {
              if (VIRTUAL_IDS.includes(id)) {
                const meta = VIRTUAL_META[id];
                const color = virtualColors[id] || meta.default_color;
                return (
                  <SortableTile key={id} id={id}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm" style={{ backgroundColor: color }}>
                      <Sparkles size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-oswald font-bold truncate">{meta.label}</div>
                      <div className="text-[11px] text-muted-foreground">{meta.subtitle}</div>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setColorPicker(colorPicker === id ? null : id)}
                        className="px-2 py-1 rounded-md border border-border text-[11px] font-bold hover:bg-muted"
                        data-testid={`tile-color-btn-${id}`}
                        style={{ color }}
                      >
                        Color
                      </button>
                      {colorPicker === id && (
                        <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-border rounded-lg p-2 shadow-xl grid grid-cols-6 gap-1.5" data-testid={`tile-color-palette-${id}`}>
                          {COLOR_PRESETS.map(c => (
                            <button
                              key={c}
                              onClick={() => changeVirtualColor(id, c)}
                              className={`w-7 h-7 rounded-md border-2 transition-transform hover:scale-110 ${c === color ? 'border-white ring-2 ring-primary' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                              data-testid={`tile-color-opt-${id}-${c}`}
                              aria-label={c}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </SortableTile>
                );
              }

              const cat = catById[id];
              if (!cat) return null;
              return (
                <SortableTile key={id} id={id}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm" style={{ backgroundColor: cat.color }}>
                    <Tag size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-oswald font-bold truncate">{cat.name}</div>
                    <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Package size={10} /> {countProducts(cat.id)} productos
                    </div>
                  </div>
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
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
