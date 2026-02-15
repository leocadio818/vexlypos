import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Printer, RefreshCw, Trash2, CheckCircle, XCircle, Clock, Settings2, Tag, Send, ChefHat, Wine, Receipt } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => ({ 
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('pos_token')}` 
});

const channelIcons = {
  kitchen: ChefHat,
  bar: Wine,
  receipt: Receipt
};

export default function PrinterSettings() {
  const [config, setConfig] = useState({
    enabled: true,
    paper_width: 80,
    auto_print_comanda: false,
    auto_print_receipt: false,
    business_name: '',
    business_address: '',
    rnc: '',
    phone: '',
    footer_text: 'Gracias por su visita!'
  });
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryMappings, setCategoryMappings] = useState({});
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('channels');

  const loadData = useCallback(async () => {
    try {
      const [configRes, channelsRes, categoriesRes, mappingsRes, queueRes] = await Promise.all([
        fetch(`${API}/api/printer-config`),
        fetch(`${API}/api/print-channels`),
        fetch(`${API}/api/categories`),
        fetch(`${API}/api/category-channels`),
        fetch(`${API}/api/print/queue`)
      ]);
      
      if (configRes.ok) setConfig(await configRes.json());
      if (channelsRes.ok) setChannels(await channelsRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (mappingsRes.ok) {
        const mappings = await mappingsRes.json();
        const mapObj = {};
        mappings.forEach(m => { mapObj[m.category_id] = m.channel_code; });
        setCategoryMappings(mapObj);
      }
      if (queueRes.ok) setQueue(await queueRes.json());
    } catch (err) {
      toast.error('Error cargando configuración');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveConfig = async () => {
    try {
      const res = await fetch(`${API}/api/printer-config`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(config)
      });
      if (res.ok) toast.success('Configuración guardada');
    } catch (err) {
      toast.error('Error guardando configuración');
    }
  };

  const updateChannel = async (channelId, updates) => {
    try {
      await fetch(`${API}/api/print-channels/${channelId}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(updates)
      });
      setChannels(channels.map(c => c.id === channelId ? { ...c, ...updates } : c));
      toast.success('Canal actualizado');
    } catch (err) {
      toast.error('Error actualizando canal');
    }
  };

  const saveCategoryMappings = async () => {
    try {
      await fetch(`${API}/api/category-channels`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(categoryMappings)
      });
      toast.success('Asignaciones guardadas');
    } catch (err) {
      toast.error('Error guardando asignaciones');
    }
  };

  const testPrint = async (channelCode) => {
    try {
      const res = await fetch(`${API}/api/print/test/${channelCode}`, {
        method: 'POST',
        headers: headers()
      });
      if (res.ok) {
        toast.success('Prueba enviada a la cola');
        loadData();
      }
    } catch (err) {
      toast.error('Error enviando prueba');
    }
  };

  const clearQueue = async () => {
    try {
      const res = await fetch(`${API}/api/print-queue/clear`, { method: 'DELETE', headers: headers() });
      if (res.ok) {
        toast.success('Cola limpiada');
        loadData();
      }
    } catch (err) {
      toast.error('Error limpiando cola');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20" data-testid="printer-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Printer className="w-6 h-6 text-orange-500" />
          <h1 className="text-xl font-oswald font-bold">CONFIGURACIÓN DE IMPRESIÓN</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Sistema de impresión</span>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {[
          { id: 'channels', label: 'Impresoras', icon: Printer },
          { id: 'categories', label: 'Categorías', icon: Tag },
          { id: 'business', label: 'Datos Negocio', icon: Settings2 },
          { id: 'queue', label: `Cola (${queue.length})`, icon: Clock }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-orange-500/20 text-orange-400 border-b-2 border-orange-500' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Canales de Impresión */}
      {activeTab === 'channels' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Configura el nombre de la impresora de Windows para cada canal. 
            El nombre debe coincidir exactamente con el que aparece en Panel de Control &gt; Dispositivos e Impresoras.
          </p>
          
          <div className="grid gap-4">
            {channels.map(channel => {
              const Icon = channelIcons[channel.code] || Printer;
              return (
                <Card key={channel.id} className="bg-slate-800 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl ${
                        channel.code === 'kitchen' ? 'bg-orange-500/20' :
                        channel.code === 'bar' ? 'bg-purple-500/20' : 'bg-green-500/20'
                      }`}>
                        <Icon className={`w-6 h-6 ${
                          channel.code === 'kitchen' ? 'text-orange-500' :
                          channel.code === 'bar' ? 'text-purple-500' : 'text-green-500'
                        }`} />
                      </div>
                      
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-oswald font-bold text-lg">{channel.name}</h3>
                            <p className="text-xs text-slate-400">Canal: {channel.code}</p>
                          </div>
                          <Switch
                            checked={channel.active}
                            onCheckedChange={(checked) => updateChannel(channel.id, { active: checked })}
                          />
                        </div>
                        
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nombre de impresora Windows (ej: Caja, EPSON-TM20, POS-80)"
                            value={channel.printer_name || ''}
                            onChange={(e) => setChannels(channels.map(c => 
                              c.id === channel.id ? { ...c, printer_name: e.target.value } : c
                            ))}
                            className="bg-slate-900 border-slate-600 flex-1"
                          />
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => updateChannel(channel.id, { printer_name: channels.find(c => c.id === channel.id)?.printer_name })}
                          >
                            Guardar
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => testPrint(channel.code)}
                            disabled={!channel.printer_name}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        {channel.printer_name && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Configurado: {channel.printer_name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Auto-print options */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base">Impresión Automática</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Imprimir comanda al enviar a cocina</Label>
                  <p className="text-xs text-slate-400">La comanda se imprime automáticamente</p>
                </div>
                <Switch
                  checked={config.auto_print_comanda}
                  onCheckedChange={(checked) => setConfig({ ...config, auto_print_comanda: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Imprimir recibo al cobrar</Label>
                  <p className="text-xs text-slate-400">El recibo se imprime automáticamente</p>
                </div>
                <Switch
                  checked={config.auto_print_receipt}
                  onCheckedChange={(checked) => setConfig({ ...config, auto_print_receipt: checked })}
                />
              </div>
              <Button onClick={saveConfig} className="bg-orange-600 hover:bg-orange-700">
                Guardar Opciones
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Asignación de Categorías */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Asigna cada categoría de productos al canal de impresión correspondiente.
            Por ejemplo, "Mariscos" y "Carnes" van a Cocina, "Bebidas" y "Cocteles" van a Bar.
          </p>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="space-y-3">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: cat.color || '#666' }}
                      />
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <Select
                      value={categoryMappings[cat.id] || 'kitchen'}
                      onValueChange={(value) => setCategoryMappings({ ...categoryMappings, [cat.id]: value })}
                    >
                      <SelectTrigger className="w-40 bg-slate-800 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map(ch => {
                          const Icon = channelIcons[ch.code] || Printer;
                          return (
                            <SelectItem key={ch.code} value={ch.code}>
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4" />
                                {ch.name}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              
              <Button onClick={saveCategoryMappings} className="w-full mt-4 bg-orange-600 hover:bg-orange-700">
                Guardar Asignaciones
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Datos del Negocio */}
      {activeTab === 'business' && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-orange-500" />
              Datos que aparecen en los recibos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nombre del Negocio</Label>
                <Input
                  placeholder="MI RESTAURANTE"
                  value={config.business_name || ''}
                  onChange={(e) => setConfig({ ...config, business_name: e.target.value })}
                  className="bg-slate-900 border-slate-600 font-bold text-lg"
                />
              </div>
              <div className="col-span-2">
                <Label>Dirección</Label>
                <Input
                  placeholder="Av. Principal #123, Santo Domingo"
                  value={config.business_address || ''}
                  onChange={(e) => setConfig({ ...config, business_address: e.target.value })}
                  className="bg-slate-900 border-slate-600"
                />
              </div>
              <div>
                <Label>RNC</Label>
                <Input
                  placeholder="123456789"
                  value={config.rnc || ''}
                  onChange={(e) => setConfig({ ...config, rnc: e.target.value })}
                  className="bg-slate-900 border-slate-600"
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  placeholder="809-555-1234"
                  value={config.phone || ''}
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  className="bg-slate-900 border-slate-600"
                />
              </div>
              <div className="col-span-2">
                <Label>Mensaje de pie de recibo</Label>
                <Input
                  placeholder="Gracias por su visita!"
                  value={config.footer_text || ''}
                  onChange={(e) => setConfig({ ...config, footer_text: e.target.value })}
                  className="bg-slate-900 border-slate-600"
                />
              </div>
            </div>
            
            <Button onClick={saveConfig} className="w-full bg-orange-600 hover:bg-orange-700">
              Guardar Datos del Negocio
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tab: Cola de Impresión */}
      {activeTab === 'queue' && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              Cola de Impresión
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={clearQueue}>
                <Trash2 className="w-4 h-4 mr-1" />
                Limpiar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Printer className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay trabajos pendientes</p>
                <p className="text-sm mt-2">
                  Asegúrate de que el Agente de Impresión esté corriendo en la PC con las impresoras.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((job) => {
                  const Icon = channelIcons[job.channel] || Printer;
                  return (
                    <div 
                      key={job.id} 
                      className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-yellow-500/20">
                          <Icon className="w-4 h-4 text-yellow-500" />
                        </div>
                        <div>
                          <p className="font-medium capitalize">{job.type} - {job.channel}</p>
                          <p className="text-xs text-slate-400">
                            {job.printer_name || 'Sin impresora'} • {new Date(job.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                        <Clock className="w-3 h-3 mr-1" />
                        Pendiente
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Instrucciones del Agente */}
            <div className="mt-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Printer className="w-4 h-4 text-orange-500" />
                Agente de Impresión
              </h4>
              <p className="text-sm text-slate-400 mb-3">
                El agente debe estar corriendo en la PC donde están conectadas las impresoras.
                Ejecuta el siguiente comando en PowerShell:
              </p>
              <div className="bg-black rounded-lg p-3 font-mono text-xs text-green-400">
                python print_agent.py
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
