import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { areasAPI, tablesAPI, ncfAPI, decoratorsAPI } from '@/lib/api';
import { Users, Plus, Lock, Unlock, Maximize2, Minus, AlertTriangle, FileText, ChevronRight, Minus as HLine, GripVertical, Square, Circle, Type, Trash2, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

const statusColors = {
  free: { border: '#1E88E5', bg: 'rgba(30,136,229,0.15)', glow: 'rgba(30,136,229,0.4)' }, // Azul para libre
  occupied: { border: '#C62828', bg: 'rgba(198,40,40,0.15)', glow: 'rgba(198,40,40,0.4)' }, // Rojo para mis mesas
  occupied_other: { border: '#F9A825', bg: 'rgba(249,168,37,0.15)', glow: 'rgba(249,168,37,0.4)' }, // Amarillo para de otros
  billed: { border: '#2E7D4E', bg: 'rgba(46,125,78,0.15)', glow: 'rgba(46,125,78,0.4)' }, // Verde para por facturar
  reserved: { border: '#7C4DFF', bg: 'rgba(124,77,255,0.15)', glow: 'rgba(124,77,255,0.4)' }, // Morado para reservada
  divided: { border: '#FF6600', bg: 'rgba(255,102,0,0.25)', glow: 'rgba(255,102,0,0.5)' }, // Naranja para dividida
  divided_other: { border: '#F9A825', bg: 'rgba(249,168,37,0.25)', glow: 'rgba(249,168,37,0.5)' }, // Amarillo para dividida de otros
};

// Decorator color presets
const DECORATOR_COLORS = [
  { name: 'Gris', value: '#6B7280' },
  { name: 'Negro', value: '#1F2937' },
  { name: 'Marrón', value: '#92400E' },
  { name: 'Verde', value: '#166534' },
  { name: 'Azul', value: '#1E40AF' },
  { name: 'Rojo', value: '#991B1B' },
];

// Decorator types
const DECORATOR_TYPES = [
  { type: 'hline', icon: HLine, label: '― Línea H', defaultW: 15, defaultH: 0.5 },
  { type: 'vline', icon: GripVertical, label: '| Línea V', defaultW: 0.5, defaultH: 15 },
  { type: 'rect', icon: Square, label: '□ Rectángulo', defaultW: 12, defaultH: 8 },
  { type: 'circle', icon: Circle, label: '○ Círculo', defaultW: 5, defaultH: 5 },
  { type: 'text', icon: Type, label: 'T Texto', defaultW: 10, defaultH: 3 },
];

// Draggable Decorator Component
function DraggableDecorator({ decorator, containerSize, onUpdate, onDelete, editMode, device }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [isSelected, setIsSelected] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [textValue, setTextValue] = useState(decorator.text || '');
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0, sizeW: 0, sizeH: 0, moved: false, pointerId: null });
  const nodeRef = useRef(null);

  // Responsive scaling for decorators (same approach as tables)
  const getDecoratorScale = () => {
    if (device?.isMobile) return Math.min(containerSize.w / 800, containerSize.h / 500, 1.2);
    if (device?.isTablet) return Math.min(containerSize.w / 1000, containerSize.h / 600, 1.3);
    return Math.min(containerSize.w / 1200, containerSize.h / 700, 1.5);
  };
  const decoratorScale = getDecoratorScale();
  
  // Minimum sizes scale with device (responsive)
  const minW = device?.isMobile ? 15 : device?.isTablet ? 18 : 20;
  const minH = device?.isMobile ? 8 : device?.isTablet ? 9 : 10;

  // Convert percentage to pixels
  const pxX = (decorator.x / 100) * containerSize.w;
  const pxY = (decorator.y / 100) * containerSize.h;
  const pxW = (decorator.width / 100) * containerSize.w;
  const pxH = (decorator.height / 100) * containerSize.h;

  useEffect(() => {
    setPos({ x: pxX, y: pxY });
    setSize({ w: pxW, h: pxH });
  }, [pxX, pxY, pxW, pxH]);

  // Click outside to deselect - but NOT if clicking on controls
  useEffect(() => {
    if (!editMode || !isSelected) return;
    const handleClickOutside = (e) => {
      // Don't deselect if clicking inside the decorator
      if (nodeRef.current?.contains(e.target)) return;
      // Don't deselect if clicking on buttons (they have data-testid starting with delete- or color-)
      if (e.target.closest('[data-testid^="delete-"]') || e.target.closest('[data-testid^="color-"]')) return;
      setIsSelected(false);
      setShowColorPicker(false);
    };
    // Use mousedown for desktop, touchstart for mobile
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [editMode, isSelected]);

  const handleSelect = (e) => {
    if (!editMode) return;
    e.stopPropagation();
    setIsSelected(true);
  };

  const handlePointerDown = (e) => {
    console.log('DECORATOR POINTER DOWN - editMode:', editMode, 'isResizing:', isResizing, 'isSelected:', isSelected);
    if (!editMode || isResizing) return;
    e.stopPropagation();
    
    // If not selected, just select
    if (!isSelected) {
      console.log('SELECTING DECORATOR:', decorator.id);
      setIsSelected(true);
      return;
    }
    
    // Start dragging if already selected
    console.log('STARTING DRAG');
    const d = dragRef.current;
    d.startX = e.clientX; d.startY = e.clientY;
    d.posX = pos.x; d.posY = pos.y;
    d.moved = false; d.pointerId = e.pointerId;
    setIsDragging(true);
    nodeRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging && !isResizing) return;
    const d = dragRef.current;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    
    if (isDragging) {
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      if (d.moved) {
        setPos({ 
          x: Math.max(0, Math.min(containerSize.w - size.w, d.posX + dx)), 
          y: Math.max(0, Math.min(containerSize.h - size.h, d.posY + dy)) 
        });
      }
    } else if (isResizing) {
      const newW = Math.max(10, d.sizeW + dx);
      const newH = Math.max(10, d.sizeH + dy);
      setSize({ w: newW, h: newH });
    }
  };

  const handlePointerUp = () => {
    const d = dragRef.current;
    if (isDragging && d.moved) {
      onUpdate(decorator.id, { 
        x: Math.max(0, Math.min(95, (pos.x / containerSize.w) * 100)), 
        y: Math.max(0, Math.min(95, (pos.y / containerSize.h) * 100))
      });
    }
    if (isResizing) {
      onUpdate(decorator.id, { 
        width: Math.max(1, (size.w / containerSize.w) * 100),
        height: Math.max(1, (size.h / containerSize.h) * 100)
      });
    }
    setIsDragging(false);
    setIsResizing(false);
    try { nodeRef.current?.releasePointerCapture(d.pointerId); } catch {}
  };

  const handleResizeStart = (e) => {
    if (!editMode) return;
    e.stopPropagation();
    const d = dragRef.current;
    d.startX = e.clientX; d.startY = e.clientY;
    d.sizeW = size.w; d.sizeH = size.h;
    d.pointerId = e.pointerId;
    setIsResizing(true);
    e.target?.setPointerCapture(e.pointerId);
  };

  const handleTextSave = () => {
    onUpdate(decorator.id, { text: textValue });
    setEditingText(false);
  };

  const renderContent = () => {
    const minDim = device?.isMobile ? 12 : 14;
    // Minimum line thickness scales with device
    const lineThickness = device?.isMobile ? 2 : 3;
    switch (decorator.type) {
      case 'hline':
        return <div className="w-full h-full rounded-sm" style={{ backgroundColor: decorator.color, minHeight: lineThickness }} />;
      case 'vline':
        return <div className="w-full h-full rounded-sm" style={{ backgroundColor: decorator.color, minWidth: lineThickness }} />;
      case 'rect':
        return <div className="w-full h-full rounded-lg border-2" style={{ borderColor: decorator.color, backgroundColor: `${decorator.color}20` }} />;
      case 'circle':
        return <div className="w-full h-full rounded-full border-2" style={{ borderColor: decorator.color, backgroundColor: `${decorator.color}20` }} />;
      case 'text':
        if (editMode && editingText) {
          return (
            <input
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={handleTextSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSave()}
              autoFocus
              className="w-full h-full bg-transparent text-center font-oswald font-bold outline-none"
              style={{ color: decorator.color, fontSize: Math.max(minDim, size.h * 0.6) }}
            />
          );
        }
        return (
          <span 
            className="font-oswald font-bold text-center w-full truncate px-1"
            style={{ color: decorator.color, fontSize: Math.max(minDim, size.h * 0.6) }}
            onDoubleClick={() => editMode && setEditingText(true)}
          >
            {decorator.text || 'Texto'}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={nodeRef}
      className={`absolute flex items-center justify-center select-none ${editMode ? 'cursor-pointer' : 'pointer-events-none'}`}
      style={{
        left: pos.x, 
        top: pos.y, 
        width: Math.max(minW, size.w), 
        height: Math.max(minH, size.h),
        zIndex: editMode ? (isDragging || isSelected ? 100 : 10) : 1,
        opacity: editMode ? 1 : 0.7,
        outline: editMode && isSelected ? '3px dashed #FF6600' : 'none',
        outlineOffset: '2px',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: isDragging ? 'none' : 'transform 0.15s',
        pointerEvents: editMode ? 'auto' : 'none',
      }}
      onPointerDown={editMode ? handlePointerDown : undefined}
      onPointerMove={(isDragging || isResizing) ? handlePointerMove : undefined}
      onPointerUp={(isDragging || isResizing) ? handlePointerUp : undefined}
      data-testid={`decorator-${decorator.id}`}
    >
      {renderContent()}
      
      {/* Edit Controls - visible when decorator is selected in edit mode */}
      {editMode && isSelected && (
        <>
          {/* Delete button - RED X */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              console.log('DELETE BUTTON CLICKED - ID:', decorator.id);
              onDelete(decorator.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{ 
              pointerEvents: 'auto',
              position: 'absolute',
              top: -20,
              right: -20,
              width: 44,
              height: 44,
              zIndex: 9999,
              WebkitTapHighlightColor: 'transparent'
            }}
            className="rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl hover:bg-red-700 active:scale-90 border-2 border-white touch-manipulation"
            data-testid={`delete-decorator-${decorator.id}`}
          >
            <Trash2 size={20} />
          </button>
          
          {/* Color picker button - PALETTE */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              console.log('COLOR BUTTON CLICKED - showColorPicker:', !showColorPicker);
              setShowColorPicker(prev => !prev);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{ 
              pointerEvents: 'auto',
              position: 'absolute',
              top: -20,
              left: -20,
              width: 44,
              height: 44,
              zIndex: 9999,
              borderColor: decorator.color,
              WebkitTapHighlightColor: 'transparent'
            }}
            className="rounded-full bg-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-90 border-2 touch-manipulation"
            data-testid={`color-picker-${decorator.id}`}
          >
            <Palette size={20} style={{ color: decorator.color }} />
          </button>
          
          {/* Edit Text button - only for text decorators */}
          {decorator.type === 'text' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                console.log('EDIT TEXT CLICKED');
                setEditingText(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              style={{ 
                pointerEvents: 'auto',
                position: 'absolute',
                top: -20,
                left: 30,
                width: 44,
                height: 44,
                zIndex: 9999,
                WebkitTapHighlightColor: 'transparent'
              }}
              className="rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl hover:bg-blue-700 active:scale-90 border-2 border-white touch-manipulation"
              data-testid={`edit-text-${decorator.id}`}
            >
              <Type size={20} />
            </button>
          )}
          
          {/* Color picker dropdown */}
          {showColorPicker && (
            <div 
              style={{
                pointerEvents: 'auto',
                position: 'absolute',
                left: -10,
                top: 30,
                zIndex: 99999
              }}
              className="bg-slate-900 rounded-xl p-3 shadow-2xl flex gap-2 border-2 border-primary"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {DECORATOR_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('COLOR SELECTED:', c.value);
                    onUpdate(decorator.id, { color: c.value });
                    setShowColorPicker(false);
                  }}
                  style={{ 
                    pointerEvents: 'auto',
                    backgroundColor: c.value,
                    width: 40,
                    height: 40,
                    WebkitTapHighlightColor: 'transparent'
                  }}
                  className="rounded-full border-2 border-white/50 hover:scale-110 active:scale-90 transition-transform touch-manipulation"
                  title={c.name}
                  data-testid={`color-${c.name.toLowerCase()}`}
                />
              ))}
            </div>
          )}
          
          {/* Resize handle */}
          <div
            style={{
              pointerEvents: 'auto',
              position: 'absolute',
              bottom: -16,
              right: -16,
              width: 36,
              height: 36,
              zIndex: 9999
            }}
            className="bg-primary rounded-lg cursor-se-resize flex items-center justify-center border-2 border-white shadow-xl touch-manipulation"
            onPointerDown={handleResizeStart}
            onPointerMove={isResizing ? handlePointerMove : undefined}
            onPointerUp={isResizing ? handlePointerUp : undefined}
          >
            <Maximize2 size={16} className="text-white" />
          </div>
        </>
      )}
    </div>
  );
}

// Decorator Toolbar Component - FIXED: Now positioned outside the map canvas
function DecoratorToolbar({ onAddDecorator, visible, isMobile }) {
  if (!visible) return null;
  
  // This component renders OUTSIDE the map canvas as a separate bar
  return null; // Rendered separately in the main component
}

// Generate chair/seat positions around the table - as small semicircles attached to the table edge
const getChairPositions = (capacity, shape) => {
  const chairs = [];
  
  if (shape === 'round') {
    for (let i = 0; i < capacity; i++) {
      const angle = (i * 360 / capacity) - 90;
      chairs.push({ type: 'round', angle });
    }
  } else {
    // Square or rectangle - distribute on top and bottom
    const perSide = Math.ceil(capacity / 2);
    for (let i = 0; i < capacity; i++) {
      const side = i < perSide ? 'top' : 'bottom';
      const posIndex = i < perSide ? i : i - perSide;
      const total = side === 'top' ? perSide : capacity - perSide;
      chairs.push({ 
        type: 'rect',
        side, 
        position: (posIndex + 1) / (total + 1)
      });
    }
  }
  
  return chairs;
};

// Chair component - small semicircle attached to table
const Chair = ({ chair, tableW, tableH, shape, color }) => {
  // Chair size proportional to table - MIN ensures visibility on small tables
  const minDimension = Math.min(tableW, tableH);
  const size = Math.max(minDimension * 0.15, 8);
  
  if (chair.type === 'round') {
    const angle = chair.angle;
    const rad = (angle * Math.PI) / 180;
    const radiusX = tableW / 2;
    const radiusY = tableH / 2;
    const x = Math.cos(rad) * radiusX;
    const y = Math.sin(rad) * radiusY;
    
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          width: size,
          height: size * 0.55,
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle + 90}deg)`,
          background: `linear-gradient(180deg, ${color} 0%, ${color}90 100%)`,
          borderRadius: '50% 50% 0 0',
          boxShadow: `0 1px 3px rgba(0,0,0,0.4)`,
        }}
      />
    );
  } else {
    // Rectangle/Square tables
    const { side, position } = chair;
    const baseStyle = { 
      position: 'absolute',
      background: `linear-gradient(180deg, ${color} 0%, ${color}90 100%)`,
      boxShadow: `0 1px 3px rgba(0,0,0,0.4)`,
      pointerEvents: 'none',
    };
    
    if (side === 'top') {
      return (
        <div style={{ 
          ...baseStyle,
          width: size, 
          height: size * 0.5,
          left: `${position * 100}%`, 
          top: 0, 
          transform: `translate(-50%, -50%)`,
          borderRadius: '50% 50% 0 0',
        }} />
      );
    } else {
      return (
        <div style={{ 
          ...baseStyle,
          width: size, 
          height: size * 0.5,
          left: `${position * 100}%`, 
          bottom: 0,
          transform: `translate(-50%, 50%) rotate(180deg)`,
          borderRadius: '50% 50% 0 0',
        }} />
      );
    }
  }
};

// More visible pattern for divided tables - diagonal stripes with higher contrast
const stripedPattern = (isOther) => `repeating-linear-gradient(
  -45deg,
  rgba(${isOther ? '249,168,37' : '255,102,0'},0.5),
  rgba(${isOther ? '249,168,37' : '255,102,0'},0.5) 6px,
  rgba(${isOther ? '249,168,37' : '255,102,0'},0.15) 6px,
  rgba(${isOther ? '249,168,37' : '255,102,0'},0.15) 12px
)`;

function DraggableTable({ table, containerSize, onDragEnd, onClick, editMode, onResize, currentUserId, largeMode, device }) {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0, moved: false, pointerId: null });
  const nodeRef = useRef(null);

  // Determine if this table belongs to another user
  const isOtherUser = table.owner_id && table.owner_id !== currentUserId;
  const isDivided = table.status === 'divided';
  const isOccupied = table.status === 'occupied';
  
  // Get correct color scheme based on ownership
  let colorKey = table.status;
  if (isOtherUser && isOccupied) colorKey = 'occupied_other';
  if (isOtherUser && isDivided) colorKey = 'divided_other';
  
  const colors = statusColors[colorKey] || statusColors.free;
  const pxX = (table.x / 100) * containerSize.w;
  const pxY = (table.y / 100) * containerSize.h;
  
  // Responsive scaling based on device
  const getScale = () => {
    if (device?.isMobile) return Math.min(containerSize.w / 800, containerSize.h / 500, 1.2);
    if (device?.isTablet) return Math.min(containerSize.w / 1000, containerSize.h / 600, 1.3);
    return Math.min(containerSize.w / 1200, containerSize.h / 700, 1.5);
  };
  
  const scale = getScale();
  const baseW = table.width || 80;
  const baseH = table.height || 80;
  
  // Minimum sizes based on device
  const minW = device?.isMobile ? 55 : device?.isTablet ? 60 : 50;
  const minH = device?.isMobile ? 50 : device?.isTablet ? 55 : 45;
  
  const w = Math.max(minW, baseW * scale);
  const h = Math.max(minH, baseH * scale);
  const radius = table.shape === 'round' ? '50%' : table.shape === 'rectangle' ? '12px' : '16px';
  
  // Font sizes based on device
  const numberSize = device?.isMobile ? 'text-base' : largeMode ? 'text-xl' : 'text-lg';
  const capacitySize = device?.isMobile ? 'text-xs' : largeMode ? 'text-xs' : 'text-[11px]';
  const iconSize = device?.isMobile ? 10 : largeMode ? 12 : 9;

  useEffect(() => { setPos({ x: pxX, y: pxY }); }, [pxX, pxY]);

  const handlePointerDown = (e) => {
    if (!editMode) return;
    const d = dragRef.current;
    d.startX = e.clientX; d.startY = e.clientY;
    d.posX = pos.x; d.posY = pos.y;
    d.moved = false; d.pointerId = e.pointerId;
    setIsDragging(true);
    nodeRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const d = dragRef.current;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) d.moved = true;
    if (d.moved) {
      setPos({ x: Math.max(0, Math.min(containerSize.w - w, d.posX + dx)), y: Math.max(0, Math.min(containerSize.h - h, d.posY + dy)) });
    }
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    const d = dragRef.current;
    setIsDragging(false);
    try { nodeRef.current?.releasePointerCapture(d.pointerId); } catch {}
    if (d.moved) {
      onDragEnd(table, Math.max(0, Math.min(90, (pos.x / containerSize.w) * 100)), Math.max(0, Math.min(90, (pos.y / containerSize.h) * 100)));
    }
  };

  const handleClick = () => {
    if (!editMode) { onClick(table); return; }
    if (editMode) { onResize(table); }
  };

  // Get chair positions for this table
  const chairs = getChairPositions(table.capacity || 4, table.shape);
  const chairColor = colors.border;

  return (
    <div
      ref={nodeRef}
      data-testid={`table-${table.number}`}
      className="absolute flex flex-col items-center justify-center select-none touch-none"
      style={{
        left: pos.x, top: pos.y, width: w, height: h, borderRadius: radius,
        border: `${isDivided ? '4px' : '3px'} solid ${editMode ? '#FF6600' : colors.border}`,
        backgroundColor: editMode ? 'rgba(255,102,0,0.1)' : colors.bg,
        backgroundImage: isDivided && !editMode ? stripedPattern(isOtherUser) : 'none',
        boxShadow: isDragging 
          ? `0 0 25px ${colors.glow}, 0 8px 30px rgba(0,0,0,0.5)` 
          : isDivided 
            ? `0 0 20px ${colors.glow}, inset 0 0 15px ${isOtherUser ? 'rgba(2,136,209,0.2)' : 'rgba(255,102,0,0.2)'}` 
            : `0 0 15px ${colors.glow}`,
        backdropFilter: 'blur(8px)',
        cursor: editMode ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        zIndex: isDragging ? 100 : 1,
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
        transition: isDragging ? 'none' : 'transform 0.2s, box-shadow 0.2s',
        overflow: 'visible',
      }}
      onPointerDown={editMode ? handlePointerDown : undefined}
      onPointerMove={editMode ? handlePointerMove : undefined}
      onPointerUp={editMode ? handlePointerUp : undefined}
      onClick={handleClick}
    >
      {/* Chairs around the table - now INSIDE the table component */}
      {!editMode && chairs.map((chair, idx) => (
        <Chair 
          key={idx} 
          chair={chair} 
          tableW={w} 
          tableH={h} 
          shape={table.shape} 
          color={chairColor} 
        />
      ))}
      
      {/* Divided badge */}
      {isDivided && !editMode && (
        <div className={`absolute -top-2 -right-2 ${device?.isMobile ? 'w-5 h-5 text-xs' : largeMode ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-xs'} rounded-full flex items-center justify-center text-white font-bold shadow-lg border-2 border-background ${isOtherUser ? 'bg-yellow-500' : 'bg-orange-500'} z-10`}>
          ÷
        </div>
      )}
      <span className={`font-oswald font-bold ${numberSize}`} style={{ color: editMode ? '#FF6600' : colors.border }}>
        {table.number}
      </span>
      {editMode && (
        <span className={`text-primary mt-0.5 ${device?.isMobile ? 'text-[11px]' : largeMode ? 'text-xs' : 'text-[8px]'}`}>
          <Maximize2 size={device?.isMobile ? 9 : largeMode ? 10 : 8} className="inline" />
        </span>
      )}
    </div>
  );
}

export default function TableMap() {
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [decorators, setDecorators] = useState([]);
  const [activeArea, setActiveArea] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [resizeDialog, setResizeDialog] = useState({ open: false, table: null, width: 80, height: 80 });
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });
  const navigate = useNavigate();
  const { hasPermission, user, largeMode, device } = useAuth();

  // NCF Alerts state
  const [ncfAlerts, setNcfAlerts] = useState({ critical: [], warning: [], has_critical: false, has_warnings: false });
  const [showNcfAlert, setShowNcfAlert] = useState(true);

  const canMoveTable = hasPermission('move_tables');
  const currentUserId = user?.id;
  
  // Responsive helpers
  const isMobile = device?.isMobile;
  const isTablet = device?.isTablet;

  // Fetch NCF alerts
  const fetchNcfAlerts = useCallback(async () => {
    try {
      const res = await ncfAPI.getAlerts();
      if (res.data) {
        setNcfAlerts(res.data);
      }
    } catch (err) {
      console.warn('Could not fetch NCF alerts:', err);
    }
  }, []);

  // Load NCF alerts on mount and every 5 minutes
  useEffect(() => {
    fetchNcfAlerts();
    const interval = setInterval(fetchNcfAlerts, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [fetchNcfAlerts]);

  // Fetch decorators when area changes
  const fetchDecorators = useCallback(async () => {
    if (!activeArea) return;
    try {
      const res = await decoratorsAPI.list(activeArea);
      setDecorators(res.data || []);
    } catch (err) {
      console.warn('Could not fetch decorators:', err);
    }
  }, [activeArea]);

  useEffect(() => {
    fetchDecorators();
  }, [fetchDecorators]);

  // Decorator handlers
  const handleAddDecorator = async (type, defaultW, defaultH) => {
    if (!activeArea) return;
    try {
      const newDecorator = {
        area_id: activeArea,
        type,
        x: 40 + Math.random() * 20,
        y: 40 + Math.random() * 20,
        width: defaultW,
        height: defaultH,
        color: '#6B7280',
        text: type === 'text' ? 'Texto' : '',
      };
      const res = await decoratorsAPI.create(newDecorator);
      setDecorators(prev => [...prev, res.data]);
    } catch (err) {
      console.warn('Error creating decorator:', err);
    }
  };

  const handleUpdateDecorator = async (id, updates) => {
    try {
      await decoratorsAPI.update(id, updates);
      setDecorators(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    } catch (err) {
      console.warn('Error updating decorator:', err);
    }
  };

  const handleDeleteDecorator = async (id) => {
    try {
      await decoratorsAPI.delete(id);
      setDecorators(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.warn('Error deleting decorator:', err);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      // Check reservation activations first
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/reservations/check-activations`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      
      const [areasRes, tablesRes] = await Promise.all([areasAPI.list(), tablesAPI.list()]);
      setAreas(areasRes.data);
      setTables(tablesRes.data);
      // Cache areas for offline use
      try { localStorage.setItem('vexly_areas', JSON.stringify(areasRes.data)); } catch {}
      if (!activeArea && areasRes.data.length > 0) setActiveArea(areasRes.data[0].id);
    } catch {
      // Offline fallback — read from localStorage
      const cachedMesas = localStorage.getItem('vexly_mesas');
      const cachedAreas = localStorage.getItem('vexly_areas');
      if (cachedMesas) setTables(JSON.parse(cachedMesas));
      if (cachedAreas) {
        const areasData = JSON.parse(cachedAreas);
        setAreas(areasData);
        if (!activeArea && areasData.length > 0) setActiveArea(areasData[0].id);
      }
    }
  }, [activeArea]);

  useEffect(() => { fetchData(); }, [fetchData]);
  
  // Listen for table transfer notifications → refetch
  useEffect(() => {
    const handleTablesUpdated = () => fetchData();
    window.addEventListener('tablesUpdated', handleTablesUpdated);
    return () => window.removeEventListener('tablesUpdated', handleTablesUpdated);
  }, [fetchData]);
  
  // Check reservation activations every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Responsive aspect ratio for the map canvas
  // Mobile: uses full available space (no forced aspect ratio)
  // Tablet: 16:10 aspect ratio
  // Desktop: 16:10 aspect ratio
  const getMapAspectRatio = (viewportWidth) => {
    if (viewportWidth < 768) return null; // Mobile: use full container (no forced ratio)
    if (viewportWidth < 1024) return 16 / 10; // Tablet
    return 16 / 10; // Desktop
  };
  
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const MAP_ASPECT_RATIO = getMapAspectRatio(viewportWidth);
        
        let w = rect.width;
        let h = rect.height;
        
        // Mobile: use full width and calculate height based on content needs
        if (MAP_ASPECT_RATIO === null) {
          // Use full container width with small padding
          w = Math.max(rect.width - 8, rect.width * 0.98);
          // For mobile, ensure minimum height that can show all tables
          // Use a taller aspect ratio (closer to 1:1 or even portrait) to fit all content
          const mobileMapHeight = Math.max(
            w * 1.2, // Slightly taller than wide to fit tables vertically
            500, // Absolute minimum
            viewportHeight - 220 // Leave space for UI elements
          );
          h = mobileMapHeight;
        } else {
          // Tablet/Desktop: maintain aspect ratio
          const currentRatio = w / h;
          if (currentRatio > MAP_ASPECT_RATIO) {
            // Container is wider than needed - use height as reference
            w = h * MAP_ASPECT_RATIO;
          } else {
            // Container is taller than needed - use width as reference
            h = w / MAP_ASPECT_RATIO;
          }
        }
        
        setContainerSize({ 
          w, 
          h,
          // Store actual container dimensions for centering
          actualW: rect.width,
          actualH: rect.height,
          // Pass viewport info for responsive positioning
          isMobileView: viewportWidth < 768
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    // Also listen for orientation changes on mobile
    window.addEventListener('orientationchange', () => setTimeout(updateSize, 100));
    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredTables = tables.filter(t => t.area_id === activeArea);

  const handleDragEnd = async (table, newX, newY) => {
    try {
      await tablesAPI.update(table.id, { x: newX, y: newY });
      setTables(prev => prev.map(t => t.id === table.id ? { ...t, x: newX, y: newY } : t));
    } catch { console.warn('Error moviendo mesa'); }
  };

  const handleTableClick = (table) => {
    navigate(`/order/${table.id}`);
  };

  const handleResize = (table) => {
    setResizeDialog({ open: true, table, width: table.width || 80, height: table.height || 80 });
  };

  const handleSaveResize = async () => {
    if (!resizeDialog.table) return;
    try {
      await tablesAPI.update(resizeDialog.table.id, { width: resizeDialog.width, height: resizeDialog.height });
      setTables(prev => prev.map(t => t.id === resizeDialog.table.id ? { ...t, width: resizeDialog.width, height: resizeDialog.height } : t));
      setResizeDialog({ open: false, table: null, width: 80, height: 80 });
    } catch { console.warn('Error actualizando tamaño'); }
  };

  return (
    <div className="h-full flex flex-col" data-testid="table-map-page">
      {/* Header - Glassmorphism */}
      <div className={`px-3 sm:px-4 ${isMobile ? 'py-2' : largeMode ? 'py-4' : 'py-3'} backdrop-blur-xl bg-white/5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
        <h1 className={`font-oswald font-bold tracking-wide text-white ${isMobile ? 'text-lg' : largeMode ? 'text-2xl' : 'text-xl'}`}>MAPA DE MESAS</h1>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Legend - Hidden on mobile, collapsed on tablet */}
          <div className={`items-center gap-2 sm:gap-3 flex-wrap ${isMobile ? 'hidden' : isTablet ? 'hidden sm:flex' : 'flex'} ${largeMode ? 'text-sm' : 'text-xs'} text-white/70`}>
            <span className="flex items-center gap-1.5"><span className={`${largeMode ? 'w-4 h-4' : 'w-3 h-3'} rounded-full`} style={{backgroundColor:'#1E88E5'}} /> Libre</span>
            <span className="flex items-center gap-1.5"><span className={`${largeMode ? 'w-4 h-4' : 'w-3 h-3'} rounded-full bg-table-occupied`} /> Mis mesas</span>
            <span className="flex items-center gap-1.5"><span className={`${largeMode ? 'w-4 h-4' : 'w-3 h-3'} rounded-full`} style={{backgroundColor:'#F9A825'}} /> De otros</span>
            <span className="flex items-center gap-1.5"><span className={`${largeMode ? 'w-4 h-4' : 'w-3 h-3'} rounded-full`} style={{backgroundColor:'#FF6600'}} /> Dividida</span>
            <span className="flex items-center gap-1.5"><span className={`${largeMode ? 'w-4 h-4' : 'w-3 h-3'} rounded-full`} style={{backgroundColor:'#2E7D4E'}} /> Por Facturar</span>
            <span className="flex items-center gap-1.5"><span className={`${largeMode ? 'w-4 h-4' : 'w-3 h-3'} rounded-full`} style={{backgroundColor:'#7C4DFF'}} /> Reservada</span>
          </div>
          {canMoveTable && (
            <button
              onClick={() => setEditMode(!editMode)}
              data-testid="edit-mode-toggle"
              className={`${isMobile ? 'text-xs h-9 px-3' : largeMode ? 'text-sm h-10 px-4' : 'text-xs h-9 px-3'} rounded-xl font-oswald font-bold transition-all active:scale-95 ${
                editMode 
                  ? 'bg-white/20 text-white border border-white/30' 
                  : 'backdrop-blur-md bg-white/10 border border-white/20 text-white/80 hover:bg-white/20'
              }`}
            >
              {editMode ? <><Unlock size={isMobile ? 14 : largeMode ? 18 : 14} className="inline mr-1" /> Editando</> : <><Lock size={isMobile ? 14 : largeMode ? 18 : 14} className="inline mr-1" /> Editar</>}
            </button>
          )}
        </div>
      </div>

      {/* Area Tabs - Glassmorphism */}
      <div className={`flex gap-1 px-3 sm:px-4 pt-2 sm:pt-3 overflow-x-auto scrollbar-hide`} data-testid="area-tabs">
        {areas.map(area => (
          <button key={area.id} onClick={() => setActiveArea(area.id)}
            data-testid={`area-tab-${area.name.toLowerCase().replace(/\s/g, '-')}`}
            className={`${isMobile ? 'px-4 py-2 text-sm min-w-fit' : largeMode ? 'px-6 py-3 text-base' : 'px-5 py-2.5 text-sm'} rounded-t-xl font-oswald tracking-wide whitespace-nowrap transition-all btn-press ${
              activeArea === area.id 
                ? 'backdrop-blur-xl bg-white/15 border-t-2 border-x border-white/20 text-white' 
                : 'backdrop-blur-md bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 border-t border-x border-transparent'
            }`} style={activeArea === area.id ? { borderTopColor: area.color } : {}}>
            {area.name}
          </button>
        ))}
      </div>

      {/* Decorator Toolbar - OUTSIDE the map canvas, only in edit mode */}
      {editMode && (
        <div 
          className={`mx-2 sm:mx-4 mb-1 backdrop-blur-xl bg-slate-900/95 border border-primary/50 rounded-xl shadow-lg flex items-center ${
            isMobile ? 'justify-around p-2' : 'justify-start gap-2 px-4 py-2'
          }`}
          data-testid="decorator-toolbar"
        >
          <span className={`text-primary font-oswald text-xs font-bold ${isMobile ? 'hidden' : 'mr-3'}`}>DECORADORES:</span>
          {DECORATOR_TYPES.map(dt => (
            <button
              key={dt.type}
              onClick={() => handleAddDecorator(dt.type, dt.defaultW, dt.defaultH)}
              className={`flex items-center gap-1.5 rounded-lg font-medium transition-all active:scale-95 text-white/80 hover:text-white hover:bg-white/20 border border-transparent hover:border-primary/50 ${
                isMobile ? 'flex-col px-2 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
              }`}
              data-testid={`add-${dt.type}`}
              title={dt.label}
            >
              <dt.icon size={isMobile ? 18 : 16} className="text-primary" />
              <span className="text-[10px]">{dt.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table Canvas - Glassmorphism */}
      <div 
        ref={containerRef} 
        className={`relative backdrop-blur-xl bg-white/5 mx-2 sm:mx-4 mb-2 sm:mb-4 rounded-xl border border-white/10 ${
          isMobile 
            ? 'overflow-auto min-h-[500px] flex-1' 
            : 'overflow-hidden flex-1'
        }`}
        style={isMobile ? { 
          maxHeight: 'calc(100vh - 200px)', // Leave space for header, tabs, and nav bar
          WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
        } : {}}
        data-testid="table-canvas"
      >
        {editMode && (
          <div className={`absolute top-2 ${isMobile ? 'left-2 right-2 text-center' : 'left-2'} z-50 backdrop-blur-xl bg-white/20 text-white border border-white/30 ${isMobile ? 'text-xs px-3 py-1' : largeMode ? 'text-sm px-4 py-2' : 'text-xs px-3 py-1.5'} rounded-full font-oswald tracking-wider animate-pulse`}>
            {isMobile ? 'MODO EDICION' : 'MODO EDICION - Arrastra mesas o decoradores'}
          </div>
        )}
        
        {/* Map area with fixed aspect ratio - positioned based on device */}
        <div 
          className={isMobile ? 'relative' : 'absolute'}
          style={{
            width: containerSize.w,
            height: containerSize.h,
            ...(isMobile ? {
              // Mobile: relative positioning, centered horizontally
              margin: '0 auto',
              minHeight: containerSize.h,
            } : {
              // Desktop/Tablet: absolute positioning, centered
              left: containerSize.actualW ? (containerSize.actualW - containerSize.w) / 2 : 0,
              top: containerSize.actualH ? (containerSize.actualH - containerSize.h) / 2 : 0,
            })
          }}
        >
          {/* Decorators Layer - BEHIND tables (lower z-index) */}
          {decorators.filter(d => d.area_id === activeArea).map(decorator => (
            <DraggableDecorator
              key={decorator.id}
              decorator={decorator}
              containerSize={containerSize}
              onUpdate={handleUpdateDecorator}
              onDelete={handleDeleteDecorator}
              editMode={editMode}
              device={device}
            />
          ))}
          
          {/* Tables Layer - ON TOP of decorators */}
          {containerSize.w > 0 && filteredTables.map(table => (
            <DraggableTable key={table.id} table={table} containerSize={containerSize}
              onDragEnd={handleDragEnd} onClick={handleTableClick}
              editMode={editMode} onResize={handleResize} currentUserId={currentUserId} largeMode={largeMode} device={device} />
          ))}
        </div>
        {filteredTables.length === 0 && decorators.filter(d => d.area_id === activeArea).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-white/40">
            <div className="text-center">
              <Plus size={isMobile ? 28 : largeMode ? 40 : 32} className="mx-auto mb-2 opacity-40" />
              <p className={isMobile ? 'text-sm' : largeMode ? 'text-base' : 'text-sm'}>No hay mesas en esta area</p>
            </div>
          </div>
        )}
      </div>

      {/* Resize Dialog - Glassmorphism */}
      <Dialog open={resizeDialog.open} onOpenChange={(o) => !o && setResizeDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm backdrop-blur-xl bg-slate-900/90 border-white/20" data-testid="resize-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-white">Redimensionar Mesa {resizeDialog.table?.number}</DialogTitle></DialogHeader>
          <div className="space-y-6">
            <div>
              <label className="text-sm text-white/60 mb-2 block">Ancho: {resizeDialog.width}px</label>
              <Slider value={[resizeDialog.width]} onValueChange={([v]) => setResizeDialog(p => ({ ...p, width: v }))}
                min={40} max={160} step={5} className="py-2" />
            </div>
            <div>
              <label className="text-sm text-white/60 mb-2 block">Alto: {resizeDialog.height}px</label>
              <Slider value={[resizeDialog.height]} onValueChange={([v]) => setResizeDialog(p => ({ ...p, height: v }))}
                min={40} max={160} step={5} className="py-2" />
            </div>
            <div className="flex items-center justify-center p-4 backdrop-blur-md bg-white/5 rounded-lg border border-white/10">
              <div style={{
                width: resizeDialog.width * 0.8, height: resizeDialog.height * 0.8,
                borderRadius: resizeDialog.table?.shape === 'round' ? '50%' : '12px',
                border: '2px solid #FF6600', backgroundColor: 'rgba(255,102,0,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="font-oswald text-primary font-bold">{resizeDialog.table?.number}</span>
              </div>
            </div>
            <button onClick={handleSaveResize} className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-oswald font-bold active:scale-95 transition-all" data-testid="save-resize">
              GUARDAR TAMANO
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
