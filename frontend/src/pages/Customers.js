import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/context/ThemeContext';
import { formatMoney } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Heart, Plus, Search, Gift, Star, Phone, Mail, ArrowLeft, Pencil, Send, Trash2, Eye, Loader2 } from 'lucide-react';
import { notify } from '@/lib/notify';
import axios from 'axios';
import { NumericInput } from '@/components/NumericKeypad';
import { useSectionLayout, useScreenEditMode, useLongPress } from '@/hooks/useEditableGrid';
import { EditableCardGrid, EditModeBar } from '@/components/EditableCardGrid';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Admin roles that can configure loyalty points
const ADMIN_ROLES = ['admin', 'gerente', 'propietario', 'manager', 'owner'];

export default function Customers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isMinimalist, isNeoDark } = useTheme();
  const isLightMode = isMinimalist && !isNeoDark;
  const [customers, setCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [config, setConfig] = useState({ points_per_hundred: 10, point_value_rd: 1, min_redemption: 50 });
  const [addDialog, setAddDialog] = useState({ open: false, name: '', phone: '', email: '' });
  const [redeemDialog, setRedeemDialog] = useState({ open: false, customer: null, points: '' });
  const [editDialog, setEditDialog] = useState({ open: false, customer: null, name: '', phone: '', email: '', rnc: '' });
  const [configDialog, setConfigDialog] = useState(false);
  
  // Marketing email state
  const [marketingDialog, setMarketingDialog] = useState({ 
    open: false, 
    subject: '', 
    message: '', 
    products: [],
    previewHtml: '',
    customerCount: 0,
    showPreview: false,
    sending: false
  });

  // Check if current user has admin privileges
  const isAdmin = user && ADMIN_ROLES.includes(user.role?.toLowerCase());

  // Editable grid for loyalty info cards
  const LOYALTY_IDS = useMemo(() => ['points_rate', 'point_value', 'min_redeem'], []);
  const custScreen = useScreenEditMode();
  const loyaltyCards = useSectionLayout('customers', 'loyalty', LOYALTY_IDS);
  useEffect(() => { custScreen.registerSection([loyaltyCards]); }, [loyaltyCards, custScreen.registerSection]); // eslint-disable-line react-hooks/exhaustive-deps
  const custLongPress = useLongPress(custScreen.enterEditMode, 800);

  const fetchAll = useCallback(async () => {
    try {
      const [cRes, cfgRes] = await Promise.all([
        axios.get(`${API}/customers`, { headers: headers() }),
        axios.get(`${API}/loyalty/config`, { headers: headers() }),
      ]);
      setAllCustomers(cRes.data);
      setConfig(cfgRes.data);
    } catch (e) { console.error('Error loading customers:', e); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filter customers locally for instant search
  useEffect(() => {
    if (!search) {
      setCustomers(allCustomers);
    } else {
      const q = search.toLowerCase();
      setCustomers(allCustomers.filter(c => 
        c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
      ));
    }
  }, [search, allCustomers]);

  const handleAddCustomer = async () => {
    if (!addDialog.name) return;
    try {
      await axios.post(`${API}/customers`, { name: addDialog.name, phone: addDialog.phone, email: addDialog.email }, { headers: headers() });
      notify.success('Cliente registrado');
      setAddDialog({ open: false, name: '', phone: '', email: '' });
      fetchAll();
    } catch { notify.error('Error'); }
  };

  const handleRedeem = async () => {
    const pts = parseInt(redeemDialog.points);
    if (!pts || pts < config.min_redemption) { notify.error(`Minimo ${config.min_redemption} puntos`); return; }
    try {
      const res = await axios.post(`${API}/customers/${redeemDialog.customer.id}/redeem-points`, { points: pts }, { headers: headers() });
      notify.success(`${pts} puntos canjeados = ${formatMoney(res.data.discount_rd)} descuento`);
      setRedeemDialog({ open: false, customer: null, points: '' });
      fetchAll();
    } catch (e) { notify.error(e.response?.data?.detail || 'Error'); }
  };

  const handleUpdateConfig = async () => {
    try {
      await axios.put(`${API}/loyalty/config`, config, { headers: headers() });
      notify.success('Configuracion actualizada');
      setConfigDialog(false);
    } catch { notify.error('Error'); }
  };

  // Marketing email functions
  const openMarketingDialog = async () => {
    try {
      const res = await axios.post(`${API}/email/send-marketing/preview`, { subject: '', message: '' }, { headers: headers() });
      setMarketingDialog({
        open: true,
        subject: '',
        message: '',
        products: [],
        previewHtml: '',
        customerCount: res.data.customer_count || 0,
        showPreview: false,
        sending: false
      });
    } catch (e) {
      notify.error('Error al cargar datos');
    }
  };

  const handleMarketingPreview = async () => {
    if (!marketingDialog.subject.trim()) { notify.error('El asunto es requerido'); return; }
    if (!marketingDialog.message.trim()) { notify.error('El mensaje es requerido'); return; }
    try {
      const res = await axios.post(`${API}/email/send-marketing/preview`, {
        subject: marketingDialog.subject,
        message: marketingDialog.message,
        products: marketingDialog.products.filter(p => p.name.trim())
      }, { headers: headers() });
      setMarketingDialog(prev => ({ ...prev, previewHtml: res.data.html, customerCount: res.data.customer_count, showPreview: true }));
    } catch (e) {
      notify.error('Error al generar preview');
    }
  };

  const handleMarketingSend = async () => {
    if (!marketingDialog.subject.trim()) { notify.error('El asunto es requerido'); return; }
    if (!marketingDialog.message.trim()) { notify.error('El mensaje es requerido'); return; }
    if (marketingDialog.customerCount === 0) { notify.error('No hay clientes con email'); return; }
    
    const confirmed = window.confirm(`¿Enviar email a ${marketingDialog.customerCount} clientes?`);
    if (!confirmed) return;
    
    setMarketingDialog(prev => ({ ...prev, sending: true }));
    try {
      const res = await axios.post(`${API}/email/send-marketing`, {
        subject: marketingDialog.subject,
        message: marketingDialog.message,
        products: marketingDialog.products.filter(p => p.name.trim())
      }, { headers: headers() });
      
      notify.success(`Email enviado a ${res.data.sent_count} clientes exitosamente`);
      setMarketingDialog({ open: false, subject: '', message: '', products: [], previewHtml: '', customerCount: 0, showPreview: false, sending: false });
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error al enviar emails');
      setMarketingDialog(prev => ({ ...prev, sending: false }));
    }
  };

  const addProductRow = () => {
    setMarketingDialog(prev => ({ ...prev, products: [...prev.products, { name: '', price: 0 }] }));
  };

  const removeProductRow = (index) => {
    setMarketingDialog(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
  };

  const updateProductRow = (index, field, value) => {
    setMarketingDialog(prev => ({
      ...prev,
      products: prev.products.map((p, i) => i === index ? { ...p, [field]: value } : p)
    }));
  };

  return (
    <div className="absolute inset-0 flex flex-col" data-testid="customers-page">
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-border flex items-center justify-between bg-card/50 shrink-0 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button onClick={() => navigate('/settings')} className="p-1.5 sm:p-2 hover:bg-muted rounded-lg transition-colors shrink-0" data-testid="customers-back-btn">
            <ArrowLeft size={18} />
          </button>
          <Heart size={18} className="text-primary shrink-0 hidden sm:block" />
          <h1 className="font-oswald text-base sm:text-xl font-bold tracking-wide truncate">CLIENTES</h1>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={openMarketingDialog} className="text-xs h-8 px-2" data-testid="marketing-email-btn">
                <Send size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Email</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfigDialog(true)} className="text-xs h-8 px-2" data-testid="loyalty-config-btn">
                <Star size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Config</span>
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setAddDialog({ open: true, name: '', phone: '', email: '' })}
            className="bg-primary text-primary-foreground font-bold active:scale-95 h-8 px-2 sm:px-3 text-xs" data-testid="add-customer-btn">
            <Plus size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Nuevo</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 sm:pb-4">
        <div className="max-w-4xl mx-auto">
          {/* Loyalty Info - Editable */}
          <div className="mb-6" {...(custScreen.isAdmin && !custScreen.editMode ? custLongPress : {})}>
            {custScreen.editMode && <EditModeBar onSave={custScreen.save} onCancel={custScreen.cancel} onRestore={custScreen.restore} hasHiddenCards={loyaltyCards.hasHiddenCards} />}
            <EditableCardGrid
              editMode={custScreen.editMode}
              visibleCards={loyaltyCards.visibleCards}
              cardOrder={loyaltyCards.cardOrder}
              reorder={loyaltyCards.reorder}
              hideCard={loyaltyCards.hideCard}
              className="grid grid-cols-3 gap-3"
              renderCard={(id) => {
                const cards = {
                  points_rate: (<div className="bg-card border border-border rounded-xl p-4 text-center h-full"><Star size={20} className="mx-auto mb-1 text-yellow-400" /><p className="text-xs text-muted-foreground uppercase">Puntos por RD$100</p><p className="font-oswald text-2xl font-bold">{config.points_per_hundred}</p></div>),
                  point_value: (<div className="bg-card border border-border rounded-xl p-4 text-center h-full"><Gift size={20} className="mx-auto mb-1 text-green-400" /><p className="text-xs text-muted-foreground uppercase">Valor del Punto</p><p className="font-oswald text-2xl font-bold">RD$ {config.point_value_rd}</p></div>),
                  min_redeem: (<div className="bg-card border border-border rounded-xl p-4 text-center h-full"><Heart size={20} className="mx-auto mb-1 text-primary" /><p className="text-xs text-muted-foreground uppercase">Min para Canjeo</p><p className="font-oswald text-2xl font-bold">{config.min_redemption} pts</p></div>),
                };
                return cards[id] || null;
              }}
            />
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente por nombre o telefono..."
              className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm" data-testid="customer-search" />
          </div>

          {/* Customer List */}
          <ScrollArea className="h-[calc(100vh-320px)] [&_[data-radix-scroll-area-viewport]>div]:!block">
            <div className="space-y-2">
              {customers.map(c => (
                <div key={c.id} className="p-3 sm:p-4 rounded-xl bg-card border border-border" data-testid={`customer-${c.id}`}>
                  <div className="flex items-start sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{c.name}</span>
                        <Badge variant="outline" className="text-[11px] border-yellow-500 text-yellow-400 shrink-0">
                          <Star size={8} className="mr-0.5" /> {c.points} pts
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {c.phone && <span className="flex items-center gap-1"><Phone size={10} /> {c.phone}</span>}
                        {c.email && <span className="flex items-center gap-1 truncate"><Mail size={10} /> {c.email}</span>}
                        <span>V: {c.visits}</span>
                        <span>{formatMoney(c.total_spent)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setEditDialog({ open: true, customer: c, name: c.name, phone: c.phone || '', email: c.email || '', rnc: c.rnc || '' })}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" data-testid={`edit-${c.id}`}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRedeemDialog({ open: true, customer: c, points: '' })}
                        disabled={c.points < config.min_redemption}
                        className="h-8 text-xs border-primary/50 text-primary px-2" data-testid={`redeem-${c.id}`}>
                        <Gift size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Canjear</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {customers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay clientes registrados</p>}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(o) => !o && setAddDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-customer-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nuevo Cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={addDialog.name} onChange={e => setAddDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre completo" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="customer-name-input" />
            <input value={addDialog.phone} onChange={e => setAddDialog(p => ({ ...p, phone: e.target.value }))}
              placeholder="Telefono" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="customer-phone-input" />
            <input value={addDialog.email} onChange={e => setAddDialog(p => ({ ...p, email: e.target.value }))}
              placeholder="Email (opcional)" type="email" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={handleAddCustomer} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-add-customer">
              REGISTRAR CLIENTE
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Redeem Dialog */}
      <Dialog open={redeemDialog.open} onOpenChange={(o) => !o && setRedeemDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-xs bg-card border-border" data-testid="redeem-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Canjear Puntos</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{redeemDialog.customer?.name}</p>
              <p className="font-oswald text-3xl font-bold text-yellow-400">{redeemDialog.customer?.points} pts</p>
            </div>
            <NumericInput label="Valor" value={redeemDialog.points} onChange={e => setRedeemDialog(p => ({ ...p, points: e.target.value }))}
               placeholder={`Minimo ${config.min_redemption} puntos`}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald text-center text-lg" data-testid="redeem-points-input" />
            {redeemDialog.points && (
              <p className="text-center text-sm">Descuento: <span className="font-oswald text-primary font-bold">{formatMoney(parseInt(redeemDialog.points) * config.point_value_rd)}</span></p>
            )}
            <Button onClick={handleRedeem} className="w-full h-11 bg-green-600 text-white font-oswald font-bold active:scale-95" data-testid="confirm-redeem">
              <Gift size={16} className="mr-2" /> CANJEAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(v) => !v && setEditDialog({ open: false, customer: null, name: '', phone: '', email: '', rnc: '' })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="edit-customer-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Editar Cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nombre / Razón Social</label>
              <input value={editDialog.name} onChange={e => setEditDialog(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">RNC / Cédula</label>
              <input value={editDialog.rnc} onChange={e => setEditDialog(p => ({ ...p, rnc: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mt-1 font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teléfono</label>
              <input value={editDialog.phone} onChange={e => setEditDialog(p => ({ ...p, phone: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <input value={editDialog.email} onChange={e => setEditDialog(p => ({ ...p, email: e.target.value }))}
                type="email" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <Button className="w-full" disabled={!editDialog.name} onClick={async () => {
              try {
                await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/customers/${editDialog.customer?.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
                  body: JSON.stringify({ name: editDialog.name, phone: editDialog.phone, email: editDialog.email, rnc: editDialog.rnc })
                });
                setEditDialog({ open: false, customer: null, name: '', phone: '', email: '', rnc: '' });
                fetchAll();
                notify.success('Cliente actualizado');
              } catch { notify.error('Error al actualizar'); }
            }}>
              Guardar Cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={configDialog} onOpenChange={setConfigDialog}>
        <DialogContent className="max-w-xs bg-card border-border" data-testid="loyalty-config-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Configurar Puntos</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Puntos por cada RD$100</label>
              <NumericInput label="Valor" value={config.points_per_hundred} onChange={e => setConfig(p => ({ ...p, points_per_hundred: parseInt(e.target.value) || 0 }))}
                 className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Valor de cada punto (RD$)</label>
              <NumericInput label="Valor" value={config.point_value_rd} onChange={e => setConfig(p => ({ ...p, point_value_rd: parseFloat(e.target.value) || 0 }))}
                 className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Minimo puntos para canjeo</label>
              <NumericInput label="Valor" value={config.min_redemption} onChange={e => setConfig(p => ({ ...p, min_redemption: parseInt(e.target.value) || 0 }))}
                 className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" />
            </div>
            <Button onClick={handleUpdateConfig} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">
              GUARDAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Marketing Email Dialog */}
      <Dialog open={marketingDialog.open} onOpenChange={(open) => !marketingDialog.sending && setMarketingDialog(prev => ({ ...prev, open }))}>
        <DialogContent 
          className={`max-w-2xl max-h-[90vh] overflow-hidden flex flex-col ${isLightMode ? 'bg-white' : ''}`}
          style={isLightMode ? { backgroundColor: '#ffffff' } : {}}
        >
          <DialogHeader>
            <DialogTitle 
              className="flex items-center gap-2 text-lg"
              style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}
            >
              <Send size={20} className="text-primary" />
              Enviar Email a Clientes
            </DialogTitle>
            <p 
              className="text-sm"
              style={isLightMode ? { color: '#64748B', WebkitTextFillColor: '#64748B' } : { color: 'rgba(255,255,255,0.6)' }}
            >
              {marketingDialog.customerCount > 0 
                ? `${marketingDialog.customerCount} clientes con email registrado`
                : 'No hay clientes con email registrado'}
            </p>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2">
            {!marketingDialog.showPreview ? (
              <div className="space-y-4 py-2">
                {/* Subject */}
                <div>
                  <label 
                    className="text-xs font-medium mb-1 block"
                    style={isLightMode ? { color: '#374151' } : {}}
                  >Asunto *</label>
                  <input
                    type="text"
                    value={marketingDialog.subject}
                    onChange={(e) => setMarketingDialog(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Ej: Nuevas promociones esta semana"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm"
                    style={isLightMode ? { backgroundColor: '#F9FAFB', color: '#1F2937', borderColor: '#D1D5DB' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
                    data-testid="marketing-subject-input"
                  />
                </div>

                {/* Message */}
                <div>
                  <label 
                    className="text-xs font-medium mb-1 block"
                    style={isLightMode ? { color: '#374151' } : {}}
                  >Mensaje *</label>
                  <textarea
                    value={marketingDialog.message}
                    onChange={(e) => setMarketingDialog(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Escribe tu mensaje aquí..."
                    rows={4}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm resize-none"
                    style={isLightMode ? { backgroundColor: '#F9FAFB', color: '#1F2937', borderColor: '#D1D5DB' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
                    data-testid="marketing-message-input"
                  />
                </div>

                {/* Products Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label 
                      className="text-xs font-medium"
                      style={isLightMode ? { color: '#374151' } : {}}
                    >Productos destacados (opcional)</label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={addProductRow}
                      className="h-7 text-xs"
                      data-testid="add-product-row-btn"
                    >
                      <Plus size={12} className="mr-1" /> Agregar
                    </Button>
                  </div>
                  
                  {marketingDialog.products.length > 0 && (
                    <div className="space-y-2">
                      {marketingDialog.products.map((product, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={product.name}
                            onChange={(e) => updateProductRow(index, 'name', e.target.value)}
                            placeholder="Nombre del producto"
                            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
                            style={isLightMode ? { backgroundColor: '#F9FAFB', color: '#1F2937', borderColor: '#D1D5DB' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
                            data-testid={`product-name-${index}`}
                          />
                          <input
                            type="number"
                            value={product.price}
                            onChange={(e) => updateProductRow(index, 'price', parseFloat(e.target.value) || 0)}
                            placeholder="Precio"
                            className="w-28 border border-border rounded-lg px-3 py-2 text-sm"
                            style={isLightMode ? { backgroundColor: '#F9FAFB', color: '#1F2937', borderColor: '#D1D5DB' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
                            data-testid={`product-price-${index}`}
                          />
                          <button
                            onClick={() => removeProductRow(index)}
                            className="p-2 hover:bg-destructive/10 rounded-lg transition-colors text-destructive"
                            data-testid={`remove-product-${index}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={handleMarketingPreview}
                    className="flex-1 h-11"
                    disabled={!marketingDialog.subject.trim() || !marketingDialog.message.trim()}
                    data-testid="preview-email-btn"
                  >
                    <Eye size={16} className="mr-2" /> Vista Previa
                  </Button>
                  <Button
                    onClick={handleMarketingSend}
                    className="flex-1 h-11 bg-primary text-primary-foreground font-bold"
                    disabled={marketingDialog.sending || marketingDialog.customerCount === 0 || !marketingDialog.subject.trim() || !marketingDialog.message.trim()}
                    data-testid="send-marketing-btn"
                  >
                    {marketingDialog.sending ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" /> Enviando...</>
                    ) : (
                      <><Send size={16} className="mr-2" /> Enviar a {marketingDialog.customerCount}</>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-2">
                {/* Preview Mode */}
                <div className="mb-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setMarketingDialog(prev => ({ ...prev, showPreview: false }))}
                    className="mb-3"
                  >
                    <ArrowLeft size={14} className="mr-1" /> Volver a editar
                  </Button>
                  <p 
                    className="text-xs"
                    style={isLightMode ? { color: '#64748B' } : { color: 'rgba(255,255,255,0.6)' }}
                  >
                    Vista previa del email que recibirán los clientes:
                  </p>
                </div>
                
                <div 
                  className="border border-border rounded-lg overflow-hidden"
                  style={{ maxHeight: '400px', overflowY: 'auto' }}
                >
                  <iframe
                    srcDoc={marketingDialog.previewHtml}
                    title="Email Preview"
                    className="w-full"
                    style={{ height: '400px', border: 'none' }}
                  />
                </div>

                {/* Send Button in Preview Mode */}
                <div className="mt-4">
                  <Button
                    onClick={handleMarketingSend}
                    className="w-full h-12 bg-primary text-primary-foreground font-bold text-base"
                    disabled={marketingDialog.sending || marketingDialog.customerCount === 0}
                    data-testid="send-marketing-confirm-btn"
                  >
                    {marketingDialog.sending ? (
                      <><Loader2 size={18} className="mr-2 animate-spin" /> Enviando...</>
                    ) : (
                      <><Send size={18} className="mr-2" /> Enviar a {marketingDialog.customerCount} clientes</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
