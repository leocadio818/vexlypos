import { useState, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import { ncfAPI } from '@/lib/api';
import { FileText, Plus, Trash2, Pencil, RefreshCw, AlertTriangle, AlertCircle, Calendar, ListChecks, Store, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import axios from 'axios';
import { NeoDatePicker, NeoTimePicker } from '@/components/DateTimePicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function NcfTab() {
  const { ncfTypes, ncfSequences, ncfAlerts, refreshNCFData } = useSettings();
  const [saleTypes, setSaleTypes] = useState([]);
  const [ncfDialog, setNcfDialog] = useState({ 
    open: false, ncf_type_code: '', serie: 'B', prefix: '', current_number: 1, 
    range_start: 1, range_end: 100, expiration_date: '', notes: '', editId: null,
    authorized_sale_types: [], alert_threshold: '', alert_interval: ''
  });

  // Load sale types
  useEffect(() => {
    const loadSaleTypes = async () => {
      try {
        const res = await axios.get(`${API}/sale-types`, { headers: hdrs() });
        setSaleTypes(res.data || []);
      } catch (e) {
        console.error('Error loading sale types:', e);
      }
    };
    loadSaleTypes();
  }, []);

  const handleSaveNCFSequence = async () => {
    if (!ncfDialog.ncf_type_code || !ncfDialog.expiration_date || !ncfDialog.range_end) {
      toast.error('Tipo NCF, fecha vencimiento y rango final son requeridos');
      return;
    }
    try {
      const data = {
        ncf_type_code: ncfDialog.ncf_type_code,
        serie: ncfDialog.serie || 'B',
        prefix: ncfDialog.prefix || `${ncfDialog.serie}${ncfDialog.ncf_type_code.slice(1)}`,
        current_number: parseInt(ncfDialog.current_number) || 1,
        range_start: parseInt(ncfDialog.range_start) || 1,
        range_end: parseInt(ncfDialog.range_end),
        expiration_date: ncfDialog.expiration_date,
        notes: ncfDialog.notes || null,
        authorized_sale_types: ncfDialog.authorized_sale_types || [],
        alert_threshold: ncfDialog.alert_threshold ? parseInt(ncfDialog.alert_threshold) : null,
        alert_interval: ncfDialog.alert_interval ? parseInt(ncfDialog.alert_interval) : null
      };
      
      if (ncfDialog.editId) {
        await ncfAPI.updateSequence(ncfDialog.editId, {
          current_number: data.current_number,
          range_end: data.range_end,
          expiration_date: data.expiration_date,
          notes: data.notes,
          authorized_sale_types: data.authorized_sale_types,
          alert_threshold: data.alert_threshold,
          alert_interval: data.alert_interval
        });
        toast.success('Secuencia NCF actualizada');
      } else {
        await ncfAPI.createSequence(data);
        toast.success('Secuencia NCF creada');
      }
      setNcfDialog({ open: false, ncf_type_code: '', serie: 'B', prefix: '', current_number: 1, range_start: 1, range_end: 100, expiration_date: '', notes: '', editId: null, authorized_sale_types: [], alert_threshold: '', alert_interval: '' });
      refreshNCFData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar secuencia');
    }
  };

  const toggleSaleType = (saleTypeId) => {
    setNcfDialog(prev => ({
      ...prev,
      authorized_sale_types: prev.authorized_sale_types?.includes(saleTypeId)
        ? prev.authorized_sale_types.filter(id => id !== saleTypeId)
        : [...(prev.authorized_sale_types || []), saleTypeId]
    }));
  };

  const handleDeleteNCFSequence = async (id) => {
    if (!confirm('¿Desactivar esta secuencia NCF?')) return;
    try {
      await ncfAPI.deleteSequence(id);
      toast.success('Secuencia desactivada');
      refreshNCFData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  return (
    <div className="space-y-6" data-testid="ncf-content">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-oswald text-lg font-bold flex items-center gap-2">
            <FileText size={20} className="text-blue-500" />
            Comprobantes Fiscales (NCF)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Gestiona las secuencias de comprobantes fiscales DGII - Serie B
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshNCFData} className="text-xs">
            <RefreshCw size={14} className="mr-1" /> Actualizar
          </Button>
          <Button 
            size="sm" 
            onClick={() => setNcfDialog({ open: true, ncf_type_code: '', serie: 'B', prefix: '', current_number: 1, range_start: 1, range_end: 100, expiration_date: '', notes: '', editId: null, authorized_sale_types: [], alert_threshold: '', alert_interval: '' })}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="add-ncf-btn"
          >
            <Plus size={14} className="mr-1" /> Nueva Secuencia
          </Button>
        </div>
      </div>

      {/* Alerts Summary */}
      {(ncfAlerts.critical?.length > 0 || ncfAlerts.warning?.length > 0) && (
        <div className="space-y-2">
          {ncfAlerts.critical?.map((alert, i) => (
            <Alert key={`crit-${i}`} className="bg-red-500/10 border-red-500/50">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <AlertTitle className="text-red-400 font-oswald">{alert.ncf_type_name || alert.ncf_type}</AlertTitle>
              <AlertDescription className="text-xs text-red-300">{alert.message}</AlertDescription>
            </Alert>
          ))}
          {ncfAlerts.warning?.map((alert, i) => (
            <Alert key={`warn-${i}`} className="bg-yellow-500/10 border-yellow-500/50">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertTitle className="text-yellow-400 font-oswald">{alert.ncf_type_name || alert.ncf_type}</AlertTitle>
              <AlertDescription className="text-xs text-yellow-300">{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* NCF Sequences List */}
      {ncfSequences.length === 0 ? (
        <div className="text-center py-12 bg-card/50 rounded-xl border border-border">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-oswald font-bold mb-2">No hay secuencias NCF configuradas</h3>
          <p className="text-sm text-muted-foreground mb-4">Crea una secuencia para empezar a emitir comprobantes fiscales</p>
          <Button 
            onClick={() => setNcfDialog({ open: true, ncf_type_code: 'B02', serie: 'B', prefix: '', current_number: 1, range_start: 1, range_end: 500, expiration_date: '', notes: '', editId: null, authorized_sale_types: [], alert_threshold: '', alert_interval: '' })}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus size={14} className="mr-1" /> Crear Secuencia B02
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ncfSequences.map((seq) => (
            <div 
              key={seq.id} 
              className={`bg-card border rounded-xl p-4 transition-colors ${
                seq.alert_level === 'critical' ? 'border-red-500/50 bg-red-500/5' :
                seq.alert_level === 'warning' ? 'border-yellow-500/50 bg-yellow-500/5' :
                'border-border hover:border-blue-500/30'
              }`}
              data-testid={`ncf-seq-${seq.ncf_type_code}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-oswald font-bold text-sm ${
                    seq.alert_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                    seq.alert_level === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {seq.ncf_type_code}
                  </div>
                  <div>
                    <h3 className="font-oswald font-bold text-sm">
                      {seq.ncf_types_config?.name || seq.ncf_type_code}
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      {seq.ncf_types_config?.description}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={() => setNcfDialog({
                      open: true,
                      ncf_type_code: seq.ncf_type_code,
                      serie: seq.serie,
                      prefix: seq.prefix,
                      current_number: seq.current_number,
                      range_start: seq.range_start,
                      range_end: seq.range_end,
                      expiration_date: seq.expiration_date,
                      notes: seq.notes || '',
                      editId: seq.id,
                      authorized_sale_types: seq.authorized_sale_types || [],
                      alert_threshold: seq.alert_threshold || '',
                      alert_interval: seq.alert_interval || ''
                    })}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteNCFSequence(seq.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Usados: {seq.current_number - seq.range_start}</span>
                  <span className={`font-bold ${
                    seq.remaining < 10 ? 'text-red-400' :
                    seq.remaining < 50 ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    Restantes: {seq.remaining}
                  </span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      seq.remaining < 10 ? 'bg-red-500' :
                      seq.remaining < 50 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.max(5, (seq.remaining / (seq.range_end - seq.range_start + 1)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Rango:</span>
                  <span className="ml-1 font-mono">{seq.range_start} - {seq.range_end}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Actual:</span>
                  <span className="ml-1 font-mono font-bold">{seq.current_number}</span>
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  <Calendar size={12} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Vence:</span>
                  <span className={`ml-1 font-mono ${seq.is_expired ? 'text-red-400' : ''}`}>
                    {seq.expiration_date}
                  </span>
                  {seq.days_until_expiry !== null && !seq.is_expired && seq.days_until_expiry < 60 && (
                    <Badge className={`ml-1 text-[9px] ${seq.days_until_expiry < 30 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-muted'}`}>
                      {seq.days_until_expiry} días
                    </Badge>
                  )}
                  {seq.is_expired && (
                    <Badge className="ml-1 text-[9px] bg-red-500/20 text-red-400">VENCIDO</Badge>
                  )}
                </div>
                {/* Alert Config Display */}
                {seq.alert_threshold && (
                  <div className="col-span-2 flex items-center gap-1 pt-1 border-t border-border/50 mt-1">
                    <Bell size={12} className="text-amber-500" />
                    <span className="text-muted-foreground text-[10px]">Alerta:</span>
                    <span className="text-[10px] text-amber-400">
                      ≤{seq.alert_threshold} NCF
                      {seq.alert_interval && ` (cada ${seq.alert_interval} ventas)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NCF Types Reference */}
      <div className="bg-card/50 border border-border rounded-xl p-4">
        <h3 className="font-oswald font-bold text-sm mb-3 flex items-center gap-2">
          <ListChecks size={16} className="text-blue-500" />
          Tipos de Comprobantes DGII (Serie B)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {ncfTypes.map((type) => (
            <div key={type.id || type.code} className="flex items-center gap-2 text-xs p-2 bg-background rounded-lg">
              <Badge variant="outline" className="font-mono text-[10px]">{type.id || type.code}</Badge>
              <span className="text-muted-foreground truncate">{type.description || type.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* NCF Dialog */}
      <Dialog open={ncfDialog.open} onOpenChange={(o) => !o && setNcfDialog({ ...ncfDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{ncfDialog.editId ? 'Editar Secuencia NCF' : 'Nueva Secuencia NCF'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo de Comprobante</label>
              <select value={ncfDialog.ncf_type_code} onChange={e => setNcfDialog({ ...ncfDialog, ncf_type_code: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" disabled={!!ncfDialog.editId}>
                <option value="">Seleccionar...</option>
                {ncfTypes.map(t => (
                  <option key={t.id || t.code} value={t.id || t.code}>{t.id || t.code} - {t.description || t.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Número Inicial</label>
                <input type="number" value={ncfDialog.range_start} onChange={e => setNcfDialog({ ...ncfDialog, range_start: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" disabled={!!ncfDialog.editId} />
              </div>
              <div>
                <label className="text-sm font-medium">Número Final</label>
                <input type="number" value={ncfDialog.range_end} onChange={e => setNcfDialog({ ...ncfDialog, range_end: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Número Actual</label>
              <input type="number" value={ncfDialog.current_number} onChange={e => setNcfDialog({ ...ncfDialog, current_number: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Fecha de Vencimiento</label>
              <input type="date" value={ncfDialog.expiration_date} onChange={e => setNcfDialog({ ...ncfDialog, expiration_date: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Notas (opcional)</label>
              <input type="text" value={ncfDialog.notes} onChange={e => setNcfDialog({ ...ncfDialog, notes: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Notas internas..." />
            </div>
            
            {/* Authorized Sale Types */}
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Store size={14} className="text-blue-500" />
                Autorizado para estos Tipos de Venta
              </label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Esta secuencia se usará automáticamente al procesar pagos con estos tipos de venta
              </p>
              <div className="space-y-2 bg-background rounded-lg p-3 border border-border max-h-40 overflow-y-auto">
                {saleTypes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay tipos de venta configurados</p>
                ) : (
                  saleTypes.map(st => (
                    <div 
                      key={st.id} 
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleSaleType(st.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={ncfDialog.authorized_sale_types?.includes(st.id)}
                          onCheckedChange={() => toggleSaleType(st.id)}
                        />
                        <span className="text-sm font-medium">{st.name}</span>
                      </div>
                      {st.code && (
                        <Badge variant="outline" className="text-[8px]">{st.code}</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Alert Configuration - NEW */}
            <div className="border-t border-border pt-4 mt-4">
              <label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Bell size={14} className="text-amber-500" />
                Configuración de Alertas
              </label>
              <p className="text-[10px] text-muted-foreground mb-3">
                Recibe notificaciones en checkout cuando los comprobantes estén por agotarse
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Inicio de Alerta</label>
                  <input 
                    type="number" 
                    value={ncfDialog.alert_threshold} 
                    onChange={e => setNcfDialog({ ...ncfDialog, alert_threshold: e.target.value })}
                    className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm"
                    placeholder="Ej: 50"
                    min="1"
                  />
                  <p className="text-[9px] text-muted-foreground mt-1">Alertar cuando queden ≤ este número</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Intervalo de Alerta</label>
                  <input 
                    type="number" 
                    value={ncfDialog.alert_interval} 
                    onChange={e => setNcfDialog({ ...ncfDialog, alert_interval: e.target.value })}
                    className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm"
                    placeholder="Ej: 5"
                    min="1"
                  />
                  <p className="text-[9px] text-muted-foreground mt-1">Mostrar alerta cada N ventas</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNcfDialog({ ...ncfDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveNCFSequence} className="bg-blue-600 hover:bg-blue-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
