import { useState } from 'react';
import { useSettings } from './SettingsContext';
import { reasonsAPI } from '@/lib/api';
import { CreditCard, AlertTriangle, ShoppingBag, Plus, Trash2, Pencil, Banknote, X, Check, Smartphone, Building2, DollarSign, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/NumericKeypad';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const SubTabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      active 
        ? 'bg-primary/20 text-primary border border-primary/30' 
        : 'bg-card/50 text-muted-foreground border border-border hover:border-primary/30 hover:text-primary'
    }`}
  >
    <Icon size={14} />
    {label}
  </button>
);

export default function VentasTab() {
  const { payMethods, saleTypes, reasons, ncfTypes, taxConfig, systemConfig, setSystemConfig, fetchAll } = useSettings();
  const [ventasSubTab, setVentasSubTab] = useState('pagos');
  const [quickAmountInput, setQuickAmountInput] = useState('');
  
  // Dialogs
  const [payDialog, setPayDialog] = useState({ 
    open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
    bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null, is_cash: true 
  });
  const [reasonDialog, setReasonDialog] = useState({ open: false, name: '', return_to_inventory: true });
  const [saleDialog, setSaleDialog] = useState({ open: false, name: '', code: '', tax_exemptions: [], default_ncf_type_id: 'B02', editId: null });

  // Payment method handlers
  const handleSavePayMethod = async () => {
    if (!payDialog.name) return;
    try {
      const data = { 
        name: payDialog.name, 
        icon: payDialog.icon, 
        icon_type: payDialog.icon_type,
        brand_icon: payDialog.brand_icon,
        bg_color: payDialog.bg_color,
        text_color: payDialog.text_color,
        currency: payDialog.currency, 
        exchange_rate: parseFloat(payDialog.exchange_rate) || 1,
        is_cash: payDialog.is_cash
      };
      if (payDialog.editId) {
        await axios.put(`${API}/payment-methods/${payDialog.editId}`, data, { headers: hdrs() });
      } else {
        await axios.post(`${API}/payment-methods`, data, { headers: hdrs() });
      }
      toast.success(payDialog.editId ? 'Actualizado' : 'Creado');
      setPayDialog({ 
        open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
        bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null, is_cash: true 
      }); 
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeletePayMethod = async (id) => {
    try { await axios.delete(`${API}/payment-methods/${id}`, { headers: hdrs() }); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // Reason handlers
  const handleAddReason = async () => {
    if (!reasonDialog.name.trim()) return;
    try {
      await reasonsAPI.create({ name: reasonDialog.name, return_to_inventory: reasonDialog.return_to_inventory });
      toast.success('Razon creada');
      setReasonDialog({ open: false, name: '', return_to_inventory: true }); fetchAll();
    } catch { toast.error('Error'); }
  };

  // Sale type handlers
  const handleSaveSaleType = async () => {
    if (!saleDialog.name) return;
    try {
      const autoCode = saleDialog.code || saleDialog.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
      
      const data = { 
        name: saleDialog.name, 
        code: autoCode, 
        tax_exemptions: saleDialog.tax_exemptions || [],
        default_ncf_type_id: saleDialog.default_ncf_type_id || 'B02'
      };
      if (saleDialog.editId) await axios.put(`${API}/sale-types/${saleDialog.editId}`, data, { headers: hdrs() });
      else await axios.post(`${API}/sale-types`, data, { headers: hdrs() });
      toast.success(saleDialog.editId ? 'Actualizado' : 'Creado');
      setSaleDialog({ open: false, name: '', code: '', tax_exemptions: [], default_ncf_type_id: 'B02', editId: null }); fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleDeleteSaleType = async (id) => {
    try { await axios.delete(`${API}/sale-types/${id}`, { headers: hdrs() }); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  const handleSaveSystemConfig = async () => {
    try { 
      await axios.put(`${API}/system/config`, systemConfig, { headers: hdrs() }); 
      toast.success('Configuración del sistema guardada'); 
    }
    catch { toast.error('Error'); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SubTabButton active={ventasSubTab === 'pagos'} onClick={() => setVentasSubTab('pagos')} icon={CreditCard} label="Formas de Pago" />
        <SubTabButton active={ventasSubTab === 'anulaciones'} onClick={() => setVentasSubTab('anulaciones')} icon={AlertTriangle} label="Anulaciones" />
        <SubTabButton active={ventasSubTab === 'tipos'} onClick={() => setVentasSubTab('tipos')} icon={ShoppingBag} label="Tipos de Venta" />
      </div>

      {ventasSubTab === 'pagos' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Formas de Pago</h2>
            <Button onClick={() => setPayDialog({ 
              open: true, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
              bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null 
            })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-payment-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
          </div>
          
          {/* Payment Methods Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {payMethods.sort((a, b) => (a.order || 0) - (b.order || 0)).map(m => (
              <div 
                key={m.id} 
                className="group relative rounded-2xl overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1"
                style={{ backgroundColor: m.bg_color || '#6b7280' }}
                data-testid={`payment-${m.id}`}
              >
                <div 
                  className="p-4 flex flex-col items-center justify-center min-h-[100px]"
                  style={{ color: m.text_color || '#ffffff' }}
                >
                  {m.icon_type === 'brand' && m.brand_icon ? (
                    <div className="w-10 h-6 bg-white/20 rounded flex items-center justify-center text-[8px] font-bold mb-2">
                      {m.brand_icon.toUpperCase()}
                    </div>
                  ) : (
                    (() => {
                      const icons = { banknote: Banknote, 'credit-card': CreditCard, smartphone: Smartphone, building2: Building2, 'dollar-sign': DollarSign };
                      const Icon = icons[m.icon] || Banknote;
                      return <Icon size={24} className="mb-2" />;
                    })()
                  )}
                  <span className="font-oswald font-bold text-sm text-center">{m.name}</span>
                  {m.currency && m.currency !== 'DOP' && (
                    <span className="text-[10px] opacity-70 mt-1">1 = {m.exchange_rate}</span>
                  )}
                </div>
                
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 bg-white/20 hover:bg-white/30 text-white"
                    onClick={() => setPayDialog({ 
                      open: true, 
                      name: m.name, 
                      icon: m.icon || 'banknote', 
                      icon_type: m.icon_type || 'lucide',
                      brand_icon: m.brand_icon || null,
                      bg_color: m.bg_color || '#6b7280',
                      text_color: m.text_color || '#ffffff',
                      currency: m.currency || 'DOP', 
                      exchange_rate: m.exchange_rate || 1, 
                      editId: m.id,
                      is_cash: m.is_cash !== false
                    })}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 bg-destructive/50 hover:bg-destructive/70 text-white"
                    onClick={() => handleDeletePayMethod(m.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Amounts Configuration */}
          <div className="bg-card border-2 border-primary/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Banknote size={20} className="text-primary" />
              <h3 className="font-oswald text-base font-bold">Montos Rápidos de Pago</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Estos botones aparecerán en la pantalla de cobro para agilizar el proceso de pago.
            </p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {(systemConfig.quick_amounts || []).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No hay montos configurados</p>
              ) : (
                (systemConfig.quick_amounts || []).map((amount, i) => (
                  <div key={i} className="flex items-center gap-1 bg-primary/20 text-primary rounded-xl px-4 py-2 font-oswald font-bold">
                    <span className="text-lg">{amount.toLocaleString()}</span>
                    <button 
                      onClick={() => setSystemConfig(p => ({
                        ...p, 
                        quick_amounts: p.quick_amounts.filter((_, idx) => idx !== i)
                      }))}
                      className="ml-2 hover:text-destructive transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex gap-2">
              <NumericInput 
                value={quickAmountInput}
                onChange={e => setQuickAmountInput(e.target.value)}
                placeholder="Agregar monto..."
                label="Monto Rapido"
                allowDecimal={false}
                className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm font-oswald"
              />
              <Button 
                variant="default" 
                onClick={() => {
                  const val = parseInt(quickAmountInput);
                  if (val > 0) {
                    setSystemConfig(p => ({
                      ...p,
                      quick_amounts: [...(p.quick_amounts || []), val].sort((a, b) => a - b)
                    }));
                    setQuickAmountInput('');
                  }
                }}
                className="px-6 bg-primary text-primary-foreground font-oswald font-bold"
              >
                <Plus size={18} className="mr-1" /> Agregar
              </Button>
            </div>
            
            <Button 
              onClick={handleSaveSystemConfig} 
              className="w-full mt-4 h-11 bg-green-600 hover:bg-green-700 text-white font-oswald font-bold"
            >
              <Check size={18} className="mr-2" /> Guardar Montos Rápidos
            </Button>
          </div>
        </>
      )}

      {ventasSubTab === 'anulaciones' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Razones de Anulacion</h2>
            <Button onClick={() => setReasonDialog({ open: true, name: '', return_to_inventory: true })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-reason-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
          </div>
          <div className="space-y-2">
            {reasons.map(reason => (
              <div key={reason.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div>
                  <span className="font-semibold text-sm">{reason.name}</span>
                  <Badge variant={reason.return_to_inventory ? 'default' : 'destructive'} className="ml-2 text-[9px]">
                    {reason.return_to_inventory ? 'Retorna inventario' : 'No retorna'}
                  </Badge>
                </div>
                <Switch checked={reason.return_to_inventory}
                  onCheckedChange={() => { reasonsAPI.update(reason.id, { return_to_inventory: !reason.return_to_inventory }).then(() => { toast.success('Actualizado'); fetchAll(); }); }} />
              </div>
            ))}
          </div>
        </>
      )}

      {ventasSubTab === 'tipos' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Tipos de Venta</h2>
            <Button onClick={() => setSaleDialog({ open: true, name: '', code: '', tax_exemptions: [], default_ncf_type_id: 'B02', editId: null })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-saletype-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
          </div>
          <div className="space-y-2">
            {saleTypes.map(st => {
              const exemptCount = (st.tax_exemptions || []).length;
              const ncfType = ncfTypes.find(n => n.id === st.default_ncf_type_id || n.code === st.default_ncf_type_id);
              return (
                <div key={st.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`saletype-${st.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{st.name}</span>
                    {st.default_ncf_type_id && (
                      <Badge variant="outline" className="text-[9px] border-blue-500/50 text-blue-400 bg-blue-500/10">
                        <FileText size={10} className="mr-1" />
                        {st.default_ncf_type_id}
                        {ncfType && <span className="ml-1 opacity-70">({ncfType.description?.split(' ')[0] || ''})</span>}
                      </Badge>
                    )}
                    {exemptCount > 0 && (
                      <Badge variant="outline" className="text-[9px] border-muted-foreground/50 text-muted-foreground">
                        {exemptCount} no aplica(n)
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => setSaleDialog({ open: true, name: st.name, code: st.code, tax_exemptions: st.tax_exemptions || [], default_ncf_type_id: st.default_ncf_type_id || 'B02', editId: st.id })}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                      onClick={() => handleDeleteSaleType(st.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Payment Method Dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => !o && setPayDialog({ ...payDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald">{payDialog.editId ? 'Editar Método' : 'Nuevo Método de Pago'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={payDialog.name} onChange={e => setPayDialog({ ...payDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Efectivo RD$" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Color Fondo</label>
                <input type="color" value={payDialog.bg_color} onChange={e => setPayDialog({ ...payDialog, bg_color: e.target.value })}
                  className="w-full h-10 mt-1 rounded-lg border border-border cursor-pointer" />
              </div>
              <div>
                <label className="text-sm font-medium">Color Texto</label>
                <input type="color" value={payDialog.text_color} onChange={e => setPayDialog({ ...payDialog, text_color: e.target.value })}
                  className="w-full h-10 mt-1 rounded-lg border border-border cursor-pointer" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Moneda</label>
                <select value={payDialog.currency} onChange={e => setPayDialog({ ...payDialog, currency: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                  <option value="DOP">DOP (Peso Dominicano)</option>
                  <option value="USD">USD (Dólar)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>
              {payDialog.currency !== 'DOP' && (
                <div>
                  <label className="text-sm font-medium">Tasa de Cambio</label>
                  <NumericInput value={payDialog.exchange_rate} onChange={e => setPayDialog({ ...payDialog, exchange_rate: e.target.value })}
                    label="Tasa de Cambio" className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={payDialog.is_cash} onCheckedChange={(v) => setPayDialog({ ...payDialog, is_cash: v })} />
              <label className="text-sm">Es efectivo (afecta arqueo de caja)</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayDialog({ ...payDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSavePayMethod} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reason Dialog */}
      <Dialog open={reasonDialog.open} onOpenChange={(o) => !o && setReasonDialog({ ...reasonDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-oswald">Nueva Razón de Anulación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={reasonDialog.name} onChange={e => setReasonDialog({ ...reasonDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Cliente cambió de opinión" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={reasonDialog.return_to_inventory} onCheckedChange={(v) => setReasonDialog({ ...reasonDialog, return_to_inventory: v })} />
              <label className="text-sm">Retornar al inventario</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReasonDialog({ ...reasonDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleAddReason} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Type Dialog */}
      <Dialog open={saleDialog.open} onOpenChange={(o) => !o && setSaleDialog({ ...saleDialog, open: false })}>
        <DialogContent className="sm:max-w-md bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald">{saleDialog.editId ? 'Editar Tipo de Venta' : 'Nuevo Tipo de Venta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={saleDialog.name} onChange={e => setSaleDialog({ ...saleDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Consumo Local" />
            </div>
            <div>
              <label className="text-sm font-medium">NCF por Defecto</label>
              <select value={saleDialog.default_ncf_type_id} onChange={e => setSaleDialog({ ...saleDialog, default_ncf_type_id: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm">
                {ncfTypes.map(n => (
                  <option key={n.id} value={n.code}>{n.code} - {n.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Impuestos Aplicables</label>
              <p className="text-xs text-muted-foreground mb-3">Activa los impuestos que aplican a este tipo de venta</p>
              <div className="space-y-2">
                {taxConfig.map(tax => {
                  const isExempt = (saleDialog.tax_exemptions || []).includes(tax.id);
                  const isApplied = !isExempt;
                  return (
                    <div key={tax.id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border">
                      <div>
                        <span className="font-medium text-sm">{tax.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({tax.rate}%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${isApplied ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {isApplied ? 'Aplica' : 'No Aplica'}
                        </span>
                        <Switch 
                          checked={isApplied}
                          onCheckedChange={() => {
                            setSaleDialog(p => {
                              const current = p.tax_exemptions || [];
                              if (isApplied) {
                                return { ...p, tax_exemptions: [...current, tax.id] };
                              } else {
                                return { ...p, tax_exemptions: current.filter(id => id !== tax.id) };
                              }
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaleDialog({ ...saleDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveSaleType} className="bg-primary text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
