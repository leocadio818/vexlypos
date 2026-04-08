import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  AlertCircle, AlertTriangle, Info, CheckCircle2, 
  RefreshCw, Filter, Trash2, Clock, User, Monitor,
  Printer, CreditCard, Mail, Package, FileText, Shield
} from 'lucide-react';
import { notify } from '@/lib/notify';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Module icons
const MODULE_ICONS = {
  payments: CreditCard,
  printing: Printer,
  ecf: FileText,
  email: Mail,
  inventory: Package,
  auth: Shield,
  test: AlertCircle,
};

// Level colors and icons
const LEVEL_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', badge: 'bg-red-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', badge: 'bg-amber-500' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10', badge: 'bg-blue-500' },
};

export default function SystemLogsTab() {
  const { user } = useAuth();
  const { isMinimalist, isNeoDark } = useTheme();
  const isLightMode = isMinimalist && !isNeoDark;
  
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ by_level: {}, by_module: {}, unresolved: 0, today: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [resolveDialog, setResolveDialog] = useState({ open: false, log: null, notes: '' });
  
  // Filters
  const [filters, setFilters] = useState({
    module: '',
    level: '',
    resolved: null
  });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('limit', '100');
      if (filters.module) params.append('module', filters.module);
      if (filters.level) params.append('level', filters.level);
      if (filters.resolved !== null) params.append('resolved', filters.resolved);
      
      const [logsRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/system-logs?${params}`, { headers: headers() }),
        axios.get(`${API}/api/system-logs/stats`, { headers: headers() })
      ]);
      
      setLogs(logsRes.data.logs || []);
      setStats(statsRes.data || { by_level: {}, by_module: {}, unresolved: 0, today: 0 });
    } catch (e) {
      notify.error('Error cargando logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleResolve = async () => {
    if (!resolveDialog.log) return;
    try {
      await axios.put(
        `${API}/api/system-logs/${resolveDialog.log.id}/resolve`,
        { notes: resolveDialog.notes },
        { headers: headers() }
      );
      notify.success('Log marcado como resuelto');
      setResolveDialog({ open: false, log: null, notes: '' });
      fetchLogs();
    } catch (e) {
      notify.error('Error al resolver log');
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm('¿Eliminar logs resueltos de más de 30 días?')) return;
    try {
      const res = await axios.delete(`${API}/api/system-logs/cleanup?days=30`, { headers: headers() });
      notify.success(`${res.data.deleted} logs eliminados`);
      fetchLogs();
    } catch (e) {
      notify.error('Error al limpiar logs');
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-DO', { 
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const ModuleIcon = ({ module }) => {
    const Icon = MODULE_ICONS[module] || AlertCircle;
    return <Icon size={16} />;
  };

  const LevelBadge = ({ level }) => {
    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.info;
    return (
      <Badge className={`${config.badge} text-white text-xs px-1.5 py-0.5`}>
        {level.toUpperCase()}
      </Badge>
    );
  };

  // Check permission
  if (user?.role !== 'admin' && user?.role !== 'supervisor') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No tienes permiso para ver los logs del sistema</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          className="rounded-xl p-4 text-center"
          style={isLightMode 
            ? { backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }
            : { backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }
          }
        >
          <AlertCircle size={24} className="mx-auto mb-2 text-red-500" style={{ stroke: '#EF4444' }} />
          <p className="text-2xl font-bold" style={{ color: isLightMode ? '#DC2626' : '#F87171' }}>
            {stats.unresolved || 0}
          </p>
          <p className="text-xs" style={{ color: isLightMode ? '#991B1B' : '#FCA5A5' }}>
            Sin Resolver
          </p>
        </div>
        
        <div 
          className="rounded-xl p-4 text-center"
          style={isLightMode 
            ? { backgroundColor: '#FEF3C7', border: '1px solid #FDE68A' }
            : { backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }
          }
        >
          <Clock size={24} className="mx-auto mb-2 text-amber-500" style={{ stroke: '#F59E0B' }} />
          <p className="text-2xl font-bold" style={{ color: isLightMode ? '#B45309' : '#FBBF24' }}>
            {stats.today || 0}
          </p>
          <p className="text-xs" style={{ color: isLightMode ? '#92400E' : '#FCD34D' }}>
            Hoy
          </p>
        </div>
        
        <div 
          className="rounded-xl p-4 text-center"
          style={isLightMode 
            ? { backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }
            : { backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }
          }
        >
          <CheckCircle2 size={24} className="mx-auto mb-2 text-green-500" style={{ stroke: '#10B981' }} />
          <p className="text-2xl font-bold" style={{ color: isLightMode ? '#059669' : '#34D399' }}>
            {(stats.by_level?.error || 0) - (stats.unresolved || 0)}
          </p>
          <p className="text-xs" style={{ color: isLightMode ? '#047857' : '#6EE7B7' }}>
            Resueltos
          </p>
        </div>
        
        <div 
          className="rounded-xl p-4 text-center"
          style={isLightMode 
            ? { backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }
            : { backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }
          }
        >
          <FileText size={24} className="mx-auto mb-2 text-blue-500" style={{ stroke: '#3B82F6' }} />
          <p className="text-2xl font-bold" style={{ color: isLightMode ? '#2563EB' : '#60A5FA' }}>
            {logs.length}
          </p>
          <p className="text-xs" style={{ color: isLightMode ? '#1D4ED8' : '#93C5FD' }}>
            Total
          </p>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filters.module}
          onChange={(e) => setFilters(f => ({ ...f, module: e.target.value }))}
          className="h-9 px-3 rounded-lg border border-border text-sm"
          style={isLightMode ? { backgroundColor: '#F9FAFB', color: '#374151' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <option value="">Todos los módulos</option>
          <option value="payments">Pagos</option>
          <option value="printing">Impresión</option>
          <option value="ecf">e-CF/DGII</option>
          <option value="email">Email</option>
          <option value="inventory">Inventario</option>
        </select>
        
        <select
          value={filters.level}
          onChange={(e) => setFilters(f => ({ ...f, level: e.target.value }))}
          className="h-9 px-3 rounded-lg border border-border text-sm"
          style={isLightMode ? { backgroundColor: '#F9FAFB', color: '#374151' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <option value="">Todos los niveles</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        
        <select
          value={filters.resolved === null ? '' : filters.resolved.toString()}
          onChange={(e) => setFilters(f => ({ ...f, resolved: e.target.value === '' ? null : e.target.value === 'true' }))}
          className="h-9 px-3 rounded-lg border border-border text-sm"
          style={isLightMode ? { backgroundColor: '#F9FAFB', color: '#374151' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <option value="">Todos</option>
          <option value="false">Sin resolver</option>
          <option value="true">Resueltos</option>
        </select>
        
        <div className="flex-1" />
        
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        
        {user?.role === 'admin' && (
          <Button variant="outline" size="sm" onClick={handleCleanup} className="text-red-500 hover:text-red-600">
            <Trash2 size={14} className="mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Logs List */}
      <ScrollArea className="h-[400px] rounded-lg border border-border">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <CheckCircle2 size={32} className="mb-2 text-green-500" />
            <p>No hay logs que mostrar</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => {
              const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
              return (
                <div
                  key={log.id}
                  className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors ${log.resolved ? 'opacity-60' : ''}`}
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <ModuleIcon module={log.module} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <LevelBadge level={log.level} />
                        <span 
                          className="text-xs font-medium uppercase"
                          style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.5)' }}
                        >
                          {log.module}
                        </span>
                        {log.resolved && (
                          <Badge variant="outline" className="text-xs text-green-500 border-green-500">
                            Resuelto
                          </Badge>
                        )}
                      </div>
                      
                      <p 
                        className="font-medium text-sm mb-1 line-clamp-2"
                        style={{ color: isLightMode ? '#1F2937' : 'white' }}
                      >
                        {log.human_message}
                      </p>
                      
                      <div className="flex items-center gap-3 text-xs" style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.5)' }}>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDate(log.timestamp)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {log.user_name || 'Sistema'}
                        </span>
                        {log.device && (
                          <span className="flex items-center gap-1">
                            <Monitor size={12} />
                            {log.device}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent 
          className="max-w-lg"
          style={isLightMode ? { backgroundColor: '#ffffff' } : {}}
        >
          <DialogHeader>
            <DialogTitle 
              className="flex items-center gap-2"
              style={isLightMode ? { color: '#1F2937' } : {}}
            >
              <ModuleIcon module={selectedLog?.module} />
              Detalle del Log
            </DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <LevelBadge level={selectedLog.level} />
                <span 
                  className="text-sm font-medium uppercase"
                  style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.6)' }}
                >
                  {selectedLog.module}
                </span>
                {selectedLog.resolved && (
                  <Badge variant="outline" className="text-green-500 border-green-500">
                    Resuelto
                  </Badge>
                )}
              </div>
              
              <div>
                <label className="text-xs font-medium" style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.5)' }}>
                  Mensaje
                </label>
                <p 
                  className="mt-1 font-medium"
                  style={{ color: isLightMode ? '#1F2937' : 'white' }}
                >
                  {selectedLog.human_message}
                </p>
              </div>
              
              <div>
                <label className="text-xs font-medium" style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.5)' }}>
                  Error Técnico
                </label>
                <p 
                  className="mt-1 text-sm font-mono p-2 rounded-lg overflow-x-auto"
                  style={{ 
                    backgroundColor: isLightMode ? '#F3F4F6' : 'rgba(0,0,0,0.3)',
                    color: isLightMode ? '#DC2626' : '#F87171'
                  }}
                >
                  {selectedLog.technical_error}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-xs font-medium" style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.5)' }}>
                    Usuario
                  </label>
                  <p style={{ color: isLightMode ? '#1F2937' : 'white' }}>
                    {selectedLog.user_name || 'Sistema'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.5)' }}>
                    Fecha
                  </label>
                  <p style={{ color: isLightMode ? '#1F2937' : 'white' }}>
                    {formatDate(selectedLog.timestamp)}
                  </p>
                </div>
              </div>
              
              {selectedLog.resolved && (
                <div 
                  className="p-3 rounded-lg"
                  style={{ 
                    backgroundColor: isLightMode ? '#ECFDF5' : 'rgba(16,185,129,0.1)',
                    border: isLightMode ? '1px solid #A7F3D0' : '1px solid rgba(16,185,129,0.3)'
                  }}
                >
                  <p className="text-sm" style={{ color: isLightMode ? '#059669' : '#34D399' }}>
                    <strong>Resuelto por:</strong> {selectedLog.resolved_by}
                  </p>
                  <p className="text-sm" style={{ color: isLightMode ? '#059669' : '#34D399' }}>
                    <strong>Fecha:</strong> {formatDate(selectedLog.resolved_at)}
                  </p>
                  {selectedLog.notes && (
                    <p className="text-sm mt-1" style={{ color: isLightMode ? '#047857' : '#6EE7B7' }}>
                      <strong>Notas:</strong> {selectedLog.notes}
                    </p>
                  )}
                </div>
              )}
              
              {!selectedLog.resolved && (
                <Button
                  onClick={() => {
                    setSelectedLog(null);
                    setResolveDialog({ open: true, log: selectedLog, notes: '' });
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle2 size={16} className="mr-2" />
                  Marcar como Resuelto
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialog.open} onOpenChange={(open) => !open && setResolveDialog({ open: false, log: null, notes: '' })}>
        <DialogContent 
          className="max-w-md"
          style={isLightMode ? { backgroundColor: '#ffffff' } : {}}
        >
          <DialogHeader>
            <DialogTitle style={isLightMode ? { color: '#1F2937' } : {}}>
              Resolver Log
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p 
              className="text-sm"
              style={{ color: isLightMode ? '#4B5563' : 'rgba(255,255,255,0.7)' }}
            >
              {resolveDialog.log?.human_message}
            </p>
            
            <div>
              <label 
                className="text-xs font-medium mb-1 block"
                style={{ color: isLightMode ? '#6B7280' : 'rgba(255,255,255,0.5)' }}
              >
                Notas (opcional)
              </label>
              <textarea
                value={resolveDialog.notes}
                onChange={(e) => setResolveDialog(d => ({ ...d, notes: e.target.value }))}
                placeholder="Describe cómo se resolvió el problema..."
                rows={3}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none"
                style={isLightMode 
                  ? { backgroundColor: '#F9FAFB', color: '#1F2937' }
                  : { backgroundColor: 'rgba(255,255,255,0.05)' }
                }
              />
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setResolveDialog({ open: false, log: null, notes: '' })}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleResolve}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 size={16} className="mr-2" />
                Resolver
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
