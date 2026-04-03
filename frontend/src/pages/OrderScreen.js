import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ordersAPI, categoriesAPI, productsAPI, modifiersAPI, reasonsAPI, tablesAPI, areasAPI, billsAPI, inventorySettingsAPI, posSessionsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, Send, Trash2, AlertTriangle, Receipt, Grid3X3, SplitSquareHorizontal, FileText, Printer, Lock, MoveRight, Users, Check, X, Plus, Merge, Hash, RotateCcw, Ban, MoreVertical, Percent, RefreshCw, ShoppingCart, Utensils, ShoppingBag, Truck, Pizza, Coffee, Sandwich, IceCream, Soup, Wine, Beer, Beef, Fish, Salad, Cookie, Cake, Search, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { notify } from '@/lib/notify';
import { useTheme } from '@/context/ThemeContext';
import TransferTableModal from '@/components/TransferTableModal';
import AccountSelectorLobby from '@/components/AccountSelectorLobby';
import SplitCheckView from '@/components/SplitCheckView';
import MoveItemsFlow from '@/components/MoveItemsFlow';

// Mapa de iconos de producto
const PRODUCT_ICON_MAP = {
  'pizza': Pizza,
  'coffee': Coffee,
  'sandwich': Sandwich,
  'ice-cream': IceCream,
  'soup': Soup,
  'wine': Wine,
  'beer': Beer,
  'beef': Beef,
  'fish': Fish,
  'salad': Salad,
  'cookie': Cookie,
  'cake': Cake,
};

// Auto-contrast: returns white or black text based on background luminance (WCAG algorithm)
function getContrastText(hex) {
  if (!hex) return '#FFFFFF';
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.55 ? '#1E293B' : '#FFFFFF';
}

export default function OrderScreen() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const { user, largeMode, hasPermission, device } = useAuth();
  const { isMinimalist } = useTheme();
  const [table, setTable] = useState(null);
  const [order, setOrder] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [activeCat, setActiveCat] = useState(null); // null = show categories grid
  const [cancelReasons, setCancelReasons] = useState([]);
  const [modDialog, setModDialog] = useState({ open: false, product: null, selectedMods: {}, qty: '0', notes: '' });
  const [cancelDialog, setCancelDialog] = useState({ 
    open: false, 
    itemId: null, 
    itemIds: [], // For bulk cancellation
    mode: 'single', // 'single', 'multiple', 'order'
    selectedReasonId: null,
    returnToInventory: true,
    comments: '',
    requiresManagerAuth: false,
    showManagerPin: false,
    managerPin: '',
    managerAuthError: '',
    authorizedBy: null // { id, name }
  });
  const [preCheckHtml, setPreCheckHtml] = useState('');
  const [preCheckOpen, setPreCheckOpen] = useState(false);
  const [preCheckCount, setPreCheckCount] = useState(0);
  const [managerPinDialog, setManagerPinDialog] = useState({ open: false, pin: '', error: '' });
  const [taxConfig, setTaxConfig] = useState([]);
  
  // Service Type State - Para Llevar / Comer Aquí / Delivery
  // 'dine_in' = Comer Aquí (incluye propina), 'takeaway' = Para Llevar, 'delivery' = Delivery
  const [serviceType, setServiceType] = useState('dine_in');
  
  // Sale Types with NCF defaults and tax exemptions
  const [saleTypes, setSaleTypes] = useState([]);
  const [currentSaleType, setCurrentSaleType] = useState(null);
  
  // Grid display settings
  const [gridSettings, setGridSettings] = useState({
    categoryColumns: 3,
    productColumns: 3,
    buttonSize: 'medium' // 'small', 'medium', 'large'
  });
  
  // Quick quantity mode
  const [presetQty, setPresetQty] = useState(0); // 0 = quick add x1, >0 = preset quantity
  const [showQtyKeypad, setShowQtyKeypad] = useState(false); // Floating keypad
  const [qtyKeypadExtended, setQtyKeypadExtended] = useState(false); // Extended mode for 10+ or decimals
  const [qtyKeypadValue, setQtyKeypadValue] = useState(''); // Current value in extended mode
  
  // Product search within category
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const productSearchRef = useRef(null);
  
  // Move Table Dialog
  const [moveDialog, setMoveDialog] = useState({ open: false });
  const [allTables, setAllTables] = useState([]);
  const [allAreas, setAllAreas] = useState([]);
  const [mergeConfirm, setMergeConfirm] = useState({ open: false, targetTableId: null, targetTableNumber: null });
  const [reservedAlert, setReservedAlert] = useState({ open: false, tableNumber: null });
  
  // Split/Divide Dialog
  const [splitMode, setSplitMode] = useState(false);
  const [divisions, setDivisions] = useState([{ id: 1, name: 'División 1', item_ids: [] }]);
  const [activeDivision, setActiveDivision] = useState(1);
  const [selectedSplitItems, setSelectedSplitItems] = useState([]);
  
  // Account Label Dialog
  const [accountLabelDialog, setAccountLabelDialog] = useState({ open: false, label: '', action: null, itemIds: [] });
  
  // Partial Void Dialog
  const [partialVoidDialog, setPartialVoidDialog] = useState({ open: false, item: null, qtyToVoid: 1 });
  
  // Move Items Mode
  const [moveItemsMode, setMoveItemsMode] = useState(false);
  const [selectedItemsToMove, setSelectedItemsToMove] = useState([]);
  
  // Rename Account Dialog
  const [renameDialog, setRenameDialog] = useState({ open: false, value: '' });
  
  // Selected Items for Void/Cancel
  const [selectedItems, setSelectedItems] = useState([]);
  
  // B04 Redirect Dialog - Para cuentas cerradas
  const [b04RedirectDialog, setB04RedirectDialog] = useState({ 
    open: false, 
    transactionNumber: null, 
    ncf: null, 
    total: 0,
    paidAt: null 
  });
  
  // Functions Menu Popover
  const [functionsMenuOpen, setFunctionsMenuOpen] = useState(false);
  
  // Merge Accounts Dialog
  const [mergeAccountsDialog, setMergeAccountsDialog] = useState({ open: false, sourceOrderId: null });
  
  // Merge mode for account selector (visual merge)
  const [selectorMergeMode, setSelectorMergeMode] = useState(false);
  const [selectorMergeSource, setSelectorMergeSource] = useState(null);
  
  // Transfer Table Dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  // Move Items flow
  const [moveItemsActive, setMoveItemsActive] = useState(false);

  // Mobile fullscreen account view
  const [mobileAccountExpanded, setMobileAccountExpanded] = useState(false);
  
  // Mobile button state machine: 'initial' | 'editing' | 'closing'
  // initial: Show PRE-CUENTA only
  // editing: Show ANULAR (when items selected)
  // closing: Show FACTURAR (after pre-cuenta printed)
  const [mobileButtonState, setMobileButtonState] = useState('initial');
  
  // Multiple orders per table support
  const [tableOrders, setTableOrders] = useState([]); // All orders for this table
  const [activeOrderId, setActiveOrderId] = useState(null); // Currently selected order
  const [showAccountSelector, setShowAccountSelector] = useState(false); // Show account picker for divided tables
  
  // Required modifiers alert modal
  const [requiredAlert, setRequiredAlert] = useState({ open: false, missingGroups: [] });
  
  // Stock Control State
  const [stockStatus, setStockStatus] = useState({}); // { productId: { in_stock: bool, available_quantity: num } }
  const [allowSaleWithoutStock, setAllowSaleWithoutStock] = useState(true); // Default to true (no restrictions)
  const [stockLoading, setStockLoading] = useState(false);
  
  // Business Day State - block operations when no active day
  const [hasActiveDay, setHasActiveDay] = useState(true); // Assume true until checked
  
  const orderRef = useRef(null);
  const tableOrdersRef = useRef([]);
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  // Barcode scanner state
  const [barcodeNotFound, setBarcodeNotFound] = useState(null);
  const [printerSelectDialog, setPrinterSelectDialog] = useState({ open: false, pendingOrderId: null, isReprint: false });
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef(null);

  const [accessDenied, setAccessDenied] = useState(null); // Stores error message if access denied

  const applyOrders = useCallback((orders) => {
    setTableOrders(orders);
    tableOrdersRef.current = orders;
    setAccessDenied(null);
    if (orders.length > 0) {
      const currentOrder = activeOrderId ? orders.find(o => o.id === activeOrderId) : orders[0];
      if (currentOrder) { setOrder(currentOrder); setActiveOrderId(currentOrder.id); orderRef.current = currentOrder; }
      if (orders.length > 1 && !activeOrderId) setShowAccountSelector(true);
    }
  }, [activeOrderId]);

  const loadFromCache = useCallback(() => {
    try {
      const mesasRaw = localStorage.getItem('vexly_mesas');
      if (mesasRaw) {
        const t = JSON.parse(mesasRaw).find(tb => tb.id === tableId);
        if (t) setTable(t);
      }
      const ordersRaw = localStorage.getItem('vexly_orders');
      if (ordersRaw) {
        const parsed = JSON.parse(ordersRaw);
        const orders = Array.isArray(parsed) ? parsed.filter(o => o.table_id === tableId) : [];
        if (orders.length > 0) applyOrders(orders);
      }
    } catch {}
  }, [tableId, applyOrders]);

  const fetchOrder = useCallback(async () => {
    try {
      const tableRes = await tablesAPI.list();
      const t = tableRes.data.find(tb => tb.id === tableId);
      setTable(t);
      
      try {
        const ordersRes = await ordersAPI.getTableOrders(tableId);
        const orders = ordersRes.data || [];
        applyOrders(orders);

        if (orders.length === 0 && t?.active_order_id) {
          try {
            const orderRes = await ordersAPI.get(t.active_order_id);
            setOrder(orderRes.data);
            setActiveOrderId(orderRes.data.id);
            setTableOrders([orderRes.data]);
            orderRef.current = orderRes.data;
          } catch {}
        }
      } catch (orderError) {
        if (orderError.response?.status === 403) {
          setAccessDenied(orderError.response?.data?.detail || 'No tienes permiso para acceder a esta mesa');
          setOrder(null);
          setTableOrders([]);
        } else {
          // Network error — fall back to cache
          loadFromCache();
        }
      }
    } catch {
      // Network error — fall back to cache
      loadFromCache();
    }
  }, [tableId, activeOrderId, applyOrders, loadFromCache]);

  // Keep tableOrdersRef in sync with local order state changes (e.g. after adding items)
  useEffect(() => {
    if (order && tableOrdersRef.current.length > 0) {
      tableOrdersRef.current = tableOrdersRef.current.map(o =>
        o.id === order.id ? order : o
      );
    }
  }, [order]);


  useEffect(() => {
    const fetchAll = async () => {
      // Categories
      let catData = [];
      try {
        const catRes = await categoriesAPI.list();
        catData = catRes.data;
        try { localStorage.setItem('vexly_categories', JSON.stringify(catData)); } catch {}
      } catch {
        const c = localStorage.getItem('vexly_categories');
        if (c) catData = JSON.parse(c);
      }
      setCategories(catData);

      // Products
      let prodData = [];
      try {
        const prodRes = await productsAPI.list();
        prodData = prodRes.data;
        try { localStorage.setItem('vexly_products', JSON.stringify(prodData)); } catch {}
      } catch {
        const c = localStorage.getItem('vexly_products');
        if (c) prodData = JSON.parse(c);
      }
      setProducts(prodData);

      // Modifiers
      let oldGroups = [];
      try {
        const modRes = await modifiersAPI.list();
        oldGroups = modRes.data.filter(m => m.options && m.options.length > 0);
        try { localStorage.setItem('vexly_modifiers', JSON.stringify(modRes.data)); } catch {}
      } catch {
        const c = localStorage.getItem('vexly_modifiers');
        if (c) oldGroups = JSON.parse(c).filter(m => m.options && m.options.length > 0);
      }
      // Merge old modifier system with new modifier_groups system
      try {
        const newRes = await fetch(`${API_BASE}/api/modifier-groups-with-options`);
        const newGroups = await newRes.json();
        const normalizedNew = newGroups.filter(g => g.options && g.options.length > 0).map(g => ({
          ...g, required: g.required || (g.min_selection > 0), max_selections: g.max_selections || g.max_selection || 1
        }));
        const oldIds = new Set(oldGroups.map(g => g.id));
        setModifierGroups([...oldGroups, ...normalizedNew.filter(g => !oldIds.has(g.id))]);
      } catch { setModifierGroups(oldGroups); }

      // Cancellation reasons
      try {
        const reasonRes = await reasonsAPI.list();
        const reasons = (reasonRes.data || []).filter(r => r.active !== false);
        setCancelReasons(reasons);
        try { localStorage.setItem('vexly_cancellation_reasons', JSON.stringify(reasons)); } catch {}
      } catch {
        const c = localStorage.getItem('vexly_cancellation_reasons');
        if (c) setCancelReasons(JSON.parse(c));
      }

      // Tax config
      try {
        const taxRes = await fetch(`${API_BASE}/api/tax-config`);
        const taxes = await taxRes.json();
        setTaxConfig(taxes.filter(t => t.active && t.rate > 0));
      } catch {}

      // Sale types
      try {
        const stRes = await fetch(`${API_BASE}/api/sale-types`);
        const stData = await stRes.json();
        const sortedTypes = stData.filter(st => st.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
        setSaleTypes(sortedTypes);
        const initialSaleType = sortedTypes.find(st => st.code === 'consumo_local') || sortedTypes[0];
        setCurrentSaleType(initialSaleType);
        if (initialSaleType) {
          const typeMap = {
            'consumo_local': 'dine_in',
            'para_llevar': 'takeaway',
            'delivery': 'delivery',
            'credito_fiscal': 'dine_in',
            'exportacion': 'export',
            'servicios': 'service'
          };
          setServiceType(typeMap[initialSaleType.code] || 'dine_in');
        }
      } catch {}
    };
    fetchAll().catch(() => {}); fetchOrder();
    // Check if there's an active business day
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/business-days/current`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
        const data = await res.json();
        setHasActiveDay(!!data?.has_open_day);
        try { localStorage.setItem('vexly_business_day_current', JSON.stringify(data)); } catch {}
      } catch {
        const c = localStorage.getItem('vexly_business_day_current');
        if (c) setHasActiveDay(!!JSON.parse(c)?.has_open_day);
        else setHasActiveDay(false);
      }
    })();
  }, [fetchOrder, API_BASE]);

  // Load inventory settings and stock status
  useEffect(() => {
    const loadStockData = async () => {
      try {
        // Load inventory settings to check if we need to enforce stock control
        const settingsRes = await inventorySettingsAPI.get();
        const settings = settingsRes.data;
        setAllowSaleWithoutStock(settings.allow_sale_without_stock ?? true);
        
        // Only load stock status if stock control is enabled
        if (!settings.allow_sale_without_stock) {
          setStockLoading(true);
          const stockRes = await inventorySettingsAPI.getProductsStockStatus();
          const stockMap = {};
          (stockRes.data || []).forEach(item => {
            stockMap[item.product_id] = {
              in_stock: item.in_stock,
              available_quantity: item.available_quantity,
              is_low_stock: item.is_low_stock,
              has_recipe: item.has_recipe
            };
          });
          setStockStatus(stockMap);
          setStockLoading(false);
        }
      } catch (err) {
        console.error('Error loading stock data:', err);
        setAllowSaleWithoutStock(true); // Default to allowing sales if settings fail
      }
    };
    loadStockData();
  }, []);

  // Re-sync tax config AND sale types every 30s so admin changes reflect immediately
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Refresh taxes
        const taxRes = await fetch(`${API_BASE}/api/tax-config`);
        const taxes = await taxRes.json();
        setTaxConfig(taxes.filter(t => t.active && t.rate > 0));
        
        // Refresh sale types - 100% dynamic
        const stRes = await fetch(`${API_BASE}/api/sale-types`);
        const stData = await stRes.json();
        const sortedTypes = stData.filter(st => st.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
        setSaleTypes(sortedTypes);
        
        // Update currentSaleType if it still exists, otherwise default to first
        if (currentSaleType) {
          const stillExists = sortedTypes.find(st => st.id === currentSaleType.id);
          if (stillExists) {
            // Update with any changes from admin
            setCurrentSaleType(stillExists);
          } else {
            // Sale type was deleted, fallback to first
            setCurrentSaleType(sortedTypes[0]);
          }
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [API_BASE, currentSaleType]);

  // Keep orderRef in sync with order state
  useEffect(() => {
    if (order) {
      orderRef.current = order;
    }
  }, [order]);

  // Auto-send pending items to kitchen when leaving the page
  const alreadySentRef = useRef(false);
  const sendPendingToKitchenSilently = useCallback(async (showToast = false) => {
    if (alreadySentRef.current) return false;
    
    // Send pending items for ALL orders on this table, not just the active one
    const allOrders = tableOrdersRef.current || [];
    const ordersWithPending = allOrders.filter(o => 
      o.items?.some(i => i.status === 'pending')
    );
    
    if (ordersWithPending.length === 0) return false;
    
    try {
      alreadySentRef.current = true;
      // Send all orders with pending items in parallel
      await Promise.all(
        ordersWithPending.map(o => ordersAPI.sendToKitchen(o.id))
      );
      // Reset after short delay to allow future sends (e.g. user adds more items)
      setTimeout(() => { alreadySentRef.current = false; }, 1500);
      return true;
    } catch (e) {
      alreadySentRef.current = false;
      return false;
    }
  }, []);

  // Intercept all navigation clicks to send pending items first
  useEffect(() => {
    const handleNavClick = async (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (href && !href.startsWith('/order/') && href !== '#') {
        // Check ALL orders on the table for pending items
        const allOrders = tableOrdersRef.current || [];
        const ordersWithPending = allOrders.filter(o => 
          o.items?.some(i => i.status === 'pending')
        );
        
        if (ordersWithPending.length > 0 && !alreadySentRef.current) {
          e.preventDefault();
          e.stopPropagation();
          alreadySentRef.current = true;
          try {
            await Promise.all(
              ordersWithPending.map(o => ordersAPI.sendToKitchen(o.id))
            );
          } catch {}
          navigate(href);
          return;
        }
      }
    };

    document.addEventListener('click', handleNavClick, true);
    return () => document.removeEventListener('click', handleNavClick, true);
  }, [navigate]);

  // Listen for sidebar functions menu events
  useEffect(() => {
    const handleOpenMoveDialog = () => {
      openMoveDialog();
    };
    
    const handleEnterSplitMode = () => {
      enterSplitMode();
    };
    
    const handleVoidEntireOrder = async () => {
      // ═══════════════════════════════════════════════════════════════════════════════
      // LÓGICA DUAL DE ANULACIÓN:
      // 1. Cuenta ABIERTA (sin factura pagada): Cancela items sin registro fiscal
      // 2. Cuenta CERRADA (con factura NCF): Redirige al módulo B04 de Notas de Crédito
      // ═══════════════════════════════════════════════════════════════════════════════
      
      if (!order) return;
      
      try {
        // Verificar si existe una factura PAGADA para esta orden
        const billsRes = await billsAPI.list({ order_id: order.id });
        const paidBill = billsRes.data?.find(b => b.status === 'paid');
        
        if (paidBill) {
          // ─── CUENTA CERRADA: Redirigir a B04 ───
          // La cuenta ya fue facturada y pagada, necesita una Nota de Crédito
          setB04RedirectDialog({
            open: true,
            transactionNumber: paidBill.transaction_number || order.transaction_number,
            ncf: paidBill.ncf,
            total: paidBill.total,
            paidAt: paidBill.paid_at
          });
        } else {
          // ─── CUENTA ABIERTA: Cancelar sin fiscal ───
          // La cuenta NO ha sido facturada, se puede cancelar directamente
          const currentActiveItems = order?.items?.filter(i => i.status !== 'cancelled') || [];
          if (currentActiveItems.length === 0) {
            return; // Silent - no items to void
          }
          const allItemIds = currentActiveItems.map(i => i.id);
          openBulkCancelDialog(allItemIds, true); // true = force manager auth
        }
      } catch (err) {
        console.error('Error checking bill status:', err);
        // En caso de error, asumir cuenta abierta
        const currentActiveItems = order?.items?.filter(i => i.status !== 'cancelled') || [];
        if (currentActiveItems.length === 0) return;
        const allItemIds = currentActiveItems.map(i => i.id);
        openBulkCancelDialog(allItemIds, true);
      }
    };
    
    window.addEventListener('openMoveTableDialog', handleOpenMoveDialog);
    window.addEventListener('enterSplitMode', handleEnterSplitMode);
    window.addEventListener('voidEntireOrder', handleVoidEntireOrder);
    const handleOpenTransfer = () => setTransferDialogOpen(true);
    window.addEventListener('openTransferTableDialog', handleOpenTransfer);
    const handleOpenMoveItems = () => setMoveItemsActive(true);
    window.addEventListener('openMoveItemsFlow', handleOpenMoveItems);
    
    return () => {
      window.removeEventListener('openMoveTableDialog', handleOpenMoveDialog);
      window.removeEventListener('enterSplitMode', handleEnterSplitMode);
      window.removeEventListener('voidEntireOrder', handleVoidEntireOrder);
      window.removeEventListener('openTransferTableDialog', handleOpenTransfer);
      window.removeEventListener('openMoveItemsFlow', handleOpenMoveItems);
    };
  }, [order]);

  // Haptic feedback utility - vibrates on mobile devices
  const triggerHaptic = useCallback((pattern = 'light') => {
    if (!navigator.vibrate) return;
    // Vibration patterns: 'light' = 10ms, 'medium' = 25ms, 'strong' = 50ms, 'double' = [25, 50, 25]
    const patterns = {
      light: 10,
      medium: 25,
      strong: 50,
      double: [25, 50, 25],
      success: [10, 30, 10, 30, 50]
    };
    navigator.vibrate(patterns[pattern] || patterns.light);
  }, []);

  // Mobile button state machine: Only handle editing state transitions
  // Track previous selection count to detect actual changes
  const prevSelectedCount = useRef(0);
  useEffect(() => {
    const current = selectedItems.length;
    const previous = prevSelectedCount.current;
    
    // Only act on actual changes in selection
    if (current !== previous) {
      if (current > 0) {
        // Items selected - go to editing mode
        setMobileButtonState('editing');
        triggerHaptic('medium'); // Haptic feedback on state change
      } else if (previous > 0) {
        // Items were deselected - return to initial
        setMobileButtonState('initial');
        triggerHaptic('light'); // Light feedback on deselection
      }
      prevSelectedCount.current = current;
    }
  }, [selectedItems.length, triggerHaptic]);

  // Load grid settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pos_grid_settings');
    if (saved) {
      try {
        setGridSettings(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const handleBack = async () => { 
    // If table has multiple accounts, go back to account selector first
    if (tableOrders.length > 1 && !showAccountSelector) {
      try { await sendPendingToKitchenSilently(true); } catch {}
      try { await fetchOrder(); } catch {}
      setShowAccountSelector(true);
      return;
    }
    try { await sendPendingToKitchenSilently(true); } catch {}
    navigate('/tables'); 
  };

  const filteredProducts = activeCat ? products.filter(p => {
    if (p.category_id !== activeCat) return false;
    if (productSearchQuery.trim()) {
      return p.name?.toLowerCase().includes(productSearchQuery.toLowerCase().trim());
    }
    return true;
  }) : [];

  // Global search results (when searching from categories view)
  const globalSearchResults = !activeCat && showProductSearch && productSearchQuery.trim()
    ? products.filter(p => p.active !== false && p.name?.toLowerCase().includes(productSearchQuery.toLowerCase().trim()))
    : [];

  const handleProductClick = (product) => {
    // Block if offline
    if (!navigator.onLine) {
      notify.error('Sin conexión. Para agregar artículos necesitas internet.');
      return;
    }
    // Block if no active business day
    if (!hasActiveDay) {
      notify.error('No hay jornada activa', { description: 'Se requiere iniciar una nueva jornada. Cierra sesión y vuelve a entrar.' });
      return;
    }
    // Check if product has any modifiers (from either old or new system)
    const assignmentIds = (product.modifier_assignments || []).map(a => a.group_id);
    const legacyIds = product.modifier_group_ids || [];
    const allModifierIds = [...new Set([...assignmentIds, ...legacyIds])];
    const hasModifiers = allModifierIds.length > 0;
    
    // If product has modifiers, open dialog to let user choose
    if (hasModifiers) {
      setModDialog({ open: true, product, selectedMods: {}, qty: presetQty > 0 ? String(presetQty) : '1', notes: '' });
      if (presetQty > 0) setPresetQty(0); // Reset preset after use
      return;
    }
    
    // No modifiers: quick add mode - add directly without dialog
    const qty = presetQty > 0 ? presetQty : 1;
    addItemToOrder(product, qty, [], '');
    if (presetQty > 0) setPresetQty(0); // Reset preset after use
  };
  
  // Long press to open quantity dialog (for fractional quantities or notes)
  const handleProductLongPress = (product) => {
    setModDialog({ open: true, product, selectedMods: {}, qty: '0', notes: '' });
  };

  const addItemToOrder = async (product, qty, mods, notes) => {
    if (!navigator.onLine) {
      notify.error('Sin conexión. Para agregar artículos necesitas internet.');
      return;
    }
    const item = { product_id: product.id, product_name: product.name, quantity: qty, unit_price: product.price, modifiers: mods, notes };
    try {
      if (!order) {
        const res = await ordersAPI.create({ table_id: tableId, items: [item] });
        setOrder(res.data);
      } else {
        const res = await ordersAPI.addItems(order.id, [item]);
        setOrder(res.data);
      }
    } catch { console.warn('Error agregando item'); }
  };

  const handleConfirmModifiers = () => {
    const { product, selectedMods, qty, notes } = modDialog;
    
    // Get all modifier group IDs from both old and new systems
    const assignmentIds = (product?.modifier_assignments || []).map(a => a.group_id);
    const legacyIds = product?.modifier_group_ids || [];
    const allModifierIds = [...new Set([...assignmentIds, ...legacyIds])];
    
    // Validate required modifier groups
    const requiredGroups = modifierGroups.filter(mg => {
      if (!allModifierIds.includes(mg.id)) return false;
      const assignment = (product?.modifier_assignments || []).find(a => a.group_id === mg.id);
      return assignment ? assignment.min_selections > 0 : mg.required;
    });
    
    // Find missing required groups
    const missingGroups = requiredGroups.filter(group => {
      const selectedForGroup = selectedMods[group.id] || [];
      return selectedForGroup.length === 0;
    });
    
    if (missingGroups.length > 0) {
      setRequiredAlert({ open: true, missingGroups });
      return;
    }
    
    const mods = Object.values(selectedMods).flat().filter(Boolean);
    addItemToOrder(product, parseFloat(qty) || 1, mods, notes);
    setModDialog({ open: false, product: null, selectedMods: {}, qty: '1', notes: '' });
  };

  const handleSendToKitchen = async () => {
    if (!order) return;
    const pendingItems = order.items.filter(i => i.status === 'pending');
    if (pendingItems.length === 0) return; // Silent - no items to send
    try {
      const res = await ordersAPI.sendToKitchen(order.id);
      setOrder(res.data);
    } catch { console.warn('Error enviando a cocina'); }
  };

  // EXPRESS VOID: Direct deletion for PENDING items (no reason, no PIN, no inventory impact)
  const handleExpressVoid = async (itemIds) => {
    try {
      const res = await ordersAPI.cancelItems(order.id, {
        item_ids: itemIds,
        reason_id: null,  // No reason for express void
        return_to_inventory: false,  // No inventory impact for pending items
        comments: 'Anulación Express - Item no enviado',
        authorized_by_id: null,
        authorized_by_name: null,
        express_void: true  // Flag for express void
      });
      setOrder(res.data);
      setSelectedItems([]);
    } catch (e) {
      const msg = e.response?.data?.detail || 'Error eliminando item(s)';
      console.warn(msg);
    }
  };

  // Smart void handler: Determines if express void or audit protocol is needed
  const handleSmartVoid = (itemIds) => {
    // PARTIAL VOID: If single item selected and qty > 1, show partial void dialog
    if (itemIds.length === 1) {
      const item = order?.items?.find(i => i.id === itemIds[0]);
      if (item && item.quantity > 1) {
        setPartialVoidDialog({ open: true, item, qtyToVoid: 1 });
        return;
      }
    }
    
    // Check if ALL selected items are pending (not sent to kitchen)
    const allPending = itemIds.every(id => {
      const item = order?.items?.find(i => i.id === id);
      return item?.status === 'pending' && !item?.sent_to_kitchen;
    });
    
    // Check if ANY items were sent (requires audit protocol)
    const anyWasSent = itemIds.some(id => {
      const item = order?.items?.find(i => i.id === id);
      return item?.status === 'sent' || item?.sent_to_kitchen;
    });
    
    if (allPending) {
      handleExpressVoid(itemIds);
    } else {
      openBulkCancelDialog(itemIds, anyWasSent);
    }
  };

  // Handle partial void confirmation
  const handlePartialVoidConfirm = async () => {
    const { item, qtyToVoid } = partialVoidDialog;
    if (!item || qtyToVoid < 1) return;
    
    const wasSent = item.status === 'sent' || item.sent_to_kitchen;
    
    // If voiding all, delegate to normal flow
    if (qtyToVoid === item.quantity) {
      setPartialVoidDialog({ open: false, item: null, qtyToVoid: 1 });
      handleSmartVoidSingle(item.id, wasSent);
      return;
    }
    
    // If item is pending (not sent), use express partial void
    if (!wasSent) {
      try {
        const res = await fetch(`${API_BASE}/api/orders/${order.id}/partial-void/${item.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
          body: JSON.stringify({ qty_to_void: qtyToVoid, express_void: true, return_to_inventory: false, comments: `Anulacion parcial express (${qtyToVoid} de ${item.quantity})` })
        });
        if (res.ok) { setOrder(await res.json()); setSelectedItems([]); }
      } catch {}
      setPartialVoidDialog({ open: false, item: null, qtyToVoid: 1 });
      return;
    }
    
    // Item was sent: open cancel dialog with partial void context
    setPartialVoidDialog({ open: false, item: null, qtyToVoid: 1 });
    setCancelDialog({ 
      open: true, itemId: item.id, itemIds: [], mode: 'single',
      selectedReasonId: null, returnToInventory: true, comments: '',
      requiresManagerAuth: false, showManagerPin: false, managerPin: '',
      managerAuthError: '', authorizedBy: null,
      partialVoid: true, partialQty: qtyToVoid
    });
  };

  // Single item smart void (for when partial void resolves to full void)
  const handleSmartVoidSingle = (itemId, wasSent) => {
    if (!wasSent) {
      handleExpressVoid([itemId]);
    } else {
      openBulkCancelDialog([itemId], true);
    }
  };

  const handleCancelItem = async () => {
    const { itemId, itemIds, mode, selectedReasonId, returnToInventory, comments, requiresManagerAuth, authorizedBy } = cancelDialog;
    
    if (!selectedReasonId) {
      // Silent - no reason selected
      return;
    }
    
    // Check if manager auth is required but not yet provided
    if (requiresManagerAuth && !authorizedBy) {
      setCancelDialog(prev => ({ ...prev, showManagerPin: true, managerAuthError: '' }));
      return;
    }
    
    try {
      let res;
      const cancelData = {
        reason_id: selectedReasonId,
        return_to_inventory: returnToInventory,
        comments: comments,
        authorized_by_id: authorizedBy?.id || null,
        authorized_by_name: authorizedBy?.name || null
      };
      
      // Check if this is a partial void from the partial void dialog
      if (cancelDialog.partialVoid && cancelDialog.partialQty && itemId) {
        const pvRes = await fetch(`${API_BASE}/api/orders/${order.id}/partial-void/${itemId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
          body: JSON.stringify({ ...cancelData, qty_to_void: cancelDialog.partialQty })
        });
        if (pvRes.ok) { setOrder(await pvRes.json()); setSelectedItems([]); resetCancelDialog(); }
        return;
      }
      
      if (mode === 'multiple' && itemIds.length > 0) {
        res = await ordersAPI.cancelItems(order.id, {
          ...cancelData,
          item_ids: itemIds
        });
      } else {
        res = await ordersAPI.cancelItem(order.id, itemId, cancelData);
      }
      setOrder(res.data);
      // Clear selected items after successful cancellation
      setSelectedItems([]);
      resetCancelDialog();
    } catch (e) { 
      const msg = e.response?.data?.detail || 'Error anulando item(s)';
      console.warn(msg); 
    }
  };

  const resetCancelDialog = () => {
    setCancelDialog({ 
      open: false, itemId: null, itemIds: [], mode: 'single',
      selectedReasonId: null, returnToInventory: true, comments: '',
      requiresManagerAuth: false, showManagerPin: false, managerPin: '',
      managerAuthError: '', authorizedBy: null
    });
  };

  // Verify manager PIN — check against reason's allowed_roles
  const verifyManagerPin = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: JSON.stringify({ pin: cancelDialog.managerPin, permission: 'void_items' })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { response: { data: errData } };
      }
      const data = await res.json();
      // Check if the authorizing user's role is in the reason's allowed_roles
      const allowedRoles = cancelDialog.reasonAllowedRoles || ['admin','supervisor'];
      if (data.role && !allowedRoles.includes(data.role) && !data.is_superuser) {
        setCancelDialog(prev => ({ ...prev, managerAuthError: 'Este usuario no tiene el rol autorizado para esta razon', managerPin: '' }));
        return;
      }
      
      setCancelDialog(prev => ({ 
        ...prev, 
        showManagerPin: false, 
        managerPin: '',
        managerAuthError: '',
        authorizedBy: { id: data.user_id, name: data.user_name, is_superuser: data.is_superuser }
      }));
      
      // Removed toast - silent authorization (user sees the UI update)
      
      // DON'T auto-submit - let user confirm with "Anular" button
    } catch (e) {
      const errorMsg = e.response?.data?.detail || 'Error verificando PIN';
      setCancelDialog(prev => ({ ...prev, managerAuthError: errorMsg, managerPin: '' }));
    }
  };

  // Open cancel dialog for a single item
  const openCancelDialog = (itemId) => {
    const item = order?.items?.find(i => i.id === itemId);
    const wasSent = item?.status === 'sent' || item?.sent_to_kitchen;
    setCancelDialog({ 
      open: true, 
      itemId, 
      itemIds: [], 
      mode: 'single',
      selectedReasonId: null,
      returnToInventory: wasSent,
      comments: '',
      requiresManagerAuth: false,
      showManagerPin: false,
      managerPin: '',
      managerAuthError: '',
      authorizedBy: null
    });
  };

  // Open cancel dialog for multiple items - NOW OPENS DIRECTLY TO REASON SELECTION
  const openBulkCancelDialog = (itemIds, forceManagerAuth = false) => {
    const anyWasSent = itemIds.some(id => {
      const item = order?.items?.find(i => i.id === id);
      return item?.status === 'sent' || item?.sent_to_kitchen;
    });
    setCancelDialog({ 
      open: true, 
      itemId: null, 
      itemIds, 
      mode: 'multiple',
      selectedReasonId: null,
      returnToInventory: anyWasSent,
      comments: '',
      requiresManagerAuth: false, // Will be set based on selected reason
      showManagerPin: false, // PIN only shows AFTER reason selection if required
      managerPin: '',
      managerAuthError: '',
      authorizedBy: null,
      forceAuth: forceManagerAuth // Flag to always require auth regardless of reason
    });
  };

  // Handle reason selection - check allowed_roles for authorization
  const handleReasonSelect = (reasonId) => {
    const reason = cancelReasons.find(r => r.id === reasonId);
    const userRole = user?.role || 'waiter';
    const allowedRoles = reason?.allowed_roles || ['admin','supervisor','cashier','waiter','kitchen'];
    const needsAuth = !allowedRoles.includes(userRole);
    
    setCancelDialog(prev => ({
      ...prev,
      selectedReasonId: reasonId,
      returnToInventory: reason?.return_to_inventory ?? reason?.affects_inventory ?? prev.returnToInventory,
      requiresManagerAuth: needsAuth,
      showManagerPin: needsAuth,
      authorizedBy: null,
      reasonAllowedRoles: allowedRoles,
    }));
  };

  const activeItems = order?.items?.filter(i => i.status !== 'cancelled') || [];
  const pendingCount = activeItems.filter(i => i.status === 'pending').length;
  const subtotal = activeItems.reduce((sum, i) => {
    const modTotal = (i.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
    return sum + (i.unit_price + modTotal) * i.quantity;
  }, 0);

  // ─── MOTOR DE CÁLCULO INTELIGENTE ───
  // Calculate taxes per item, applying the intersection rule:
  // A tax applies to an item only if:
  // 1. The Sale Type allows it (not in saleType.tax_exemptions)
  // 2. AND the Product allows it (not in product.tax_exemptions)
  
  const calculateItemTaxes = useCallback((item) => {
    // Get product data to check its tax exemptions
    const product = products.find(p => p.id === item.product_id);
    const productTaxExemptions = product?.tax_exemptions || [];
    const saleTypeTaxExemptions = currentSaleType?.tax_exemptions || [];
    
    const itemSubtotal = (item.unit_price + (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0)) * item.quantity;
    const itemTaxes = [];
    let itemRunningTotal = itemSubtotal;
    
    for (const tax of taxConfig) {
      // Rule 1: Check if Sale Type allows this tax
      const saleTypeAllows = !saleTypeTaxExemptions.includes(tax.id);
      
      // Rule 2: Check if Product allows this tax
      const productAllows = !productTaxExemptions.includes(tax.id);
      
      // Rule 3: Check is_dine_in_only flag (for legacy compatibility)
      const dineInOk = serviceType === 'dine_in' || !tax.is_dine_in_only;
      
      // Tax applies only if ALL conditions are met
      if (saleTypeAllows && productAllows && dineInOk) {
        const base = tax.apply_to_tip ? itemRunningTotal : itemSubtotal;
        const amount = Math.round(base * (tax.rate / 100) * 100) / 100;
        itemTaxes.push({ 
          tax_id: tax.id, 
          description: tax.description, 
          rate: tax.rate, 
          amount, 
          is_tip: tax.is_tip || false 
        });
        itemRunningTotal += amount;
      }
    }
    
    return { subtotal: itemSubtotal, taxes: itemTaxes, total: itemRunningTotal };
  }, [products, currentSaleType, taxConfig, serviceType]);

  // Aggregate taxes across all items
  const taxBreakdown = useMemo(() => {
    const aggregatedTaxes = {};
    
    for (const item of activeItems) {
      const itemCalc = calculateItemTaxes(item);
      for (const tax of itemCalc.taxes) {
        if (!aggregatedTaxes[tax.tax_id]) {
          aggregatedTaxes[tax.tax_id] = { ...tax, amount: 0 };
        }
        aggregatedTaxes[tax.tax_id].amount += tax.amount;
      }
    }
    
    return Object.values(aggregatedTaxes).map(tax => ({
      ...tax,
      amount: Math.round(tax.amount * 100) / 100
    }));
  }, [activeItems, calculateItemTaxes]);
  
  const grandTotal = subtotal + taxBreakdown.reduce((sum, t) => sum + t.amount, 0);

  const handleQtyKey = (key) => {
    setModDialog(prev => {
      let val = prev.qty;
      if (key === 'C') val = '0';
      else if (key === 'DEL') val = val.length > 1 ? val.slice(0, -1) : '0';
      else if (key === '.') { if (!val.includes('.')) val += '.'; }
      else val = val === '0' ? key : val + key;
      return { ...prev, qty: val };
    });
  };

  // ═══ BARCODE SCANNER LISTENER ═══
  // Barcode scanners act as keyboards — they type fast + Enter
  // Detect rapid keystrokes (< 50ms between chars) ending with Enter
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ignore if any input/textarea is focused (user is typing)
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      
      if (e.key === 'Enter' && barcodeBuffer.current.length >= 3) {
        const scannedCode = barcodeBuffer.current;
        barcodeBuffer.current = '';
        
        // Find product by barcode in loaded products
        const found = products.find(p => p.barcode === scannedCode && p.active !== false);
        if (found) {
          handleProductClick(found);
        } else {
          setBarcodeNotFound(scannedCode);
          setTimeout(() => setBarcodeNotFound(null), 4000);
        }
        return;
      }
      
      // Only accept printable chars (digits, letters)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimer.current);
        // Reset buffer after 100ms of no input (human typing is slower)
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
      }
    };
    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [products, handleProductClick]);

  const sendToSpecificPrinter = async (orderId, channelCode) => {
    try {
      const resp = await fetch(`${API_BASE}/api/print/pre-check/${orderId}/send?channel_override=${channelCode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      const data = await resp.json();
      if (data.ok) {
        notify.success('Pre-cuenta enviada a impresora');
        setPreCheckOpen(false);
        setPrinterSelectDialog({ open: false, pendingOrderId: null });
      }
    } catch { notify.error('Error al imprimir'); }
  };

  const checkUserHasActiveShift = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/pos-sessions/my-session`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      if (r.ok) {
        const d = await r.json();
        return d && d.status === 'open';
      }
    } catch {}
    return false;
  };

  const fetchAvailablePrinters = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/print-channels`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
      });
      if (r.ok) {
        const channels = await r.json();
        setAvailablePrinters(channels.filter(c => c.active !== false && (c.ip || c.ip_address)));
      }
    } catch {}
  };

  const handlePrintPreCheckToPhysical = async () => {
    const hasShift = await checkUserHasActiveShift();
    if (hasShift) {
      // Cajero con turno abierto → imprime directo en su caja
      try {
        const resp = await fetch(`${API_BASE}/api/print/pre-check/${order?.id}/send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
        });
        const data = await resp.json();
        if (data.ok) setPreCheckOpen(false);
      } catch { notify.error('Error al imprimir'); }
    } else {
      // Sin turno → cerrar pre-cuenta y mostrar selector de impresora
      setPreCheckOpen(false);
      await fetchAvailablePrinters();
      setPrinterSelectDialog({ open: true, pendingOrderId: order?.id });
    }
  };

  // Pre-check (pre-cuenta) functions
  const fetchPreCheckCount = async () => {
    if (!order) return;
    try {
      const r = await fetch(`${API_BASE}/api/print/pre-check-count/${order.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
      const d = await r.json();
      setPreCheckCount(d.count || 0);
    } catch {}
  };

  useEffect(() => { if (order) fetchPreCheckCount(); }, [order]);

  const handlePrintPreCheck = async () => {
    if (!order) return;
    // If already printed, check permission
    if (preCheckCount > 0) {
      // User has reprint_precuenta permission → reprint directly, no PIN needed
      if (hasPermission('reprint_precuenta')) {
        await doPrintPreCheck();
        return;
      }
      // No permission → require manager PIN
      setManagerPinDialog({ open: true, pin: '' });
      return;
    }
    await doPrintPreCheck();
  };

  const doPrintPreCheck = async (specificOrderId = null) => {
    const targetOrderId = specificOrderId || order?.id;
    if (!targetOrderId) return;
    
    try {
      const r = await fetch(`${API_BASE}/api/print/pre-check/${targetOrderId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
      const d = await r.json();
      setPreCheckHtml(d.html);
      setPreCheckOpen(true);
      if (!specificOrderId) {
        setPreCheckCount(d.print_number);
        // Mobile: Transition to 'closing' state after printing pre-check
        setMobileButtonState('closing');
        triggerHaptic('success'); // Success vibration pattern for pre-check
      }
      // First print: change table status to billed (yellow glow)
      if (d.print_number === 1 && table) {
        try {
          await tablesAPI.update(table.id, { status: 'billed' });
        } catch {}
      }
    } catch { console.warn('Error generando pre-cuenta'); }
  };

  // Print pre-check for a specific account
  const handlePrintAccountPreCheck = async (orderId, accountNumber) => {
    await doPrintPreCheck(orderId);
  };

  // Print pre-check for ALL accounts on this table
  const handlePrintAllAccounts = async () => {
    const ordersWithItems = tableOrders.filter(o => 
      o.items?.some(i => i.status !== 'cancelled')
    );
    if (ordersWithItems.length === 0) return;
    
    for (const ord of ordersWithItems) {
      await doPrintPreCheck(ord.id);
    }
    notify.success(`${ordersWithItems.length} pre-cuentas generadas`);
  };

  const handleManagerAuth = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/auth/verify-manager`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: JSON.stringify({ 
          pin: managerPinDialog.pin,
          permission: 'reprint_receipt'  // Permission to reprint
        })
      });
      if (r.ok) {
        const data = await r.json();
        setManagerPinDialog({ open: false, pin: '', error: '' });
        await doPrintPreCheck();
      } else {
        const d = await r.json();
        const errorMsg = d.detail || 'No autorizado';
        setManagerPinDialog(prev => ({ ...prev, error: errorMsg, pin: '' }));
      }
    } catch { 
      setManagerPinDialog(prev => ({ ...prev, error: 'Error de conexión', pin: '' }));
    }
  };

  // Move Table Functions
  const openMoveDialog = async () => {
    try {
      const [tablesRes, areasRes] = await Promise.all([tablesAPI.list(), areasAPI.list()]);
      setAllTables(tablesRes.data);
      setAllAreas(areasRes.data);
      setMoveDialog({ open: true });
    } catch { console.warn('Error cargando mesas'); }
  };

  const handleMoveTable = async (targetTableId) => {
    if (!order) return;
    try {
      // Always move only the CURRENT order/account, not all of them
      const res = await ordersAPI.moveToTable(order.id, targetTableId, false);
      if (res.data.needs_merge) {
        // Target table is occupied, ask to merge
        setMoveDialog({ open: false });
        setMergeConfirm({ open: true, targetTableId, targetTableNumber: res.data.target_table_number });
      } else {
        setMoveDialog({ open: false });
        navigate(`/order/${targetTableId}`);
      }
    } catch { console.warn('Error moviendo cuenta'); }
  };

  const handleConfirmMerge = async () => {
    if (!order || !mergeConfirm.targetTableId) return;
    try {
      await ordersAPI.moveToTable(order.id, mergeConfirm.targetTableId, true);
      setMergeConfirm({ open: false, targetTableId: null, targetTableNumber: null });
      navigate(`/order/${mergeConfirm.targetTableId}`);
    } catch { console.warn('Error uniendo cuenta'); }
  };

  // Split/Divide Functions - Create new orders
  const enterSplitMode = () => {
    setSplitMode(true);
    setSelectedSplitItems([]);
  };

  const exitSplitMode = () => {
    setSplitMode(false);
    setSelectedSplitItems([]);
  };

  const toggleSplitItem = (itemId) => {
    setSelectedSplitItems(prev => 
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  // Select a different order (account) in the same table
  const selectOrder = (orderId) => {
    const selectedOrder = tableOrders.find(o => o.id === orderId);
    if (selectedOrder) {
      setOrder(selectedOrder);
      setActiveOrderId(orderId);
      orderRef.current = selectedOrder;
      setSelectedSplitItems([]);
    }
  };

  // Create new order from selected items
  const createNewOrderFromItems = async (label = '') => {
    if (selectedSplitItems.length === 0) {
      notify.error('Selecciona al menos un item');
      return;
    }
    if (!order) return;
    
    // Check if ALL items are selected - not allowed (account would be empty)
    const allItemIds = activeItems.map(i => i.id);
    if (selectedSplitItems.length === allItemIds.length) {
      notify.error('No puedes mover todos los items. Deselecciona al menos uno para que la cuenta original no quede vacía.');
      return;
    }

    try {
      const res = await ordersAPI.splitToNewOrder(order.id, selectedSplitItems, label);
      setSelectedSplitItems([]);
      setAccountLabelDialog({ open: false, label: '', action: null, itemIds: [] });
      // Refresh orders
      await fetchOrder();
      // Switch to new order
      setActiveOrderId(res.data.new_order.id);
    } catch (e) { 
      console.warn(e.response?.data?.detail || 'Error dividiendo cuenta'); 
    }
  };

  // Open label dialog for split
  const openSplitLabelDialog = () => {
    if (selectedSplitItems.length === 0) {
      notify.error('Selecciona al menos un item');
      return;
    }
    const allItemIds = activeItems.map(i => i.id);
    if (selectedSplitItems.length === allItemIds.length) {
      notify.error('No puedes mover todos los items. Deselecciona al menos uno.');
      return;
    }
    setAccountLabelDialog({ open: true, label: '', action: 'split', itemIds: selectedSplitItems });
  };

  // Create new empty account on the table
  const createNewEmptyAccount = async (label = '') => {
    try {
      const res = await ordersAPI.createNewAccount(tableId, label);
      setAccountLabelDialog({ open: false, label: '', action: null, itemIds: [] });
      // Refresh orders and switch to new account
      await fetchOrder();
      setActiveOrderId(res.data.id);
      setShowAccountSelector(false); // Go directly to the new account
    } catch (e) {
      console.warn(e.response?.data?.detail || 'Error creando nueva cuenta');
    }
  };

  // Open label dialog for new empty account
  const openNewAccountLabelDialog = () => {
    if (!navigator.onLine) {
      notify.error('Sin conexión. Para agregar artículos necesitas internet.');
      return;
    }
    setAccountLabelDialog({ open: true, label: '', action: 'new', itemIds: [] });
  };

  // Rename current account
  const handleRenameAccount = async () => {
    if (!order) return;
    try {
      await fetch(`${API_BASE}/api/orders/${order.id}/label`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: JSON.stringify({ label: renameDialog.value.trim() })
      });
      setRenameDialog({ open: false, value: '' });
      await fetchOrder();
    } catch { console.warn('Error renombrando cuenta'); }
  };

  // Handle label dialog confirm
  const handleAccountLabelConfirm = () => {
    const label = accountLabelDialog.label.trim();
    if (accountLabelDialog.action === 'split') {
      createNewOrderFromItems(label);
    } else if (accountLabelDialog.action === 'new') {
      createNewEmptyAccount(label);
    }
  };

  // Delete empty account
  const deleteEmptyAccount = async (orderId, accountNumber) => {
    try {
      await ordersAPI.deleteEmpty(orderId);
      // Refresh orders
      await fetchOrder();
      // If current order was deleted, switch to first available
      if (activeOrderId === orderId) {
        const remaining = tableOrders.filter(o => o.id !== orderId);
        if (remaining.length > 0) {
          setActiveOrderId(remaining[0].id);
        } else {
          navigate('/tables');
        }
      }
    } catch (e) {
      console.warn(e.response?.data?.detail || 'Error eliminando cuenta');
    }
  };

  // Merge two accounts
  const mergeAccounts = async (targetOrderId) => {
    const sourceOrderId = mergeAccountsDialog.sourceOrderId;
    if (!sourceOrderId || !targetOrderId) return;
    
    try {
      await ordersAPI.mergeOrders(sourceOrderId, targetOrderId);
      setMergeAccountsDialog({ open: false, sourceOrderId: null });
      // Refresh orders and switch to target
      await fetchOrder();
      setActiveOrderId(targetOrderId);
    } catch (e) {
      console.warn(e.response?.data?.detail || 'Error fusionando cuentas');
    }
  };

  // Open merge dialog
  const openMergeDialog = (orderId) => {
    setMergeAccountsDialog({ open: true, sourceOrderId: orderId });
  };

  // Handle merge from account selector
  const handleSelectorMerge = async (targetOrderId) => {
    if (!selectorMergeSource || !targetOrderId || selectorMergeSource === targetOrderId) return;
    try {
      await ordersAPI.mergeOrders(selectorMergeSource, targetOrderId);
      setSelectorMergeMode(false);
      setSelectorMergeSource(null);
      await fetchOrder();
      notify.success('Cuentas unidas exitosamente');
    } catch (e) {
      notify.error(e.response?.data?.detail || 'Error uniendo cuentas');
    }
  };

  // Direct billing - create bill and go to payment
  const handleDirectBilling = async () => {
    try {
      // Validar turno abierto antes de cobrar
      try {
        const shiftCheck = await posSessionsAPI.check();
        if (!shiftCheck.data?.has_open_session) {
          notify.error('Debes abrir un turno de caja', {
            description: 'Ve a Caja / Turnos para abrir tu turno antes de cobrar.',
            duration: 4000
          });
          return;
        }
      } catch { /* Si falla, permitir continuar */ }
      
      // Check for existing open bills for this order
      const existingBills = await billsAPI.list({ order_id: order.id, status: 'open' });
      
      // Build query params with NCF type from sale type
      const ncfType = currentSaleType?.default_ncf_type_id || 'B02';
      const queryParams = `serviceType=${serviceType}&ncfType=${ncfType}&saleTypeId=${currentSaleType?.id || ''}`;
      
      if (existingBills.data?.length > 0) {
        // If there's an open bill, go directly to payment with service type and NCF
        navigate(`/payment/${existingBills.data[0].id}?${queryParams}`);
        return;
      }
      
      // Create new bill with all items
      const itemIds = order.items
        .filter(i => i.status !== 'cancelled')
        .map(i => i.id);
      
      if (itemIds.length === 0) {
        return; // Silent - no items to bill
      }
      
      const res = await billsAPI.create({
        order_id: order.id,
        table_id: tableId,
        item_ids: itemIds,
        sale_type: serviceType,  // Pass service type to bill creation
        sale_type_id: currentSaleType?.id,  // Pass sale type ID
        default_ncf_type: ncfType  // Pass NCF type for fiscal sequence
      });
      
      // Navigate directly to payment screen with service type and NCF
      navigate(`/payment/${res.data.id}?${queryParams}`);
    } catch (e) {
      console.warn(e.response?.data?.detail || 'Error creando factura');
    }
  };

  // Check if order is empty
  const isOrderEmpty = (ord) => {
    if (!ord?.items) return true;
    return ord.items.filter(i => i.status !== 'cancelled').length === 0;
  };

  // Get order total
  const getOrderTotal = (ord) => {
    if (!ord?.items) return 0;
    const items = ord.items.filter(i => i.status !== 'cancelled');
    return items.reduce((sum, i) => {
      const modTotal = (i.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
      return sum + (i.unit_price + modTotal) * i.quantity;
    }, 0);
  };

  // Enter move items mode
  const enterMoveItemsMode = () => {
    if (selectedSplitItems.length === 0) {
      return; // Silent - no items selected
      return;
    }
    setSelectedItemsToMove([...selectedSplitItems]);
    setSplitMode(false); // Exit split mode
    setMoveItemsMode(true);
  };

  // Exit move items mode
  const exitMoveItemsMode = () => {
    setMoveItemsMode(false);
    setSelectedItemsToMove([]);
  };

  // Move items to another account
  const moveItemsToAccount = async (targetOrderId) => {
    if (selectedItemsToMove.length === 0 || !order) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order.id}/move-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({
          target_order_id: targetOrderId,
          item_ids: selectedItemsToMove
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error moviendo artículos');
      }
      
      const data = await res.json();
      
      // Reset and refresh
      setMoveItemsMode(false);
      setSelectedItemsToMove([]);
      setSelectedSplitItems([]);
      await fetchOrder();
      
      // Switch to target order
      setActiveOrderId(targetOrderId);
    } catch (e) {
      console.warn(e.message || 'Error moviendo artículos');
    }
  };

  return (
    <div className={`h-full flex flex-col ${showAccountSelector && tableOrders.length > 1 ? '' : 'lg:flex-row-reverse'}`} data-testid="order-screen">
      {/* ═══ ACCOUNT SELECTOR — Componente extraído ═══ */}
      {showAccountSelector && tableOrders.length > 1 && (
        <AccountSelectorLobby
          tableOrders={tableOrders}
          table={table}
          selectorMergeMode={selectorMergeMode}
          setSelectorMergeMode={setSelectorMergeMode}
          selectorMergeSource={selectorMergeSource}
          setSelectorMergeSource={setSelectorMergeSource}
          onBack={async () => { try { await sendPendingToKitchenSilently(true); } catch {} navigate('/tables'); }}
          onSelectAccount={(ord) => {
            setActiveOrderId(ord.id);
            setOrder(ord);
            orderRef.current = ord;
            setShowAccountSelector(false);
            setMobileAccountExpanded(false);
          }}
          onNewAccount={openNewAccountLabelDialog}
          onPrintAll={handlePrintAllAccounts}
          onMerge={handleSelectorMerge}
          getOrderTotal={getOrderTotal}
          isOrderEmpty={isOrderEmpty}
        />
      )}

      {/* ═══ NORMAL ORDER VIEW (hidden when account selector is shown) ═══ */}
      {(!showAccountSelector || tableOrders.length <= 1) && (
      <>
      {/* Mobile: Floating button to show account when collapsed */}
      {!mobileAccountExpanded && !splitMode && !accessDenied && activeItems.length > 0 && (
        <button
          onClick={() => setMobileAccountExpanded(true)}
          className="lg:hidden fixed bottom-20 right-4 z-50 h-14 px-4 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-2 font-oswald font-bold active:scale-95 transition-transform"
          data-testid="mobile-show-account-btn"
        >
          <ShoppingCart size={20} />
          <span className="text-sm">{activeItems.length}</span>
          <span className="text-sm font-bold">{formatMoney(grandTotal)}</span>
        </button>
      )}

      {/* Left (visually): Order Summary - Now rendered second but appears on left due to flex-row-reverse */}
      {/* Responsive: 35% on large screens, 45% on tablets, fullscreen on mobile when expanded */}
      <div className={`
        ${mobileAccountExpanded ? 'fixed inset-0 z-40 pb-16' : splitMode ? 'fixed inset-0 z-40 pb-16 lg:relative lg:inset-auto lg:z-auto lg:pb-0 lg:flex' : 'hidden lg:flex'} 
        w-full lg:w-[45%] xl:w-[35%] 
        border-b lg:border-b-0 lg:border-l border-white/10 
        flex flex-col backdrop-blur-xl bg-background/95 lg:bg-white/5 shrink-0
        lg:pb-0
      `}>
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (splitMode) {
                  exitSplitMode();
                  setMobileAccountExpanded(false);
                } else if (mobileAccountExpanded) {
                  setMobileAccountExpanded(false);
                } else {
                  handleBack();
                }
              }} 
              data-testid="back-to-tables" 
              className="h-10 w-10 rounded-lg text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all"
            >
              {splitMode ? <X size={18} /> : <ArrowLeft size={18} />}
            </button>
            <h2 className="font-oswald text-lg lg:text-base font-bold text-white">
              {accessDenied ? `Mesa ${table?.number || '?'}` : splitMode ? 'EDITAR CUENTA' : `Mesa ${table?.number || '?'}${order?.transaction_number ? ` | T-${order.transaction_number}` : ''}`}
            </h2>
            {order?.waiter_name && !splitMode && !accessDenied && (
              <p className="text-xs text-white/60 ml-1">Mesero: {order.waiter_name}</p>
            )}
          </div>
        </div>

        {/* Access Denied Screen */}
        {accessDenied && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <Lock size={32} className="text-red-500" />
            </div>
            <h3 className="font-oswald text-lg font-bold text-red-500 mb-2">Acceso Denegado</h3>
            <p className="text-sm text-white/60 mb-6">{accessDenied}</p>
            <button onClick={() => navigate('/tables')} className="px-4 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 flex items-center gap-2 transition-all">
              <ArrowLeft size={14} /> Volver a Mesas
            </button>
          </div>
        )}

        {/* Account Tabs - Show when table has multiple orders OR has at least one order */}
        {!accessDenied && (tableOrders.length > 1 || (tableOrders.length === 1 && order)) && !splitMode && (
          <div className="flex flex-col">
            {/* Move Items Mode Header */}
            {moveItemsMode && (
              <div className="flex items-center justify-between px-2 py-1.5 bg-purple-600/20 border-b border-purple-500/30">
                <span className="text-xs font-semibold text-purple-300">
                  ↓ Selecciona cuenta destino ({selectedItemsToMove.length} artículo{selectedItemsToMove.length > 1 ? 's' : ''})
                </span>
                <button onClick={exitMoveItemsMode} className="h-6 px-2 text-xs text-purple-300 hover:text-white flex items-center rounded">
                  <X size={12} className="mr-1" /> Cancelar
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 p-2 border-b border-white/10 overflow-x-auto bg-white/5" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {tableOrders.map(ord => {
                const isEmpty = isOrderEmpty(ord);
                const canDelete = isEmpty && tableOrders.length > 1 && !moveItemsMode;
                const isCurrentOrder = activeOrderId === ord.id;
                const canMoveHere = moveItemsMode && !isCurrentOrder;
                
                return (
                  <div key={ord.id} className="flex items-center gap-0.5 shrink-0">
                    {canMoveHere ? (
                      <button
                        onClick={() => moveItemsToAccount(ord.id)}
                        className="px-3 py-2 rounded-lg text-xs font-oswald whitespace-nowrap transition-all bg-purple-600 hover:bg-purple-500 text-white font-bold border-2 border-purple-400 animate-pulse"
                      >
                        → #{ord.account_number || 1}
                      </button>
                    ) : (
                      <button
                        onClick={() => !moveItemsMode && selectOrder(ord.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-oswald whitespace-nowrap transition-all flex items-center gap-1 ${
                          isCurrentOrder 
                            ? moveItemsMode 
                              ? 'bg-yellow-600 text-black font-bold border-2 border-yellow-400' 
                              : 'bg-primary text-primary-foreground font-bold' 
                            : 'bg-card border border-border text-muted-foreground hover:border-primary/50'
                        }`}
                        disabled={moveItemsMode}
                      >
                        {moveItemsMode && isCurrentOrder ? 'Desde →' : `#${ord.account_number || 1}`}
                        {!moveItemsMode && <span className="text-[11px] opacity-70">({ord.items?.filter(i => i.status !== 'cancelled').length || 0})</span>}
                      </button>
                    )}
                    {/* Delete empty account */}
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEmptyAccount(ord.id, ord.account_number || 1);
                        }}
                        data-testid={`delete-account-${ord.account_number || 1}`}
                        className="w-6 h-6 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shrink-0 transition-colors"
                        title="Eliminar cuenta vacía"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
              {/* Add New Account Button - Hide in move mode */}
              {!moveItemsMode && (
                <button
                  onClick={openNewAccountLabelDialog}
                  data-testid="add-new-account-btn"
                  className="px-2 py-1.5 rounded-lg text-xs font-oswald whitespace-nowrap transition-all bg-green-600/20 border border-green-600/50 text-green-400 hover:bg-green-600/30 hover:border-green-500 flex items-center gap-1"
                  title="Crear nueva cuenta"
                >
                  <Plus size={12} /> Nueva
                </button>
              )}
              {/* Merge Accounts Button - only show if 2+ accounts */}
              {tableOrders.length >= 2 && !moveItemsMode && (
                <button
                  onClick={() => openMergeDialog(activeOrderId)}
                  data-testid="merge-accounts-btn"
                  className="px-2 py-1.5 rounded-lg text-xs font-oswald whitespace-nowrap transition-all bg-blue-600/20 border border-blue-600/50 text-blue-400 hover:bg-blue-600/30 hover:border-blue-500 flex items-center gap-1"
                  title="Unir cuentas"
                >
                  <Merge size={12} /> Unir
                </button>
              )}
            </div>
          </div>
        )}

        {/* Split Mode View — Componente extraído */}
        {splitMode ? (
          <SplitCheckView
            tableOrders={tableOrders}
            activeOrderId={activeOrderId}
            order={order}
            activeItems={activeItems}
            selectedSplitItems={selectedSplitItems}
            setSelectedSplitItems={setSelectedSplitItems}
            onToggleSplitItem={toggleSplitItem}
            onSelectOrder={selectOrder}
            onDeleteEmptyAccount={deleteEmptyAccount}
            onSplitToNewAccount={openSplitLabelDialog}
            onMoveToAccount={enterMoveItemsMode}
            getOrderTotal={getOrderTotal}
            isOrderEmpty={isOrderEmpty}
          />
        ) : moveItemsActive ? (
          <MoveItemsFlow
            active={moveItemsActive}
            order={order}
            tableOrders={tableOrders}
            tableId={tableId}
            onDone={() => { setMoveItemsActive(false); fetchOrder(); }}
            onCancel={() => setMoveItemsActive(false)}
          />
        ) : (
          /* Normal Order View */
          <>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2.5">
                {activeItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Selecciona productos</p>
                ) : (
                  activeItems.map(item => {
                    const modTotal = (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
                    const itemTotal = (item.unit_price + modTotal) * item.quantity;
                    const isSelected = selectedItems.includes(item.id);
                    return (
                    <div key={item.id} data-testid={`order-item-${item.id}`}
                      onClick={() => {
                        // Toggle selection for void with haptic feedback
                        triggerHaptic('light');
                        if (isSelected) {
                          setSelectedItems(prev => prev.filter(id => id !== item.id));
                        } else {
                          setSelectedItems(prev => [...prev, item.id]);
                        }
                      }}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-red-500/10 border-red-500/50 ring-1 ring-red-500/30' 
                          : 'bg-background/50 border-border/50 hover:border-primary/30'
                      }`}>
                      {/* Selection indicator */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-red-500 border-red-500' : 'border-muted-foreground/40'
                      }`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-oswald text-sm font-bold text-primary">{item.quantity}x</span>
                          <span className="text-sm font-bold truncate">{item.product_name}</span>
                        </div>
                        {item.modifiers?.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.modifiers.map((m, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">+ {m.name}</span>
                                {m.price > 0 && <span className="font-oswald text-primary/70">+{formatMoney(m.price)}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {item.notes && <p className="text-xs text-yellow-500 mt-1 italic">📝 {item.notes}</p>}
                        <div className="mt-1">
                          {item.status === 'pending' && <Badge variant="outline" className="text-[8px] h-4 border-yellow-600 text-yellow-500">Pendiente</Badge>}
                          {item.status === 'sent' && <Badge variant="outline" className="text-[8px] h-4 border-blue-500 text-blue-400">Enviado</Badge>}
                          {item.status === 'preparing' && <Badge variant="outline" className="text-[8px] h-4 border-orange-500 text-orange-400">Preparando</Badge>}
                          {item.status === 'ready' && <Badge variant="outline" className="text-[8px] h-4 border-green-500 text-green-400">Listo</Badge>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-oswald text-sm">{formatMoney(itemTotal)}</span>
                      </div>
                    </div>
                  )})
                )}
              </div>
            </ScrollArea>

            <div className="px-3 py-2.5 border-t border-border space-y-1">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-oswald">{formatMoney(subtotal)}</span>
              </div>
              {subtotal > 0 && taxBreakdown.map((tax, i) => (
                <div key={i} className="flex justify-between items-center text-xs text-muted-foreground/70">
                  <span>{tax.description} ({tax.rate}%)</span>
                  <span className="font-oswald">{formatMoney(tax.amount)}</span>
                </div>
              ))}
              {subtotal > 0 && (
                <div className="flex justify-between items-center font-oswald border-t border-border/50 pt-1.5 mt-1">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">{formatMoney(grandTotal)}</span>
                </div>
              )}
            </div>

            {/* Action Buttons - Fixed at bottom, larger for touch */}
            {/* Mobile: State machine for buttons (initial -> editing -> closing) */}
            {/* Desktop: Always show ENVIAR + FACTURAR row, then secondary buttons */}
            {!splitMode && order && (
              <div className="p-3 border-t border-border bg-card/80 space-y-2">
                {/* ENVIAR button - always visible when there are pending items (both mobile and desktop) */}
                {pendingCount > 0 && (
                  <Button onClick={handleSendToKitchen} size="lg" data-testid="send-to-kitchen-btn"
                    className="h-14 w-full bg-green-600 hover:bg-green-700 text-white font-oswald text-base font-bold active:scale-95">
                    <Send size={18} className="mr-2" /> ENVIAR ({pendingCount})
                  </Button>
                )}

                {/* Desktop view: Always show FACTURAR and secondary buttons */}
                <div className="hidden lg:block space-y-2">
                  <Button onClick={handleDirectBilling} size="lg" data-testid="go-to-billing-desktop" 
                    className="h-14 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-oswald text-base font-bold">
                    <Receipt size={18} className="mr-2" /> FACTURAR
                  </Button>
                  {activeItems.length > 0 && (
                    <div className="flex gap-2">
                      {selectedItems.length > 0 && (
                        <Button 
                          onClick={() => handleSmartVoid(selectedItems)}
                          variant="outline" 
                          size="lg" 
                          data-testid="void-selected-btn-desktop"
                          className="h-12 text-sm border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 flex-1"
                        >
                          <Ban size={16} className="mr-1.5" /> Anular ({selectedItems.length})
                        </Button>
                      )}
                      <Button onClick={handlePrintPreCheck} variant="outline" size="lg" data-testid="pre-check-btn-desktop"
                        className={`h-12 text-sm border-muted-foreground/30 relative flex-1 ${selectedItems.length === 0 ? 'flex-[2]' : ''}`}>
                        <FileText size={16} className="mr-1.5" /> Pre-Cuenta
                        {preCheckCount > 0 && <Lock size={10} className="ml-1 text-yellow-500" />}
                      </Button>
                      {tableOrders.length > 1 && (
                        <Button onClick={handlePrintAllAccounts} variant="outline" size="lg" data-testid="print-all-accounts-btn"
                          className="h-12 text-sm border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 flex-1">
                          <Printer size={16} className="mr-1.5" /> Todas
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Mobile view: PRE-CUENTA + FACTURAR side by side (no state machine) */}
                <div className="lg:hidden space-y-2">
                  {activeItems.length > 0 && (
                    <>
                      {/* ANULAR - only when items selected */}
                      {selectedItems.length > 0 && (
                        <Button 
                          onClick={() => {
                            triggerHaptic('strong');
                            handleSmartVoid(selectedItems);
                          }}
                          size="lg" 
                          data-testid="void-selected-btn-mobile"
                          className="h-12 w-full bg-red-600 hover:bg-red-700 text-white font-oswald text-sm font-bold"
                        >
                          <Ban size={16} className="mr-1.5" /> ANULAR ({selectedItems.length})
                        </Button>
                      )}
                      {/* PRE-CUENTA + FACTURAR always visible */}
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => {
                            triggerHaptic('medium');
                            handlePrintPreCheck();
                          }} 
                          variant="outline" 
                          size="lg" 
                          data-testid="pre-check-btn-mobile"
                          className="h-14 flex-1 text-sm border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 font-oswald font-bold"
                        >
                          <FileText size={16} className="mr-1.5" /> PRE-CUENTA
                          {preCheckCount > 0 && <Lock size={10} className="ml-1 text-yellow-500" />}
                        </Button>
                        <Button 
                          onClick={() => {
                            triggerHaptic('double');
                            handleDirectBilling();
                          }} 
                          size="lg" 
                          data-testid="go-to-billing-mobile"
                          className="h-14 flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-oswald text-sm font-bold"
                        >
                          <Receipt size={16} className="mr-1.5" /> FACTURAR
                        </Button>
                      </div>
                      {/* TODAS - only when multiple accounts */}
                      {tableOrders.length > 1 && (
                        <Button 
                          onClick={() => {
                            triggerHaptic('medium');
                            handlePrintAllAccounts();
                          }} 
                          variant="outline" 
                          size="sm" 
                          data-testid="print-all-accounts-btn-mobile"
                          className="w-full h-9 text-xs border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 font-oswald font-bold"
                        >
                          <Printer size={14} className="mr-1" /> IMPRIMIR TODAS LAS CUENTAS
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Printer Selection Modal */}
      {printerSelectDialog.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPrinterSelectDialog({ open: false, pendingOrderId: null })}>
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-blue-500/20">
              <Printer size={32} className="text-blue-500" />
            </div>
            <h2 className="font-oswald text-xl font-bold mb-1 text-center text-foreground">Selecciona Impresora</h2>
            <p className="text-muted-foreground text-sm text-center mb-5">¿En cuál impresora deseas imprimir la pre-cuenta?</p>
            <div className="space-y-2">
              {availablePrinters.map(ch => (
                <button key={ch.id} onClick={() => sendToSpecificPrinter(printerSelectDialog.pendingOrderId, ch.code || ch.id)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-muted/50 transition-all active:scale-95"
                  data-testid={`select-printer-${ch.code}`}>
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                    <Printer size={20} className="text-primary" />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-sm">{ch.name}</span>
                    <p className="text-xs text-muted-foreground">{ch.ip || ch.ip_address}</p>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setPrinterSelectDialog({ open: false, pendingOrderId: null })}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Barcode Not Found Modal */}
      {barcodeNotFound && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBarcodeNotFound(null)}>
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full mx-4 p-8 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center bg-red-500/20">
              <AlertTriangle size={40} className="text-red-500" />
            </div>
            <h2 className="font-oswald text-xl font-bold mb-2 text-foreground">Producto No Encontrado</h2>
            <p className="text-muted-foreground text-sm mb-2">El código escaneado no coincide con ningún producto activo.</p>
            <p className="font-mono text-lg font-bold text-primary bg-muted rounded-lg py-2 px-4 inline-block mb-4">{barcodeNotFound}</p>
            <button onClick={() => setBarcodeNotFound(null)}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-oswald font-bold text-base transition-all active:scale-95">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Access Denied - Mobile fullscreen */}
      {accessDenied && !mobileAccountExpanded && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center lg:hidden">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <Lock size={32} className="text-red-500" />
          </div>
          <h3 className="font-oswald text-lg font-bold text-red-500 mb-2">Acceso Denegado</h3>
          <p className="text-sm text-muted-foreground mb-6">{accessDenied}</p>
          <button onClick={() => navigate('/tables')} className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted flex items-center gap-2 transition-all">
            <ArrowLeft size={14} /> Volver a Mesas
          </button>
        </div>
      )}

      {/* Right (visually): Categories & Products - Now rendered first but appears on right */}
      {/* Hide on mobile when account is expanded */}
      {!splitMode && !accessDenied && !mobileAccountExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden">
        {/* Grid Settings Bar - Glassmorphism */}
        <div className={`flex items-center justify-between px-3 ${largeMode ? 'py-2.5' : 'py-2'} border-b border-white/10 backdrop-blur-xl bg-white/5`}>
          <div className="flex items-center gap-2">
            {activeCat ? (
              <button onClick={() => { setActiveCat(null); setShowProductSearch(false); setProductSearchQuery(''); }} className={`flex items-center gap-2 bg-primary text-primary-foreground font-oswald font-bold rounded-xl px-4 transition-all active:scale-95 ${largeMode ? 'h-12 text-base' : 'h-10 text-sm'}`} data-testid="back-to-categories">
                <ArrowLeft size={largeMode ? 20 : 16} /> Categorias
              </button>
            ) : (
              <span className={`font-semibold flex items-center gap-1.5 ${largeMode ? 'text-base' : 'text-sm'}`}><Grid3X3 size={largeMode ? 18 : 14} /> Categorias</span>
            )}
            {/* Button to go back to account selector when table has multiple accounts */}
            {tableOrders.length > 1 && !activeCat && (
              <>
              <button
                onClick={async () => { try { await sendPendingToKitchenSilently(true); } catch {} try { await fetchOrder(); } catch {} setShowAccountSelector(true); }}
                className={`flex items-center gap-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30 font-oswald font-bold rounded-xl px-3 transition-all active:scale-95 ${largeMode ? 'h-10 text-sm' : 'h-8 text-xs'}`}
                data-testid="back-to-accounts-btn"
              >
                <Users size={largeMode ? 16 : 14} /> Cuentas
              </button>
              <button
                onClick={() => setRenameDialog({ open: true, value: order?.account_label || '' })}
                className={`flex items-center gap-1.5 bg-white/10 text-white/60 border border-white/20 hover:bg-white/20 hover:text-white font-oswald rounded-xl px-3 transition-all active:scale-95 ${largeMode ? 'h-10 text-sm' : 'h-8 text-xs'}`}
                data-testid="rename-account-btn"
              >
                <Pencil size={largeMode ? 14 : 12} /> {order?.account_label ? 'Editar Nombre' : 'Nombrar'}
              </button>
              </>
            )}
            {activeCat && (
              <>
                <span className={`font-semibold ${largeMode ? 'text-base' : 'text-sm'}`}>{categories.find(c => c.id === activeCat)?.name}</span>
              </>
            )}
          </div>
          {/* Column controls and Quantity button */}
          <div className="flex items-center gap-2.5">
            {/* Search Button - always visible */}
            <button
              onClick={() => {
                setShowProductSearch(!showProductSearch);
                setProductSearchQuery('');
                setTimeout(() => productSearchRef.current?.focus(), 100);
              }}
              className={`${largeMode ? 'w-10 h-8' : 'w-9 h-8'} rounded-lg font-bold transition-colors flex items-center justify-center ${
                showProductSearch
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white/10 hover:bg-cyan-500/20 text-white/60'
              }`}
              title="Buscar producto"
              data-testid="product-search-btn"
            >
              <Search size={largeMode ? 16 : 14} />
            </button>
            {/* Quick Quantity Button */}
            {activeCat && (
              <button
                onClick={() => {
                  setShowQtyKeypad(true);
                  setQtyKeypadExtended(false);
                  setQtyKeypadValue('');
                }}
                className={`${largeMode ? 'w-10 h-8' : 'w-9 h-8'} rounded-lg ${largeMode ? 'text-sm' : 'text-xs'} font-bold transition-colors flex items-center justify-center ${
                  presetQty > 0
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 hover:bg-orange-500/20 text-white/60'
                }`}
                title="Selector de cantidad"
              >
                <Hash size={largeMode ? 16 : 14} />
                {presetQty > 0 && <span className="ml-0.5">{presetQty}</span>}
              </button>
            )}
            {!device?.isMobile && (
            <>
            <span className={`text-white/50 mx-1 lg:hidden ${largeMode ? 'text-xs' : 'text-xs'}`}>Col:</span>
            {[2, 3, 4, 5].map(num => (
              <button
                key={num}
                onClick={() => {
                  const newSettings = activeCat 
                    ? { ...gridSettings, productColumns: num }
                    : { ...gridSettings, categoryColumns: num };
                  setGridSettings(newSettings);
                  localStorage.setItem('pos_grid_settings', JSON.stringify(newSettings));
                }}
                className={`lg:hidden ${largeMode ? 'w-8 h-8 text-sm' : 'w-7 h-7 text-xs'} rounded-lg font-bold transition-colors ${
                  (activeCat ? gridSettings.productColumns : gridSettings.categoryColumns) === num
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white/60'
                }`}
              >
                {num}
              </button>
            ))}
            </>
            )}
          </div>
        </div>

        {/* Product Search Bar */}
        {showProductSearch && (
          <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border-b border-cyan-500/30">
            <Search size={16} className="text-cyan-400 shrink-0" />
            <input
              ref={productSearchRef}
              type="text"
              value={productSearchQuery}
              onChange={e => setProductSearchQuery(e.target.value)}
              placeholder={activeCat ? "Buscar en esta categoría..." : "Buscar producto en todas las categorías..."}
              className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-white/40"
              data-testid="product-search-input"
              autoFocus
            />
            {productSearchQuery && (
              <button onClick={() => setProductSearchQuery('')} className="text-white/50 hover:text-white">
                <X size={14} />
              </button>
            )}
            <button
              onClick={() => { setShowProductSearch(false); setProductSearchQuery(''); }}
              className="text-cyan-400/70 hover:text-cyan-400 text-xs font-medium"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Preset Qty Indicator */}
        {presetQty > 0 && activeCat && (
          <div className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-500/20 border-b border-orange-500/30">
            <span className={`font-bold text-orange-400 ${largeMode ? 'text-base' : 'text-sm'}`}>
              Próximo producto: x{presetQty}
            </span>
            <button
              onClick={() => setPresetQty(0)}
              className={`text-orange-400/70 hover:text-orange-400 underline ${largeMode ? 'text-base' : 'text-sm'}`}
            >
              Cancelar
            </button>
          </div>
        )}

        <ScrollArea className="flex-1">
          {/* Global Search Results (searching from categories view) */}
          {!activeCat && globalSearchResults.length > 0 && (
            <div 
              className={`p-3 grid ${largeMode ? 'gap-3' : 'gap-2.5'} auto-fill-grid`}
              style={{ gridTemplateColumns: `repeat(${device?.isMobile ? 2 : Math.min(gridSettings.productColumns, 3)}, minmax(0, 1fr))` }}
              data-testid="global-search-grid"
            >
              {globalSearchResults.map(product => {
                const assignmentIds = (product.modifier_assignments || []).map(a => a.group_id);
                const legacyIds = product.modifier_group_ids || [];
                const hasModifiers = [...new Set([...assignmentIds, ...legacyIds])].length > 0;
                let pressTimer = null;
                const productStock = stockStatus[product.id];
                const isOutOfStock = !allowSaleWithoutStock && productStock && !productStock.in_stock;
                const isLowStock = productStock?.is_low_stock && !isOutOfStock;
                let touchStartY = 0;
                let touchMoved = false;
                const catName = categories.find(c => c.id === product.category_id)?.name || '';

                return (
                  <button 
                    key={product.id} 
                    onClick={(e) => { if (touchMoved) { e.preventDefault(); return; } if (!isOutOfStock) handleProductClick(product); }}
                    onTouchStart={(e) => { touchStartY = e.touches?.[0]?.clientY || 0; touchMoved = false; pressTimer = setTimeout(() => { if (!touchMoved) handleProductLongPress(product); }, 500); }}
                    onTouchMove={(e) => { if (Math.abs((e.touches?.[0]?.clientY || 0) - touchStartY) > 10) { touchMoved = true; if (pressTimer) clearTimeout(pressTimer); } }}
                    onTouchEnd={() => { if (pressTimer) clearTimeout(pressTimer); }}
                    onTouchCancel={() => { if (pressTimer) clearTimeout(pressTimer); }}
                    disabled={isOutOfStock}
                    data-testid={`search-product-${product.id}`}
                    className={`group relative border-2 transition-all rounded-xl flex flex-col justify-between ${largeMode ? 'p-3 md:p-2' : 'p-2 md:p-1.5'} min-h-[5rem] md:min-h-[5rem] lg:min-h-[5.625rem] text-left ${
                      isOutOfStock 
                        ? 'bg-card/50 border-red-500/50 opacity-60 cursor-not-allowed' 
                        : product.button_bg_color
                          ? 'border-transparent hover:brightness-110 active:scale-[0.97] shadow-md'
                          : 'bg-card border-border hover:border-primary/50 active:scale-[0.97]'
                    }`}
                    style={product.button_bg_color && !isOutOfStock ? { backgroundColor: product.button_bg_color } : {}}
                  >
                    <span className={`font-semibold leading-tight line-clamp-2 block ${largeMode ? 'text-sm md:text-xs' : 'text-xs md:text-[11px]'}`}>{product.name}</span>
                    <span className={`text-[10px] text-muted-foreground truncate block`}>{catName}</span>
                    <span className={`font-oswald font-bold block mt-auto ${largeMode ? 'text-base md:text-sm' : 'text-sm md:text-xs'} ${product.button_bg_color ? '' : 'text-primary'}`}>{formatMoney(product.price)}</span>
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="px-3 py-1.5 rounded-lg bg-red-600/90 text-white text-xs font-bold uppercase">Agotado</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* No results message */}
          {!activeCat && showProductSearch && productSearchQuery.trim() && globalSearchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No se encontró "{productSearchQuery}"</p>
            </div>
          )}

          {/* Category Grid (when no category selected and not searching) */}
          {!activeCat && !(showProductSearch && productSearchQuery.trim()) && (
            <div 
              className={`p-3 grid ${largeMode ? 'gap-3' : 'gap-2.5'} auto-fill-grid`}
              style={{ gridTemplateColumns: `repeat(${device?.isMobile ? 2 : Math.min(gridSettings.categoryColumns, 3)}, minmax(0, 1fr))` }}
              data-testid="category-grid"
            >
              {categories.map((cat, idx) => {
                const catProductCount = products.filter(p => p.category_id === cat.id).length;
                
                // Smart color palette — beautiful, solid, distinguishable
                const AUTO_PALETTE = [
                  '#2563EB', // Royal Blue
                  '#DC2626', // Cherry Red
                  '#059669', // Emerald
                  '#D97706', // Amber
                  '#7C3AED', // Violet
                  '#DB2777', // Rose
                  '#0891B2', // Cyan
                  '#CA8A04', // Gold
                  '#4F46E5', // Indigo
                  '#E11D48', // Crimson
                  '#0D9488', // Teal
                  '#EA580C', // Burnt Orange
                ];
                const color = cat.color || AUTO_PALETTE[idx % AUTO_PALETTE.length];
                const textColor = getContrastText(color);
                
                let catTouchStartY = 0;
                let catTouchMoved = false;

                return (
                  <button key={cat.id}
                    onClick={(e) => { if (catTouchMoved) { e.preventDefault(); return; } setActiveCat(cat.id); }}
                    onTouchStart={(e) => { catTouchStartY = e.touches?.[0]?.clientY || 0; catTouchMoved = false; }}
                    onTouchMove={(e) => { if (Math.abs((e.touches?.[0]?.clientY || 0) - catTouchStartY) > 10) catTouchMoved = true; }}
                    data-testid={`cat-card-${cat.id}`}
                    data-contrast={textColor === '#FFFFFF' ? 'light' : 'dark'}
                    className={`relative rounded-xl border-0 transition-all active:scale-[0.97] shadow-lg hover:shadow-xl hover:brightness-110 ${largeMode ? 'p-3 md:p-2' : 'p-2 md:p-1.5'} min-h-[5rem] md:min-h-[5rem] lg:min-h-[6.25rem] text-left flex flex-col justify-between`}
                    style={{ backgroundColor: color }}>
                    <span className={`font-bold leading-tight ${largeMode ? 'text-lg md:text-sm' : 'text-base md:text-xs'}`}>{cat.name}</span>
                    <span className={`${largeMode ? 'text-sm md:text-xs' : 'text-xs md:text-xs'}`} style={{ opacity: 0.7 }}>{catProductCount} productos</span>
                    <div data-badge className={`absolute top-1.5 right-1.5 md:top-1 md:right-1 ${largeMode ? 'w-8 h-8 md:w-6 md:h-6' : 'w-7 h-7 md:w-5 md:h-5'} rounded-full flex items-center justify-center`}>
                      <span className={`font-oswald font-bold ${largeMode ? 'text-sm md:text-xs' : 'text-xs md:text-[11px]'}`}>{catProductCount}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Product Grid (when category selected) */}
          {/* Dynamic columns: max 3 on wider panel to avoid cramping */}
          {activeCat && (
            <div 
              className={`p-3 grid ${largeMode ? 'gap-3' : 'gap-2.5'} auto-fill-grid`}
              style={{ gridTemplateColumns: `repeat(${device?.isMobile ? 2 : Math.min(gridSettings.productColumns, 3)}, minmax(0, 1fr))` }}
              data-testid="product-grid"
            >
              {filteredProducts.map(product => {
                // Check modifiers from both old and new systems
                const assignmentIds = (product.modifier_assignments || []).map(a => a.group_id);
                const legacyIds = product.modifier_group_ids || [];
                const hasModifiers = [...new Set([...assignmentIds, ...legacyIds])].length > 0;
                let pressTimer = null;
                
                // Stock control logic
                const productStock = stockStatus[product.id];
                const isOutOfStock = !allowSaleWithoutStock && productStock && !productStock.in_stock;
                const isLowStock = productStock?.is_low_stock && !isOutOfStock;
                
                // Touch scroll protection: track if finger moved during touch
                let touchStartY = 0;
                let touchMoved = false;

                const handleTouchStart = (e) => {
                  if (isOutOfStock) return;
                  touchStartY = e.touches?.[0]?.clientY || 0;
                  touchMoved = false;
                  pressTimer = setTimeout(() => {
                    if (!touchMoved) handleProductLongPress(product);
                  }, 500);
                };

                const handleTouchMove = (e) => {
                  const y = e.touches?.[0]?.clientY || 0;
                  if (Math.abs(y - touchStartY) > 10) {
                    touchMoved = true;
                    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                  }
                };
                
                const handleTouchEnd = () => {
                  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                };

                const handleClick = (e) => {
                  // On touch devices, only fire if finger didn't move (not a scroll)
                  if (touchMoved) { e.preventDefault(); return; }
                  if (!isOutOfStock) handleProductClick(product);
                };
                
                return (
                  <button 
                    key={product.id} 
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    onMouseDown={() => { if (!isOutOfStock) pressTimer = setTimeout(() => handleProductLongPress(product), 500); }}
                    onMouseUp={handleTouchEnd}
                    onMouseLeave={handleTouchEnd}
                    disabled={isOutOfStock}
                    data-testid={`product-${product.id}`}
                    data-contrast={product.button_bg_color && !isOutOfStock ? (getContrastText(product.button_bg_color) === '#FFFFFF' ? 'light' : 'dark') : undefined}
                    className={`group relative border-2 transition-all rounded-xl flex flex-col justify-between ${largeMode ? 'p-3 md:p-2' : 'p-2 md:p-1.5'} min-h-[5rem] md:min-h-[5rem] lg:min-h-[5.625rem] text-left ${
                      isOutOfStock 
                        ? 'bg-card/50 border-red-500/50 opacity-60 cursor-not-allowed' 
                        : isLowStock
                          ? 'border-yellow-500/50 hover:border-yellow-500 active:scale-[0.97]'
                          : product.button_bg_color
                            ? 'border-transparent hover:brightness-110 active:scale-[0.97] shadow-md'
                            : 'bg-card border-border hover:border-primary/50 active:scale-[0.97]'
                    }`}
                    style={product.button_bg_color && !isOutOfStock ? { backgroundColor: product.button_bg_color } : {}}
                  >
                    {/* Imagen o Icono del producto */}
                    {(product.image_url || product.icon) ? (
                      <div className="flex items-center justify-center overflow-hidden mb-1 h-8 md:h-6">
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt="" 
                            className="h-full rounded-lg object-contain"
                            onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                          />
                        ) : product.icon && PRODUCT_ICON_MAP[product.icon] ? (
                          (() => {
                            const IconComponent = PRODUCT_ICON_MAP[product.icon];
                            return <IconComponent size={largeMode ? 22 : 18} className="text-primary/80" />;
                          })()
                        ) : null}
                      </div>
                    ) : null}
                    {/* Nombre arriba, precio al fondo */}
                    <span className={`font-semibold leading-tight line-clamp-3 block ${largeMode ? 'text-sm md:text-xs' : 'text-xs md:text-[11px]'} ${isOutOfStock ? 'text-muted-foreground' : ''}`}>{product.name}</span>
                    <span className={`font-oswald font-bold block mt-auto ${largeMode ? 'text-base md:text-sm' : 'text-sm md:text-xs'} ${isOutOfStock ? 'text-muted-foreground' : product.button_bg_color ? '' : 'text-primary'}`}>{formatMoney(product.price)}</span>
                    {hasModifiers && !isOutOfStock && <div className={`absolute top-2 right-2 ${largeMode ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full bg-primary/60`} title="Tiene modificadores" />}
                    
                    {/* Out of Stock Badge */}
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="px-3 py-1.5 rounded-lg bg-red-600/90 text-white text-xs font-bold uppercase tracking-wide shadow-lg">
                          Agotado
                        </span>
                      </div>
                    )}
                    
                    {/* Low Stock Indicator */}
                    {isLowStock && !isOutOfStock && (
                      <div className={`absolute top-2 ${hasModifiers ? 'right-5' : 'right-2'}`}>
                        <AlertTriangle size={largeMode ? 16 : 14} className="text-yellow-500" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
      )}

      {/* Floating Quantity Keypad */}
      {showQtyKeypad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowQtyKeypad(false)}>
          <div 
            className="bg-card border-2 border-primary/50 rounded-2xl p-4 shadow-2xl w-72"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Display */}
            <div className="bg-background rounded-xl border border-border p-3 mb-3 text-center">
              {qtyKeypadExtended ? (
                <span className="font-oswald text-4xl font-bold text-primary">
                  {qtyKeypadValue || '0'}
                </span>
              ) : (
                <span className="font-oswald text-lg text-muted-foreground">
                  Selecciona cantidad
                </span>
              )}
            </div>

            {qtyKeypadExtended ? (
              /* Extended Mode - Full Keypad */
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'DEL'].map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === 'DEL') {
                          setQtyKeypadValue(prev => prev.slice(0, -1));
                        } else if (key === '.') {
                          if (!qtyKeypadValue.includes('.')) {
                            setQtyKeypadValue(prev => prev + '.');
                          }
                        } else {
                          setQtyKeypadValue(prev => prev + key);
                        }
                      }}
                      className={`h-14 rounded-xl font-oswald text-xl font-bold transition-all active:scale-95 ${
                        key === 'DEL' 
                          ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                          : 'bg-muted hover:bg-primary/20'
                      }`}
                    >
                      {key === 'DEL' ? '⌫' : key}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => {
                      setQtyKeypadExtended(false);
                      setQtyKeypadValue('');
                    }}
                    className="h-12 rounded-xl font-oswald font-bold text-sm bg-muted hover:bg-muted/80 transition-all"
                  >
                    ← Volver
                  </button>
                  <button
                    onClick={() => {
                      const qty = parseFloat(qtyKeypadValue);
                      if (qty > 0) {
                        setPresetQty(qty);
                        setShowQtyKeypad(false);
                        setQtyKeypadExtended(false);
                        setQtyKeypadValue('');
                      }
                    }}
                    className="h-12 rounded-xl font-oswald font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                  >
                    OK ✓
                  </button>
                </div>
              </div>
            ) : (
              /* Quick Mode - Numbers 1-9 + Extended */
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      onClick={() => {
                        setPresetQty(num);
                        setShowQtyKeypad(false);
                      }}
                      className="h-14 rounded-xl font-oswald text-2xl font-bold bg-muted hover:bg-primary hover:text-primary-foreground transition-all active:scale-95"
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => {
                      setQtyKeypadExtended(true);
                      setQtyKeypadValue('');
                    }}
                    className="h-12 rounded-xl font-oswald font-bold text-lg bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2"
                  >
                    10+ <span className="text-xl">›</span>
                  </button>
                  <button
                    onClick={() => {
                      setPresetQty(0);
                      setShowQtyKeypad(false);
                    }}
                    className="h-12 rounded-xl font-oswald font-bold text-sm bg-destructive/20 text-destructive hover:bg-destructive/30 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Dialog with Numpad - TOUCH FRIENDLY */}
      <Dialog open={modDialog.open} onOpenChange={(open) => !open && setModDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-lg bg-card border-border p-5" data-testid="modifier-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-lg">{modDialog.product?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 scrollbar-thin">
            {/* Simple quantity display - no keypad, use # button for custom qty */}
            <div className="bg-background rounded-xl border border-border p-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Cantidad:</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setModDialog(p => ({ ...p, qty: String(Math.max(1, (parseInt(p.qty) || 1) - 1)) }))}
                  className="w-9 h-9 rounded-lg bg-muted hover:bg-destructive/20 font-bold text-lg active:scale-95 transition-all">-</button>
                <span className="font-oswald text-2xl font-bold text-primary w-10 text-center" data-testid="qty-display">{modDialog.qty || '1'}</span>
                <button onClick={() => setModDialog(p => ({ ...p, qty: String((parseInt(p.qty) || 1) + 1) }))}
                  className="w-9 h-9 rounded-lg bg-muted hover:bg-primary/20 font-bold text-lg active:scale-95 transition-all">+</button>
              </div>
            </div>

            {(() => {
              // Get all modifier group IDs from both old and new systems
              const assignmentIds = (modDialog.product?.modifier_assignments || []).map(a => a.group_id);
              const legacyIds = modDialog.product?.modifier_group_ids || [];
              const allModifierIds = [...new Set([...assignmentIds, ...legacyIds])];
              
              return modifierGroups.filter(mg => allModifierIds.includes(mg.id)).map(group => {
                // Check if required from assignment or from group itself
                const assignment = (modDialog.product?.modifier_assignments || []).find(a => a.group_id === group.id);
                const isRequired = assignment ? assignment.min_selections > 0 : group.required;
                const maxSelections = assignment ? assignment.max_selections : group.max_selections;
                
                return (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold">{group.name}</span>
                  {isRequired && <Badge variant="destructive" className="text-xs h-5 px-2">Requerido</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.options.map(opt => {
                    const isSelected = (modDialog.selectedMods[group.id] || []).some(m => m.id === opt.id);
                    return (
                      <button key={opt.id} onClick={() => {
                        setModDialog(prev => {
                          const current = prev.selectedMods[group.id] || [];
                          const updated = maxSelections === 1 ? (isSelected ? [] : [opt]) : (isSelected ? current.filter(m => m.id !== opt.id) : [...current, opt]);
                          return { ...prev, selectedMods: { ...prev.selectedMods, [group.id]: updated } };
                        });
                      }} className={`p-3 rounded-xl text-left transition-all border-2 active:scale-95 min-h-[60px] ${
                        isSelected ? 'border-primary bg-primary/15 text-primary shadow-md' : 'border-border bg-background hover:border-primary/50'
                      }`}>
                        <span className="block font-semibold text-sm">{opt.name}</span>
                        {opt.price > 0 && <span className="text-primary font-oswald text-sm mt-1 block">+{formatMoney(opt.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
                );
              });
            })()}

            <input value={modDialog.notes} onChange={e => setModDialog(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas especiales..." className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm" data-testid="item-notes-input" />
          </div>
          <Button onClick={handleConfirmModifiers} data-testid="confirm-modifiers-btn"
            disabled={!modDialog.qty || modDialog.qty === '0'}
            className="w-full h-14 bg-primary text-primary-foreground font-oswald font-bold text-lg tracking-wider active:scale-95 mt-3 disabled:opacity-40">
            AGREGAR ({formatMoney((modDialog.product?.price || 0) * (parseInt(modDialog.qty) || 0))})
          </Button>
          
          {/* Required Modifiers Alert - Inside Dialog */}
          {requiredAlert.open && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg overflow-hidden" style={{ zIndex: 100 }}>
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
              
              {/* Alert Card */}
              <div className="relative w-full mx-4 animate-in zoom-in-95 duration-200">
                <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-2xl blur opacity-50 animate-pulse" />
                <div className="relative bg-slate-900 rounded-2xl border border-white/20 p-5">
                  {/* Icon */}
                  <div className="flex justify-center mb-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center shadow-lg">
                      <AlertTriangle size={28} className="text-white" />
                    </div>
                  </div>
                  
                  <h3 className="text-center font-oswald text-lg font-bold text-white mb-2">
                    ¡Selección Requerida!
                  </h3>
                  
                  <p className="text-center text-white/60 text-xs mb-3">
                    Debes elegir una opción en:
                  </p>
                  
                  <div className="space-y-1.5 mb-4">
                    {requiredAlert.missingGroups.map((group, index) => (
                      <div key={group.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-400/30">
                        <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                          <span className="text-red-400 font-bold text-xs">{index + 1}</span>
                        </div>
                        <span className="text-white text-sm font-medium">{group.name}</span>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setRequiredAlert({ open: false, missingGroups: [] })}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-oswald font-bold transition-all active:scale-95 shadow-lg"
                  >
                    ¡Entendido!
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Partial Void Dialog */}
      <Dialog open={partialVoidDialog.open} onOpenChange={(open) => !open && setPartialVoidDialog({ open: false, item: null, qtyToVoid: 1 })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="partial-void-dialog" style={{ backdropFilter: 'blur(20px)', background: 'rgba(var(--card-rgb, 30,30,40), 0.85)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-500" /> 
              Anulacion Parcial
            </DialogTitle>
          </DialogHeader>
          {partialVoidDialog.item && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cuantas unidades desea anular de <strong className="text-foreground">{partialVoidDialog.item.product_name}</strong>?
              </p>
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-center gap-4">
                <button
                  onClick={() => setPartialVoidDialog(p => ({ ...p, qtyToVoid: Math.max(1, p.qtyToVoid - 1) }))}
                  data-testid="partial-void-minus"
                  className="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 font-bold text-xl hover:bg-red-500/30 active:scale-90 transition-all"
                >-</button>
                <span className="font-oswald text-4xl font-bold text-primary w-16 text-center" data-testid="partial-void-qty">
                  {partialVoidDialog.qtyToVoid}
                </span>
                <button
                  onClick={() => setPartialVoidDialog(p => ({ ...p, qtyToVoid: Math.min(p.item.quantity, p.qtyToVoid + 1) }))}
                  data-testid="partial-void-plus"
                  className="w-12 h-12 rounded-xl bg-green-500/20 text-green-400 font-bold text-xl hover:bg-green-500/30 active:scale-90 transition-all"
                >+</button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {partialVoidDialog.qtyToVoid} de {partialVoidDialog.item.quantity} | Quedan: <strong className="text-foreground">{partialVoidDialog.item.quantity - partialVoidDialog.qtyToVoid}</strong>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPartialVoidDialog({ open: false, item: null, qtyToVoid: 1 })}
                  className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 text-muted-foreground font-semibold hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePartialVoidConfirm}
                  data-testid="partial-void-confirm"
                  className="flex-1 h-11 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-oswald font-bold active:scale-95 transition-all"
                >
                  ANULAR ({partialVoidDialog.qtyToVoid})
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog - Enhanced VoidReasonModal */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => !open && resetCancelDialog()}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <AlertTriangle size={18} className="text-destructive" /> 
              {cancelDialog.mode === 'multiple' 
                ? `Anular ${cancelDialog.itemIds.length} Items` 
                : 'Anular Item'}
            </DialogTitle>
          </DialogHeader>
          
          {/* Manager PIN Entry View */}
          {cancelDialog.showManagerPin ? (
            <div className="space-y-4">
              <div className="text-center py-2">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-500/10 mb-3">
                  <Lock size={28} className="text-yellow-500" />
                </div>
                <h3 className="font-oswald text-base font-bold">Autorización de Gerente</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Esta anulación requiere PIN de administrador (1-8 dígitos)
                </p>
              </div>
              
              {/* PIN Display - 8 circles like Login */}
              <div className="flex justify-center gap-2 py-3">
                {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                  <div 
                    key={i} 
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      cancelDialog.managerPin.length > i 
                        ? 'bg-primary border-primary scale-110 shadow-lg shadow-primary/30' 
                        : 'bg-transparent border-muted-foreground/40'
                    }`}
                  />
                ))}
              </div>
              
              {/* Error Message */}
              {cancelDialog.managerAuthError && (
                <p className="text-center text-xs text-destructive font-medium animate-shake">
                  {cancelDialog.managerAuthError}
                </p>
              )}
              
              {/* Numeric Keypad - Updated for 1-8 digits, no leading zero */}
              <div className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', '⌫'].map(key => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === 'CLR') {
                        setCancelDialog(prev => ({ ...prev, managerPin: '', managerAuthError: '' }));
                      } else if (key === '⌫') {
                        setCancelDialog(prev => ({ ...prev, managerPin: prev.managerPin.slice(0, -1), managerAuthError: '' }));
                      } else if (cancelDialog.managerPin.length < 8) {
                        // Prevent leading zero
                        if (key === '0' && cancelDialog.managerPin.length === 0) {
                          setCancelDialog(prev => ({ ...prev, managerAuthError: 'PIN no puede iniciar con 0' }));
                          return;
                        }
                        const newPin = cancelDialog.managerPin + key;
                        setCancelDialog(prev => ({ ...prev, managerPin: newPin, managerAuthError: '' }));
                      }
                    }}
                    className={`h-14 rounded-xl font-oswald text-xl font-bold transition-all active:scale-95 ${
                      key === 'CLR' ? 'bg-muted text-muted-foreground text-sm' :
                      key === '⌫' ? 'bg-muted text-muted-foreground' :
                      'bg-background border-2 border-border hover:border-primary/50'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
              
              {/* Verify Button - Enabled when 1+ digits */}
              <Button 
                onClick={verifyManagerPin}
                disabled={cancelDialog.managerPin.length < 1}
                className="w-full h-12 bg-primary text-primary-foreground font-oswald font-bold active:scale-95"
              >
                VERIFICAR PIN
              </Button>
              
              {/* Back Button */}
              <Button 
                variant="outline" 
                onClick={() => setCancelDialog(prev => ({ ...prev, showManagerPin: false, managerPin: '', managerAuthError: '' }))}
                className="w-full font-oswald"
              >
                <X size={14} className="mr-1" /> Volver
              </Button>
            </div>
          ) : (
            /* Normal Cancel Dialog View */
            <div className="space-y-4">
              {/* Reason Selector */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Razón de Anulación</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {cancelReasons.map(reason => (
                    <button 
                      key={reason.id} 
                      onClick={() => handleReasonSelect(reason.id)} 
                      data-testid={`cancel-reason-${reason.id}`}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-all active:scale-[0.98] ${
                        cancelDialog.selectedReasonId === reason.id 
                          ? 'border-destructive bg-destructive/10' 
                          : 'border-border bg-background hover:border-destructive/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium flex-1">{reason.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {reason.requires_manager_auth && (
                            <Badge variant="outline" className="text-[11px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                              <Lock size={8} className="mr-0.5" /> Auth
                            </Badge>
                          )}
                          {reason.return_to_inventory ? (
                            <Badge variant="outline" className="text-[11px] bg-green-500/10 text-green-500 border-green-500/30">
                              <RotateCcw size={10} className="mr-1" /> Retorna
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[11px] bg-red-500/10 text-red-500 border-red-500/30">
                              <Ban size={10} className="mr-1" /> Merma
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Manager Auth Required Notice */}
              {cancelDialog.requiresManagerAuth && (
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                  cancelDialog.authorizedBy 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : 'bg-yellow-500/10 border-yellow-500/30'
                }`}>
                  {cancelDialog.authorizedBy ? (
                    <>
                      <Check size={16} className="text-green-500" />
                      <span className="text-sm text-green-500 font-semibold flex-1">
                        Autorizado por: {cancelDialog.authorizedBy.name}
                        {cancelDialog.authorizedBy.is_superuser && <span className="text-xs ml-1">(Superusuario)</span>}
                      </span>
                      <Badge variant="outline" className="text-[11px] bg-green-500/20 text-green-400 border-green-500/40">
                        ✓ Verificado
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Lock size={16} className="text-yellow-500" />
                      <span className="text-sm text-yellow-500 flex-1">
                        Esta razón requiere autorización de gerente
                      </span>
                      <Button 
                        size="sm"
                        onClick={() => setCancelDialog(prev => ({ ...prev, showManagerPin: true }))}
                        className="h-8 bg-yellow-600 hover:bg-yellow-500 text-black font-oswald font-bold text-xs"
                        data-testid="open-pin-keypad-btn"
                      >
                        <Lock size={12} className="mr-1" /> Ingresar PIN
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Comments Field */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Comentarios (opcional)
                </label>
                <textarea 
                  value={cancelDialog.comments}
                  onChange={(e) => setCancelDialog(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Detalles adicionales..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm resize-none focus:outline-none focus:border-destructive/50"
                  data-testid="cancel-comments"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={resetCancelDialog}
                  className="flex-1 font-oswald"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCancelItem}
                  disabled={!cancelDialog.selectedReasonId || (cancelDialog.requiresManagerAuth && !cancelDialog.authorizedBy)}
                  className={`flex-1 font-oswald font-bold ${
                    cancelDialog.authorizedBy 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-destructive hover:bg-destructive/90 text-white'
                  }`}
                  data-testid="confirm-cancel-btn"
                >
                  {cancelDialog.authorizedBy ? (
                    <><Check size={14} className="mr-1" /> Confirmar Anulación</>
                  ) : (
                    <><Trash2 size={14} className="mr-1" /> Anular</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pre-Check Print Preview */}
      <Dialog open={preCheckOpen} onOpenChange={setPreCheckOpen}>
        <DialogContent className="max-w-sm bg-white text-black" data-testid="pre-check-dialog">
          <DialogHeader><DialogTitle className="text-black font-oswald">Pre-Cuenta</DialogTitle></DialogHeader>
          <div className="receipt-paper p-2" style={{maxWidth: '72mm', margin: '0 auto'}} dangerouslySetInnerHTML={{ __html: preCheckHtml }} />
          <Button onClick={handlePrintPreCheckToPhysical} className="w-full h-11 bg-gray-900 text-white font-oswald font-bold active:scale-95" data-testid="print-precheck-btn">
            <Printer size={16} className="mr-2" /> IMPRIMIR PRE-CUENTA
          </Button>
        </DialogContent>
      </Dialog>

      {/* Manager PIN Authorization Dialog - Updated for 8-digit PIN */}
      <Dialog open={managerPinDialog.open} onOpenChange={(o) => !o && setManagerPinDialog({ open: false, pin: '', error: '' })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="manager-pin-dialog">
          <DialogHeader><DialogTitle className="font-oswald flex items-center gap-2">
            <Lock size={18} className="text-yellow-500" /> Autorizacion de Gerente
          </DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">
              Esta pre-cuenta ya fue impresa. Se requiere PIN de gerente para reimprimir (1-8 dígitos).
            </p>
            
            {/* PIN Display - 8 circles */}
            <div className="flex justify-center gap-2 py-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                <div 
                  key={i} 
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                    managerPinDialog.pin.length > i 
                      ? 'bg-yellow-500 border-yellow-500 scale-110 shadow-lg shadow-yellow-500/30' 
                      : 'bg-transparent border-muted-foreground/40'
                  }`}
                />
              ))}
            </div>
            
            {/* Error Message */}
            {managerPinDialog.error && (
              <p className="text-center text-xs text-destructive font-medium">
                {managerPinDialog.error}
              </p>
            )}
            
            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', '⌫'].map(key => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === 'CLR') {
                      setManagerPinDialog(p => ({ ...p, pin: '', error: '' }));
                    } else if (key === '⌫') {
                      setManagerPinDialog(p => ({ ...p, pin: p.pin.slice(0, -1), error: '' }));
                    } else if (managerPinDialog.pin.length < 8) {
                      // Prevent leading zero
                      if (key === '0' && managerPinDialog.pin.length === 0) {
                        setManagerPinDialog(p => ({ ...p, error: 'PIN no puede iniciar con 0' }));
                        return;
                      }
                      setManagerPinDialog(p => ({ ...p, pin: p.pin + key, error: '' }));
                    }
                  }}
                  className={`h-14 rounded-xl font-oswald text-xl font-bold transition-all active:scale-95 ${
                    key === 'CLR' ? 'bg-muted text-muted-foreground text-sm' :
                    key === '⌫' ? 'bg-muted text-muted-foreground' :
                    'bg-background border-2 border-border hover:border-yellow-500/50'
                  }`}
                  data-testid={`manager-pin-key-${key === '⌫' ? 'del' : key.toLowerCase()}`}
                >
                  {key}
                </button>
              ))}
            </div>
            
            <Button 
              onClick={handleManagerAuth} 
              disabled={!managerPinDialog.pin || managerPinDialog.pin.length < 1}
              className="w-full h-12 bg-yellow-600 hover:bg-yellow-500 text-black font-oswald font-bold active:scale-95" 
              data-testid="confirm-manager-pin"
            >
              AUTORIZAR RE-IMPRESION
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Table Dialog */}
      <Dialog open={moveDialog.open} onOpenChange={(o) => !o && setMoveDialog({ open: false })}>
        <DialogContent className="max-w-lg bg-card border-border" data-testid="move-table-dialog">
          <DialogHeader><DialogTitle className="font-oswald flex items-center gap-2">
            <MoveRight size={18} className="text-primary" /> Mover a otra Mesa
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground mb-2">
              Selecciona la mesa destino. Si está ocupada, se te preguntará si deseas unir las cuentas.
            </p>
            {allAreas.map(area => (
              <div key={area.id}>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: area.color }} />
                  {area.name}
                </h4>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {allTables.filter(t => t.area_id === area.id && t.id !== tableId).map(t => {
                    const isFree = t.status === 'free';
                    const isDivided = t.status === 'divided';
                    const isOccupied = t.status === 'occupied' || t.status === 'billed';
                    const isReserved = t.status === 'reserved';
                    const isOtherUser = t.owner_id && t.owner_id !== user?.id;
                    
                    // Determine color based on status and ownership
                    let colorClass = 'border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/20'; // Free
                    let statusText = 'Libre';
                    
                    if (isReserved) {
                      colorClass = 'border-purple-500/50 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20';
                      statusText = 'Reservada';
                    } else if (isDivided) {
                      colorClass = isOtherUser 
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                        : 'border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20';
                      statusText = 'Dividida';
                    } else if (isOccupied) {
                      colorClass = isOtherUser
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                        : 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20';
                      statusText = isOtherUser ? 'De otro' : 'Ocupada';
                    }
                    
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (isReserved) {
                            setReservedAlert({ open: true, tableNumber: t.number });
                            return;
                          }
                          handleMoveTable(t.id);
                        }}
                        className={`p-2 rounded-lg text-center font-oswald transition-all border ${colorClass}`}
                      >
                        <span className="text-sm font-bold">#{t.number}</span>
                        <span className="block text-[8px] mt-0.5">{statusText}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Confirmation Dialog */}
      <Dialog open={mergeConfirm.open} onOpenChange={(o) => !o && setMergeConfirm({ open: false, targetTableId: null, targetTableNumber: null })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="merge-confirm-dialog">
          <DialogHeader><DialogTitle className="font-oswald flex items-center gap-2">
            <Users size={18} className="text-yellow-500" /> ¿Unir Cuentas?
          </DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
              <p className="text-sm text-center">
                La <strong className="text-primary">Mesa #{mergeConfirm.targetTableNumber}</strong> ya tiene una cuenta activa.
              </p>
              <p className="text-xs text-muted-foreground text-center mt-2">
                ¿Deseas unir todos los artículos de esta mesa con la mesa destino?
              </p>
            </div>
            <div className="text-center text-sm">
              <div className="flex items-center justify-center gap-3">
                <div className="px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="font-oswald text-lg text-primary">Mesa #{table?.number}</span>
                  <span className="block text-xs text-muted-foreground">{activeItems.length} items</span>
                </div>
                <MoveRight size={20} className="text-primary" />
                <div className="px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="font-oswald text-lg text-yellow-400">Mesa #{mergeConfirm.targetTableNumber}</span>
                  <span className="block text-xs text-muted-foreground">Ocupada</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setMergeConfirm({ open: false, targetTableId: null, targetTableNumber: null })}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmMerge}
                className="flex-1 bg-yellow-600 text-black font-oswald font-bold"
              >
                <Users size={14} className="mr-1" /> UNIR CUENTAS
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reserved Table Alert */}
      <Dialog open={reservedAlert.open} onOpenChange={(o) => !o && setReservedAlert({ open: false, tableNumber: null })}>
        <DialogContent className="max-w-sm bg-card border-purple-500/50">
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
              <Lock size={32} className="text-purple-400" />
            </div>
            <div>
              <h3 className="font-oswald text-xl font-bold text-purple-400">Mesa #{reservedAlert.tableNumber}</h3>
              <p className="text-lg font-semibold mt-2">Esta mesa está Reservada</p>
              <p className="text-muted-foreground mt-1">Contacte al Administrador</p>
            </div>
            <Button 
              onClick={() => setReservedAlert({ open: false, tableNumber: null })}
              className="bg-purple-600 hover:bg-purple-700 text-white font-oswald"
            >
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Accounts Dialog */}
      <Dialog open={mergeAccountsDialog.open} onOpenChange={(o) => !o && setMergeAccountsDialog({ open: false, sourceOrderId: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-oswald flex items-center gap-2">
              <Merge size={18} className="text-blue-400" /> Unir Cuentas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecciona la cuenta a la que deseas unir la <strong>Cuenta #{order?.account_number || tableOrders.find(o => o.id === mergeAccountsDialog.sourceOrderId)?.account_number || 1}</strong>:
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tableOrders
                .filter(o => o.id !== mergeAccountsDialog.sourceOrderId)
                .map(ord => {
                  const itemCount = ord.items?.filter(i => i.status !== 'cancelled').length || 0;
                  const total = getOrderTotal(ord);
                  return (
                    <button
                      key={ord.id}
                      onClick={() => mergeAccounts(ord.id)}
                      data-testid={`merge-target-${ord.account_number || 1}`}
                      className="w-full p-3 rounded-lg border border-border bg-card hover:border-blue-500 hover:bg-blue-500/10 transition-all flex items-center justify-between"
                    >
                      <div className="text-left">
                        <span className="font-oswald font-bold">Cuenta #{ord.account_number || 1}</span>
                        <span className="text-xs text-muted-foreground ml-2">({itemCount} items)</span>
                      </div>
                      <span className="text-sm font-oswald text-primary">RD$ {total.toLocaleString()}</span>
                    </button>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Los items de la cuenta actual se moverán a la cuenta seleccionada
            </p>
            <Button 
              variant="outline" 
              onClick={() => setMergeAccountsDialog({ open: false, sourceOrderId: null })}
              className="w-full"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Account Label Dialog */}
      {/* ═══ B04 REDIRECT DIALOG - Cuenta Cerrada ═══ */}
      <Dialog open={b04RedirectDialog.open} onOpenChange={(o) => !o && setB04RedirectDialog({ open: false, transactionNumber: null, ncf: null, total: 0, paidAt: null })}>
        <DialogContent className="max-w-md backdrop-blur-xl bg-slate-900/95 border-amber-500/30" data-testid="b04-redirect-dialog">
          <DialogHeader>
            <DialogTitle className="font-oswald text-xl text-amber-400 flex items-center gap-2">
              <AlertTriangle size={24} />
              Cuenta Ya Facturada
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Alerta Visual */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-amber-200 text-sm leading-relaxed">
                Esta cuenta ya fue <strong>facturada y pagada</strong>. Para anularla, debe generar una{' '}
                <strong>Nota de Crédito (NCF B04)</strong> que afecte el comprobante fiscal original.
              </p>
            </div>
            
            {/* Información de la Factura */}
            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">Transacción:</span>
                <span className="text-white font-oswald font-bold text-lg">#{b04RedirectDialog.transactionNumber}</span>
              </div>
              {b04RedirectDialog.ncf && (
                <div className="flex justify-between items-center">
                  <span className="text-white/60 text-sm">NCF:</span>
                  <span className="text-green-400 font-mono text-sm">{b04RedirectDialog.ncf}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">Total:</span>
                <span className="text-white font-oswald">RD$ {b04RedirectDialog.total?.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
              </div>
              {b04RedirectDialog.paidAt && (
                <div className="flex justify-between items-center">
                  <span className="text-white/60 text-sm">Fecha Pago:</span>
                  <span className="text-white/80 text-sm">{new Date(b04RedirectDialog.paidAt).toLocaleDateString('es-DO')}</span>
                </div>
              )}
            </div>
            
            {/* Acciones */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setB04RedirectDialog({ open: false, transactionNumber: null, ncf: null, total: 0, paidAt: null })}
                className="flex-1 font-oswald border-white/20 text-white/70 hover:bg-white/10"
              >
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  // Navegar a Caja con el número de transacción para B04
                  const transNum = b04RedirectDialog.transactionNumber;
                  setB04RedirectDialog({ open: false, transactionNumber: null, ncf: null, total: 0, paidAt: null });
                  // Guardar en sessionStorage para que CashRegister lo recoja
                  if (transNum) {
                    sessionStorage.setItem('pendingB04Transaction', transNum.toString());
                  }
                  navigate('/cash-register?openB04=true');
                }}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-oswald font-bold"
                data-testid="go-to-b04-btn"
              >
                <Receipt size={18} className="mr-2" />
                Ir a Crear B04
              </Button>
            </div>
            
            {/* Nota informativa */}
            <p className="text-white/40 text-xs text-center">
              Solo los administradores pueden generar Notas de Crédito (B04)
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Table Modal */}
      <TransferTableModal
        open={transferDialogOpen}
        onClose={(success) => { setTransferDialogOpen(false); if (success) navigate('/tables'); }}
        tableId={tableId}
        currentUserId={user?.id}
        currentUserName={user?.name}
      />

    </>
    )}

    {/* ═══ ACCOUNT LABEL DIALOG - Always rendered (used by selector + order view) ═══ */}
    <Dialog open={accountLabelDialog.open} onOpenChange={(o) => !o && setAccountLabelDialog({ open: false, label: '', action: null, itemIds: [] })}>
      <DialogContent className="max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <SplitSquareHorizontal size={18} className="text-green-400" /> 
            {accountLabelDialog.action === 'split' ? 'Nueva Cuenta (Dividir)' : 'Nueva Cuenta'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              Etiqueta / Nombre (Opcional)
            </label>
            <input
              type="text"
              value={accountLabelDialog.label}
              onChange={(e) => setAccountLabelDialog(prev => ({ ...prev, label: e.target.value }))}
              placeholder="Ej: Juan, María, Grupo VIP..."
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              data-testid="account-label-input"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Esta etiqueta aparecerá en la pre-cuenta y factura para identificar la cuenta.
            </p>
          </div>
          
          {accountLabelDialog.action === 'split' && accountLabelDialog.itemIds.length > 0 && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-sm text-green-400">
                <strong>{accountLabelDialog.itemIds.length}</strong> item(s) se moverán a la nueva cuenta
              </p>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={() => setAccountLabelDialog({ open: false, label: '', action: null, itemIds: [] })}
              className="font-oswald"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleAccountLabelConfirm}
              className="bg-green-600 hover:bg-green-700 text-white font-oswald font-bold"
              data-testid="confirm-account-label-btn"
            >
              Crear Cuenta
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* ═══ RENAME ACCOUNT DIALOG ═══ */}
    <Dialog open={renameDialog.open} onOpenChange={(o) => !o && setRenameDialog({ open: false, value: '' })}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <Pencil size={16} className="text-primary" /> {order?.account_label ? 'Editar Nombre' : 'Nombrar Cuenta'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <input
            type="text"
            value={renameDialog.value}
            onChange={(e) => setRenameDialog(prev => ({ ...prev, value: e.target.value }))}
            placeholder="Ej: Juan, María..."
            className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
            data-testid="rename-account-input"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setRenameDialog({ open: false, value: '' })} className="font-oswald">
              Cancelar
            </Button>
            <Button onClick={handleRenameAccount} className="bg-primary hover:bg-primary/90 text-primary-foreground font-oswald font-bold" data-testid="confirm-rename-btn">
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    </div>
  );
}
