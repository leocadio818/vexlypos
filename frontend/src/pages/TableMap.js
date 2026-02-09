import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { areasAPI, tablesAPI } from '@/lib/api';
import { Users, Plus, Lock, Unlock, Maximize2, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';

const statusColors = {
  free: { border: '#2E7D4E', bg: 'rgba(46,125,78,0.15)', glow: 'rgba(46,125,78,0.4)' },
  occupied: { border: '#C62828', bg: 'rgba(198,40,40,0.15)', glow: 'rgba(198,40,40,0.4)' },
  occupied_other: { border: '#1565C0', bg: 'rgba(21,101,192,0.15)', glow: 'rgba(21,101,192,0.4)' }, // Blue for other users
  billed: { border: '#F9A825', bg: 'rgba(249,168,37,0.15)', glow: 'rgba(249,168,37,0.4)' },
  reserved: { border: '#7C4DFF', bg: 'rgba(124,77,255,0.15)', glow: 'rgba(124,77,255,0.4)' },
  divided: { border: '#FF6600', bg: 'rgba(255,102,0,0.25)', glow: 'rgba(255,102,0,0.5)' },
  divided_other: { border: '#0288D1', bg: 'rgba(2,136,209,0.25)', glow: 'rgba(2,136,209,0.5)' }, // Light blue for divided by others
};

// More visible pattern for divided tables - diagonal stripes with higher contrast
const stripedPattern = `repeating-linear-gradient(
  -45deg,
  rgba(255,102,0,0.5),
  rgba(255,102,0,0.5) 6px,
  rgba(255,102,0,0.15) 6px,
  rgba(255,102,0,0.15) 12px
)`;

function DraggableTable({ table, containerSize, onDragEnd, onClick, editMode, onResize }) {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0, moved: false, pointerId: null });
  const nodeRef = useRef(null);

  const colors = statusColors[table.status] || statusColors.free;
  const isDivided = table.status === 'divided';
  const pxX = (table.x / 100) * containerSize.w;
  const pxY = (table.y / 100) * containerSize.h;
  const scale = Math.min(containerSize.w / 1200, containerSize.h / 700, 1.5);
  const baseW = table.width || 80;
  const baseH = table.height || 80;
  const w = Math.max(50, baseW * scale);
  const h = Math.max(45, baseH * scale);
  const radius = table.shape === 'round' ? '50%' : table.shape === 'rectangle' ? '12px' : '16px';

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

  return (
    <div
      ref={nodeRef}
      data-testid={`table-${table.number}`}
      className="absolute flex flex-col items-center justify-center select-none touch-none"
      style={{
        left: pos.x, top: pos.y, width: w, height: h, borderRadius: radius,
        border: `${isDivided ? '4px' : '3px'} solid ${editMode ? '#FF6600' : colors.border}`,
        backgroundColor: editMode ? 'rgba(255,102,0,0.1)' : colors.bg,
        backgroundImage: isDivided && !editMode ? stripedPattern : 'none',
        boxShadow: isDragging 
          ? `0 0 25px ${colors.glow}, 0 8px 30px rgba(0,0,0,0.5)` 
          : isDivided 
            ? `0 0 20px ${colors.glow}, inset 0 0 15px rgba(255,102,0,0.2)` 
            : `0 0 15px ${colors.glow}`,
        backdropFilter: 'blur(8px)',
        cursor: editMode ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        zIndex: isDragging ? 100 : 1,
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
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold shadow-lg border-2 border-background">
          ÷
        </div>
      )}
      <span className="font-oswald text-lg font-bold" style={{ color: editMode ? '#FF6600' : colors.border }}>
        {table.number}
      </span>
      <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <Users size={9} /> {table.capacity}
      </span>
      {editMode && (
        <span className="text-[8px] text-primary mt-0.5"><Maximize2 size={8} className="inline" /></span>
      )}
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
  const { hasPermission } = useAuth();

  const canMoveTable = hasPermission('move_tables');

  const fetchData = useCallback(async () => {
    try {
      const [areasRes, tablesRes] = await Promise.all([areasAPI.list(), tablesAPI.list()]);
      setAreas(areasRes.data);
      setTables(tablesRes.data);
      if (!activeArea && areasRes.data.length > 0) setActiveArea(areasRes.data[0].id);
    } catch { toast.error('Error cargando datos'); }
  }, [activeArea]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    if (table.status === 'reserved') {
      toast.error('Mesa reservada. Solo un gerente puede desbloquearla.');
      return;
    }
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
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <h1 className="font-oswald text-xl font-bold tracking-wide">MAPA DE MESAS</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-table-free" /> Libre</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-table-occupied" /> Ocupada</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{backgroundColor:'#FF6600'}} /> Dividida</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-table-billed" /> Facturada</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{backgroundColor:'#7C4DFF'}} /> Reservada</span>
          </div>
          {canMoveTable && (
            <Button
              variant={editMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditMode(!editMode)}
              data-testid="edit-mode-toggle"
              className={`text-xs ${editMode ? 'bg-primary text-white' : 'border-primary/50 text-primary'}`}
            >
              {editMode ? <><Unlock size={14} className="mr-1" /> Editando</> : <><Lock size={14} className="mr-1" /> Editar</>}
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 px-4 pt-3 overflow-x-auto" data-testid="area-tabs">
        {areas.map(area => (
          <button key={area.id} onClick={() => setActiveArea(area.id)}
            data-testid={`area-tab-${area.name.toLowerCase().replace(/\s/g, '-')}`}
            className={`px-5 py-2.5 rounded-t-lg font-oswald text-sm tracking-wide whitespace-nowrap transition-all btn-press ${
              activeArea === area.id ? 'bg-background border-t-2 border-x border-border text-primary' : 'bg-card/50 text-muted-foreground hover:text-foreground border-t border-x border-transparent'
            }`} style={activeArea === area.id ? { borderTopColor: area.color } : {}}>
            {area.name}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="flex-1 relative bg-background grid-bg mx-4 mb-4 rounded-b-xl rounded-tr-xl border border-border overflow-hidden" data-testid="table-canvas">
        {editMode && (
          <div className="absolute top-2 left-2 z-50 bg-primary/90 text-white text-xs px-3 py-1.5 rounded-full font-oswald tracking-wider animate-pulse">
            MODO EDICION - Arrastra o toca para redimensionar
          </div>
        )}
        {containerSize.w > 0 && filteredTables.map(table => (
          <DraggableTable key={table.id} table={table} containerSize={containerSize}
            onDragEnd={handleDragEnd} onClick={handleTableClick}
            editMode={editMode} onResize={handleResize} />
        ))}
        {filteredTables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Plus size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay mesas en esta area</p>
            </div>
          </div>
        )}
      </div>

      {/* Resize Dialog */}
      <Dialog open={resizeDialog.open} onOpenChange={(o) => !o && setResizeDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="resize-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Redimensionar Mesa {resizeDialog.table?.number}</DialogTitle></DialogHeader>
          <div className="space-y-6">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Ancho: {resizeDialog.width}px</label>
              <Slider value={[resizeDialog.width]} onValueChange={([v]) => setResizeDialog(p => ({ ...p, width: v }))}
                min={40} max={160} step={5} className="py-2" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Alto: {resizeDialog.height}px</label>
              <Slider value={[resizeDialog.height]} onValueChange={([v]) => setResizeDialog(p => ({ ...p, height: v }))}
                min={40} max={160} step={5} className="py-2" />
            </div>
            <div className="flex items-center justify-center p-4 bg-background rounded-lg border border-border">
              <div style={{
                width: resizeDialog.width * 0.8, height: resizeDialog.height * 0.8,
                borderRadius: resizeDialog.table?.shape === 'round' ? '50%' : '12px',
                border: '2px solid #FF6600', backgroundColor: 'rgba(255,102,0,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="font-oswald text-primary font-bold">{resizeDialog.table?.number}</span>
              </div>
            </div>
            <Button onClick={handleSaveResize} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="save-resize">
              GUARDAR TAMANO
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
