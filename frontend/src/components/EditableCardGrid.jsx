import { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useCallback } from 'react';
import { X, GripVertical } from 'lucide-react';

/* ── Sortable card wrapper ── */
function SortableCard({ id, editMode, onHide, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
    touchAction: editMode ? 'none' : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className={editMode ? 'editable-card-shake' : ''}>
      {editMode && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onHide(id); }}
            className="absolute -top-2 -right-2 z-20 w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
            data-testid={`hide-card-${id}`}
            aria-label="Ocultar tarjeta"
          >
            <X size={16} strokeWidth={3} />
          </button>
          <div
            {...attributes}
            {...listeners}
            className="absolute top-1 left-1 z-20 w-12 h-12 rounded-md bg-white/20 backdrop-blur-sm flex items-center justify-center cursor-grab active:cursor-grabbing"
            data-testid={`drag-handle-${id}`}
            style={{ touchAction: 'none' }}
          >
            <GripVertical size={18} className="text-white/80" />
          </div>
        </>
      )}
      {children}
    </div>
  );
}

/* ── Main editable card grid ── */
export function EditableCardGrid({
  editMode,
  visibleCards,
  cardOrder,
  reorder,
  hideCard,
  renderCard,
  className = '',
}) {
  const [activeId, setActiveId] = useState(null);

  // Configure sensors for both pointer (mouse) and touch
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleCards.indexOf(active.id);
    const newIndex = visibleCards.indexOf(over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      // Map visible indices to full cardOrder indices
      const fullOld = cardOrder.indexOf(active.id);
      const fullNew = cardOrder.indexOf(over.id);
      if (fullOld !== -1 && fullNew !== -1) reorder(fullOld, fullNew);
    }
  }, [visibleCards, cardOrder, reorder]);

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const items = useMemo(() => visibleCards, [visibleCards]);

  if (!editMode) {
    // No DnD context needed — just render cards in order
    return (
      <div className={className}>
        {visibleCards.map(id => (
          <div key={id}>{renderCard(id)}</div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={items} strategy={rectSortingStrategy}>
        <div className={className}>
          {visibleCards.map(id => (
            <SortableCard key={id} id={id} editMode={editMode} onHide={hideCard}>
              {renderCard(id)}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <div className="opacity-80 scale-105 rotate-2 shadow-2xl">
            {renderCard(activeId)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ── Edit mode floating toolbar ── */
/* Safari iOS aggressively resets button styles — all properties must be explicit
   with -webkit- prefixes and appearance:none to prevent native overrides. */
export function EditModeBar({ onSave, onCancel, onRestore, hasHiddenCards }) {
  const btnBase = {
    minHeight: 48,
    padding: '10px 20px',
    fontSize: '0.875rem',
    fontWeight: 700,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: '0.3px',
    lineHeight: '1.2',
    margin: 0,
    boxSizing: 'border-box',
    textDecoration: 'none',
    outline: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    appearance: 'none',
    WebkitTapHighlightColor: 'transparent',
  };
  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#D97706', borderBottom: '2px solid #B45309', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
      data-testid="edit-mode-bar"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GripVertical size={16} color="#FFF" />
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}>Modo Edicion</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasHiddenCards && (
          <button
            onClick={onRestore}
            style={{ ...btnBase, backgroundColor: 'rgba(255,255,255,0.25)', color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', opacity: 1 }}
            data-testid="restore-layout-btn"
          >
            Restaurar
          </button>
        )}
        <button
          onClick={onCancel}
          style={{ ...btnBase, backgroundColor: '#FFFFFF', color: '#1F2937', WebkitTextFillColor: '#1F2937', border: '2px solid #9CA3AF', opacity: 1 }}
          data-testid="cancel-edit-btn"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          style={{ ...btnBase, backgroundColor: '#111827', color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', opacity: 1 }}
          data-testid="save-layout-btn"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
