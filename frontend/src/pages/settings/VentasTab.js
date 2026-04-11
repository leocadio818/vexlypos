import { useState } from 'react';
import { useSettings } from './SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { reasonsAPI } from '@/lib/api';
import { CreditCard, AlertTriangle, ShoppingBag, Plus, Trash2, Pencil, Banknote, X, Check, Smartphone, Building2, DollarSign, FileText } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
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
  const { user, hasPermission, isAdmin } = useAuth();
  const canManageSaleConfig = isAdmin || hasPermission('manage_sale_config');
  const canEditExchangeRate = isAdmin || hasPermission('edit_exchange_rate') || canManageSaleConfig;
  const canConfigTiposVenta = isAdmin || hasPermission('config_tipos_venta');
  const canAddDeletePayMethods = isAdmin || hasPermission('config_formas_pago');
  const [ventasSubTab, setVentasSubTab] = useState('pagos');
  const [quickAmountInput, setQuickAmountInput] = useState('');
  
  // Dialogs
  const [payDialog, setPayDialog] = useState({ 
    open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
    bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null, is_cash: true, dgii_payment_code: null, force_contingency: false 
  });
  const [reasonDialog, setReasonDialog] = useState({ open: false, name: '', affects_inventory: true, allowed_roles: [], active: true, editId: null });
  const [showInactiveReasons, setShowInactiveReasons] = useState(false);
  const [confirmAction, setConfirmAction] = useState({ open: false, title: '', description: '', onConfirm: null, variant: 'default' });
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
        is_cash: payDialog.is_cash,
        dgii_payment_code: payDialog.dgii_payment_code,  // Código DGII para e-CF
        force_contingency: payDialog.force_contingency || false  // Uber Eats, Pedidos Ya, etc.
      };
      if (payDialog.editId) {
        await axios.put(`${API}/payment-methods/${payDialog.editId}`, data, { headers: hdrs() });
      } else {
        await axios.post(`${API}/payment-methods`, data, { headers: hdrs() });
      }
      notify.success(payDialog.editId ? 'Actualizado' : 'Creado');
      setPayDialog({ 
        open: false, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
        bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null, is_cash: true, dgii_payment_code: null, force_contingency: false 
      }); 
      fetchAll();
    } catch { notify.error('Error'); }
  };

  const handleDeletePayMethod = async (id) => {
    try { await axios.delete(`${API}/payment-methods/${id}`, { headers: hdrs() }); notify.success('Eliminado'); fetchAll(); }
    catch { notify.error('Error'); }
  };

  // Reason handlers
  const handleSaveReason = async () => {
    if (!reasonDialog.name.trim()) return;
    setConfirmAction({
      open: true,
      title: reasonDialog.editId ? 'Guardar Cambios' : 'Crear Razon',
      description: reasonDialog.editId
        ? `¿Confirmas guardar los cambios en "${reasonDialog.name}"?`
        : `¿Crear la razon "${reasonDialog.name}"?`,
      variant: 'default',
      onConfirm: async () => {
        try {
      const payload = {
        name: reasonDialog.name,
        return_to_inventory: reasonDialog.affects_inventory,
        affects_inventory: reasonDialog.affects_inventory,
        allowed_roles: reasonDialog.allowed_roles,
        active: reasonDialog.active,
      };
      if (reasonDialog.editId) {
        await reasonsAPI.update(reasonDialog.editId, payload);
        notify.success('Razon actualizada');
      } else {
        await reasonsAPI.create(payload);
        notify.success('Razon creada');
      }
      setReasonDialog({ open: false, name: '', affects_inventory: true, allowed_roles: [], active: true, editId: null });
      fetchAll();
    } catch { notify.error('Error'); }
      }
    });
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
      notify.success(saleDialog.editId ? 'Actualizado' : 'Creado');
      setSaleDialog({ open: false, name: '', code: '', tax_exemptions: [], default_ncf_type_id: 'B02', editId: null }); fetchAll();
    } catch { notify.error('Error'); }
  };

  const handleDeleteSaleType = async (id) => {
    try { await axios.delete(`${API}/sale-types/${id}`, { headers: hdrs() }); notify.success('Eliminado'); fetchAll(); }
    catch { notify.error('Error'); }
  };

  const handleSaveSystemConfig = async () => {
    try { 
      await axios.put(`${API}/system/config`, systemConfig, { headers: hdrs() }); 
      notify.success('Configuración del sistema guardada'); 
    }
    catch { notify.error('Error'); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SubTabButton active={ventasSubTab === 'pagos'} onClick={() => setVentasSubTab('pagos')} icon={CreditCard} label="Formas de Pago" />
        <SubTabButton active={ventasSubTab === 'anulaciones'} onClick={() => setVentasSubTab('anulaciones')} icon={AlertTriangle} label="Anulaciones" />
        {canConfigTiposVenta && (
          <SubTabButton active={ventasSubTab === 'tipos'} onClick={() => setVentasSubTab('tipos')} icon={ShoppingBag} label="Tipos de Venta" />
        )}
      </div>

      {ventasSubTab === 'pagos' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Formas de Pago</h2>
            {canAddDeletePayMethods && (
            <Button onClick={() => setPayDialog({ 
              open: true, name: '', icon: 'banknote', icon_type: 'lucide', brand_icon: null, 
              bg_color: '#6b7280', text_color: '#ffffff', currency: 'DOP', exchange_rate: 1, editId: null, dgii_payment_code: null, force_contingency: false 
            })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-payment-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
            )}
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
                  {m.dgii_payment_code && (
                    <span className="text-[10px] opacity-80 bg-white/20 px-1.5 py-0.5 rounded mt-1">DGII: {m.dgii_payment_code}</span>
                  )}
                  {m.force_contingency && (
                    <span className="text-[10px] bg-amber-500/80 text-white px-1.5 py-0.5 rounded mt-1">CONTINGENCIA</span>
                  )}
                  {m.currency && m.currency !== 'DOP' && (
                    <span className="text-xs opacity-70 mt-1">1 = {m.exchange_rate}</span>
                  )}
                </div>
                
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {(canManageSaleConfig || (canEditExchangeRate && m.currency !== 'DOP')) && (
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
                      is_cash: m.is_cash !== false,
                      dgii_payment_code: m.dgii_payment_code || null,
                      force_contingency: m.force_contingency || false
                    })}
                  >
                    <Pencil size={16} />
                  </Button>
                  )}
                  {canAddDeletePayMethods && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 bg-destructive/50 hover:bg-destructive/70 text-white"
                    onClick={() => handleDeletePayMethod(m.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                  )}
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

            {/* Color del botón Monto Exacto */}
            <div className="mt-6 bg-card border border-border rounded-xl p-4">
              <h3 className="font-oswald font-bold text-sm mb-2">Color del Boton "Monto Exacto"</h3>
              <p className="text-xs text-muted-foreground mb-3">Este color se usa en la pantalla de Procesar Pago</p>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={systemConfig.exact_amount_color || '#D4C5F0'} 
                  onChange={e => setSystemConfig(p => ({ ...p, exact_amount_color: e.target.value }))}
                  className="w-12 h-10 rounded-lg border border-border cursor-pointer"
                />
                <div className="flex-1 h-11 rounded-xl flex items-center justify-center font-oswald font-bold text-sm"
                  style={{ backgroundColor: systemConfig.exact_amount_color || '#D4C5F0', color: '#1f2937' }}>
                  MONTO EXACTO (Vista Previa)
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {ventasSubTab === 'anulaciones' && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-oswald text-base font-bold">Razones de Anulacion</h2>
            <div className="flex items-center gap-2">
              {reasons.filter(r => r.active === false).length > 0 && (
                <button
                  onClick={() => setShowInactiveReasons(!showInactiveReasons)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    showInactiveReasons ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  }`}>
                  {showInactiveReasons ? 'Ocultar' : 'Mostrar'} Inactivas ({reasons.filter(r => r.active === false).length})
                </button>
              )}
              <Button onClick={() => setReasonDialog({ open: true, name: '', affects_inventory: true, allowed_roles: ['admin','supervisor','cashier','waiter','kitchen'], active: true, editId: null })} size="sm"
                className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-reason-btn">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {reasons.filter(r => showInactiveReasons || r.active !== false).map(reason => (
              <div key={reason.id} className={`flex items-center justify-between p-4 rounded-lg bg-card border border-border ${reason.active === false ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <span className="font-semibold text-sm">{reason.name}</span>
                  <Badge variant={reason.return_to_inventory || reason.affects_inventory ? 'default' : 'destructive'} className="text-[11px]">
                    {reason.return_to_inventory || reason.affects_inventory ? 'Retorna inventario' : 'No retorna'}
                  </Badge>
                  {reason.allowed_roles && reason.allowed_roles.length < 5 && (
                    <Badge variant="outline" className="text-[11px]">{reason.allowed_roles.length} roles</Badge>
                  )}
                  {reason.active === false && <Badge className="text-[11px] bg-red-500/20 text-red-500">INACTIVA</Badge>}
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <Switch checked={reason.active !== false}
                    onCheckedChange={() => {
                      const newState = !(reason.active !== false);
                      setConfirmAction({
                        open: true,
                        title: newState ? 'Reactivar Razon' : 'Desactivar Razon',
                        description: newState
                          ? `¿Reactivar "${reason.name}"? Volvera a aparecer en la pantalla de caja.`
                          : `¿Desactivar "${reason.name}"? Dejara de aparecer en la pantalla de caja para anulaciones.`,
                        variant: newState ? 'default' : 'destructive',
                        onConfirm: () => {
                          reasonsAPI.update(reason.id, { active: newState }).then(() => {
                            notify.success(newState ? 'Razon reactivada' : 'Razon desactivada');
                            fetchAll();
                          });
                        }
                      });
                    }} />
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-primary"
                    onClick={() => setReasonDialog({ open: true, name: reason.name, affects_inventory: reason.return_to_inventory || reason.affects_inventory || false, allowed_roles: reason.allowed_roles || ['admin','supervisor','cashier','waiter','kitchen'], active: reason.active !== false, editId: reason.id })}>
                    <Pencil size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {ventasSubTab === 'tipos' && canConfigTiposVenta && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-base font-bold">Tipos de Venta</h2>
            {canManageSaleConfig && (
            <Button onClick={() => setSaleDialog({ open: true, name: '', code: '', tax_exemptions: [], default_ncf_type_id: 'B02', editId: null })} size="sm"
              className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-saletype-btn">
              <Plus size={14} className="mr-1" /> Agregar
            </Button>
            )}
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
                      <Badge variant="outline" className="text-[11px] border-blue-500/50 text-blue-400 bg-blue-500/10">
                        <FileText size={10} className="mr-1" />
                        {st.default_ncf_type_id}
                        {ncfType && <span className="ml-1 opacity-70">({ncfType.description?.split(' ')[0] || ''})</span>}
                      </Badge>
                    )}
                    {exemptCount > 0 && (
                      <Badge variant="outline" className="text-[11px] border-muted-foreground/50 text-muted-foreground">
                        {exemptCount} no aplica(n)
                      </Badge>
                    )}
                  </div>
                  {canManageSaleConfig && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => setSaleDialog({ open: true, name: st.name, code: st.code, tax_exemptions: st.tax_exemptions || [], default_ncf_type_id: st.default_ncf_type_id || 'B02', editId: st.id })}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive"
                      onClick={() => handleDeleteSaleType(st.id)}><Trash2 size={14} /></Button>
                  </div>
                  )}
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
            <div>
              <label className="text-sm font-medium">Código DGII</label>
              <select 
                value={payDialog.dgii_payment_code || ''} 
                onChange={e => setPayDialog({ ...payDialog, dgii_payment_code: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm"
                data-testid="dgii-code-select"
              >
                <option value="">Automático (por nombre)</option>
                <option value="1">1 - Efectivo</option>
                <option value="2">2 - Cheque/Transferencia/Depósito</option>
                <option value="3">3 - Tarjeta de Crédito/Débito</option>
                <option value="4">4 - Venta a Crédito</option>
                <option value="5">5 - Bonos o Certificados</option>
                <option value="6">6 - Permuta</option>
                <option value="7">7 - Nota de Crédito</option>
                <option value="8">8 - Otras Formas de Pago</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Código oficial DGII para facturación electrónica (e-CF)
              </p>
            </div>
            <div className="border-t border-border pt-4 mt-2">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={payDialog.force_contingency} 
                  onCheckedChange={(v) => setPayDialog({ ...payDialog, force_contingency: v })} 
                  data-testid="force-contingency-toggle"
                />
                <label className="text-sm font-medium">Forzar Contingencia</label>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Para plataformas como Uber Eats y Pedidos Ya que generan su propio comprobante.
                La venta queda en contingencia para revisión sin enviar a DGII automáticamente.
              </p>
              {payDialog.force_contingency && (
                <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xs text-amber-500">
                    ⚠️ Las ventas con este método NO se enviarán a DGII automáticamente.
                    Aparecerán en el Dashboard e-CF → Contingencia para revisión.
                  </p>
                </div>
              )}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald">{reasonDialog.editId ? 'Editar Razon' : 'Nueva Razon de Anulacion'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input type="text" value={reasonDialog.name} onChange={e => setReasonDialog({ ...reasonDialog, name: e.target.value })}
                className="w-full mt-1 p-2 rounded-lg bg-background border border-border text-sm" placeholder="Ej: Cliente cambio de opinion" />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
              <Switch checked={reasonDialog.affects_inventory} onCheckedChange={(v) => setReasonDialog({ ...reasonDialog, affects_inventory: v })} />
              <div>
                <label className="text-sm font-medium">Afecta Inventario</label>
                <p className="text-xs text-muted-foreground">Si se activa, los productos anulados retornan al stock</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Puestos Autorizados</label>
              <p className="text-xs text-muted-foreground mb-2">Solo estos roles pueden usar esta razon sin autorizacion de un superior</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'admin', label: 'Admin' },
                  { id: 'supervisor', label: 'Supervisor' },
                  { id: 'cashier', label: 'Cajero' },
                  { id: 'waiter', label: 'Mesero' },
                  { id: 'kitchen', label: 'Cocina' },
                ].map(role => {
                  const selected = (reasonDialog.allowed_roles || []).includes(role.id);
                  return (
                    <button key={role.id} type="button"
                      onClick={() => {
                        const roles = reasonDialog.allowed_roles || [];
                        setReasonDialog({ ...reasonDialog, allowed_roles: selected ? roles.filter(r => r !== role.id) : [...roles, role.id] });
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}>
                      {role.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReasonDialog({ ...reasonDialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSaveReason} className="bg-primary text-primary-foreground">Guardar</Button>
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
                  <option key={n.id} value={n.id}>{n.id} - {n.description}</option>
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

      {/* Confirm Action AlertDialog */}
      <AlertDialog open={confirmAction.open} onOpenChange={(o) => !o && setConfirmAction(p => ({ ...p, open: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-oswald">{confirmAction.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmAction.onConfirm) confirmAction.onConfirm(); }}
              className={confirmAction.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
