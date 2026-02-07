import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { areasAPI, tablesAPI } from '@/lib/api';
import { Users, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Draggable from 'react-draggable';

const statusColors = {
  free: { border: '#2E7D4E', bg: 'rgba(46,125,78,0.15)', glow: 'rgba(46,125,78,0.4)' },
  occupied: { border: '#C62828', bg: 'rgba(198,40,40,0.15)', glow: 'rgba(198,40,40,0.4)' },
  billed: { border: '#F9A825', bg: 'rgba(249,168,37,0.15)', glow: 'rgba(249,168,37,0.4)' },
};

export default function TableMap() {
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeArea, setActiveArea] = useState(null);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      const [areasRes, tablesRes] = await Promise.all([areasAPI.list(), tablesAPI.list()]);
      setAreas(areasRes.data);
      setTables(tablesRes.data);
      if (!activeArea && areasRes.data.length > 0) setActiveArea(areasRes.data[0].id);
    } catch (e) {
      toast.error('Error cargando datos');
    }
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

  // Refresh every 10s
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredTables = tables.filter(t => t.area_id === activeArea);
  const currentArea = areas.find(a => a.id === activeArea);

  const toPixels = (pct, dimension) => (pct / 100) * dimension;
  const toPct = (px, dimension) => Math.max(0, Math.min(90, (px / dimension) * 100));

  const handleDragStop = async (table, e, data) => {
    const newX = toPct(data.x, containerSize.w);
    const newY = toPct(data.y, containerSize.h);
    try {
      await tablesAPI.update(table.id, { x: newX, y: newY });
      setTables(prev => prev.map(t => t.id === table.id ? { ...t, x: newX, y: newY } : t));
    } catch {
      toast.error('Error moviendo mesa');
    }
  };

  const handleTableClick = (table) => {
    navigate(`/order/${table.id}`);
  };

  const getTableShape = (table) => {
    const w = (table.width / 100) * containerSize.w * 0.8;
    const h = (table.height / 100) * containerSize.h * 0.8;
    const minW = 70;
    const minH = 60;
    const finalW = Math.max(minW, Math.min(w, 140));
    const finalH = Math.max(minH, Math.min(h, 120));
    return {
      width: finalW,
      height: finalH,
      borderRadius: table.shape === 'round' ? '50%' : table.shape === 'rectangle' ? '12px' : '16px',
    };
  };

  return (
    <div className="h-full flex flex-col" data-testid="table-map-page">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <h1 className="font-oswald text-xl font-bold tracking-wide">MAPA DE MESAS</h1>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-table-free" /> Libre</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-table-occupied" /> Ocupada</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-table-billed" /> Facturada</span>
        </div>
      </div>

      {/* Area Tabs */}
      <div className="flex gap-1 px-4 pt-3 overflow-x-auto" data-testid="area-tabs">
        {areas.map(area => (
          <button
            key={area.id}
            onClick={() => setActiveArea(area.id)}
            data-testid={`area-tab-${area.name.toLowerCase().replace(/\s/g, '-')}`}
            className={`px-5 py-2.5 rounded-t-lg font-oswald text-sm tracking-wide whitespace-nowrap transition-all btn-press ${
              activeArea === area.id
                ? 'bg-background border-t border-x border-border text-primary'
                : 'bg-card/50 text-muted-foreground hover:text-foreground border-t border-x border-transparent'
            }`}
            style={activeArea === area.id ? { borderTopColor: area.color } : {}}
          >
            {area.name}
          </button>
        ))}
      </div>

      {/* Table Map Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-background grid-bg mx-4 mb-4 rounded-b-xl rounded-tr-xl border border-border overflow-hidden"
        data-testid="table-canvas"
      >
        {filteredTables.map(table => {
          const colors = statusColors[table.status] || statusColors.free;
          const shape = getTableShape(table);
          const x = toPixels(table.x, containerSize.w);
          const y = toPixels(table.y, containerSize.h);

          return (
            <Draggable
              key={table.id}
              position={{ x, y }}
              onStop={(e, data) => handleDragStop(table, e, data)}
              bounds="parent"
              cancel=".no-drag"
            >
              <div
                className="absolute cursor-move flex flex-col items-center justify-center transition-shadow"
                data-testid={`table-${table.number}`}
                style={{
                  width: shape.width,
                  height: shape.height,
                  borderRadius: shape.borderRadius,
                  border: `2px solid ${colors.border}`,
                  backgroundColor: colors.bg,
                  boxShadow: `0 0 15px ${colors.glow}`,
                  backdropFilter: 'blur(8px)',
                }}
                onDoubleClick={() => handleTableClick(table)}
              >
                <span className="font-oswald text-xl font-bold" style={{ color: colors.border }}>
                  {table.number}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Users size={10} /> {table.capacity}
                </span>
                {table.status !== 'free' && (
                  <span className="text-[9px] mt-0.5 font-medium uppercase tracking-wider"
                    style={{ color: colors.border }}>
                    {table.status === 'occupied' ? 'Ocupada' : 'Facturada'}
                  </span>
                )}
                <button
                  className="no-drag absolute inset-0 opacity-0"
                  onClick={() => handleTableClick(table)}
                  aria-label={`Abrir mesa ${table.number}`}
                />
              </div>
            </Draggable>
          );
        })}

        {filteredTables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Plus size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay mesas en esta area</p>
              <p className="text-xs opacity-60">Agrega mesas desde Configuracion</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
