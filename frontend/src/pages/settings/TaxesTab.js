import { useState } from 'react';
import { useSettings } from './SettingsContext';
import { taxesAPI } from '@/lib/api';
import { Calculator, Plus, Trash2, Pencil, Sparkles, Percent, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '@/components/NumericKeypad';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function TaxesTab() {
  const { taxConfig, refreshTaxConfig } = useSettings();
  const [taxDialog, setTaxDialog] = useState({
    open: false, code: '', name: '', rate: 18, tax_type: 'percentage', applies_to: 'subtotal',
    is_dine_in_only: false, dgii_code: '', description: '', sort_order: 0, editId: null
  });

  const handleSeedDefaultTaxes = async () => {
    try {
      const res = await taxesAPI.seedDefaults();
      toast.success(`Se crearon ${res.data.created} impuestos por defecto`);
      refreshTaxConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const handleSaveTax = async () => {
    if (!taxDialog.code.trim() || !taxDialog.name.trim()) {
      toast.error('Código y nombre son requeridos');
      return;
    }
    try {
      const data = {
        code: taxDialog.code.toUpperCase(),
        name: taxDialog.name,
        rate: parseFloat(taxDialog.rate) || 0,
        tax_type: taxDialog.tax_type,
        applies_to: taxDialog.applies_to,
        is_dine_in_only: taxDialog.is_dine_in_only,
        dgii_code: taxDialog.dgii_code || null,
        description: taxDialog.description || null,
        sort_order: parseInt(taxDialog.sort_order) || 0
      };
      
      if (taxDialog.editId) {
        await taxesAPI.updateConfig(taxDialog.editId, data);
        toast.success('Impuesto actualizado');
      } else {
        await taxesAPI.createConfig(data);
        toast.success('Impuesto creado');
      }
      setTaxDialog({ open: false, code: '', name: '', rate: 18, tax_type: 'percentage', applies_to: 'subtotal', is_dine_in_only: false, dgii_code: '', description: '', sort_order: 0, editId: null });
      refreshTaxConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar impuesto');
    }
  };

  const handleDeleteTax = async (code) => {
    if (!confirm(`¿Desactivar impuesto ${code}?`)) return;
    try {
      await taxesAPI.deleteConfig(code);
      toast.success('Impuesto desactivado');
      refreshTaxConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al desactivar');
    }
  };

  return (
    <div className="space-y-6" data-testid="taxes-content">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-oswald text-lg font-bold flex items-center gap-2">
            <Calculator size={20} className="text-amber-500" />
            Configuración de Impuestos
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Gestiona ITBIS, Propina Legal y otros impuestos del sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSeedDefaultTaxes}
            className="text-xs"
            data-testid="seed-default-taxes"
          >
            <Sparkles size={14} className="mr-1" /> Cargar Por Defecto
          </Button>
          <Button 
            size="sm" 
            onClick={() => setTaxDialog({ open: true, code: '', name: '', rate: 18, tax_type: 'percentage', applies_to: 'subtotal', is_dine_in_only: false, dgii_code: '', description: '', sort_order: 0, editId: null })}
            className="bg-amber-600 hover:bg-amber-700"
            data-testid="add-tax-btn"
          >
            <Plus size={14} className="mr-1" /> Nuevo Impuesto
          </Button>
        </div>
      </div>

      {/* Tax List */}
      {taxConfig.length === 0 ? (
        <div className="text-center py-12 bg-card/50 rounded-xl border border-border">
          <Calculator size={48} className="mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-oswald font-bold mb-2">No hay impuestos configurados</h3>
          <p className="text-sm text-muted-foreground mb-4">Carga los impuestos por defecto para RD o crea uno personalizado</p>
          <Button onClick={handleSeedDefaultTaxes} className="bg-amber-600 hover:bg-amber-700">
            <Sparkles size={14} className="mr-1" /> Cargar Impuestos RD
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {taxConfig.map((tax, idx) => (
            <div 
              key={tax.code || idx} 
              className="bg-card border border-border rounded-xl p-4 hover:border-amber-500/30 transition-colors"
              data-testid={`tax-item-${tax.code}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    tax.is_dine_in_only ? 'bg-blue-500/20 text-blue-500' : 'bg-amber-500/20 text-amber-500'
                  }`}>
                    <Percent size={20} />
                  </div>
                  <div>
                    <h3 className="font-oswald font-bold">{tax.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">{tax.code}</Badge>
                      <span>{tax.rate}%</span>
                      {tax.dgii_code && <span className="text-muted-foreground">DGII: {tax.dgii_code}</span>}
                      {tax.is_dine_in_only && (
                        <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">Solo Local</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setTaxDialog({
                      open: true,
                      code: tax.code,
                      name: tax.name,
                      rate: tax.rate,
                      tax_type: tax.tax_type,
                      applies_to: tax.applies_to,
                      is_dine_in_only: tax.is_dine_in_only,
                      dgii_code: tax.dgii_code || '',
                      description: tax.description || '',
                      sort_order: tax.sort_order || 0,
                      editId: tax.code
                    })}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteTax(tax.code)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              {tax.description && (
                <p className="text-xs text-muted-foreground mt-2 pl-15">{tax.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <Alert className="bg-blue-500/10 border-blue-500/30">
        <AlertCircle className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-400 font-oswald">Impuestos Dinámicos</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Los impuestos marcados como "Solo Local" (ej: Propina Legal) se omiten automáticamente
          para órdenes "Para Llevar" o "Delivery".
        </AlertDescription>
      </Alert>

      {/* Tax Dialog */}
      <Dialog open={taxDialog.open} onOpenChange={(o) => !o && setTaxDialog({ ...taxDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{taxDialog.editId ? 'Editar Impuesto' : 'Nuevo Impuesto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Código</label>
                <input type="text" value={taxDialog.code} onChange={e => setTaxDialog({ ...taxDialog, code: e.target.value.toUpperCase() })}
                  className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm font-mono" placeholder="ITBIS" disabled={!!taxDialog.editId} />
              </div>
              <div>
                <label className="text-sm font-medium">Tasa (%)</label>
                <NumericInput value={taxDialog.rate} onChange={e => setTaxDialog({ ...taxDialog, rate: e.target.value })}
                  label="Tasa (%)" className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={taxDialog.name} onChange={e => setTaxDialog({ ...taxDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="ITBIS 18%" />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción (opcional)</label>
              <input type="text" value={taxDialog.description} onChange={e => setTaxDialog({ ...taxDialog, description: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Impuesto general..." />
            </div>
            <div>
              <label className="text-sm font-medium">Código DGII (opcional)</label>
              <input type="text" value={taxDialog.dgii_code} onChange={e => setTaxDialog({ ...taxDialog, dgii_code: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="E1" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={taxDialog.is_dine_in_only} onCheckedChange={(v) => setTaxDialog({ ...taxDialog, is_dine_in_only: v })} />
              <label className="text-sm">Solo aplica en consumo local (no Para Llevar/Delivery)</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaxDialog({ ...taxDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveTax} className="bg-amber-600 hover:bg-amber-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
