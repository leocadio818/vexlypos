import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ordersAPI, categoriesAPI, productsAPI, modifiersAPI, reasonsAPI, tablesAPI, areasAPI, billsAPI, inventorySettingsAPI, posSessionsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, Send, Trash2, AlertTriangle, Receipt, Grid3X3, SplitSquareHorizontal, FileText, Printer, Lock, MoveRight, Users, Check, X, Plus, Merge, Hash, RotateCcw, Ban, MoreVertical, Percent, RefreshCw, ShoppingCart, Utensils, ShoppingBag, Truck, Pizza, Coffee, Sandwich, IceCream, Soup, Wine, Beer, Beef, Fish, Salad, Cookie, Cake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

export default function OrderScreen() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const { user, largeMode } = useAuth();
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
  
  // Move Items Mode
  const [moveItemsMode, setMoveItemsMode] = useState(false);
  const [selectedItemsToMove, setSelectedItemsToMove] = useState([]);
  
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
  
  // Required modifiers alert modal
  const [requiredAlert, setRequiredAlert] = useState({ open: false, missingGroups: [] });
  
  // Stock Control State
  const [stockStatus, setStockStatus] = useState({}); // { productId: { in_stock: bool, available_quantity: num } }
  const [allowSaleWithoutStock, setAllowSaleWithoutStock] = useState(true); // Default to true (no restrictions)
  const [stockLoading, setStockLoading] = useState(false);
  
  const orderRef = useRef(null);
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  const [accessDenied, setAccessDenied] = useState(null); // Stores error message if access denied

  const fetchOrder = useCallback(async () => {
    try {
      const tableRes = await tablesAPI.list();
      const t = tableRes.data.find(tb => tb.id === tableId);
      setTable(t);
      
      // Fetch ALL orders for this table
      try {
        const ordersRes = await ordersAPI.getTableOrders(tableId);
        const orders = ordersRes.data || [];
        setTableOrders(orders);
        setAccessDenied(null); // Clear any previous access denied
        
        if (orders.length > 0) {
          // If there's an active order selected, keep it; otherwise select first
          const currentOrder = activeOrderId 
            ? orders.find(o => o.id === activeOrderId) 
            : orders[0];
          if (currentOrder) {
            setOrder(currentOrder);
            setActiveOrderId(currentOrder.id);
            orderRef.current = currentOrder;
          }
        } else if (t?.active_order_id) {
          // Fallback: try to get order from table reference
          try {
            const orderRes = await ordersAPI.get(t.active_order_id);
            setOrder(orderRes.data);
            setActiveOrderId(orderRes.data.id);
            setTableOrders([orderRes.data]);
            orderRef.current = orderRes.data;
          } catch {}
        }
      } catch (orderError) {
        // Check if it's a 403 Forbidden error
        if (orderError.response?.status === 403) {
          setAccessDenied(orderError.response?.data?.detail || 'No tienes permiso para acceder a esta mesa');
          setOrder(null);
          setTableOrders([]);
        }
      }
    } catch {}
  }, [tableId, activeOrderId]);

  useEffect(() => {
    const fetchAll = async () => {
      const [catRes, prodRes, modRes, reasonRes] = await Promise.all([
        categoriesAPI.list(), productsAPI.list(), modifiersAPI.list(), reasonsAPI.list()
      ]);
      setCategories(catRes.data); setProducts(prodRes.data);
      setModifierGroups(modRes.data); setCancelReasons(reasonRes.data);
      // Fetch tax config
      try {
        const taxRes = await fetch(`${API_BASE}/api/tax-config`);
        const taxes = await taxRes.json();
        setTaxConfig(taxes.filter(t => t.active && t.rate > 0));
      } catch {}
      // Fetch sale types (with NCF defaults and tax exemptions) - 100% dynamic from DB
      try {
        const stRes = await fetch(`${API_BASE}/api/sale-types`);
        const stData = await stRes.json();
        // Sort by order field and filter active
        const sortedTypes = stData.filter(st => st.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
        setSaleTypes(sortedTypes);
        // Set initial sale type to first one (usually "Consumo Local")
        const initialSaleType = sortedTypes.find(st => st.code === 'consumo_local') || sortedTypes[0];
        setCurrentSaleType(initialSaleType);
        // Also set serviceType for compatibility
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
    fetchAll(); fetchOrder();
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
  const sendPendingToKitchenSilently = useCallback(async (showToast = false) => {
    const currentOrder = orderRef.current;
    if (!currentOrder) return false;
    const pendingItems = currentOrder.items?.filter(i => i.status === 'pending') || [];
    if (pendingItems.length === 0) return false;
    try {
      await ordersAPI.sendToKitchen(currentOrder.id);
      // Removed toast - silent auto-send
      console.log('Auto-enviado a cocina:', pendingItems.length, 'items');
      return true;
    } catch (e) {
      console.error('Error auto-enviando a cocina:', e);
      return false;
    }
  }, []);

  // Intercept all navigation clicks to send pending items first
  useEffect(() => {
    const handleNavClick = async (e) => {
      // Check if click is on a navigation link
      const link = e.target.closest('a[href]');
      if (!link) return;
      
      const href = link.getAttribute('href');
      // Only intercept internal navigation away from order screen
      if (href && !href.startsWith('/order/') && href !== '#') {
        const currentOrder = orderRef.current;
        console.log('Nav click intercepted, order:', currentOrder?.id, 'pending:', currentOrder?.items?.filter(i => i.status === 'pending')?.length);
        if (currentOrder) {
          const pendingItems = currentOrder.items?.filter(i => i.status === 'pending') || [];
          if (pendingItems.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            try {
              await ordersAPI.sendToKitchen(currentOrder.id);
              // Removed toast - silent auto-send
              console.log('Comanda enviada exitosamente');
            } catch (err) {
              console.error('Error enviando a cocina:', err);
            }
            // Navigate after sending
            navigate(href);
            return;
          }
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
    
    return () => {
      window.removeEventListener('openMoveTableDialog', handleOpenMoveDialog);
      window.removeEventListener('enterSplitMode', handleEnterSplitMode);
      window.removeEventListener('voidEntireOrder', handleVoidEntireOrder);
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
    await sendPendingToKitchenSilently(true); 
    navigate('/tables'); 
  };

  const filteredProducts = activeCat ? products.filter(p => p.category_id === activeCat) : [];

  const handleProductClick = (product) => {
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
      // EXPRESS VOID: All items are pending - direct deletion
      handleExpressVoid(itemIds);
    } else {
      // AUDIT PROTOCOL: Some items were sent - require reason and possibly PIN
      openBulkCancelDialog(itemIds, anyWasSent);
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
      
      if (mode === 'multiple' && itemIds.length > 0) {
        // Bulk cancellation
        res = await ordersAPI.cancelItems(order.id, {
          ...cancelData,
          item_ids: itemIds
        });
      } else {
        // Single item cancellation
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

  // Verify manager PIN
  const verifyManagerPin = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: JSON.stringify({ 
          pin: cancelDialog.managerPin,
          permission: 'void_items'  // Request specific permission for void/cancel
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        // Show specific error message for permission denied vs invalid PIN
        const errorMsg = data.detail || 'Error de autenticación';
        setCancelDialog(prev => ({ ...prev, managerAuthError: errorMsg, managerPin: '' }));
        return;
      }
      
      const data = await res.json();
      // Manager verified with correct permissions - mark as authorized but DON'T auto-submit
      // User must click "Anular" button to confirm
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
      const errorMsg = 'Error verificando PIN - intenta de nuevo';
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

  // Handle reason selection - auto-set return_to_inventory and requiresManagerAuth
  const handleReasonSelect = (reasonId) => {
    const reason = cancelReasons.find(r => r.id === reasonId);
    setCancelDialog(prev => ({
      ...prev,
      selectedReasonId: reasonId,
      returnToInventory: reason?.return_to_inventory ?? prev.returnToInventory,
      requiresManagerAuth: reason?.requires_manager_auth ?? false,
      authorizedBy: null // Reset authorization when changing reason
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
    // If already printed, require manager PIN
    if (preCheckCount > 0) {
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
      return; // Silent - no items selected
    }
    if (!order) return;
    
    // Check if ALL items are selected - not allowed
    const allItemIds = activeItems.map(i => i.id);
    if (selectedSplitItems.length === allItemIds.length) {
      return; // Silent - use "Mover Mesa" instead
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
      return; // Silent - no items selected
    }
    const allItemIds = activeItems.map(i => i.id);
    if (selectedSplitItems.length === allItemIds.length) {
      return; // Silent - use "Mover Mesa" instead
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
    } catch (e) {
      console.warn(e.response?.data?.detail || 'Error creando nueva cuenta');
    }
  };

  // Open label dialog for new empty account
  const openNewAccountLabelDialog = () => {
    setAccountLabelDialog({ open: true, label: '', action: 'new', itemIds: [] });
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

  // Direct billing - create bill and go to payment
  const handleDirectBilling = async () => {
    try {
      // Validar turno abierto antes de cobrar
      try {
        const shiftCheck = await posSessionsAPI.check();
        if (!shiftCheck.data?.has_open_session) {
          toast.error('Debes abrir un turno de caja', {
            description: 'Ve a Caja / Turnos para abrir tu turno antes de cobrar.',
            duration: 6000
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
    <div className="h-full flex flex-col lg:flex-row-reverse" data-testid="order-screen">
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
        ${mobileAccountExpanded ? 'fixed inset-0 z-40 pb-16' : 'hidden lg:flex'} 
        w-full lg:w-[45%] xl:w-[35%] 
        border-b lg:border-b-0 lg:border-l border-white/10 
        flex flex-col backdrop-blur-xl bg-background/95 lg:bg-white/5 shrink-0
        lg:pb-0
      `}>
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (mobileAccountExpanded) {
                  setMobileAccountExpanded(false);
                } else if (splitMode) {
                  exitSplitMode();
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
              {accessDenied ? `Mesa ${table?.number || '?'}` : splitMode ? 'EDITAR CUENTA' : tableOrders.length > 1 ? `Mesa ${table?.number || '?'} - Cuenta #${order?.account_number || 1}` : `Mesa ${table?.number || '?'}`}
            </h2>
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
            <div className="flex items-center gap-1 p-2 border-b border-white/10 overflow-x-auto bg-white/5">
              {tableOrders.map(ord => {
                const isEmpty = isOrderEmpty(ord);
                const canDelete = isEmpty && tableOrders.length > 1 && !moveItemsMode;
                const hasItems = !isEmpty;
                const isCurrentOrder = activeOrderId === ord.id;
                const canMoveHere = moveItemsMode && !isCurrentOrder;
                
                return (
                  <div key={ord.id} className="relative flex items-center group">
                    {canMoveHere ? (
                      <button
                        onClick={() => moveItemsToAccount(ord.id)}
                        className="px-3 py-2 rounded-lg text-xs font-oswald whitespace-nowrap transition-all bg-purple-600 hover:bg-purple-500 text-white font-bold border-2 border-purple-400 animate-pulse"
                      >
                        → Mover aquí (#{ord.account_number || 1})
                      </button>
                    ) : (
                      <button
                        onClick={() => !moveItemsMode && selectOrder(ord.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-oswald whitespace-nowrap transition-all ${
                          isCurrentOrder 
                            ? moveItemsMode 
                              ? 'bg-yellow-600 text-black font-bold border-2 border-yellow-400' 
                              : 'bg-primary text-primary-foreground font-bold' 
                            : 'bg-card border border-border text-muted-foreground hover:border-primary/50'
                        } ${canDelete ? 'pr-7' : ''} ${hasItems && tableOrders.length > 1 && !moveItemsMode ? 'pr-8' : ''}`}
                        disabled={moveItemsMode}
                      >
                        {moveItemsMode && isCurrentOrder ? 'Desde aquí →' : `Cuenta #${ord.account_number || 1}`}
                        {!moveItemsMode && <span className="ml-1 text-[9px] opacity-70">({ord.items?.filter(i => i.status !== 'cancelled').length || 0})</span>}
                      </button>
                    )}
                    {/* Print pre-check button for accounts with items */}
                    {hasItems && tableOrders.length > 1 && !moveItemsMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintAccountPreCheck(ord.id, ord.account_number || 1);
                        }}
                        data-testid={`print-precheck-${ord.account_number || 1}`}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          isCurrentOrder 
                            ? 'bg-primary-foreground/20 hover:bg-primary-foreground/40 text-primary-foreground' 
                            : 'bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400'
                        }`}
                        title={`Imprimir pre-cuenta de Cuenta #${ord.account_number || 1}`}
                      >
                        <Printer size={10} />
                      </button>
                    )}
                    {/* Delete button for empty accounts */}
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEmptyAccount(ord.id, ord.account_number || 1);
                        }}
                        data-testid={`delete-account-${ord.account_number || 1}`}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-sm"
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

        {/* Split Mode View - Multiple Orders/Accounts */}
        {splitMode ? (
          <div className="flex-1 flex flex-col">
            {/* Orders/Accounts Tabs */}
            <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto">
              {tableOrders.map(ord => {
                const isEmpty = isOrderEmpty(ord);
                const canDelete = isEmpty && tableOrders.length > 1;
                return (
                  <div key={ord.id} className="relative flex items-center">
                    <button
                      onClick={() => selectOrder(ord.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-oswald whitespace-nowrap transition-all ${
                        activeOrderId === ord.id 
                          ? 'bg-primary text-primary-foreground font-bold' 
                          : 'bg-card border border-border text-muted-foreground hover:border-primary/50'
                      } ${canDelete ? 'pr-7' : ''}`}
                    >
                      Cuenta #{ord.account_number || 1}
                      <span className="ml-1 text-[9px] opacity-70">({ord.items?.filter(i => i.status !== 'cancelled').length || 0})</span>
                    </button>
                    {/* Delete button for empty accounts */}
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEmptyAccount(ord.id, ord.account_number || 1);
                        }}
                        data-testid={`delete-account-split-${ord.account_number || 1}`}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-sm"
                        title="Eliminar cuenta vacía"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Current Order Items - Select to move */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-muted-foreground">
                    Selecciona items para mover
                  </p>
                  {activeItems.length > 0 && (
                    <button
                      onClick={() => {
                        if (selectedSplitItems.length === activeItems.length) {
                          setSelectedSplitItems([]);
                        } else {
                          setSelectedSplitItems(activeItems.map(i => i.id));
                        }
                      }}
                      className="text-[10px] text-primary hover:underline font-semibold"
                    >
                      {selectedSplitItems.length === activeItems.length ? '✓ Deseleccionar todos' : '☐ Seleccionar todos'}
                    </button>
                  )}
                </div>
                {activeItems.length === 0 ? (
                  <div className="text-center py-8">
                    <Users size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Esta cuenta está vacía</p>
                  </div>
                ) : (
                  activeItems.map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => toggleSplitItem(item.id)}
                      className={`flex items-start gap-1.5 p-1.5 rounded-lg border cursor-pointer transition-all ${
                        selectedSplitItems.includes(item.id)
                          ? 'bg-red-500/20 border-red-500'
                          : 'bg-background/50 border-border/50 hover:border-primary/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-oswald text-xs font-bold text-primary">{item.quantity}x</span>
                          <span className="text-xs font-medium truncate">{item.product_name}</span>
                        </div>
                        {item.modifiers?.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {item.modifiers.map((m, i) => <Badge key={i} variant="secondary" className="text-[7px] h-3.5 px-1">{m.name}</Badge>)}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-oswald text-[11px]">{formatMoney(item.unit_price * item.quantity)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Action bar */}
            <div className="p-3 border-t border-border bg-card space-y-2">
              {selectedSplitItems.length > 0 ? (
                <>
                  <p className="text-xs text-center font-semibold text-red-400">
                    {selectedSplitItems.length} item(s) seleccionado(s)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      onClick={openSplitLabelDialog}
                      className="h-10 bg-green-600 hover:bg-green-700 text-white font-oswald font-bold text-xs"
                    >
                      <SplitSquareHorizontal size={12} className="mr-1" /> Nueva Cuenta
                    </Button>
                    {tableOrders.length > 1 && (
                      <Button 
                        onClick={enterMoveItemsMode}
                        className="h-10 bg-purple-600 hover:bg-purple-700 text-white font-oswald font-bold text-xs"
                      >
                        <MoveRight size={12} className="mr-1" /> Mover a Cuenta
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center">
                  Toca los items que deseas mover a otra cuenta
                </p>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Total Cuenta #{order?.account_number || 1}</span>
                <span className="font-oswald text-lg font-bold text-primary">
                  {formatMoney(getOrderTotal(order))}
                </span>
              </div>
            </div>
          </div>
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
                        {item.notes && <p className="text-[10px] text-yellow-500 mt-1 italic">📝 {item.notes}</p>}
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
                    </div>
                  )}
                </div>

                {/* Mobile view: State-based button flow */}
                {/* State logic based on mobileButtonState: */}
                {/* - 'initial': Show PRE-CUENTA (default, or after interruption rule) */}
                {/* - 'editing': Show ANULAR (when items selected - always interrupts) */}
                {/* - 'closing': Show FACTURAR (after PRE-CUENTA printed, until interrupted) */}
                <div className="lg:hidden">
                  {activeItems.length > 0 && (
                    <>
                      {/* State: Editing - Show ANULAR (when items selected) - highest priority */}
                      {selectedItems.length > 0 ? (
                        <Button 
                          onClick={() => {
                            triggerHaptic('strong'); // Strong feedback for void action
                            handleSmartVoid(selectedItems);
                          }}
                          size="lg" 
                          data-testid="void-selected-btn-mobile"
                          className="h-14 w-full bg-red-600 hover:bg-red-700 text-white font-oswald text-base font-bold"
                        >
                          <Ban size={18} className="mr-2" /> ANULAR ({selectedItems.length})
                        </Button>
                      ) : mobileButtonState === 'closing' ? (
                        /* State: Closing - Show FACTURAR */
                        <Button 
                          onClick={() => {
                            triggerHaptic('double'); // Double tap feedback for billing
                            handleDirectBilling();
                          }} 
                          size="lg" 
                          data-testid="go-to-billing-mobile"
                          className="h-14 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-oswald text-base font-bold"
                        >
                          <Receipt size={18} className="mr-2" /> FACTURAR
                        </Button>
                      ) : (
                        /* State: Initial - Show PRE-CUENTA */
                        <Button 
                          onClick={() => {
                            triggerHaptic('medium'); // Medium feedback for pre-check
                            handlePrintPreCheck();
                          }} 
                          variant="outline" 
                          size="lg" 
                          data-testid="pre-check-btn-mobile"
                          className="h-14 w-full text-base border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 font-oswald font-bold"
                        >
                          <FileText size={18} className="mr-2" /> PRE-CUENTA
                          {preCheckCount > 0 && <Lock size={12} className="ml-2 text-yellow-500" />}
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

      {/* Right (visually): Categories & Products - Now rendered first but appears on right */}
      {/* Hide on mobile when account is expanded */}
      {!splitMode && !accessDenied && !mobileAccountExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden">
        {/* Grid Settings Bar - Glassmorphism */}
        <div className={`flex items-center justify-between px-3 ${largeMode ? 'py-2.5' : 'py-2'} border-b border-white/10 backdrop-blur-xl bg-white/5`}>
          <div className="flex items-center gap-2">
            {activeCat ? (
              <button onClick={() => setActiveCat(null)} className={`flex items-center gap-1.5 text-orange-400 hover:underline font-semibold ${largeMode ? 'text-base' : 'text-sm'}`} data-testid="back-to-categories">
                <Grid3X3 size={largeMode ? 18 : 14} /> Categorías
              </button>
            ) : (
              <span className={`font-semibold flex items-center gap-1.5 text-white ${largeMode ? 'text-base' : 'text-sm'}`}><Grid3X3 size={largeMode ? 18 : 14} /> Categorías</span>
            )}
            {activeCat && (
              <>
                <span className={`text-white/50 ${largeMode ? 'text-base' : 'text-sm'}`}>/</span>
                <span className={`font-semibold text-white ${largeMode ? 'text-base' : 'text-sm'}`}>{categories.find(c => c.id === activeCat)?.name}</span>
              </>
            )}
          </div>
          {/* Column controls and Quantity button */}
          <div className="flex items-center gap-1.5">
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
            <span className={`text-white/50 mx-1 ${largeMode ? 'text-xs' : 'text-[10px]'}`}>Col:</span>
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
                className={`${largeMode ? 'w-8 h-8 text-sm' : 'w-7 h-7 text-xs'} rounded-lg font-bold transition-colors ${
                  (activeCat ? gridSettings.productColumns : gridSettings.categoryColumns) === num
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white/60'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

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
          {/* Category Grid (when no category selected) */}
          {/* Dynamic columns: max 3 on wider panel to avoid cramping */}
          {!activeCat && (
            <div 
              className={`p-3 grid ${largeMode ? 'gap-3' : 'gap-2.5'}`}
              style={{ gridTemplateColumns: `repeat(${Math.min(gridSettings.categoryColumns, 3)}, minmax(0, 1fr))` }}
              data-testid="category-grid"
            >
              {categories.map(cat => {
                const catProductCount = products.filter(p => p.category_id === cat.id).length;
                const effectiveCols = Math.min(gridSettings.categoryColumns, 3);
                const heightClass = largeMode 
                  ? (effectiveCols > 2 ? 'h-28' : 'h-32')
                  : (effectiveCols > 2 ? 'h-24' : 'h-28');
                return (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)} data-testid={`cat-card-${cat.id}`}
                    className={`relative overflow-hidden rounded-xl border-2 border-border hover:border-primary/50 transition-all active:scale-[0.97] p-3 ${heightClass} text-left flex flex-col justify-between`}
                    style={{ backgroundColor: cat.color + '15', borderColor: cat.color + '40' }}>
                    <span className={`font-bold leading-tight ${largeMode ? 'text-lg' : 'text-base'}`} style={{ color: cat.color }}>{cat.name}</span>
                    <span className={`text-muted-foreground ${largeMode ? 'text-sm' : 'text-xs'}`}>{catProductCount} productos</span>
                    <div className={`absolute top-2 right-2 ${largeMode ? 'w-9 h-9' : 'w-8 h-8'} rounded-full flex items-center justify-center`} style={{ backgroundColor: cat.color + '20' }}>
                      <span className={`font-oswald font-bold ${largeMode ? 'text-sm' : 'text-xs'}`} style={{ color: cat.color }}>{catProductCount}</span>
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
              className={`p-3 grid ${largeMode ? 'gap-3' : 'gap-2.5'}`}
              style={{ gridTemplateColumns: `repeat(${Math.min(gridSettings.productColumns, 3)}, minmax(0, 1fr))` }}
              data-testid="product-grid"
            >
              {filteredProducts.map(product => {
                const effectiveCols = Math.min(gridSettings.productColumns, 3);
                const heightClass = largeMode 
                  ? (effectiveCols > 2 ? 'h-28' : 'h-32')
                  : (effectiveCols > 2 ? 'h-24' : 'h-28');
                // Check modifiers from both old and new systems
                const assignmentIds = (product.modifier_assignments || []).map(a => a.group_id);
                const legacyIds = product.modifier_group_ids || [];
                const hasModifiers = [...new Set([...assignmentIds, ...legacyIds])].length > 0;
                let pressTimer = null;
                
                // Stock control logic
                const productStock = stockStatus[product.id];
                const isOutOfStock = !allowSaleWithoutStock && productStock && !productStock.in_stock;
                const isLowStock = productStock?.is_low_stock && !isOutOfStock;
                
                const handleTouchStart = () => {
                  if (isOutOfStock) return; // Don't allow long press on out of stock items
                  pressTimer = setTimeout(() => {
                    handleProductLongPress(product);
                  }, 500); // 500ms for long press
                };
                
                const handleTouchEnd = () => {
                  if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                  }
                };
                
                return (
                  <button 
                    key={product.id} 
                    onClick={() => !isOutOfStock && handleProductClick(product)} 
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    onMouseDown={handleTouchStart}
                    onMouseUp={handleTouchEnd}
                    onMouseLeave={handleTouchEnd}
                    disabled={isOutOfStock}
                    data-testid={`product-${product.id}`}
                    className={`group relative overflow-hidden border-2 transition-all rounded-xl flex flex-col justify-between ${largeMode ? 'p-4' : 'p-3'} ${heightClass} text-left ${
                      isOutOfStock 
                        ? 'bg-card/50 border-red-500/50 opacity-60 cursor-not-allowed' 
                        : isLowStock
                          ? 'bg-card border-yellow-500/50 hover:border-yellow-500 active:scale-[0.97]'
                          : 'bg-card border-border hover:border-primary/50 active:scale-[0.97]'
                    }`}
                  >
                    {/* Imagen o Icono del producto */}
                    {(product.image_url || product.icon) && (
                      <div className={`${largeMode ? 'mb-2' : 'mb-1'}`}>
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt="" 
                            className={`${largeMode ? 'w-12 h-12' : 'w-8 h-8'} rounded-lg object-cover`}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : product.icon && PRODUCT_ICON_MAP[product.icon] ? (
                          (() => {
                            const IconComponent = PRODUCT_ICON_MAP[product.icon];
                            return <IconComponent size={largeMode ? 28 : 20} className="text-primary/80" />;
                          })()
                        ) : null}
                      </div>
                    )}
                    <span className={`font-semibold leading-tight line-clamp-2 ${largeMode ? 'text-base' : 'text-sm'} ${isOutOfStock ? 'text-muted-foreground' : ''}`}>{product.name}</span>
                    <span className={`font-oswald font-bold ${largeMode ? 'text-xl' : 'text-lg'} ${isOutOfStock ? 'text-muted-foreground' : 'text-primary'}`}>{formatMoney(product.price)}</span>
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
            {/* Compact Quantity Section - LARGER FOR TOUCH */}
            <div className="flex items-center gap-4 bg-background rounded-xl border border-border p-3">
              <span className="text-sm font-semibold text-muted-foreground">Cantidad:</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setModDialog(p => ({ ...p, qty: String(Math.max(1, (parseInt(p.qty) || 1) - 1)) }))}
                  className="h-12 w-12 rounded-xl bg-muted hover:bg-destructive/20 font-bold text-2xl active:scale-95 transition-all">-</button>
                <span className="font-oswald text-3xl font-bold text-primary w-14 text-center" data-testid="qty-display">{modDialog.qty}</span>
                <button onClick={() => setModDialog(p => ({ ...p, qty: String((parseInt(p.qty) || 1) + 1) }))}
                  className="h-12 w-12 rounded-xl bg-muted hover:bg-primary hover:text-white font-bold text-2xl active:scale-95 transition-all">+</button>
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
                  {isRequired && <Badge variant="destructive" className="text-[10px] h-5 px-2">Requerido</Badge>}
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
            className="w-full h-14 bg-primary text-primary-foreground font-oswald font-bold text-lg tracking-wider active:scale-95 mt-3">
            AGREGAR ({formatMoney((modDialog.product?.price || 0) * (parseFloat(modDialog.qty) || 1))})
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
                            <Badge variant="outline" className="text-[9px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                              <Lock size={8} className="mr-0.5" /> Auth
                            </Badge>
                          )}
                          {reason.return_to_inventory ? (
                            <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-500 border-green-500/30">
                              <RotateCcw size={10} className="mr-1" /> Retorna
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-500 border-red-500/30">
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
                      <Badge variant="outline" className="text-[9px] bg-green-500/20 text-green-400 border-green-500/40">
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
          <Button onClick={async () => {
            try {
              // Enviar directamente a la impresora
              const resp = await fetch(`${API_BASE}/api/print/pre-check/${order?.id}/send`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` }
              });
              const data = await resp.json();
              if (data.ok) {
                setPreCheckOpen(false);
              } else {
                console.warn(data.message || 'Error al imprimir');
              }
            } catch (e) {
              console.error('Error de conexión:', e);
            }
          }} className="w-full h-11 bg-gray-900 text-white font-oswald font-bold active:scale-95" data-testid="print-precheck-btn">
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
                  <span className="block text-[10px] text-muted-foreground">{activeItems.length} items</span>
                </div>
                <MoveRight size={20} className="text-primary" />
                <div className="px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="font-oswald text-lg text-yellow-400">Mesa #{mergeConfirm.targetTableNumber}</span>
                  <span className="block text-[10px] text-muted-foreground">Ocupada</span>
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
            <p className="text-[10px] text-muted-foreground text-center">
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

    </div>
  );
}
