import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Printer, Usb, Wifi, RefreshCw, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PrinterSettings() {
  const [config, setConfig] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configRes, queueRes] = await Promise.all([
        fetch(`${API}/api/printer-config`),
        fetch(`${API}/api/print-queue/pending`)
      ]);
      
      if (configRes.ok) {
        setConfig(await configRes.json());
      }
      if (queueRes.ok) {
        setQueue(await queueRes.json());
      }
    } catch (err) {
      toast.error('Error cargando configuración');
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    try {
      const res = await fetch(`${API}/api/printer-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        toast.success('Configuración guardada');
      }
    } catch (err) {
      toast.error('Error guardando configuración');
    }
  };

  const clearQueue = async () => {
    try {
      const res = await fetch(`${API}/api/print-queue/clear`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Cola limpiada');
        loadData();
      }
    } catch (err) {
      toast.error('Error limpiando cola');
    }
  };

  const testPrint = async () => {
    try {
      // Crear trabajo de prueba
      const res = await fetch(`${API}/api/print-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test',
          commands: [
            { type: 'center', bold: true, size: 'large', text: 'MESA POS RD' },
            { type: 'divider' },
            { type: 'center', text: 'Prueba de Impresion' },
            { type: 'center', text: new Date().toLocaleString() },
            { type: 'divider' },
            { type: 'center', text: 'Si puedes leer esto,' },
            { type: 'center', text: 'la impresora funciona!' },
            { type: 'feed', lines: 2 },
            { type: 'cut' }
          ]
        })
      });
      if (res.ok) {
        toast.success('Prueba enviada a la cola');
        loadData();
      }
    } catch (err) {
      toast.error('Error enviando prueba');
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
    <div className="space-y-6" data-testid="printer-settings">
      {/* Configuración General */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-orange-500" />
            Configuración de Impresora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Estado */}
          <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${config?.enabled ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {config?.enabled ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div>
                <p className="font-medium">Impresión</p>
                <p className="text-sm text-slate-400">
                  {config?.enabled ? 'Sistema de impresión activo' : 'Sistema de impresión desactivado'}
                </p>
              </div>
            </div>
            <Switch
              checked={config?.enabled}
              onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
            />
          </div>

          {/* Modo */}
          <div className="grid grid-cols-2 gap-4">
            <button
              className={`p-4 rounded-lg border-2 transition-all ${
                config?.mode === 'queue' 
                  ? 'border-orange-500 bg-orange-500/10' 
                  : 'border-slate-600 hover:border-slate-500'
              }`}
              onClick={() => setConfig({ ...config, mode: 'queue' })}
            >
              <Usb className="w-8 h-8 mx-auto mb-2 text-orange-500" />
              <p className="font-medium">USB (Agente)</p>
              <p className="text-xs text-slate-400 mt-1">
                Requiere ejecutar el agente de impresión en la PC
              </p>
            </button>
            <button
              className={`p-4 rounded-lg border-2 transition-all ${
                config?.mode === 'direct' 
                  ? 'border-orange-500 bg-orange-500/10' 
                  : 'border-slate-600 hover:border-slate-500'
              }`}
              onClick={() => setConfig({ ...config, mode: 'direct' })}
            >
              <Wifi className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <p className="font-medium">Red (Directo)</p>
              <p className="text-xs text-slate-400 mt-1">
                Impresora conectada por Ethernet/WiFi
              </p>
            </button>
          </div>

          {/* Impresora de Red */}
          {config?.mode === 'direct' && (
            <div className="p-4 bg-slate-700/50 rounded-lg space-y-4">
              <Label>IP de Impresora de Recibos</Label>
              <Input
                placeholder="192.168.1.100"
                value={config?.receipt_printer?.ip || ''}
                onChange={(e) => setConfig({
                  ...config,
                  receipt_printer: { ...config.receipt_printer, ip: e.target.value }
                })}
                className="bg-slate-800 border-slate-600"
              />
              
              <Label className="mt-4 block">IP de Impresora de Cocina</Label>
              <Input
                placeholder="192.168.1.101 (opcional - misma si es igual)"
                value={config?.kitchen_printer?.ip || ''}
                onChange={(e) => setConfig({
                  ...config,
                  kitchen_printer: { ...config.kitchen_printer, ip: e.target.value }
                })}
                className="bg-slate-800 border-slate-600"
              />
            </div>
          )}

          {/* Auto-print options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Imprimir comanda automáticamente al enviar a cocina</Label>
              <Switch
                checked={config?.auto_print_comanda}
                onCheckedChange={(checked) => setConfig({ ...config, auto_print_comanda: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Imprimir recibo automáticamente al pagar</Label>
              <Switch
                checked={config?.auto_print_receipt}
                onCheckedChange={(checked) => setConfig({ ...config, auto_print_receipt: checked })}
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 pt-4">
            <Button onClick={saveConfig} className="bg-orange-600 hover:bg-orange-700">
              Guardar Configuración
            </Button>
            <Button variant="outline" onClick={testPrint}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir Prueba
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cola de Impresión */}
      {config?.mode === 'queue' && (
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
                  {config?.enabled 
                    ? 'Asegúrate de que el agente de impresión esté corriendo'
                    : 'Activa el sistema de impresión arriba'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((job) => (
                  <div 
                    key={job.id} 
                    className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        job.status === 'pending' ? 'bg-yellow-500/20' :
                        job.status === 'completed' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {job.status === 'pending' ? (
                          <Clock className="w-4 h-4 text-yellow-500" />
                        ) : job.status === 'completed' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{job.type}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(job.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      job.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                      job.status === 'completed' ? 'bg-green-500/20 text-green-500' : 
                      'bg-red-500/20 text-red-500'
                    }`}>
                      {job.status === 'pending' ? 'Pendiente' : 
                       job.status === 'completed' ? 'Impreso' : 'Error'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Instrucciones del Agente */}
            <div className="mt-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Usb className="w-4 h-4 text-orange-500" />
                Instrucciones del Agente USB
              </h4>
              <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
                <li>Copia el archivo <code className="text-orange-400">print_agent.py</code> a la PC con la impresora</li>
                <li>Instala dependencias: <code className="text-orange-400">pip install python-escpos requests</code></li>
                <li>Ejecuta: <code className="text-orange-400">python print_agent.py --server http://[IP-SERVIDOR]:8001</code></li>
              </ol>
              <p className="text-xs text-slate-500 mt-3">
                El agente revisará la cola cada 2 segundos y enviará los trabajos a la impresora USB.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
