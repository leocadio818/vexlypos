import { useState, useEffect, useCallback } from 'react';
import { useSettings } from './SettingsContext';
import { Printer, Plus, Trash2, Pencil, ChevronRight, MapPin, Save, ChefHat, Wine } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/context/ThemeContext';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ 
  Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
  'Content-Type': 'application/json'
});

export default function ChannelsTab() {
  const { printChannels, categories, fetchAll } = useSettings();
  const { isMinimalist, isNeoDark } = useTheme();
  const isLightMode = isMinimalist && !isNeoDark;
  
  const [channelDialog, setChannelDialog] = useState({ open: false, name: '', code: '', type: 'kitchen', target: 'screen', ip: '', editId: null });
  const [activeSection, setActiveSection] = useState('channels'); // 'channels' or 'areas'
  
  // Area-based channel mappings
  const [areas, setAreas] = useState([]);
  const [areaChannelMappings, setAreaChannelMappings] = useState({});
  const [categoryMappings, setCategoryMappings] = useState({});
  const [savingAreaMappings, setSavingAreaMappings] = useState(false);
  
  // Load areas and mappings
  const loadAreaData = useCallback(async () => {
    try {
      const [areasRes, areaMappingsRes, catMappingsRes] = await Promise.all([
        axios.get(`${API}/areas`, { headers: hdrs() }),
        axios.get(`${API}/area-channel-mappings`, { headers: hdrs() }),
        axios.get(`${API}/category-channels`, { headers: hdrs() })
      ]);
      
      setAreas(areasRes.data || []);
      
      // Convert area mappings array to nested object
      const mappingsObj = {};
      (areaMappingsRes.data || []).forEach(m => {
        if (!mappingsObj[m.area_id]) mappingsObj[m.area_id] = {};
        mappingsObj[m.area_id][m.category_id] = m.channel_code;
      });
      setAreaChannelMappings(mappingsObj);
      
      // Convert category mappings
      const catObj = {};
      (catMappingsRes.data || []).forEach(m => {
        catObj[m.category_id] = m.channel_code;
      });
      setCategoryMappings(catObj);
    } catch (err) {
      console.error('Error loading area data:', err);
    }
  }, []);
  
  useEffect(() => {
    loadAreaData();
  }, [loadAreaData]);
  
  // Save area-channel mappings
  const saveAreaChannelMappings = async () => {
    setSavingAreaMappings(true);
    try {
      // Clean the mappings: remove empty entries and __global__ values
      const cleanMappings = {};
      for (const [areaId, catMappings] of Object.entries(areaChannelMappings)) {
        if (catMappings && typeof catMappings === 'object') {
          const cleanCatMappings = {};
          for (const [catId, channelCode] of Object.entries(catMappings)) {
            // Only include valid channel codes (not empty, not __global__)
            if (channelCode && channelCode !== '__global__' && channelCode.trim() !== '') {
              cleanCatMappings[catId] = channelCode;
            }
          }
          if (Object.keys(cleanCatMappings).length > 0) {
            cleanMappings[areaId] = cleanCatMappings;
          }
        }
      }
      
      console.log('Saving area mappings:', cleanMappings);
      await axios.put(`${API}/area-channel-mappings/bulk`, cleanMappings, { headers: hdrs() });
      notify.success('Asignaciones por área guardadas');
      // Reload data to confirm save
      loadAreaData();
    } catch (err) {
      console.error('Error saving area mappings:', err);
      notify.error('Error guardando asignaciones');
    }
    setSavingAreaMappings(false);
  };
  
  // Update a single area-category mapping
  const updateAreaCategoryMapping = (areaId, categoryId, channelCode) => {
    setAreaChannelMappings(prev => {
      const newMappings = { ...prev };
      if (!newMappings[areaId]) newMappings[areaId] = {};
      if (channelCode) {
        newMappings[areaId][categoryId] = channelCode;
      } else {
        delete newMappings[areaId][categoryId];
      }
      return newMappings;
    });
  };
  
  // Get effective channel for display
  const getEffectiveChannel = (areaId, categoryId) => {
    if (areaChannelMappings[areaId]?.[categoryId]) {
      return { code: areaChannelMappings[areaId][categoryId], isAreaSpecific: true };
    }
    if (categoryMappings[categoryId]) {
      return { code: categoryMappings[categoryId], isAreaSpecific: false };
    }
    return { code: 'kitchen', isAreaSpecific: false };
  };

  const handleSaveChannel = async () => {
    if (!channelDialog.name) return;
    try {
      const data = { name: channelDialog.name, code: channelDialog.code || channelDialog.name.toLowerCase().replace(/\s+/g, '_'), type: channelDialog.type, target: channelDialog.target, ip: channelDialog.ip };
      if (channelDialog.editId) await axios.put(`${API}/print-channels/${channelDialog.editId}`, data, { headers: hdrs() });
      else await axios.post(`${API}/print-channels`, data, { headers: hdrs() });
      notify.success(channelDialog.editId ? 'Actualizado' : 'Creado');
      setChannelDialog({ open: false, name: '', code: '', type: 'kitchen', target: 'screen', ip: '', editId: null }); fetchAll();
    } catch { notify.error('Error'); }
  };

  const handleDeleteChannel = async (id) => {
    try { await axios.delete(`${API}/print-channels/${id}`, { headers: hdrs() }); notify.success('Eliminado'); fetchAll(); }
    catch { notify.error('Error'); }
  };

  return (
    <div>
      {/* Link to Printer Settings */}
      <a 
        href="/settings/printer" 
        className="mb-6 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-orange-500/20 to-orange-600/10 border-2 border-orange-500/30 hover:border-orange-500/50 transition-all group"
        data-testid="printer-settings-link"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
            <Printer size={24} className="text-white" />
          </div>
          <div>
            <span className="font-oswald font-bold text-lg">Configurar Impresora USB/Red</span>
            <p className="text-xs text-muted-foreground">Cola de impresión, agente USB, impresoras térmicas</p>
          </div>
        </div>
        <ChevronRight className="text-orange-500 group-hover:translate-x-1 transition-transform" />
      </a>

      {/* Section Tabs */}
      <div className="flex gap-2 mb-4 border-b border-border pb-2">
        <button
          onClick={() => setActiveSection('channels')}
          data-testid="section-channels"
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeSection === 'channels' 
              ? 'bg-primary/20 text-primary border-b-2 border-primary' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Printer size={16} /> Canales
        </button>
        <button
          onClick={() => setActiveSection('areas')}
          data-testid="section-areas"
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeSection === 'areas' 
              ? 'bg-orange-500/20 text-orange-500 border-b-2 border-orange-500' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapPin size={16} /> Por Área
        </button>
      </div>

      {/* Section: Channels */}
      {activeSection === 'channels' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Canales de Impresion (Pantalla)</h2>
            <Button onClick={() => setChannelDialog({ open: true, name: '', code: '', type: 'kitchen', target: 'screen', ip: '', editId: null })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-channel-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
          </div>
          <div className="space-y-2">
            {printChannels.map(ch => (
              <div key={ch.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`channel-${ch.id}`}>
                <div>
                  <span className="font-semibold">{ch.name}</span>
                  <Badge variant="secondary" className="ml-2 text-[11px]">{ch.type}</Badge>
                  <Badge variant="outline" className="ml-1 text-[11px]">{ch.target === 'screen' ? 'Pantalla' : ch.target === 'network' ? `Red: ${ch.ip}` : 'USB'}</Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => setChannelDialog({ open: true, name: ch.name, code: ch.code || '', type: ch.type, target: ch.target, ip: ch.ip || ch.ip_address || '', editId: ch.id })}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-green-500"
                    onClick={async () => {
                      try {
                        await axios.post(`${API}/print/queue`, {
                          type: 'test',
                          channel: ch.code || ch.type,
                          printer_name: ch.printer_name || ch.name,
                          data: { channel_name: ch.name, test: true }
                        }, { headers: hdrs() });
                        notify.success(`Test enviado a ${ch.name}`);
                      } catch { notify.error('Error al enviar test'); }
                    }}
                    data-testid={`test-print-${ch.id}`}>
                    <Printer size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                    onClick={() => handleDeleteChannel(ch.id)}><Trash2 size={14} /></Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Section: Por Área */}
      {activeSection === 'areas' && (
        <div className="space-y-4" data-testid="area-channels-section">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p 
                className="text-sm"
                style={isLightMode ? { color: '#1E293B' } : {}}
              >
                Configura qué impresora recibe las comandas según el <strong>área</strong> de la mesa.
              </p>
              <p 
                className="text-xs mt-1"
                style={isLightMode ? { color: '#64748B' } : { color: 'rgb(148 163 184 / 0.7)' }}
              >
                Si no configuras un área, usará el canal global.
              </p>
            </div>
            <Button 
              onClick={saveAreaChannelMappings} 
              disabled={savingAreaMappings}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="save-area-mappings-btn"
            >
              <Save size={14} className="mr-2" />
              {savingAreaMappings ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
          
          {areas.length === 0 ? (
            <Card className={isLightMode ? 'bg-slate-100' : 'bg-muted/50'}>
              <CardContent className="p-8 text-center">
                <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p 
                  className="font-medium"
                  style={isLightMode ? { color: '#1E293B' } : {}}
                >No hay áreas configuradas</p>
                <p 
                  className="text-sm mt-1"
                  style={isLightMode ? { color: '#64748B' } : {}}
                >
                  Ve a Ajustes → Mesas para crear áreas
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {areas.map(area => (
                <Card key={area.id} className="overflow-hidden" data-testid={`area-config-${area.id}`}>
                  <CardHeader className={`py-3 px-4 ${isLightMode ? 'bg-slate-100' : 'bg-muted/30'}`}>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <MapPin size={14} className="text-orange-500" />
                      <span style={isLightMode ? { color: '#1E293B' } : {}}>{area.name}</span>
                      {Object.keys(areaChannelMappings[area.id] || {}).length > 0 && (
                        <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30 text-[10px]">
                          {Object.keys(areaChannelMappings[area.id] || {}).length} personalizadas
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="grid gap-2">
                      {categories.filter(c => c.id && c.name).map(category => {
                        const effective = getEffectiveChannel(area.id, category.id);
                        const areaMapping = areaChannelMappings[area.id]?.[category.id] || '';
                        
                        return (
                          <div 
                            key={category.id} 
                            className={`flex items-center justify-between gap-2 p-2 rounded-lg ${isLightMode ? 'bg-slate-50' : 'bg-background/50'}`}
                            data-testid={`area-${area.id}-cat-${category.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span 
                                className="text-sm font-medium truncate"
                                style={isLightMode ? { color: '#1E293B' } : {}}
                              >{category.name}</span>
                              {!effective.isAreaSpecific && (
                                <Badge 
                                  variant="outline" 
                                  className="text-[10px] shrink-0"
                                  style={isLightMode ? { color: '#64748B', borderColor: '#CBD5E1' } : {}}
                                >
                                  Global
                                </Badge>
                              )}
                            </div>
                            
                            <Select
                              value={areaMapping || '__global__'}
                              onValueChange={(value) => updateAreaCategoryMapping(area.id, category.id, value === '__global__' ? '' : value)}
                            >
                              <SelectTrigger 
                                className={`w-[140px] h-8 text-xs ${isLightMode ? 'bg-white border-slate-300' : ''}`}
                              >
                                <SelectValue placeholder="Usar global">
                                  {areaMapping ? (
                                    <span className="text-orange-500 font-medium">
                                      {printChannels.find(c => c.code === areaMapping)?.name || areaMapping}
                                    </span>
                                  ) : (
                                    <span style={isLightMode ? { color: '#64748B' } : {}} className="text-muted-foreground">Usar global</span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__global__">
                                  <span className="text-muted-foreground">Usar global</span>
                                </SelectItem>
                                {printChannels.filter(c => c.active !== false && c.code !== 'receipt').map(channel => (
                                  <SelectItem key={channel.code} value={channel.code}>
                                    <div className="flex items-center gap-2">
                                      {channel.type === 'kitchen' && <ChefHat size={12} />}
                                      {channel.type === 'bar' && <Wine size={12} />}
                                      {!['kitchen', 'bar'].includes(channel.type) && <Printer size={12} />}
                                      {channel.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {/* Info card */}
          <Card className={`mt-4 ${isLightMode ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20'}`}>
            <CardContent className="p-4">
              <h4 
                className="font-oswald font-bold mb-2"
                style={isLightMode ? { color: '#1E40AF' } : { color: '#60A5FA' }}
              >¿Cómo funciona?</h4>
              <ul 
                className="text-xs space-y-1"
                style={isLightMode ? { color: '#1E293B' } : { color: '#CBD5E1' }}
              >
                <li>• <strong>Prioridad 1:</strong> Canal específico del producto</li>
                <li>• <strong>Prioridad 2:</strong> Canal del área para esa categoría</li>
                <li>• <strong>Prioridad 3:</strong> Canal global de la categoría</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Channel Dialog */}
      <Dialog open={channelDialog.open} onOpenChange={(o) => !o && setChannelDialog({ ...channelDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald">{channelDialog.editId ? 'Editar Canal' : 'Nuevo Canal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={channelDialog.name} onChange={e => setChannelDialog({ ...channelDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Cocina Principal" />
            </div>
            <div>
              <label className="text-sm font-medium">Código</label>
              <input type="text" value={channelDialog.code} onChange={e => setChannelDialog({ ...channelDialog, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm font-mono" placeholder="Ej: caja2, cocina, bar" />
              <p className="text-xs text-muted-foreground mt-1">Identificador único. Debe coincidir con la línea PRINTER_[CODIGO] en config.txt del agente.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <select value={channelDialog.type} onChange={e => setChannelDialog({ ...channelDialog, type: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                <option value="kitchen">Cocina</option>
                <option value="bar">Bar</option>
                <option value="receipt">Recibo/Caja</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Destino</label>
              <select value={channelDialog.target} onChange={e => setChannelDialog({ ...channelDialog, target: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                <option value="screen">Pantalla (KDS)</option>
                <option value="network">Impresora de Red</option>
                <option value="usb">Impresora USB</option>
              </select>
            </div>
            {channelDialog.target === 'network' && (
              <div>
                <label className="text-sm font-medium">Dirección IP</label>
                <input type="text" value={channelDialog.ip} onChange={e => setChannelDialog({ ...channelDialog, ip: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="192.168.1.100" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChannelDialog({ ...channelDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveChannel} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
