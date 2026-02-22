import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { areasAPI, tablesAPI, ncfAPI } from '@/lib/api';
import { Users, Plus, Lock, Unlock, Maximize2, Minus, AlertTriangle, FileText, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
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

// Generate chair/seat positions around the table
const getChairPositions = (capacity, shape, w, h) => {
  const chairs = [];
  const chairSize = Math.min(w, h) * 0.25; // Chair size relative to table
  const offset = chairSize * 0.7; // Distance from table edge
  
  if (shape === 'round') {
    // Distribute chairs in a circle around the table
    for (let i = 0; i < capacity; i++) {
      const angle = (i * 360 / capacity) - 90; // Start from top
      const rad = (angle * Math.PI) / 180;
      const radius = Math.max(w, h) / 2 + offset;
      chairs.push({
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        rotation: angle + 90, // Face the table
        size: chairSize
      });
    }
  } else if (shape === 'rectangle') {
    // Long table - distribute on long sides primarily
    const isHorizontal = w >= h;
    const longSide = Math.max(w, h);
    const shortSide = Math.min(w, h);
    
    // For rectangle: put chairs on the long sides
    const perLongSide = Math.ceil(capacity / 2);
    const spacingLong = longSide / (perLongSide + 1);
    
    for (let i = 0; i < capacity; i++) {
      const side = i < perLongSide ? 0 : 1;
      const posIndex = i < perLongSide ? i : i - perLongSide;
      
      if (isHorizontal) {
        // Wide table - chairs on top and bottom
        chairs.push({
          x: -w/2 + spacingLong * (posIndex + 1),
          y: side === 0 ? -h/2 - offset : h/2 + offset,
          rotation: side === 0 ? 180 : 0,
          size: chairSize
        });
      } else {
        // Tall table - chairs on left and right
        chairs.push({
          x: side === 0 ? -w/2 - offset : w/2 + offset,
          y: -h/2 + spacingLong * (posIndex + 1),
          rotation: side === 0 ? 90 : -90,
          size: chairSize
        });
      }
    }
  } else {
    // Square table - distribute evenly on all 4 sides
    const perSide = Math.ceil(capacity / 4);
    const extraChairs = capacity % 4;
    const sides = [
      { name: 'top', chairs: perSide + (extraChairs > 0 ? 1 : 0) },
      { name: 'right', chairs: perSide + (extraChairs > 1 ? 1 : 0) },
      { name: 'bottom', chairs: perSide + (extraChairs > 2 ? 1 : 0) },
      { name: 'left', chairs: perSide + (extraChairs > 3 ? 1 : 0) }
    ];
    
    let placed = 0;
    for (const sideInfo of sides) {
      if (placed >= capacity) break;
      const count = Math.min(sideInfo.chairs, capacity - placed);
      const spacing = (sideInfo.name === 'top' || sideInfo.name === 'bottom' ? w : h) / (count + 1);
      
      for (let i = 0; i < count && placed < capacity; i++) {
        let x, y, rotation;
        const pos = spacing * (i + 1);
        
        switch(sideInfo.name) {
          case 'top':
            x = -w/2 + pos; y = -h/2 - offset; rotation = 180; break;
          case 'right':
            x = w/2 + offset; y = -h/2 + pos; rotation = -90; break;
          case 'bottom':
            x = -w/2 + pos; y = h/2 + offset; rotation = 0; break;
          case 'left':
            x = -w/2 - offset; y = -h/2 + pos; rotation = 90; break;
          default:
            x = 0; y = 0; rotation = 0;
        }
        
        chairs.push({ x, y, rotation, size: chairSize });
        placed++;
      }
    }
  }
  
  return chairs;
};

// Chair/Person icon component
const ChairIcon = ({ x, y, rotation, size, color, isMobile }) => {
  const actualSize = isMobile ? size * 0.75 : size;
  
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: '50%',
        top: '50%',
        width: actualSize,
        height: actualSize,
        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotation}deg)`,
      }}
    >
      {/* Person silhouette - modern minimal style */}
      <svg 
        viewBox="0 0 24 24" 
        fill={color}
        className="w-full h-full"
        style={{ filter: `drop-shadow(0 1px 3px rgba(0,0,0,0.4))` }}
      >
        {/* Head */}
        <circle cx="12" cy="5" r="4" opacity="0.95" />
        {/* Body - rounded shoulders */}
        <path 
          d="M12 11c-4.5 0-8 2.5-8 6v1.5c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5V17c0-3.5-3.5-6-8-6z" 
          opacity="0.85"
        />
      </svg>
    </div>
  );
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
  const capacitySize = device?.isMobile ? 'text-[10px]' : largeMode ? 'text-xs' : 'text-[9px]';
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
  const chairs = getChairPositions(table.capacity || 4, table.shape, w, h);
  const chairColor = editMode ? '#FF6600' : colors.border;

  return (
    <div
      ref={nodeRef}
      data-testid={`table-${table.number}`}
      className="absolute select-none touch-none"
      style={{
        left: pos.x - w * 0.3, // Extra space for chairs
        top: pos.y - h * 0.3,
        width: w * 1.6,
        height: h * 1.6,
        zIndex: isDragging ? 100 : 1,
      }}
    >
      {/* Chairs/Seats around the table */}
      {!editMode && chairs.map((chair, idx) => (
        <ChairIcon
          key={idx}
          x={chair.x + w * 0.3}
          y={chair.y + h * 0.3}
          rotation={chair.rotation}
          size={chair.size}
          color={chairColor}
          isMobile={device?.isMobile}
        />
      ))}
      
      {/* The actual table */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          left: w * 0.3,
          top: h * 0.3,
          width: w, 
          height: h, 
          borderRadius: radius,
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
          transform: isDragging ? 'scale(1.05)' : 'scale(1)',
          transition: isDragging ? 'none' : 'transform 0.2s, box-shadow 0.2s',
        }}
        onPointerDown={editMode ? handlePointerDown : undefined}
        onPointerMove={editMode ? handlePointerMove : undefined}
        onPointerUp={editMode ? handlePointerUp : undefined}
        onClick={handleClick}
      >
        {/* Divided badge */}
        {isDivided && !editMode && (
          <div className={`absolute -top-2 -right-2 ${device?.isMobile ? 'w-5 h-5 text-[10px]' : largeMode ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]'} rounded-full flex items-center justify-center text-white font-bold shadow-lg border-2 border-background ${isOtherUser ? 'bg-yellow-500' : 'bg-orange-500'}`}>
            ÷
          </div>
        )}
        <span className={`font-oswald font-bold ${numberSize}`} style={{ color: editMode ? '#FF6600' : colors.border }}>
          {table.number}
        </span>
        {editMode && (
          <span className={`text-primary mt-0.5 ${device?.isMobile ? 'text-[9px]' : largeMode ? 'text-[10px]' : 'text-[8px]'}`}>
            <Maximize2 size={device?.isMobile ? 9 : largeMode ? 10 : 8} className="inline" />
          </span>
        )}
      </div>
    </div>
  );
}

export default function TableMap() {
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
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

  const fetchData = useCallback(async () => {
    try {
      // Check reservation activations first
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/reservations/check-activations`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      
      const [areasRes, tablesRes] = await Promise.all([areasAPI.list(), tablesAPI.list()]);
      setAreas(areasRes.data);
      setTables(tablesRes.data);
      if (!activeArea && areasRes.data.length > 0) setActiveArea(areasRes.data[0].id);
    } catch { toast.error('Error cargando datos'); }
  }, [activeArea]);

  useEffect(() => { fetchData(); }, [fetchData]);
  
  // Check reservation activations every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
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
    } catch { toast.error('Error moviendo mesa'); }
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
      toast.success('Tamano actualizado');
      setResizeDialog({ open: false, table: null, width: 80, height: 80 });
    } catch { toast.error('Error'); }
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

      {/* Table Canvas - Glassmorphism */}
      <div ref={containerRef} className="flex-1 relative backdrop-blur-xl bg-white/5 mx-2 sm:mx-4 mb-2 sm:mb-4 rounded-b-xl rounded-tr-xl border border-white/10 overflow-hidden" data-testid="table-canvas">
        {editMode && (
          <div className={`absolute top-2 left-2 z-50 backdrop-blur-xl bg-white/20 text-white border border-white/30 ${isMobile ? 'text-[10px] px-3 py-1' : largeMode ? 'text-sm px-4 py-2' : 'text-xs px-3 py-1.5'} rounded-full font-oswald tracking-wider animate-pulse`}>
            {isMobile ? 'MODO EDICION' : 'MODO EDICION - Arrastra o toca para redimensionar'}
          </div>
        )}
        {containerSize.w > 0 && filteredTables.map(table => (
          <DraggableTable key={table.id} table={table} containerSize={containerSize}
            onDragEnd={handleDragEnd} onClick={handleTableClick}
            editMode={editMode} onResize={handleResize} currentUserId={currentUserId} largeMode={largeMode} device={device} />
        ))}
        {filteredTables.length === 0 && (
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
