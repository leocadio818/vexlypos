import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { billsAPI, businessDaysAPI, posSessionsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, User, Search, CreditCard, Banknote, Building2, DollarSign, Euro, Smartphone, X, Check, Wallet, Coins, CircleDollarSign, BadgeDollarSign, ChevronUp, ChevronDown, Receipt, Sparkles, Heart, FileText, Truck, Store, UtensilsCrossed, Printer, Globe, Briefcase, Shield, Lock, AlertTriangle, Bell, Plus, Phone, Mail, Moon, Sun, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import ThermalTicket, { printTicket, useBusinessConfig } from '@/components/ThermalTicket';
import FiscalDataDrawer from '@/components/FiscalDataDrawer';
import BusinessDayManager from '@/components/BusinessDayManager';

// Iconos de Lucide para métodos de pago
const lucideIcons = {
  'banknote': Banknote,
  'credit-card': CreditCard,
  'smartphone': Smartphone,
  'building2': Building2,
  'dollar-sign': DollarSign,
  'euro': Euro,
  'wallet': Wallet,
  'coins': Coins,
  'circle-dollar-sign': CircleDollarSign,
  'badge-dollar-sign': BadgeDollarSign,
  'default': Banknote
};

// SVG icons para procesadores de pago
const BrandIcons = {
  visa: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#1565C0" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <path fill="#FFF" d="M15.186 19l-2.626 7.832c0 0-.598-3.053-.724-3.719-.42-1.181-.937-2.009-2.126-2.009H7v.105c1.441.356 2.808 1.077 3.812 1.897l3.074 8.894h3.3L21.5 19H15.186zM17.556 30l3.594-11h3.6l-3.594 11H17.556zM38.95 19h-3.26l-5.04 11h3.36l.62-1.54h4.12l.34 1.54H42L38.95 19zM35.27 25.54l1.68-4.42 .96 4.42H35.27zM28.75 22.32l.4-2.32c0 0-1.87-.68-3.14-.68-1.4 0-4.71.62-4.71 3.61 0 2.78 3.88 2.81 3.88 4.27s-3.48 1.2-4.64.28l-.42 2.42c0 0 1.89.91 3.81.91 1.92 0 5.07-1 5.07-3.73 0-2.82-3.91-3.06-3.91-4.27S27.46 22.04 28.75 22.32z"/>
    </svg>
  ),
  mastercard: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#3F51B5" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <circle cx="18" cy="24" r="9" fill="#E53935"/>
      <circle cx="30" cy="24" r="9" fill="#FF9800"/>
      <path fill="#FF5722" d="M24,17c1.958,1.626,3.211,4.087,3.211,6.833c0,2.933-1.407,5.536-3.578,7.167c-2.171-1.631-3.578-4.234-3.578-7.167C20.056,21.087,21.309,18.626,24,17z"/>
    </svg>
  ),
  amex: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#1976D2" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <path fill="#FFF" d="M22.255 20l-2.113 4.683L18.029 20h-2.502l3.286 7.159H20.1l3.286-7.159H22.255zM25.752 27.159h5.502v-1.431h-3.97v-1.493h3.876v-1.426h-3.876v-1.378h3.97V20h-5.502V27.159zM7 20l2.252 7.159h2.084L13.589 20h-2.084l-1.347 5.026L8.812 20H7zM34.152 22.425c0-1.461-1.007-2.425-2.503-2.425h-4.006v7.159h1.532v-2.318h1.505l1.535 2.318h1.876l-1.752-2.493C33.377 24.359 34.152 23.534 34.152 22.425zM31.175 23.659h-2v-2.227h2c.558 0 .971.395.971.969C32.146 23.234 31.733 23.659 31.175 23.659z"/>
    </svg>
  ),
  discover: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#E64A19" d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"/>
      <circle cx="30" cy="24" r="5" fill="#FF6F00"/>
      <path fill="#FFF" d="M7.5,19h2.7c1.9,0,3,1,3,2.5c0,1.6-1.2,2.5-3,2.5H9v3h-1.5V19z M9,22.6h1c1,0,1.5-0.4,1.5-1.1s-0.5-1.1-1.5-1.1H9V22.6z"/>
    </svg>
  ),
  paypal: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#1565C0" d="M18.7,13.767l0.005,0.002C18.809,13.326,19.187,13,19.66,13h13.472c5.538,0,9.43,3.967,8.657,9.067c-0.798,5.267-5.593,9.067-11.134,9.067H26.33c-0.473,0-0.851,0.326-0.955,0.769l-1.522,6.229l-0.061,0.251h-5.77l1.406-5.749L18.7,13.767z"/>
      <path fill="#039BE5" d="M33.132,13c5.538,0,9.43,3.967,8.657,9.067c-0.798,5.267-5.593,9.067-11.134,9.067H26.33c-0.473,0-0.851,0.326-0.955,0.769l-1.522,6.229l-0.061,0.251H17.39l-0.018,0.073c-0.135,0.552,0.285,1.077,0.862,1.077h5.549c0.412,0,0.762-0.284,0.846-0.682l0.549-2.248l0.896-3.671c0.104-0.443,0.482-0.769,0.955-0.769h4.325c5.541,0,10.336-3.8,11.134-9.067C43.263,18.033,40.346,14.583,35.94,13.316C35.024,13.104,34.094,13,33.132,13"/>
    </svg>
  ),
  cash: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <rect x="4" y="12" width="40" height="24" rx="3" fill="#16a34a"/>
      <circle cx="24" cy="24" r="7" fill="none" stroke="#22c55e" strokeWidth="2"/>
      <text x="24" y="28" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">$</text>
    </svg>
  ),
  bank: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <path fill="#0891b2" d="M24,6L4,16v4h40v-4L24,6z"/>
      <rect x="8" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="16" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="28" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="36" y="22" width="4" height="14" fill="#06b6d4"/>
      <rect x="4" y="36" width="40" height="6" fill="#0891b2"/>
    </svg>
  ),
  dollar: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <circle cx="24" cy="24" r="20" fill="#059669"/>
      <text x="24" y="30" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold">$</text>
    </svg>
  ),
  euro: () => (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg">
      <circle cx="24" cy="24" r="20" fill="#d97706"/>
      <text x="24" y="30" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold">€</text>
    </svg>
  ),
};

export { BrandIcons };

// Helper para redondear montos
const round = (num, decimals = 2) => Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);

// Glassmorphism styles
const glassStyles = {
  card: "backdrop-blur-xl bg-white/10 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
  cardHover: "hover:bg-white/15 hover:border-white/30 hover:shadow-[0_8px_40px_rgba(255,255,255,0.1)]",
  cardActive: "bg-white/20 border-white/40 shadow-[0_8px_40px_rgba(255,255,255,0.2)]",
  button: "backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20",
  input: "backdrop-blur-md bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10",
};

export default function PaymentScreen() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { largeMode, device, user } = useAuth();
  const ticketRef = useRef(null);
  const [bill, setBill] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [payAmounts, setPayAmounts] = useState({});
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerDialog, setNewCustomerDialog] = useState({ open: false, name: '', phone: '', email: '' });
  const [keypadDialog, setKeypadDialog] = useState({ open: false, method: null });
  const [keypadValue, setKeypadValue] = useState('');
  const [quickAmounts, setQuickAmounts] = useState([100, 200, 500, 1000, 2000, 5000]);

  // Get service type from URL params
  const searchParams = new URLSearchParams(window.location.search);
  const urlServiceType = searchParams.get('serviceType') || 'dine_in';
  const [processing, setProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  // New state for smart payment flow
  const [pendingAmount, setPendingAmount] = useState(null);
  const [methodSelectorOpen, setMethodSelectorOpen] = useState(false);

  // Tax type selection state
  const [saleTypes, setSaleTypes] = useState([]);
  const [taxConfig, setTaxConfig] = useState([]);
  const [selectedFiscalType, setSelectedFiscalType] = useState('B02');
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [adjustedBill, setAdjustedBill] = useState(null);
  
  // Dialog states
  const [ncfDialogOpen, setNcfDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [paidBill, setPaidBill] = useState(null);
  
  // NCF Alert Modal state
  const [ncfAlertModal, setNcfAlertModal] = useState({ open: false, ncfData: null });
  
  // Fiscal Data Drawer state (for B01, B14, B15)
  const [fiscalDrawerOpen, setFiscalDrawerOpen] = useState(false);
  const [pendingFiscalType, setPendingFiscalType] = useState(null);
  const [fiscalData, setFiscalData] = useState(null); // Datos fiscales capturados
  
  // Business Day (Jornada de Trabajo) state
  const [businessDay, setBusinessDay] = useState(null);
  const [businessDayLoading, setBusinessDayLoading] = useState(true);
  const [businessDayDialogOpen, setBusinessDayDialogOpen] = useState(false);

  // Tax Override states
  const [taxOverrideDialog, setTaxOverrideDialog] = useState({ open: false, step: 'pin' });
  const [taxOverridePin, setTaxOverridePin] = useState('');
  const [taxOverrideAuthorized, setTaxOverrideAuthorized] = useState(null);
  const [taxOverrides, setTaxOverrides] = useState({});
  const [taxOverrideReference, setTaxOverrideReference] = useState('');
  const [userHasTaxPermission, setUserHasTaxPermission] = useState(false);

  // Business config for thermal ticket
  const { config: businessConfig } = useBusinessConfig();

  // Discount state
  const [discountDialog, setDiscountDialog] = useState(false);
  const [availableDiscounts, setAvailableDiscounts] = useState([]);
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountPinDialog, setDiscountPinDialog] = useState({ open: false, discount: null });
  const [discountPin, setDiscountPin] = useState('');

  // NCF Fiscal Types
  const fiscalTypes = [
    { code: 'B02', name: 'Consumidor Final', short: 'CF' },
    { code: 'B01', name: 'Crédito Fiscal', short: 'CF' },
    { code: 'B14', name: 'Gubernamental', short: 'GOB' },
    { code: 'B15', name: 'Régimen Especial', short: 'RE' }
  ];

  const API_BASE = process.env.REACT_APP_BACKEND_URL;
  const isMobile = device?.isMobile;
  const isTablet = device?.isTablet;
  const isLandscape = device?.isLandscape;

  // ═══════════════════════════════════════════════════════════════════════════════
  // VERIFICAR PERMISOS - Solo cajeros, admin y gerentes pueden procesar pagos
  // ═══════════════════════════════════════════════════════════════════════════════
  const allowedRoles = ['admin', 'cashier', 'manager'];
  const canProcessPayment = user && allowedRoles.includes(user.role);

  // Redirect unauthorized users
  useEffect(() => {
    if (user && !canProcessPayment) {
      toast.error('No tienes permiso para procesar pagos');
      navigate('/tables');
    }
  }, [user, canProcessPayment, navigate]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // VERIFICAR JORNADA DE TRABAJO - Bloquea pagos si no hay jornada abierta
  // ═══════════════════════════════════════════════════════════════════════════════
  const checkBusinessDay = useCallback(async () => {
    try {
      setBusinessDayLoading(true);
      const res = await businessDaysAPI.check();
      if (res.data.has_open_day) {
        setBusinessDay({
          business_date: res.data.business_date,
          id: res.data.day_id,
          opened_at: res.data.opened_at
        });
      } else {
        setBusinessDay(null);
      }
    } catch (err) {
      console.error('Error checking business day:', err);
      setBusinessDay(null);
    } finally {
      setBusinessDayLoading(false);
    }
  }, []);

  useEffect(() => {
    checkBusinessDay();
  }, [checkBusinessDay]);

  const fetchData = useCallback(async () => {
    try {
      const [billRes, pmRes, custRes, stRes, taxRes] = await Promise.all([
        billsAPI.get(billId),
        fetch(`${API_BASE}/api/payment-methods`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json()),
        fetch(`${API_BASE}/api/customers`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json()),
        fetch(`${API_BASE}/api/sale-types`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json()),
        fetch(`${API_BASE}/api/tax-config`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }).then(r => r.json())
      ]);
      const billData = billRes.data;
      setBill(billData);
      setAdjustedBill(billData); // Initially same as bill
      const sortedMethods = pmRes.filter(m => m.active).sort((a, b) => (a.order || 0) - (b.order || 0));
      setPaymentMethods(sortedMethods);
      setCustomers(custRes);
      setSaleTypes(stRes.filter(st => st.active));
      setTaxConfig(taxRes.filter(t => t.active || t.is_active));
      
      // Set default service type: use URL param if provided, else prioritize "Dine In"
      if (stRes.length > 0) {
        // First try to match URL service type
        const fromUrl = stRes.find(st => st.code === urlServiceType);
        // Look for Dine In as fallback
        const dineIn = stRes.find(st => st.code === 'dine_in' || st.name.toLowerCase().includes('dine'));
        const matchingBillST = billData.sale_type ? stRes.find(st => st.code === billData.sale_type) : null;
        setSelectedServiceType(fromUrl || matchingBillST || dineIn || stRes[0]);
      }
      
      // Check tax override permission
      try {
        const permRes = await fetch(`${API_BASE}/api/tax-override/check-permission`, { 
          headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } 
        });
        const permData = await permRes.json();
        setUserHasTaxPermission(permData.has_permission || false);
      } catch {
        setUserHasTaxPermission(false);
      }
      
      try {
        const configRes = await fetch(`${API_BASE}/api/system/config`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
        const config = await configRes.json();
        if (config.quick_amounts) setQuickAmounts(config.quick_amounts);
      } catch {}
    } catch {
      console.warn('Error cargando datos de pago');
    }
  }, [billId, API_BASE, urlServiceType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Handle adding new customer from payment screen
  const handleAddNewCustomer = async () => {
    if (!newCustomerDialog.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({
          name: newCustomerDialog.name,
          phone: newCustomerDialog.phone,
          email: newCustomerDialog.email
        })
      });
      if (res.ok) {
        const newCustomer = await res.json();
        toast.success('Cliente registrado');
        // Refresh customers list
        const custRes = await fetch(`${API_BASE}/api/customers`, { 
          headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } 
        }).then(r => r.json());
        setCustomers(custRes);
        // Auto-select the new customer
        setSelectedCustomer(newCustomer);
        setNewCustomerDialog({ open: false, name: '', phone: '', email: '' });
        setCustomerDialog(false);
        setCustomerSearch('');
      } else {
        toast.error('Error al crear cliente');
      }
    } catch (e) {
      toast.error('Error al crear cliente');
      console.error(e);
    }
  };

  // ─── DISCOUNT ENGINE ───
  const loadActiveDiscounts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/discounts/active`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      if (res.ok) setAvailableDiscounts(await res.json());
    } catch {}
  };

  const applyDiscount = async (discount) => {
    if (!bill) return;
    try {
      const res = await fetch(`${API_BASE}/api/discounts/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({ discount_id: discount.id, bill_id: bill.id })
      });
      if (!res.ok) { toast.error('Error al calcular descuento'); return; }
      const calc = await res.json();
      if (calc.discount_amount <= 0) {
        toast.warning(calc.message || 'Este descuento no aplica a ningun item');
        return;
      }
      setAppliedDiscount(calc);
      // Update adjustedBill with discounted values
      setAdjustedBill(prev => ({
        ...prev,
        subtotal: calc.new_subtotal,
        itbis: calc.new_itbis,
        propina_legal: calc.new_propina,
        total: calc.new_total,
        tax_breakdown: calc.new_tax_breakdown || prev?.tax_breakdown,
        discount_applied: {
          id: calc.discount_id,
          name: calc.discount_name,
          type: calc.discount_type,
          value: calc.discount_value,
          amount: calc.discount_amount,
          affected_items: calc.affected_items,
          original_subtotal: calc.original_subtotal
        }
      }));
      toast.success(`Descuento "${calc.discount_name}" aplicado: -RD$ ${calc.discount_amount.toLocaleString()}`);
      setDiscountDialog(false);
    } catch (e) {
      toast.error('Error al aplicar descuento');
    }
  };

  const handleDiscountSelect = (discount) => {
    if (discount.authorization_level === 'MANAGER_PIN_REQUIRED') {
      setDiscountPinDialog({ open: true, discount });
      setDiscountPin('');
    } else {
      applyDiscount(discount);
    }
  };

  const verifyDiscountPin = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: JSON.stringify({ pin: discountPin })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.role === 'admin' || data.role === 'manager') {
          setDiscountPinDialog({ open: false, discount: null });
          applyDiscount(discountPinDialog.discount);
        } else {
          toast.error('Se requiere PIN de Gerente o Administrador');
        }
      } else {
        toast.error('PIN incorrecto');
      }
    } catch {
      toast.error('Error verificando PIN');
    }
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    // Restore original bill values
    if (bill) {
      setAdjustedBill(prev => ({
        ...prev,
        subtotal: bill.subtotal,
        itbis: bill.itbis,
        propina_legal: bill.propina_legal,
        total: bill.total,
        tax_breakdown: bill.tax_breakdown,
        discount_applied: null
      }));
    }
    toast.info('Descuento removido');
  };

  // Handle tax override button click
  const handleTaxOverrideClick = () => {
    if (userHasTaxPermission) {
      // User has permission, go directly to adjust step
      setTaxOverrideDialog({ open: true, step: 'adjust' });
      setTaxOverrideAuthorized({ authorized_by: user.name, authorized_by_id: user.user_id });
    } else {
      // Need PIN authorization
      setTaxOverrideDialog({ open: true, step: 'pin' });
      setTaxOverridePin('');
    }
  };

  // Verify admin PIN for tax override
  const verifyTaxOverridePin = async () => {
    if (!taxOverridePin || taxOverridePin.length < 4) {
      toast.error('Ingrese un PIN válido');
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/tax-override/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({
          pin: taxOverridePin,
          bill_id: billId,
          taxes_removed: [],
          reference_document: 'pending'
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setTaxOverrideAuthorized(data);
        setTaxOverrideDialog({ open: true, step: 'adjust' });
        setTaxOverridePin('');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'PIN inválido o sin permiso');
      }
    } catch {
      toast.error('Error verificando PIN');
    }
  };

  // Toggle individual tax
  const toggleTaxOverride = (taxCode) => {
    setTaxOverrides(prev => ({
      ...prev,
      [taxCode]: prev[taxCode] === undefined ? false : !prev[taxCode]
    }));
  };

  // Apply tax overrides and recalculate
  const applyTaxOverrides = async () => {
    const removedTaxes = Object.entries(taxOverrides)
      .filter(([_, enabled]) => enabled === false)
      .map(([code]) => code);
    
    // Log the tax override (sin requerir referencia)
    if (removedTaxes.length > 0) {
      try {
        await fetch(`${API_BASE}/api/tax-override/authorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
          },
          body: JSON.stringify({
            pin: taxOverrideAuthorized?.authorized_by_id ? '00000' : taxOverridePin, // Dummy for already authorized
            bill_id: billId,
            taxes_removed: removedTaxes,
            reference_document: taxOverrideReference.trim()
          })
        });
      } catch {
        // Log error but continue
      }
    }
    
    // Recalculate totals with overrides
    const subtotal = bill?.subtotal || adjustedBill?.subtotal || 0;
    let newItbis = 0;
    let newPropina = 0;
    
    taxConfig.forEach(tax => {
      if (!tax.is_active && !tax.active) return;
      const taxCode = tax.code || tax.name?.toUpperCase();
      const isEnabled = taxOverrides[taxCode] !== false;
      
      if (!isEnabled) return; // Tax is disabled by override
      
      // Check if exempted by sale type
      const exemptions = selectedServiceType?.tax_exemptions || [];
      if (exemptions.includes(tax.id)) return;
      
      const amount = subtotal * (tax.rate / 100);
      if (tax.code === 'PROPINA' || tax.is_tip || tax.is_dine_in_only) {
        newPropina += amount;
      } else if (tax.code?.includes('ITBIS')) {
        newItbis += amount;
      }
    });
    
    const newTotal = Math.round((subtotal + newItbis + newPropina) * 100) / 100;
    
    setAdjustedBill(prev => ({
      ...prev,
      itbis: Math.round(newItbis * 100) / 100,
      propina_legal: Math.round(newPropina * 100) / 100,
      total: newTotal,
      tax_override_applied: removedTaxes.length > 0,
      tax_override_reference: taxOverrideReference.trim(),
      tax_override_by: taxOverrideAuthorized?.authorized_by
    }));
    
    setTaxOverrideDialog({ open: false, step: 'pin' });
    // Removed toast notification - silent tax adjustment
  };

  // Recalculate taxes when service type changes using Intelligent Tax Engine
  useEffect(() => {
    if (!bill || !selectedServiceType?.id || !bill.items?.length) return;

    const calculateIntelligentTaxes = async () => {
      try {
        // Prepare cart items for the tax engine
        const cartItems = bill.items.map(item => ({
          product_id: item.product_id || item.id,
          product_name: item.product_name || item.name,
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.price || 0,
          category_id: item.category_id || null,
          modifiers_total: item.modifiers_total || 0
        }));

        const res = await fetch(`${API_BASE}/api/taxes/calculate-cart`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
          },
          body: JSON.stringify({
            items: cartItems,
            sale_type_id: selectedServiceType.id
          })
        });

        if (res.ok) {
          const taxResult = await res.json();
          const summary = taxResult.summary;
          
          setAdjustedBill({
            ...bill,
            itbis: summary.itbis,
            itbis_base: summary.itbis_base,
            propina_legal: summary.propina_legal,
            propina_base: summary.propina_base,
            total: summary.total,
            subtotal: summary.subtotal,
            sale_type: selectedServiceType.code,
            sale_type_name: selectedServiceType.name,
            is_government_exempt: taxResult.is_government_exempt,
            tax_breakdown: taxResult.tax_breakdown,
            items_with_taxes: taxResult.items
          });

          // Update quick amounts based on new total
          const baseAmounts = [100, 200, 500, 1000, 2000, 5000];
          const nearestHigher = baseAmounts.find(a => a >= summary.total) || Math.ceil(summary.total / 100) * 100;
          if (!baseAmounts.includes(nearestHigher) && nearestHigher > 0) {
            setQuickAmounts([...baseAmounts, nearestHigher].sort((a, b) => a - b));
          }
        } else {
          // Fallback to simple calculation
          fallbackTaxCalculation();
        }
      } catch (err) {
        console.warn('Tax calculation error, using fallback:', err);
        fallbackTaxCalculation();
      }
    };

    const fallbackTaxCalculation = () => {
      const exemptions = selectedServiceType.tax_exemptions || [];
      let newItbis = 0;
      let newPropina = 0;
      const subtotal = bill.subtotal || 0;

      // Calculate taxes that are NOT exempt
      taxConfig.forEach(tax => {
        if (!tax.is_active || exemptions.includes(tax.id)) return;
        const amount = subtotal * (tax.rate / 100);
        if (tax.is_tip || tax.code === 'PROPINA') {
          newPropina += amount;
        } else if (tax.code === 'ITBIS') {
          newItbis += amount;
        }
      });

      const newTotal = Math.round((subtotal + newItbis + newPropina) * 100) / 100;
      
      // Build tax_breakdown with proper names
      const taxBreakdown = [
        {
          tax_id: 'itbis_default',
          description: 'ITBIS',
          rate: 18,
          amount: Math.round(newItbis * 100) / 100,
          is_tip: false
        },
        {
          tax_id: 'propina_default',
          description: 'Propina Legal',
          rate: 10,
          amount: Math.round(newPropina * 100) / 100,
          is_tip: true
        }
      ];

      setAdjustedBill({
        ...bill,
        itbis: Math.round(newItbis * 100) / 100,
        propina_legal: Math.round(newPropina * 100) / 100,
        total: newTotal,
        sale_type: selectedServiceType.code,
        sale_type_name: selectedServiceType.name,
        tax_breakdown: taxBreakdown
      });
    };

    calculateIntelligentTaxes();
  }, [bill, selectedServiceType, taxConfig, API_BASE]);

  const totalPaidDOP = paymentMethods.reduce((sum, m) => {
    const amt = parseFloat(payAmounts[m.name]) || 0;
    return sum + amt * (m.exchange_rate || 1);
  }, 0);
  const billTotal = adjustedBill?.total || bill?.total || 0;
  const overpaid = totalPaidDOP - billTotal;
  const isEnough = totalPaidDOP >= billTotal;

  // Determine if overpayment is change (cash) or tip (card)
  // Check which methods have amounts and if any are non-cash (cards)
  const hasNonCashPayment = paymentMethods.some(m => {
    const amt = parseFloat(payAmounts[m.name]) || 0;
    return amt > 0 && m.is_cash === false;
  });
  
  // If any payment is with card/non-cash, overpayment becomes tip
  const isTip = overpaid > 0 && hasNonCashPayment;
  const change = isTip ? 0 : overpaid;
  const cardTip = isTip ? overpaid : 0;

  const handlePayment = async () => {
    if (!isEnough) {
      toast.error('Monto insuficiente');
      return;
    }
    // DGII Fiscal Security: Block zero-value payments
    if (billTotal <= 0) {
      toast.error('No se puede procesar un pago con valor $0.00. La DGII no permite asignar NCF a facturas sin valor.');
      return;
    }
    
    // Validar que el usuario tenga turno abierto para cobrar
    try {
      const shiftCheck = await posSessionsAPI.check();
      if (!shiftCheck.data?.has_open_session) {
        toast.error('Debes abrir un turno de caja', {
          description: 'Ve a Caja / Turnos para abrir tu turno antes de cobrar.',
          duration: 4000
        });
        return;
      }
    } catch {
      // Si falla la verificación, permitir continuar para no bloquear ventas
    }
    
    setProcessing(true);
    try {
      const entries = Object.entries(payAmounts).filter(([_, v]) => parseFloat(v) > 0);
      const mainMethod = entries.length > 0 ? entries.sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))[0][0] : 'Efectivo RD$';
      
      // ─── CONSTRUIR LISTA DE PAGOS MÚLTIPLES ───
      const paymentsList = [];
      for (const [methodName, amount] of entries) {
        const method = paymentMethods.find(m => m.name === methodName);
        if (method && parseFloat(amount) > 0) {
          const amountNum = parseFloat(amount);
          const exchangeRate = method.exchange_rate || 1;
          const amountDOP = method.currency !== 'DOP' ? round(amountNum * exchangeRate, 2) : amountNum;
          
          paymentsList.push({
            payment_method_id: method.id,
            payment_method_name: method.name,
            amount: amountNum,
            amount_dop: amountDOP,
            currency: method.currency || 'DOP',
            exchange_rate: exchangeRate,
            brand_icon: method.brand_icon
          });
        }
      }
      
      // ─── CALCULAR CAMBIO CON LÓGICA MULTIMONEDA ───
      // Detectar si hay pago en moneda extranjera
      let changeCurrency = 'DOP';
      let changeAmount = change > 0 ? round(change, 2) : 0;
      
      // El cambio siempre se da en RD$ (pesos dominicanos)
      // Si se pagó con moneda extranjera, el cambio es: (total recibido en DOP) - (total a pagar)
      
      // Generate NCF based on sale type
      let generatedNcf = null;
      if (selectedServiceType?.id) {
        try {
          const ncfRes = await fetch(`${API_BASE}/api/ncf/generate-for-sale?sale_type_id=${selectedServiceType.id}&bill_total=${billTotal}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
          });
          
          if (ncfRes.ok) {
            generatedNcf = await ncfRes.json();
            if (generatedNcf.alert_message) {
              toast.warning(generatedNcf.alert_message);
            }
          } else {
            const errData = await ncfRes.json();
            if (errData.detail?.includes('agotada')) {
              toast.error(errData.detail);
              setProcessing(false);
              return;
            }
          }
        } catch (ncfErr) {
          console.warn('NCF generation warning:', ncfErr);
        }
      }
      
      const res = await billsAPI.pay(billId, { 
        payment_method: mainMethod, 
        tip_percentage: 0, 
        additional_tip: cardTip,
        customer_id: selectedCustomer?.id || fiscalData?.customer?.id || '',
        ncf: generatedNcf?.ncf || null,
        sale_type_id: selectedServiceType?.id || null,
        sale_type_name: selectedServiceType?.name || null,
        itbis: adjustedBill?.itbis ?? bill?.itbis ?? 0,
        propina_legal: adjustedBill?.propina_legal ?? bill?.propina_legal ?? 0,
        total: billTotal,
        amount_received: totalPaidDOP,
        // Nuevos campos para pagos múltiples
        payments: paymentsList.length > 0 ? paymentsList : null,
        change_currency: changeCurrency,
        change_amount: changeAmount,
        // Datos fiscales (B01, B14, B15)
        fiscal_id: fiscalData?.fiscalId || null,
        fiscal_id_type: fiscalData?.fiscalIdType || null,
        razon_social: fiscalData?.razonSocial || selectedCustomer?.name || null,
        customer_email: fiscalData?.email || selectedCustomer?.email || null,
        send_email: fiscalData?.sendEmail || false
      });
      
      const pts = res.data?.points_earned;
      let msg = '✓ Pago procesado';
      if (generatedNcf?.ncf) msg += ` | NCF: ${generatedNcf.ncf}`;
      if (change > 0) msg += ` | Cambio: ${formatMoney(change)}`;
      if (cardTip > 0) msg += ` | Propina: ${formatMoney(cardTip)}`;
      if (pts > 0) msg += ` | +${pts} pts fidelidad`;
      toast.success(msg);
      
      // Store the paid bill for printing
      setPaidBill({
        ...res.data,
        ncf: generatedNcf?.ncf || res.data?.ncf,
        amount_received: totalPaidDOP,
        customer_name: fiscalData?.razonSocial || selectedCustomer?.name || null,
        customer_rnc: fiscalData?.fiscalId || selectedCustomer?.rnc || null,
        customer_email: fiscalData?.email || selectedCustomer?.email || null
      });
      
      // Show NCF Alert Modal FIRST if configured and triggered (blocking)
      // The print dialog will open only after user acknowledges the alert
      if (generatedNcf?.should_show_alert && generatedNcf?.alert_message) {
        setNcfAlertModal({ 
          open: true, 
          ncfData: {
            ncf_type: generatedNcf.ncf_type,
            remaining: generatedNcf.remaining,
            alert_level: generatedNcf.alert,
            alert_message: generatedNcf.alert_message,
            expiration_date: generatedNcf.expiration_date
          }
        });
        // Don't print yet - wait for alert acknowledgment, then auto-print
      } else {
        // No alert needed, print automatically and show dialog
        setPrintDialogOpen(true);
        // Auto-print the receipt
        try {
          const printResp = await fetch(`${API_BASE}/api/print/receipt/${res.data.id}/send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
          });
          const printData = await printResp.json();
          // Removed success toast - silent print
        } catch (printErr) {
          console.warn('Auto-print error:', printErr);
        }
      }
    } catch (err) {
      // Handle specific error from backend
      const errorMsg = err?.response?.data?.detail || 'Error procesando pago';
      toast.error(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintTicket = async () => {
    try {
      // Enviar directamente a la impresora térmica
      const resp = await fetch(`${API_BASE}/api/print/receipt/${paidBill?.id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      const data = await resp.json();
      // Removed success/error toasts - silent print operation
      if (!data.ok) {
        console.warn('Print error:', data.message);
      }
    } catch (e) {
      console.error('Print connection error:', e);
    }
  };

  const handleCloseAndNavigate = () => {
    setPrintDialogOpen(false);
    navigate('/tables');
  };

  const handleKeypadConfirm = () => {
    if (keypadDialog.method && keypadValue) {
      setPayAmounts(p => ({ ...p, [keypadDialog.method]: keypadValue }));
    }
    setKeypadDialog({ open: false, method: null });
    setKeypadValue('');
  };

  // Smart payment flow: Quick amount -> Select method
  const handleQuickAmount = (amount) => {
    setPendingAmount(amount);
    setMethodSelectorOpen(true);
  };

  // Smart payment flow: Exact amount -> Select method
  const handleExact = () => {
    setPendingAmount(billTotal);
    setMethodSelectorOpen(true);
  };

  // When method is selected after choosing amount
  const handleMethodSelect = (method) => {
    if (pendingAmount !== null) {
      // Convert amount if foreign currency
      const amountInMethodCurrency = method.currency !== 'DOP' && method.exchange_rate
        ? (pendingAmount / method.exchange_rate).toFixed(2)
        : String(pendingAmount);
      setPayAmounts(p => ({ ...p, [method.name]: amountInMethodCurrency }));
      setPendingAmount(null);
      setMethodSelectorOpen(false);
    }
  };

  // Direct method click: Open keypad for manual amount entry
  const handleMethodClick = (method) => {
    if (pendingAmount !== null) {
      // If there's a pending amount, apply it to this method
      handleMethodSelect(method);
    } else {
      // Open keypad for manual entry
      const currentAmount = payAmounts[method.name];
      setKeypadValue(currentAmount || '');
      setKeypadDialog({ open: true, method: method.name });
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch) ||
    c.email?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const renderPaymentIcon = (method, size = 'normal') => {
    const iconSize = size === 'small' ? (isMobile ? 20 : 24) : (isMobile ? 28 : largeMode ? 36 : 32);
    if (method.icon_type === 'brand' && method.brand_icon && BrandIcons[method.brand_icon]) {
      const BrandIcon = BrandIcons[method.brand_icon];
      return (
        <div className={`${size === 'small' ? 'w-10 h-7' : isMobile ? 'w-12 h-9' : largeMode ? 'w-16 h-12' : 'w-14 h-10'}`}>
          <BrandIcon />
        </div>
      );
    }
    const LucideIcon = lucideIcons[method.icon] || lucideIcons.default;
    return <LucideIcon size={iconSize} className="drop-shadow-lg" />;
  };

  // Show loading/redirect screen if not authorized
  if (user && !canProcessPayment) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <Lock size={48} className="text-red-400 mx-auto mb-4" />
          <p className="text-white/70">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="relative">
          <div className="animate-spin w-12 h-12 border-4 border-white/20 border-t-white rounded-full" />
          <div className="absolute inset-0 animate-ping w-12 h-12 border-2 border-white/20 rounded-full" />
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BLOQUEO POR JORNADA - No se puede procesar pagos sin jornada abierta
  // ═══════════════════════════════════════════════════════════════════════════════
  if (!businessDayLoading && !businessDay) {
    return (
      <div 
        className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-red-900/30 to-slate-900 p-6"
        data-testid="no-business-day-block"
      >
        <div className="max-w-md text-center space-y-6">
          {/* Icon */}
          <div className="relative">
            <div className="w-24 h-24 mx-auto rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
              <Moon size={48} className="text-red-400" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Lock size={20} className="text-amber-400" />
            </div>
          </div>
          
          {/* Title */}
          <div>
            <h2 className="font-oswald font-bold text-2xl text-white mb-2">
              JORNADA NO ABIERTA
            </h2>
            <p className="text-white/60 text-sm">
              No se pueden procesar pagos sin una jornada de trabajo activa.
              Todas las transacciones deben registrarse bajo una fecha contable.
            </p>
          </div>
          
          {/* Info Box */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white/70 text-sm mb-3">
              Un <strong className="text-amber-400">Gerente</strong> o <strong className="text-amber-400">Administrador</strong> debe autorizar la apertura del día.
            </p>
            <div className="flex items-center justify-center gap-2 text-white/50 text-xs">
              <Shield size={14} />
              <span>La fecha de jornada se usará para todos los reportes fiscales (607)</span>
            </div>
          </div>
          
          {/* Action Button */}
          <Button
            onClick={() => setBusinessDayDialogOpen(true)}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-8 py-6 text-lg rounded-2xl shadow-lg shadow-green-500/25"
            data-testid="open-day-from-payment-btn"
          >
            <Sun size={20} className="mr-2" />
            Abrir Jornada de Trabajo
          </Button>
          
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="text-white/50 hover:text-white/70 text-sm flex items-center justify-center gap-2 mx-auto transition-colors"
          >
            <ArrowLeft size={14} />
            Volver
          </button>
        </div>
        
        {/* Business Day Manager Dialog */}
        <Dialog open={businessDayDialogOpen} onOpenChange={setBusinessDayDialogOpen}>
          <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-lg">
            <BusinessDayManager 
              showStatsInline={false} 
              onDayStatusChange={(hasDay, day) => {
                if (hasDay) {
                  setBusinessDay(day);
                  setBusinessDayDialogOpen(false);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div 
      className="h-full flex flex-col overflow-hidden relative"
      data-testid="payment-screen"
      style={{
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 25%, #2d1b4e 50%, #1e3a5f 75%, #0f2027 100%)',
      }}
    >
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-purple-500/30 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute top-1/2 -right-20 w-60 h-60 bg-blue-500/20 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 bg-cyan-500/20 rounded-full blur-[90px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-20 right-1/4 w-40 h-40 bg-pink-500/20 rounded-full blur-[60px] animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      {/* Glass Header */}
      <div className={`relative z-10 px-4 ${isMobile ? 'py-3' : largeMode ? 'py-4' : 'py-3'} ${glassStyles.card} border-t-0 border-x-0 rounded-none`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-2xl ${glassStyles.button} flex items-center justify-center transition-all duration-300 active:scale-95`}
            >
              <ArrowLeft size={isMobile ? 18 : 22} className="text-white/80" />
            </button>
            <div>
              <h1 className={`font-oswald font-bold tracking-wide text-white ${isMobile ? 'text-lg' : largeMode ? 'text-2xl' : 'text-xl'}`}>
                PROCESAR PAGO
              </h1>
              <p className={`text-white/50 ${isMobile ? 'text-xs' : 'text-sm'}`}>{bill.label}</p>
            </div>
          </div>
          <div className={`${glassStyles.card} rounded-2xl px-4 py-2`}>
            <p className={`font-oswald font-bold bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200 bg-clip-text text-transparent ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              {formatMoney(billTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex relative z-10 ${isMobile || (isTablet && !isLandscape) ? 'flex-col overflow-auto' : 'flex-row overflow-hidden'}`}>
        
        {/* Left Panel - Bill Details */}
        <div className={`${isMobile ? 'w-full shrink-0' : isTablet && !isLandscape ? 'w-full' : 'w-80 lg:w-96'} ${!isMobile && (isTablet && isLandscape || !isTablet) ? 'border-r border-white/10' : 'border-b border-white/10'} flex flex-col`}>
          
          {/* Header Actions - Two Large Pill Buttons (Redesigned for better readability) */}
          <div className="p-3 flex gap-3">
            {/* Botón Cliente - Enlarged */}
            <button
              onClick={() => setCustomerDialog(true)}
              className={`flex-1 ${isMobile ? 'h-14' : 'h-16'} rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} transition-all duration-300 flex items-center justify-center gap-3 group border-2 ${selectedCustomer ? 'border-purple-400/60 bg-purple-500/10' : 'border-white/20'}`}
              data-testid="customer-pill-btn"
            >
              <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-gradient-to-br from-purple-500/40 to-pink-500/40 flex items-center justify-center shadow-lg`}>
                {selectedCustomer ? (
                  <Heart size={isMobile ? 20 : 24} className="text-purple-300 fill-purple-300" />
                ) : (
                  <User size={isMobile ? 20 : 24} className="text-white/80" />
                )}
              </div>
              <div className="flex flex-col items-start">
                <span className={`font-oswald font-bold ${isMobile ? 'text-sm' : 'text-lg'} ${selectedCustomer ? 'text-purple-300' : 'text-white/80'}`}>
                  {selectedCustomer ? selectedCustomer.name.split(' ')[0] : 'CLIENTE'}
                </span>
                <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-white/50`}>
                  {selectedCustomer ? `${selectedCustomer.points || 0} pts` : 'Sin seleccionar'}
                </span>
              </div>
              {selectedCustomer && (
                <div 
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setSelectedCustomer(null); } }}
                  className="p-2 rounded-full hover:bg-red-500/30 text-red-400 transition-colors ml-auto cursor-pointer"
                >
                  <X size={16} />
                </div>
              )}
            </button>

            {/* Botón Venta/NCF - Enlarged */}
            <button
              onClick={() => setNcfDialogOpen(true)}
              className={`flex-1 ${isMobile ? 'h-14' : 'h-16'} rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} transition-all duration-300 flex items-center justify-center gap-3 group border-2 border-cyan-400/40 bg-cyan-500/5`}
              data-testid="ncf-pill-btn"
            >
              <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-gradient-to-br from-cyan-500/40 to-blue-500/40 flex items-center justify-center shadow-lg`}>
                <FileText size={isMobile ? 20 : 24} className="text-cyan-300" />
              </div>
              <div className="flex flex-col items-start">
                <span className={`font-oswald font-bold text-cyan-300 ${isMobile ? 'text-sm' : 'text-lg'}`}>
                  {selectedFiscalType}
                </span>
                <span className={`text-white/60 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                  {selectedServiceType?.name || 'Dine In'}
                </span>
              </div>
              <ChevronDown size={isMobile ? 16 : 20} className="text-cyan-400/70 ml-auto" />
            </button>
          </div>

          {/* Bill Details - Collapsible on mobile */}
          {isMobile && (
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className={`mx-3 mb-2 px-3 py-1.5 rounded-xl ${glassStyles.button} flex items-center justify-between`}
            >
              <span className="text-white/60 text-xs flex items-center gap-2">
                <Receipt size={12} />
                {bill.items?.length || 0} artículos
              </span>
              {showDetails ? <ChevronUp size={14} className="text-white/60" /> : <ChevronDown size={14} className="text-white/60" />}
            </button>
          )}

          {(!isMobile || showDetails) && (
            <div className={`px-3 ${isMobile ? '' : 'flex-1'}`}>
              <div className={`${glassStyles.card} rounded-xl ${isMobile ? 'p-2.5' : 'p-4'} mb-2`}>
                
                {/* Lista de productos compacta - scrollable */}
                <ScrollArea className={isMobile ? 'max-h-20' : 'max-h-36'}>
                  <div className="space-y-1 pr-2">
                    {bill.items?.map((item, i) => (
                      <div key={i} className={`flex justify-between items-center ${isMobile ? 'text-[10px]' : 'text-sm'}`}>
                        <span className="text-white/70 flex-1 truncate">
                          <span className={`font-oswald font-bold text-cyan-400 ${isMobile ? '' : 'text-base'}`}>{item.quantity}x</span> {item.product_name}
                        </span>
                        <span className={`font-oswald font-bold text-white/90 ml-2 ${isMobile ? '' : 'text-base'}`}>{formatMoney(item.total)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                
                {/* Totales - LEGIBILIDAD PRO para desktop */}
                <div className={`mt-3 pt-3 border-t border-white/10 space-y-2 ${isMobile ? 'text-sm' : 'text-base'}`}>
                  <div className="flex justify-between text-white/70">
                    <span className={isMobile ? '' : 'text-lg'}>Subtotal</span>
                    <span className={`font-oswald font-bold ${isMobile ? '' : 'text-xl'}`}>{formatMoney(appliedDiscount ? appliedDiscount.original_subtotal : (adjustedBill?.subtotal ?? bill.subtotal))}</span>
                  </div>
                  {/* Discount line - shown between subtotal and taxes */}
                  {appliedDiscount && (
                    <div className="flex justify-between text-emerald-400" data-testid="discount-line">
                      <span className={`flex items-center gap-1 ${isMobile ? '' : 'text-lg'}`}>
                        Desc: {appliedDiscount.discount_name}
                      </span>
                      <span className={`font-oswald font-bold ${isMobile ? '' : 'text-xl'}`}>-{formatMoney(appliedDiscount.discount_amount)}</span>
                    </div>
                  )}
                  {/* Dynamic tax display from tax_breakdown or taxConfig */}
                  {(adjustedBill?.tax_breakdown || bill.tax_breakdown || []).length > 0 ? (
                    (adjustedBill?.tax_breakdown || bill.tax_breakdown).map((tax, i) => (
                      <div key={i} className={`flex justify-between ${tax.amount === 0 ? 'text-red-400/60 line-through' : 'text-white/70'}`}>
                        <span className={isMobile ? '' : 'text-lg'}>
                          {tax.description || tax.name || (tax.is_tip ? 'Propina' : 'ITBIS')}
                          {/* Solo mostrar rate si no está incluido en el nombre */}
                          {tax.rate && !(tax.description || tax.name || '').includes('%') ? ` (${tax.rate}%)` : ''}
                        </span>
                        <span className={`font-oswald font-bold ${isMobile ? '' : 'text-xl'}`}>{formatMoney(tax.amount)}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      {/* ITBIS - usar nombre del taxConfig o default */}
                      {(() => {
                        const itbisTax = taxConfig.find(t => t.code === 'ITBIS' || (t.name && t.name.includes('ITBIS') && t.rate >= 16));
                        const itbisName = itbisTax?.name || 'ITBIS 18%';
                        return (
                          <div className="flex justify-between text-white/70">
                            <span className={isMobile ? '' : 'text-lg'}>{itbisName}</span>
                            <span className={`font-oswald font-bold ${isMobile ? '' : 'text-xl'}`}>{formatMoney(adjustedBill?.itbis ?? bill.itbis)}</span>
                          </div>
                        );
                      })()}
                      {/* Propina */}
                      {(() => {
                        const propinaValue = adjustedBill?.propina_legal ?? bill.propina_legal ?? 0;
                        const isExempt = propinaValue === 0;
                        const propinaTax = taxConfig.find(t => t.is_tip || t.code === 'PROPINA' || (t.name && t.name.toLowerCase().includes('propina')));
                        const propinaName = propinaTax?.name || 'Propina Legal 10%';
                        return (
                          <div className={`flex justify-between ${isExempt ? 'text-red-400/60 line-through' : 'text-white/70'}`}>
                            <span className={isMobile ? '' : 'text-lg'}>{propinaName}</span>
                            <span className={`font-oswald font-bold ${isMobile ? '' : 'text-xl'}`}>{formatMoney(propinaValue)}</span>
                          </div>
                        );
                      })()}
                    </>
                  )}
                  
                  {/* Botón Impuesto - Tax Override + Botón Descuento */}
                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      onClick={handleTaxOverrideClick}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${adjustedBill?.tax_override_applied 
                          ? 'bg-amber-500/20 border border-amber-400/50 text-amber-300' 
                          : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                        }`}
                      data-testid="tax-override-btn"
                    >
                      <Shield size={12} />
                      Impuesto
                      {adjustedBill?.tax_override_applied && (
                        <Badge className="ml-1 text-[8px] bg-amber-500/30">Ajustado</Badge>
                      )}
                    </button>
                    <button
                      onClick={() => { loadActiveDiscounts(); setDiscountDialog(true); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${appliedDiscount 
                          ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300' 
                          : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                        }`}
                      data-testid="discount-btn"
                    >
                      <Tag size={12} />
                      Descuento
                      {appliedDiscount && (
                        <Badge className="ml-1 text-[8px] bg-emerald-500/30">-{formatMoney(appliedDiscount.discount_amount)}</Badge>
                      )}
                    </button>
                  </div>
                  
                  {/* TOTAL GENERAL - Elemento más grande y visible */}
                  <div className={`flex justify-between items-center text-white font-bold pt-3 mt-2 border-t-2 border-cyan-400/30 ${isMobile ? 'text-base' : ''}`}>
                    <span className={`font-oswald tracking-wide ${isMobile ? '' : 'text-2xl'}`}>TOTAL</span>
                    <span className={`font-oswald bg-gradient-to-r from-cyan-300 via-blue-400 to-cyan-300 bg-clip-text text-transparent drop-shadow-lg ${isMobile ? 'text-xl' : 'text-4xl'}`}>
                      {formatMoney(adjustedBill?.total ?? bill.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Payment Methods */}
        <div className={`flex-1 flex flex-col p-4 ${isMobile ? 'shrink-0' : 'overflow-auto'}`}>
          
          {/* Payment Methods Grid */}
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-oswald font-bold text-white/70 ${isMobile ? 'text-sm' : 'text-base'}`}>
              FORMAS DE PAGO
            </h3>
            {pendingAmount !== null && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-400/30 animate-pulse">
                <Sparkles size={14} className="text-yellow-400" />
                <span className="text-yellow-300 text-xs font-bold">
                  Selecciona método para {formatMoney(pendingAmount)}
                </span>
                <button 
                  onClick={() => { setPendingAmount(null); setMethodSelectorOpen(false); }}
                  className="ml-1 text-yellow-400 hover:text-yellow-200"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          
          <div className={`grid ${isMobile ? 'grid-cols-2 gap-3' : isTablet ? 'grid-cols-3 gap-3' : 'grid-cols-3 gap-4'} mb-4`}>
            {paymentMethods.map((method, index) => {
              const amount = payAmounts[method.name];
              const hasAmount = amount && parseFloat(amount) > 0;
              
              // Calculate equivalent amount in foreign currency
              const isForeignCurrency = method.currency !== 'DOP';
              const equivalentInForeign = isForeignCurrency && method.exchange_rate 
                ? (billTotal / method.exchange_rate).toFixed(2) 
                : null;
              const currencySymbol = method.currency === 'USD' ? '$' : method.currency === 'EUR' ? '€' : '';
              
              return (
                <button
                  key={method.id}
                  onClick={() => handleMethodClick(method)}
                  className={`group relative rounded-3xl transition-all duration-500 flex flex-col items-center justify-center overflow-hidden
                    ${isMobile ? 'h-24 p-3' : largeMode ? 'h-36 p-4' : 'h-28 p-3'}
                    ${hasAmount ? glassStyles.cardActive : pendingAmount !== null ? 'ring-2 ring-yellow-400/50 ' + glassStyles.card : glassStyles.card}
                    ${glassStyles.cardHover}
                    active:scale-95 transform
                  `}
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                  data-testid={`payment-method-${method.id}`}
                >
                  {/* Liquid gradient background */}
                  <div 
                    className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(135deg, ${method.bg_color || '#6b7280'}40 0%, transparent 50%, ${method.bg_color || '#6b7280'}20 100%)`,
                    }}
                  />
                  
                  {/* Shine effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <div 
                      className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                      }}
                    />
                  </div>
                  
                  {/* Icon with glow */}
                  <div className="relative z-10 transform group-hover:scale-110 transition-transform duration-300">
                    <div 
                      className="absolute inset-0 blur-xl opacity-50"
                      style={{ backgroundColor: method.bg_color || '#6b7280' }}
                    />
                    <div className="relative" style={{ color: method.text_color || '#ffffff' }}>
                      {renderPaymentIcon(method)}
                    </div>
                  </div>
                  
                  {/* Name */}
                  <span className={`relative z-10 font-oswald font-bold text-center leading-tight text-white/90 mt-1 drop-shadow-lg ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    {method.name}
                  </span>
                  
                  {/* Foreign currency equivalent - Shows how much to receive in USD/EUR */}
                  {isForeignCurrency && equivalentInForeign && !hasAmount && (
                    <span className={`relative z-10 font-oswald font-bold text-center text-yellow-300 drop-shadow-lg ${isMobile ? 'text-sm' : 'text-base'}`}>
                      {currencySymbol}{equivalentInForeign}
                    </span>
                  )}
                  
                  {/* Exchange rate badge */}
                  {isForeignCurrency && (
                    <span className={`absolute bottom-1.5 right-2 ${glassStyles.card} px-1.5 py-0.5 rounded-full font-oswald text-white/60 ${isMobile ? 'text-[7px]' : 'text-[9px]'}`}>
                      1 = {method.exchange_rate}
                    </span>
                  )}
                  
                  {/* Amount badge - Liquid glass effect */}
                  {hasAmount && (
                    <div className={`absolute -top-1 -right-1 backdrop-blur-xl bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-full px-3 py-1 font-oswald font-bold shadow-lg shadow-green-500/30 animate-pulse ${isMobile ? 'text-xs' : 'text-sm'}`}>
                      {formatMoney(parseFloat(amount) * (method.exchange_rate || 1))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Amounts - Glass pills */}
          <h3 className={`font-oswald font-bold text-white/70 mb-3 ${isMobile ? 'text-sm' : 'text-base'}`}>
            MONTOS RÁPIDOS
          </h3>
          
          <div className={`grid ${isMobile ? 'grid-cols-3 gap-2' : 'grid-cols-6 gap-2'} mb-4`}>
            {quickAmounts.map((amount, index) => (
              <button
                key={amount}
                onClick={() => handleQuickAmount(amount)}
                className={`${isMobile ? 'h-12' : 'h-14'} rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} font-oswald font-bold text-white/80 transition-all duration-300 active:scale-95`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {amount >= 1000 ? `${amount / 1000}K` : amount}
              </button>
            ))}
          </div>
          
          <button
            onClick={handleExact}
            className={`w-full ${isMobile ? 'h-12' : 'h-14'} rounded-2xl backdrop-blur-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 hover:border-purple-400/50 font-oswald font-bold text-purple-200 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2`}
          >
            <Sparkles size={18} className="text-purple-400" />
            MONTO EXACTO ({formatMoney(billTotal)})
          </button>

          {/* Payment Summary - Glass card (NO fixed positioning on mobile) */}
          <div className="mt-auto pt-4">
            <div className={`${glassStyles.card} rounded-3xl p-4 mb-4 transition-all duration-500 ${
              isEnough ? 'border-green-400/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]' : ''
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-white/60 font-medium">Total Recibido</span>
                <span className={`font-oswald font-bold ${isMobile ? 'text-xl' : 'text-3xl'} ${
                  isEnough 
                    ? 'bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent' 
                    : 'text-red-400'
                }`}>
                  {formatMoney(totalPaidDOP)}
                </span>
              </div>
              
              {/* Cash change */}
              {change > 0 && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-green-400/20">
                  <span className="font-bold text-green-400 flex items-center gap-2">
                    <Coins size={isMobile ? 16 : 20} className="animate-bounce" />
                    CAMBIO
                  </span>
                  <span className={`font-oswald font-bold bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                    {formatMoney(change)}
                  </span>
                </div>
              )}
              
              {/* Card tip (not cash) */}
              {cardTip > 0 && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-purple-400/20">
                  <span className="font-bold text-purple-400 flex items-center gap-2">
                    <Heart size={isMobile ? 16 : 20} className="animate-pulse" />
                    PROPINA
                  </span>
                  <span className={`font-oswald font-bold bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                    {formatMoney(cardTip)}
                  </span>
                </div>
              )}
              
              {/* Amount remaining - DESTACADO para mejor visibilidad */}
              {overpaid < 0 && (
                <div className="flex justify-between items-center mt-3 p-3 rounded-xl bg-red-500/20 border border-red-500/40">
                  <span className="text-red-300 font-semibold text-base">Falta por pagar</span>
                  <span className="font-oswald font-bold text-red-400 text-xl">{formatMoney(Math.abs(overpaid))}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => navigate(-1)}
                className={`flex-1 ${isMobile ? 'h-12' : 'h-16'} rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} font-oswald font-bold text-white/70 transition-all duration-300 active:scale-95`}
              >
                CANCELAR
              </button>
              <button
                onClick={handlePayment}
                disabled={!isEnough || processing}
                className={`flex-[2] ${isMobile ? 'h-12' : 'h-16'} rounded-2xl font-oswald font-bold transition-all duration-300 active:scale-95 flex items-center justify-center gap-2
                  ${isEnough 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg shadow-green-500/30' 
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }
                `}
                data-testid="confirm-payment-btn"
              >
                {processing ? (
                  <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Check size={isMobile ? 18 : 24} />
                    <span className={isMobile ? 'text-sm' : 'text-lg'}>CONFIRMAR PAGO</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Search Dialog - Glass effect */}
      <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
        <DialogContent className={`${isMobile ? 'max-w-[95vw]' : 'max-w-md'} ${glassStyles.card} border-white/20 bg-slate-900/80`}>
          <DialogHeader>
            <DialogTitle className="font-oswald text-white text-lg flex items-center justify-between">
              <span>Buscar Cliente</span>
              <button
                onClick={() => setNewCustomerDialog({ open: true, name: '', phone: '', email: '' })}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold transition-all"
                data-testid="add-customer-from-payment-btn"
              >
                <Plus size={14} /> Nuevo
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono..."
                className={`w-full ${glassStyles.input} rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 outline-none`}
                autoFocus
              />
            </div>

            <ScrollArea className="h-64">
              <div className="space-y-2">
                {filteredCustomers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-white/40 mb-3">No se encontraron clientes</p>
                    <button
                      onClick={() => setNewCustomerDialog({ open: true, name: customerSearch, phone: '', email: '' })}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition-all"
                    >
                      <Plus size={16} /> Crear "{customerSearch || 'Nuevo Cliente'}"
                    </button>
                  </div>
                ) : (
                  filteredCustomers.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerDialog(false);
                        setCustomerSearch('');
                      }}
                      className={`w-full p-3 rounded-xl ${glassStyles.card} ${glassStyles.cardHover} text-left flex items-center gap-3 transition-all duration-300`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-white font-bold">
                        {customer.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-white text-sm">{customer.name}</p>
                        <p className="text-white/50 text-xs">{customer.phone || customer.email || 'Sin contacto'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-oswald font-bold text-purple-300">{customer.points}</p>
                        <p className="text-white/40 text-[10px]">puntos</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Customer Dialog from Payment Screen */}
      <Dialog open={newCustomerDialog.open} onOpenChange={(open) => !open && setNewCustomerDialog({ ...newCustomerDialog, open: false })}>
        <DialogContent className={`${isMobile ? 'max-w-[95vw]' : 'max-w-sm'} ${glassStyles.card} border-white/20 bg-slate-900/90`}>
          <DialogHeader>
            <DialogTitle className="font-oswald text-white text-lg flex items-center gap-2">
              <Plus size={18} className="text-primary" />
              Nuevo Cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">Nombre *</label>
              <input
                value={newCustomerDialog.name}
                onChange={e => setNewCustomerDialog({ ...newCustomerDialog, name: e.target.value })}
                placeholder="Nombre del cliente"
                className={`w-full ${glassStyles.input} rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none`}
                autoFocus
              />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block flex items-center gap-1">
                <Phone size={12} /> Teléfono
              </label>
              <input
                value={newCustomerDialog.phone}
                onChange={e => setNewCustomerDialog({ ...newCustomerDialog, phone: e.target.value })}
                placeholder="809-555-1234"
                className={`w-full ${glassStyles.input} rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none`}
              />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block flex items-center gap-1">
                <Mail size={12} /> Email
              </label>
              <input
                value={newCustomerDialog.email}
                onChange={e => setNewCustomerDialog({ ...newCustomerDialog, email: e.target.value })}
                placeholder="cliente@email.com"
                type="email"
                className={`w-full ${glassStyles.input} rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none`}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setNewCustomerDialog({ open: false, name: '', phone: '', email: '' })}
                className={`flex-1 py-3 rounded-xl ${glassStyles.card} text-white/70 font-semibold hover:bg-white/10 transition-all`}
              >
                Cancelar
              </button>
              <button
                onClick={handleAddNewCustomer}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/80 transition-all flex items-center justify-center gap-2"
                data-testid="save-new-customer-btn"
              >
                <Check size={16} /> Guardar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keypad Dialog - Glass effect */}
      <Dialog open={keypadDialog.open} onOpenChange={(open) => { if (!open) { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); } }}>
        <DialogContent className={`${isMobile ? 'max-w-[90vw]' : 'max-w-xs'} ${glassStyles.card} border-white/20 bg-slate-900/80 p-4`}>
          <DialogHeader>
            <DialogTitle className="font-oswald text-center text-white text-lg">
              {keypadDialog.method}
            </DialogTitle>
          </DialogHeader>
          
          {/* Display */}
          <div className={`${glassStyles.card} rounded-2xl p-4 text-center mb-4`}>
            <span className={`font-oswald font-bold bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent ${isMobile ? 'text-4xl' : 'text-5xl'}`}>
              {keypadValue || '0'}
            </span>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'DEL'].map(key => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'DEL') {
                    setKeypadValue(prev => prev.slice(0, -1));
                  } else if (key === '.') {
                    if (!keypadValue.includes('.')) {
                      setKeypadValue(prev => prev + '.');
                    }
                  } else {
                    setKeypadValue(prev => prev + key);
                  }
                }}
                className={`${isMobile ? 'h-14' : 'h-16'} rounded-2xl font-oswald font-bold text-xl transition-all duration-200 active:scale-95 ${
                  key === 'DEL' 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                    : `${glassStyles.card} ${glassStyles.cardHover} text-white`
                }`}
              >
                {key === 'DEL' ? '⌫' : key}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => { setKeypadDialog({ open: false, method: null }); setKeypadValue(''); }}
              className={`h-12 rounded-2xl ${glassStyles.card} ${glassStyles.cardHover} font-oswald font-bold text-white/70 transition-all duration-300`}
            >
              Cancelar
            </button>
            <button
              onClick={handleKeypadConfirm}
              className="h-12 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 font-oswald font-bold text-white transition-all duration-300 active:scale-95"
            >
              Confirmar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Venta/NCF */}
      <Dialog open={ncfDialogOpen} onOpenChange={setNcfDialogOpen}>
        <DialogContent className="max-w-sm bg-slate-900/95 backdrop-blur-xl border-white/20">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white flex items-center gap-2">
              <FileText size={18} className="text-cyan-400" />
              Tipo de Venta
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Tipo Fiscal (NCF) */}
            <div>
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                Comprobante Fiscal
              </h4>
              <div className="grid grid-cols-4 gap-2">
                {fiscalTypes.map(ft => (
                  <button
                    key={ft.code}
                    onClick={() => {
                      // Si es B01, B14 o B15, abrir el drawer de datos fiscales
                      if (['B01', 'B14', 'B15'].includes(ft.code)) {
                        setPendingFiscalType(ft.code);
                        setFiscalDrawerOpen(true);
                      } else {
                        // B02 (Consumo) - flujo directo sin datos fiscales
                        setSelectedFiscalType(ft.code);
                        setFiscalData(null); // Limpiar datos fiscales previos
                        // Auto-select first service type for this NCF
                        const firstMatch = saleTypes.find(st => st.default_ncf_type_id === ft.code);
                        if (firstMatch) setSelectedServiceType(firstMatch);
                      }
                    }}
                    className={`p-3 rounded-xl text-center transition-all ${
                      selectedFiscalType === ft.code
                        ? 'bg-cyan-500/30 border-2 border-cyan-400 text-cyan-300'
                        : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                    data-testid={`ncf-dialog-${ft.code}`}
                  >
                    <span className="font-oswald font-bold text-sm">{ft.code}</span>
                    <p className="text-[9px] mt-0.5 opacity-70">{ft.short}</p>
                  </button>
                ))}
              </div>
              
              {/* Mostrar datos fiscales si fueron capturados */}
              {fiscalData && ['B01', 'B14', 'B15'].includes(selectedFiscalType) && (
                <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-xs text-cyan-300 font-medium">{fiscalData.razonSocial}</p>
                      <p className="text-[10px] text-white/60 font-mono">{fiscalData.fiscalIdType}: {fiscalData.fiscalIdFormatted}</p>
                      {fiscalData.email && (
                        <p className="text-[10px] text-cyan-400/70 flex items-center gap-1">
                          <Mail size={10} /> {fiscalData.email}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setPendingFiscalType(selectedFiscalType);
                        setFiscalDrawerOpen(true);
                      }}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                    >
                      Cambiar
                    </button>
                  </div>
                </div>
              )}
              
              <p className="text-xs text-white/40 mt-2 text-center">
                {fiscalTypes.find(f => f.code === selectedFiscalType)?.name}
              </p>
            </div>

            {/* Tipo de Servicio - FILTRADO por NCF seleccionado */}
            <div>
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                Tipo de Servicio
              </h4>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {saleTypes
                  .filter(st => st.default_ncf_type_id === selectedFiscalType)
                  .map(st => {
                  const isSelected = selectedServiceType?.id === st.id;
                  // Check if PROPINA tax is exempted for this sale type
                  const propinaTax = taxConfig.find(t => t.code === 'PROPINA');
                  const hasPropinaExemption = propinaTax && (st.tax_exemptions || []).includes(propinaTax.id);
                  const iconMap = {
                    'consumo_local': UtensilsCrossed,
                    'para_llevar': Store,
                    'delivery': Truck,
                    'credito_fiscal': FileText,
                    'exportacion': Globe,
                    'servicios': Briefcase
                  };
                  const IconComponent = iconMap[st.code] || UtensilsCrossed;
                  return (
                    <button
                      key={st.id}
                      onClick={() => setSelectedServiceType(st)}
                      className={`w-full p-3 rounded-xl transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'bg-orange-500/30 border-2 border-orange-400 text-orange-300'
                          : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                      }`}
                      data-testid={`ncf-dialog-service-${st.code}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isSelected ? 'bg-orange-500/30' : 'bg-white/10'
                      }`}>
                        <IconComponent size={20} />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="font-semibold">{st.name}</span>
                        {st.description && (
                          <p className="text-[10px] text-white/40">{st.description}</p>
                        )}
                        <p className={`text-[10px] ${hasPropinaExemption ? 'text-amber-400/80' : 'text-green-400/80'}`}>
                          {hasPropinaExemption ? 'Sin propina de ley' : 'Con propina de ley'}
                        </p>
                      </div>
                      {isSelected && (
                        <Check size={18} className="text-orange-400" />
                      )}
                    </button>
                  );
                })}
                {saleTypes.filter(st => st.default_ncf_type_id === selectedFiscalType).length === 0 && (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <p className="text-white/40 text-sm">No hay tipos de venta configurados para {selectedFiscalType}</p>
                    <p className="text-[10px] text-white/30 mt-1">Configura en Settings → Ventas → Tipos de Venta</p>
                  </div>
                )}
              </div>
            </div>

            {/* Resumen y confirmar */}
            <button
              onClick={() => setNcfDialogOpen(false)}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-oswald font-bold text-sm active:scale-95 transition-transform"
            >
              CONFIRMAR
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Ticket Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-md bg-slate-900/95 backdrop-blur-xl border-white/20 p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-white/10">
            <DialogTitle className="font-oswald text-white flex items-center gap-2">
              <Check size={20} className="text-green-400" />
              Pago Completado
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-4 space-y-4">
            {/* Success summary */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
              <div className="text-green-400 font-oswald text-3xl font-bold mb-1">
                {formatMoney(paidBill?.total || 0)}
              </div>
              <p className="text-white/60 text-sm">Pago procesado exitosamente</p>
              {change > 0 && (
                <p className="text-yellow-400 font-bold mt-2">
                  Cambio: {formatMoney(change)}
                </p>
              )}
            </div>

            {/* Ticket preview container (hidden, used for printing) */}
            <div className="hidden">
              <ThermalTicket ref={ticketRef} bill={paidBill} config={businessConfig} />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCloseAndNavigate}
                className="flex-1 h-14 rounded-xl bg-white/5 border border-white/10 text-white/70 font-oswald font-bold hover:bg-white/10 transition-all"
              >
                CERRAR
              </button>
              <button
                onClick={handlePrintTicket}
                className="flex-[2] h-14 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-oswald font-bold flex items-center justify-center gap-2 hover:from-green-400 hover:to-emerald-500 transition-all active:scale-95"
                data-testid="print-ticket-btn"
              >
                <Printer size={20} />
                IMPRIMIR TICKET
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tax Override Dialog */}
      <Dialog open={taxOverrideDialog.open} onOpenChange={(o) => !o && setTaxOverrideDialog({ open: false, step: 'pin' })}>
        <DialogContent className="max-w-sm bg-slate-900/95 backdrop-blur-xl border-amber-500/30" data-testid="tax-override-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-amber-400 flex items-center gap-2">
              <Shield size={18} />
              Ajuste de Impuesto
            </DialogTitle>
            <DialogDescription className="text-white/50 text-xs">
              {taxOverrideDialog.step === 'pin' 
                ? 'Ingrese PIN de administrador para autorizar'
                : `Autorizado por: ${taxOverrideAuthorized?.authorized_by || 'Admin'}`
              }
            </DialogDescription>
          </DialogHeader>
          
          {/* Step 1: PIN Authorization */}
          {taxOverrideDialog.step === 'pin' && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Lock size={16} className="text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-amber-300 text-xs font-medium">Autorización Requerida</p>
                    <p className="text-white/50 text-[10px]">Esta acción requiere un PIN de administrador con permisos de ajuste fiscal.</p>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-xs text-white/50 block mb-2">PIN de Autorización</label>
                <input
                  type="password"
                  value={taxOverridePin}
                  onChange={(e) => setTaxOverridePin(e.target.value)}
                  placeholder="••••••"
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl text-center text-white text-2xl font-oswald tracking-[0.5em] focus:border-amber-500/50 focus:outline-none"
                  maxLength={10}
                  autoFocus
                  data-testid="tax-override-pin-input"
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setTaxOverrideDialog({ open: false, step: 'pin' })}
                  className="flex-1 h-12 rounded-xl bg-white/5 border border-white/10 text-white/70 font-oswald font-bold hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={verifyTaxOverridePin}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-oswald font-bold flex items-center justify-center gap-2 hover:from-amber-400 hover:to-orange-500 transition-all active:scale-95"
                  data-testid="verify-pin-btn"
                >
                  <Check size={16} />
                  Verificar
                </button>
              </div>
            </div>
          )}
          
          {/* Step 2: Tax Adjustment */}
          {taxOverrideDialog.step === 'adjust' && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 flex items-center gap-2">
                <Check size={14} className="text-green-400" />
                <span className="text-green-300 text-xs">
                  Autorizado por {taxOverrideAuthorized?.authorized_by || 'Admin'}
                </span>
              </div>
              
              {/* Tax toggles */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 block">Impuestos Aplicados</label>
                {taxConfig.filter(t => t.is_active || t.active).map(tax => {
                  const taxCode = tax.code || tax.name?.toUpperCase();
                  const isEnabled = taxOverrides[taxCode] !== false;
                  const exemptedBySaleType = selectedServiceType?.tax_exemptions?.includes(tax.id);
                  const taxAmount = (adjustedBill?.subtotal || bill?.subtotal || 0) * (tax.rate / 100);
                  
                  return (
                    <div 
                      key={tax.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer
                        ${exemptedBySaleType 
                          ? 'bg-red-500/10 border-red-500/30 opacity-50' 
                          : isEnabled 
                            ? 'bg-white/5 border-white/10 hover:border-cyan-500/30' 
                            : 'bg-amber-500/10 border-amber-500/30'
                        }`}
                      onClick={() => !exemptedBySaleType && toggleTaxOverride(taxCode)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isEnabled && !exemptedBySaleType}
                          disabled={exemptedBySaleType}
                          onCheckedChange={() => !exemptedBySaleType && toggleTaxOverride(taxCode)}
                          className={isEnabled ? 'border-cyan-500' : 'border-amber-500'}
                        />
                        <div>
                          <p className="text-white text-sm font-medium">{tax.name}</p>
                          <p className="text-white/40 text-[10px]">
                            {tax.rate}% {tax.is_dine_in_only && '(Solo local)'}
                            {exemptedBySaleType && ' - Excluido por tipo de venta'}
                          </p>
                        </div>
                      </div>
                      <span className={`font-oswald font-bold ${isEnabled && !exemptedBySaleType ? 'text-cyan-400' : 'text-white/30 line-through'}`}>
                        {formatMoney(isEnabled && !exemptedBySaleType ? taxAmount : 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              {/* Summary */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-white/50 text-xs">Nuevo Total:</span>
                  <span className="font-oswald text-2xl font-bold text-cyan-400">
                    {(() => {
                      const subtotal = adjustedBill?.subtotal || bill?.subtotal || 0;
                      let total = subtotal;
                      taxConfig.forEach(tax => {
                        if (!tax.is_active && !tax.active) return;
                        const taxCode = tax.code || tax.name?.toUpperCase();
                        const isEnabled = taxOverrides[taxCode] !== false;
                        const exempted = selectedServiceType?.tax_exemptions?.includes(tax.id);
                        if (isEnabled && !exempted) {
                          total += subtotal * (tax.rate / 100);
                        }
                      });
                      return formatMoney(Math.round(total * 100) / 100);
                    })()}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTaxOverrideDialog({ open: false, step: 'pin' });
                    setTaxOverrides({});
                    setTaxOverrideReference('');
                  }}
                  className="flex-1 h-12 rounded-xl bg-white/5 border border-white/10 text-white/70 font-oswald font-bold hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={applyTaxOverrides}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-oswald font-bold flex items-center justify-center gap-2 hover:from-cyan-400 hover:to-blue-500 transition-all active:scale-95"
                  data-testid="apply-tax-override-btn"
                >
                  <Check size={16} />
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* NCF Alert Modal - Dynamic alerts based on configuration - BLOCKING */}
      <Dialog open={ncfAlertModal.open} onOpenChange={() => {/* Prevent closing by clicking outside */}}>
        <DialogContent 
          className={`max-w-md bg-slate-900/98 backdrop-blur-xl ${ncfAlertModal.ncfData?.alert_level === 'critical' ? 'border-2 border-red-500' : 'border-2 border-amber-500'} shadow-2xl`} 
          data-testid="ncf-alert-modal"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="text-center">
            <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-3 ${ncfAlertModal.ncfData?.alert_level === 'critical' ? 'bg-red-500/30 animate-pulse' : 'bg-amber-500/30 animate-pulse'}`}>
              <Bell size={40} className={ncfAlertModal.ncfData?.alert_level === 'critical' ? 'text-red-400' : 'text-amber-400'} />
            </div>
            <DialogTitle className={`font-oswald text-2xl ${ncfAlertModal.ncfData?.alert_level === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
              ¡ATENCIÓN!
            </DialogTitle>
            <DialogDescription className="text-white/70 text-base">
              Alerta de Comprobantes Fiscales NCF
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Alert Content - More prominent */}
            <div className={`rounded-2xl p-6 ${ncfAlertModal.ncfData?.alert_level === 'critical' ? 'bg-red-500/20 border-2 border-red-500/50' : 'bg-amber-500/20 border-2 border-amber-500/50'}`}>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center font-oswald text-3xl font-bold ${ncfAlertModal.ncfData?.alert_level === 'critical' ? 'bg-red-500/30 text-red-300' : 'bg-amber-500/30 text-amber-300'}`}>
                  {ncfAlertModal.ncfData?.ncf_type}
                </div>
              </div>
              
              <p className={`text-center text-xl font-bold mb-4 ${ncfAlertModal.ncfData?.alert_level === 'critical' ? 'text-red-300' : 'text-amber-300'}`}>
                {ncfAlertModal.ncfData?.alert_message}
              </p>
              
              <div className="space-y-3 bg-black/20 rounded-xl p-4">
                <div className="flex justify-between items-center text-base">
                  <span className="text-white/60">Comprobantes restantes:</span>
                  <span className={`font-oswald text-2xl font-bold ${ncfAlertModal.ncfData?.remaining <= 10 ? 'text-red-400' : 'text-amber-400'}`}>
                    {ncfAlertModal.ncfData?.remaining}
                  </span>
                </div>
                {ncfAlertModal.ncfData?.expiration_date && (
                  <div className="flex justify-between items-center text-base">
                    <span className="text-white/60">Fecha vencimiento:</span>
                    <span className="text-white font-mono font-bold">{ncfAlertModal.ncfData?.expiration_date}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Recommendation - More visible */}
            <div className="bg-blue-500/20 border border-blue-400/50 rounded-xl p-4">
              <p className="text-sm text-blue-200 flex items-center gap-3">
                <FileText size={20} className="text-blue-400 shrink-0" />
                <span><strong>Notifique al administrador</strong> para solicitar nuevos comprobantes a la DGII antes de que se agoten.</span>
              </p>
            </div>
            
            {/* Confirm Button - Large and prominent */}
            <button
              onClick={async () => {
                setNcfAlertModal({ open: false, ncfData: null });
                // Now open the print dialog after user acknowledged the alert
                setPrintDialogOpen(true);
                // Auto-print the receipt
                if (paidBill?.id) {
                  try {
                    const printResp = await fetch(`${API_BASE}/api/print/receipt/${paidBill.id}/send`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
                    });
                    const printData = await printResp.json();
                    if (printData.ok) {
                      toast.success('Factura enviada a impresora');
                    }
                  } catch (printErr) {
                    console.warn('Auto-print error:', printErr);
                  }
                }
              }}
              className={`w-full h-16 rounded-xl font-oswald font-bold text-xl text-white transition-all active:scale-95 ${
                ncfAlertModal.ncfData?.alert_level === 'critical' 
                  ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600' 
                  : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600'
              }`}
              data-testid="ncf-alert-confirm-btn"
            >
              ENTENDIDO - CONTINUAR
            </button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Fiscal Data Drawer - Para B01, B14, B15 */}
      <FiscalDataDrawer
        open={fiscalDrawerOpen}
        onOpenChange={(open) => {
          setFiscalDrawerOpen(open);
          if (!open) setPendingFiscalType(null);
        }}
        fiscalType={pendingFiscalType}
        apiBase={API_BASE}
        onConfirm={(data) => {
          // Guardar los datos fiscales
          setFiscalData(data);
          // Establecer el tipo fiscal seleccionado
          setSelectedFiscalType(pendingFiscalType);
          // Si se encontró un cliente, seleccionarlo
          if (data.customer) {
            setSelectedCustomer(data.customer);
          }
          // Auto-select first service type for this NCF
          const firstMatch = saleTypes.find(st => st.default_ncf_type_id === pendingFiscalType);
          if (firstMatch) setSelectedServiceType(firstMatch);
          // Cerrar el drawer
          setFiscalDrawerOpen(false);
          setPendingFiscalType(null);
        }}
      />

      {/* ─── DISCOUNT SELECTION DIALOG ─── */}
      <Dialog open={discountDialog} onOpenChange={setDiscountDialog}>
        <DialogContent className="max-w-md backdrop-blur-2xl bg-black/90 border-white/10" data-testid="discount-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white">Aplicar Descuento</DialogTitle>
            <DialogDescription className="text-white/60 text-xs">Solo se puede aplicar un descuento por orden</DialogDescription>
          </DialogHeader>
          {appliedDiscount && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-emerald-300 text-sm font-bold">{appliedDiscount.discount_name}</span>
                  <span className="text-emerald-400 text-xs ml-2">-{formatMoney(appliedDiscount.discount_amount)}</span>
                </div>
                <button onClick={removeDiscount} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 border border-red-400/30 rounded" data-testid="remove-discount-btn">
                  Quitar
                </button>
              </div>
            </div>
          )}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {availableDiscounts.length === 0 ? (
              <p className="text-center text-white/40 text-sm py-6">No hay descuentos activos</p>
            ) : availableDiscounts.map(d => (
              <button
                key={d.id}
                onClick={() => handleDiscountSelect(d)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  appliedDiscount?.discount_id === d.id
                    ? 'bg-emerald-500/20 border-emerald-400/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                }`}
                data-testid={`select-discount-${d.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm">{d.name}</span>
                  <span className="font-oswald font-bold text-cyan-300">
                    {d.type === 'PERCENTAGE' ? `${d.value}%` : formatMoney(d.value)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white/40 text-xs">{d.scope === 'GLOBAL' ? 'Todo el menu' : d.scope === 'CATEGORY' ? 'Por categoria' : 'Productos especificos'}</span>
                  {d.authorization_level === 'MANAGER_PIN_REQUIRED' && (
                    <span className="flex items-center gap-1 text-amber-400 text-xs"><Shield size={8} /> PIN</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── DISCOUNT PIN DIALOG ─── */}
      <Dialog open={discountPinDialog.open} onOpenChange={(o) => !o && setDiscountPinDialog({ open: false, discount: null })}>
        <DialogContent className="max-w-xs backdrop-blur-2xl bg-black/90 border-white/10" data-testid="discount-pin-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-white text-center">PIN de Gerente</DialogTitle>
            <DialogDescription className="text-white/60 text-xs text-center">Este descuento requiere autorizacion</DialogDescription>
          </DialogHeader>
          <input
            type="password"
            value={discountPin}
            onChange={e => setDiscountPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && verifyDiscountPin()}
            className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-center text-2xl font-mono text-white tracking-[0.5em]"
            placeholder="****"
            autoFocus
            data-testid="discount-pin-input"
          />
          <Button onClick={verifyDiscountPin} className="w-full bg-amber-600 hover:bg-amber-700" data-testid="discount-pin-confirm">
            Autorizar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
