import { useState, useEffect } from 'react';
import { inventorySettingsAPI } from '@/lib/api';
import { notify } from '@/lib/notify';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Cog } from 'lucide-react';

export default function ConfigTab() {
  const [settings, setSettings] = useState({
    allow_sale_without_stock: false,
    auto_deduct_on_payment: true,
    show_stock_alerts: true
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await inventorySettingsAPI.get();
      setSettings(res.data || {
        allow_sale_without_stock: false,
        auto_deduct_on_payment: true,
        show_stock_alerts: true
      });
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await inventorySettingsAPI.update(settings);
      notify.success('Configuración guardada correctamente');
    } catch (e) {
      notify.error('Error al guardar configuración');
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Cog size={32} className="animate-spin text-primary opacity-50" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Cog size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="font-oswald text-xl font-bold">Configuración de Inventario</h2>
          <p className="text-sm text-muted-foreground">Ajustes generales del sistema de inventario</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
          <div>
            <span className="text-sm font-semibold">Permitir venta sin stock</span>
            <p className="text-xs text-muted-foreground mt-1">
              Permite vender productos aunque no haya inventario disponible
            </p>
          </div>
          <Switch 
            checked={settings.allow_sale_without_stock}
            onCheckedChange={(v) => setSettings(prev => ({ ...prev, allow_sale_without_stock: v }))} 
          />
        </div>
        
        <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
          <div>
            <span className="text-sm font-semibold">Deducir automáticamente al pagar</span>
            <p className="text-xs text-muted-foreground mt-1">
              Reduce el stock automáticamente cuando se completa una venta
            </p>
          </div>
          <Switch 
            checked={settings.auto_deduct_on_payment}
            onCheckedChange={(v) => setSettings(prev => ({ ...prev, auto_deduct_on_payment: v }))} 
          />
        </div>
        
        <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
          <div>
            <span className="text-sm font-semibold">Mostrar alertas de stock bajo</span>
            <p className="text-xs text-muted-foreground mt-1">
              Notifica cuando un producto está por agotarse según el mínimo configurado
            </p>
          </div>
          <Switch 
            checked={settings.show_stock_alerts}
            onCheckedChange={(v) => setSettings(prev => ({ ...prev, show_stock_alerts: v }))} 
          />
        </div>
      </div>

      <Button 
        onClick={handleSave} 
        className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold text-base"
      >
        GUARDAR CONFIGURACIÓN
      </Button>
    </div>
  );
}
