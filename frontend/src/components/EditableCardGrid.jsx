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
export function EditModeBar({ onSave, onCancel, onRestore, hasHiddenCards }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 py-2.5 backdrop-blur-xl bg-orange-500/90 border-b border-orange-400/50 shadow-lg edit-bar-enter"
      data-testid="edit-mode-bar"
    >
      <div className="flex items-center gap-2">
        <GripVertical size={16} className="text-white/80" />
        <span className="text-sm font-semibold text-white">Modo Edicion — Arrastra las tarjetas</span>
      </div>
      <div className="flex items-center gap-2">
        {hasHiddenCards && (
          <button
            onClick={onRestore}
            className="text-sm font-bold rounded-lg border"
            style={{ minHeight: 40, padding: '10px 16px', background: 'rgba(255,255,255,0.2)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.4)', borderRadius: 8 }}
            data-testid="restore-layout-btn"
          >
            Restaurar layout original
          </button>
        )}
        <button
          onClick={onCancel}
          className="text-sm font-bold rounded-lg border"
          style={{ minHeight: 40, padding: '10px 16px', background: '#FFFFFF', color: '#1F2937', borderColor: '#D1D5DB', borderRadius: 8 }}
          data-testid="cancel-edit-btn"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          className="text-sm font-bold rounded-lg"
          style={{ minHeight: 40, padding: '10px 16px', background: '#1F2937', color: '#FFFFFF', borderRadius: 8 }}
          data-testid="save-layout-btn"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
