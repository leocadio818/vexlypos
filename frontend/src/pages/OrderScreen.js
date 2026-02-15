import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ordersAPI, categoriesAPI, productsAPI, modifiersAPI, reasonsAPI, tablesAPI, areasAPI, billsAPI, inventorySettingsAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, Send, Trash2, AlertTriangle, Receipt, Grid3X3, SplitSquareHorizontal, FileText, Printer, Lock, MoveRight, Users, Check, X, Plus, Merge, Hash, RotateCcw, Ban, MoreVertical, Percent, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const [managerPinDialog, setManagerPinDialog] = useState({ open: false, pin: '' });
  const [taxConfig, setTaxConfig] = useState([]);
  
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
  
  // Move Items Mode
  const [moveItemsMode, setMoveItemsMode] = useState(false);
  const [selectedItemsToMove, setSelectedItemsToMove] = useState([]);
  
  // Functions Menu Popover
  const [functionsMenuOpen, setFunctionsMenuOpen] = useState(false);
  
  // Merge Accounts Dialog
  const [mergeAccountsDialog, setMergeAccountsDialog] = useState({ open: false, sourceOrderId: null });
  
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

  // Re-sync tax config every 30s so changes reflect immediately
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/tax-config`);
        const taxes = await r.json();
        setTaxConfig(taxes.filter(t => t.active && t.rate > 0));
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [API_BASE]);

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
      if (showToast) toast.success('Comanda enviada automáticamente');
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
              toast.success('Comanda enviada automáticamente');
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
    
    const handleVoidEntireOrder = () => {
      // Anular cuenta entera - SIEMPRE requiere PIN
      if (!order || activeItems.length === 0) {
        toast.info('No hay items para anular');
        return;
      }
      const allItemIds = activeItems.map(i => i.id);
      openBulkCancelDialog(allItemIds, true); // true = force manager auth
    };
    
    window.addEventListener('openMoveTableDialog', handleOpenMoveDialog);
    window.addEventListener('enterSplitMode', handleEnterSplitMode);
    window.addEventListener('voidEntireOrder', handleVoidEntireOrder);
    
    return () => {
      window.removeEventListener('openMoveTableDialog', handleOpenMoveDialog);
      window.removeEventListener('enterSplitMode', handleEnterSplitMode);
      window.removeEventListener('voidEntireOrder', handleVoidEntireOrder);
    };
  }, [order, activeItems]);

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
        setOrder(res.data); toast.success(`${product.name} agregado`);
      } else {
        const res = await ordersAPI.addItems(order.id, [item]);
        setOrder(res.data); toast.success(`${product.name} agregado`);
      }
    } catch { toast.error('Error agregando item'); }
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
    if (pendingItems.length === 0) { toast.info('No hay items pendientes'); return; }
    try {
      const res = await ordersAPI.sendToKitchen(order.id);
      setOrder(res.data); toast.success('Comanda enviada a cocina');
    } catch { toast.error('Error enviando a cocina'); }
  };

  const handleCancelItem = async () => {
    const { itemId, itemIds, mode, selectedReasonId, returnToInventory, comments, requiresManagerAuth, authorizedBy } = cancelDialog;
    
    if (!selectedReasonId) {
      toast.error('Selecciona una razón de anulación');
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
        toast.success(`${itemIds.length} items anulados`);
      } else {
        // Single item cancellation
        res = await ordersAPI.cancelItem(order.id, itemId, cancelData);
        toast.success('Item anulado');
      }
      setOrder(res.data);
      resetCancelDialog();
    } catch (e) { 
      const msg = e.response?.data?.detail || 'Error anulando item(s)';
      toast.error(msg); 
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
        body: JSON.stringify({ pin: cancelDialog.managerPin })
      });
      
      if (!res.ok) {
        const data = await res.json();
        setCancelDialog(prev => ({ ...prev, managerAuthError: data.detail || 'PIN inválido', managerPin: '' }));
        return;
      }
      
      const data = await res.json();
      // Manager verified, proceed with cancellation
      setCancelDialog(prev => ({ 
        ...prev, 
        showManagerPin: false, 
        managerPin: '',
        managerAuthError: '',
        authorizedBy: { id: data.user_id, name: data.user_name }
      }));
      toast.success(`Autorizado por ${data.user_name}`);
      
      // Auto-submit after authorization
      setTimeout(() => handleCancelItem(), 100);
    } catch {
      setCancelDialog(prev => ({ ...prev, managerAuthError: 'Error verificando PIN', managerPin: '' }));
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

  // Open cancel dialog for multiple items
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
      requiresManagerAuth: forceManagerAuth || anyWasSent, // Force auth if param or if items were sent
      showManagerPin: forceManagerAuth || anyWasSent, // Auto-show PIN if forced or items sent
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

  // Dynamic tax breakdown from config
  const taxBreakdown = [];
  let runningTotal = subtotal;
  for (const tax of taxConfig) {
    const base = tax.apply_to_tip ? runningTotal : subtotal;
    const amount = Math.round(base * (tax.rate / 100) * 100) / 100;
    taxBreakdown.push({ description: tax.description, rate: tax.rate, amount, is_tip: tax.is_tip || false });
    runningTotal += amount;
  }
  const grandTotal = runningTotal;

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
      }
      // First print: change table status to billed (yellow glow)
      if (d.print_number === 1 && table) {
        try {
          await tablesAPI.update(table.id, { status: 'billed' });
        } catch {}
      }
    } catch { toast.error('Error generando pre-cuenta'); }
  };

  // Print pre-check for a specific account
  const handlePrintAccountPreCheck = async (orderId, accountNumber) => {
    toast.info(`Generando pre-cuenta de Cuenta #${accountNumber}...`);
    await doPrintPreCheck(orderId);
  };

  const handleManagerAuth = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/auth/verify-manager`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: JSON.stringify({ pin: managerPinDialog.pin })
      });
      if (r.ok) {
        setManagerPinDialog({ open: false, pin: '' });
        toast.success('Autorizado por gerente');
        await doPrintPreCheck();
      } else {
        const d = await r.json();
        toast.error(d.detail || 'No autorizado');
      }
    } catch { toast.error('Error de autorizacion'); }
  };

  // Move Table Functions
  const openMoveDialog = async () => {
    try {
      const [tablesRes, areasRes] = await Promise.all([tablesAPI.list(), areasAPI.list()]);
      setAllTables(tablesRes.data);
      setAllAreas(areasRes.data);
      setMoveDialog({ open: true });
    } catch { toast.error('Error cargando mesas'); }
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
        toast.success(`Cuenta #${order.account_number || 1} movida a Mesa ${res.data.target_table_number || targetTableId}`);
        setMoveDialog({ open: false });
        navigate(`/order/${targetTableId}`);
      }
    } catch { toast.error('Error moviendo cuenta'); }
  };

  const handleConfirmMerge = async () => {
    if (!order || !mergeConfirm.targetTableId) return;
    try {
      await ordersAPI.moveToTable(order.id, mergeConfirm.targetTableId, true);
      toast.success('Cuenta unida exitosamente');
      setMergeConfirm({ open: false, targetTableId: null, targetTableNumber: null });
      navigate(`/order/${mergeConfirm.targetTableId}`);
    } catch { toast.error('Error uniendo cuenta'); }
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
  const createNewOrderFromItems = async () => {
    if (selectedSplitItems.length === 0) {
      toast.info('Selecciona items primero');
      return;
    }
    if (!order) return;
    
    // Check if ALL items are selected - not allowed
    const allItemIds = activeItems.map(i => i.id);
    if (selectedSplitItems.length === allItemIds.length) {
      toast.error('No puede mover todos los items. Use "Mover Mesa" para eso.');
      return;
    }

    try {
      const res = await ordersAPI.splitToNewOrder(order.id, selectedSplitItems);
      toast.success(`Cuenta #${res.data.new_order.account_number} creada`);
      setSelectedSplitItems([]);
      // Refresh orders
      await fetchOrder();
      // Switch to new order
      setActiveOrderId(res.data.new_order.id);
    } catch (e) { 
      toast.error(e.response?.data?.detail || 'Error dividiendo cuenta'); 
    }
  };

  // Create new empty account on the table
  const createNewEmptyAccount = async () => {
    try {
      const res = await ordersAPI.createNewAccount(tableId);
      toast.success(`Cuenta #${res.data.account_number} creada`);
      // Refresh orders and switch to new account
      await fetchOrder();
      setActiveOrderId(res.data.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error creando nueva cuenta');
    }
  };

  // Delete empty account
  const deleteEmptyAccount = async (orderId, accountNumber) => {
    try {
      await ordersAPI.deleteEmpty(orderId);
      toast.success(`Cuenta #${accountNumber} eliminada`);
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
      toast.error(e.response?.data?.detail || 'Error eliminando cuenta');
    }
  };

  // Merge two accounts
  const mergeAccounts = async (targetOrderId) => {
    const sourceOrderId = mergeAccountsDialog.sourceOrderId;
    if (!sourceOrderId || !targetOrderId) return;
    
    try {
      await ordersAPI.mergeOrders(sourceOrderId, targetOrderId);
      toast.success('Cuentas fusionadas exitosamente');
      setMergeAccountsDialog({ open: false, sourceOrderId: null });
      // Refresh orders and switch to target
      await fetchOrder();
      setActiveOrderId(targetOrderId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error fusionando cuentas');
    }
  };

  // Open merge dialog
  const openMergeDialog = (orderId) => {
    setMergeAccountsDialog({ open: true, sourceOrderId: orderId });
  };

  // Direct billing - create bill and go to payment
  const handleDirectBilling = async () => {
    try {
      // Check for existing open bills for this order
      const existingBills = await billsAPI.list({ order_id: order.id, status: 'open' });
      
      if (existingBills.data?.length > 0) {
        // If there's an open bill, go directly to payment
        navigate(`/payment/${existingBills.data[0].id}`);
        return;
      }
      
      // Create new bill with all items
      const itemIds = order.items
        .filter(i => i.status !== 'cancelled')
        .map(i => i.id);
      
      if (itemIds.length === 0) {
        toast.error('No hay items para facturar');
        return;
      }
      
      const res = await billsAPI.create({
        order_id: order.id,
        table_id: tableId,
        item_ids: itemIds
      });
      
      // Navigate directly to payment screen
      navigate(`/payment/${res.data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error creando factura');
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
      toast.info('Selecciona artículos primero');
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
      toast.success(`${data.items_moved} artículo(s) movido(s)`);
      
      // Reset and refresh
      setMoveItemsMode(false);
      setSelectedItemsToMove([]);
      setSelectedSplitItems([]);
      await fetchOrder();
      
      // Switch to target order
      setActiveOrderId(targetOrderId);
    } catch (e) {
      toast.error(e.message || 'Error moviendo artículos');
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row-reverse" data-testid="order-screen">
      {/* Left (visually): Order Summary - Now rendered second but appears on left due to flex-row-reverse */}
      <div className="w-full lg:w-80 xl:w-96 border-b lg:border-b-0 lg:border-l border-white/10 flex flex-col backdrop-blur-xl bg-white/5 shrink-0">
        <div className="px-2 py-2 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button onClick={splitMode ? exitSplitMode : handleBack} data-testid="back-to-tables" className="h-9 w-9 rounded-lg text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all">
              {splitMode ? <X size={16} /> : <ArrowLeft size={16} />}
            </button>
            <h2 className="font-oswald text-base font-bold text-white">
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
                  onClick={createNewEmptyAccount}
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
                      onClick={createNewOrderFromItems}
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
            <ScrollArea className="flex-1 max-h-[28vh] lg:max-h-none">
              <div className="p-2 space-y-1">
                {activeItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Selecciona productos</p>
                ) : (
                  activeItems.map(item => {
                    const modTotal = (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
                    const itemTotal = (item.unit_price + modTotal) * item.quantity;
                    return (
                    <div key={item.id} data-testid={`order-item-${item.id}`}
                      className="flex items-start gap-1.5 p-1.5 rounded-lg bg-background/50 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-oswald text-xs font-bold text-primary">{item.quantity}x</span>
                          <span className="text-xs font-medium truncate">{item.product_name}</span>
                        </div>
                        {item.modifiers?.length > 0 && (
                          <div className="mt-0.5 space-y-0.5">
                            {item.modifiers.map((m, i) => (
                              <div key={i} className="flex items-center justify-between text-[9px]">
                                <span className="text-muted-foreground">+ {m.name}</span>
                                {m.price > 0 && <span className="font-oswald text-primary/70">+{formatMoney(m.price)}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {item.notes && <p className="text-[8px] text-yellow-500 mt-0.5 italic">📝 {item.notes}</p>}
                        <div className="mt-0.5">
                          {item.status === 'pending' && <Badge variant="outline" className="text-[7px] h-3 border-yellow-600 text-yellow-500">Pendiente</Badge>}
                          {item.status === 'sent' && <Badge variant="outline" className="text-[7px] h-3 border-blue-500 text-blue-400">Enviado</Badge>}
                          {item.status === 'preparing' && <Badge variant="outline" className="text-[7px] h-3 border-orange-500 text-orange-400">Preparando</Badge>}
                          {item.status === 'ready' && <Badge variant="outline" className="text-[7px] h-3 border-green-500 text-green-400">Listo</Badge>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-oswald text-[11px]">{formatMoney(itemTotal)}</span>
                        {(item.status === 'pending' || item.status === 'sent') && (
                          <button onClick={() => openCancelDialog(item.id)} className="block ml-auto text-destructive/50 hover:text-destructive" data-testid={`cancel-item-${item.id}`}>
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  )})
                )}
              </div>
            </ScrollArea>

            <div className="px-2 py-1.5 border-t border-border space-y-0.5">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-oswald">{formatMoney(subtotal)}</span>
              </div>
              {subtotal > 0 && taxBreakdown.map((tax, i) => (
                <div key={i} className="flex justify-between items-center text-[10px] text-muted-foreground/70">
                  <span>{tax.description} ({tax.rate}%)</span>
                  <span className="font-oswald">{formatMoney(tax.amount)}</span>
                </div>
              ))}
              {subtotal > 0 && (
                <div className="flex justify-between items-center font-oswald border-t border-border/50 pt-0.5">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-base font-bold text-primary">{formatMoney(grandTotal)}</span>
                </div>
              )}
            </div>

            {/* Action Buttons - Fixed at bottom */}
            {!splitMode && order && (
              <div className="p-2 border-t border-border bg-card/80 space-y-1.5">
                {/* Primary actions row */}
                <div className="grid grid-cols-2 gap-1.5">
                  {pendingCount > 0 && (
                    <Button onClick={handleSendToKitchen} size="sm" data-testid="send-to-kitchen-btn"
                      className="h-10 bg-green-600 hover:bg-green-700 text-white font-oswald text-xs font-bold active:scale-95 col-span-2">
                      <Send size={14} className="mr-1.5" /> ENVIAR ({pendingCount})
                    </Button>
                  )}
                  <Button onClick={handleDirectBilling} size="sm" data-testid="go-to-billing" 
                    className={`h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-oswald text-xs font-bold ${pendingCount > 0 ? '' : 'col-span-2'}`}>
                    <Receipt size={14} className="mr-1.5" /> FACTURAR
                  </Button>
                </div>
                {/* Secondary actions row */}
                {activeItems.length > 0 && (
                  <div className="flex gap-1">
                    {table?.status !== 'billed' && (
                      <Button onClick={enterSplitMode} variant="outline" size="sm" data-testid="split-btn"
                        className="h-8 text-[10px] border-muted-foreground/30 flex-1">
                        <SplitSquareHorizontal size={12} className="mr-1" /> Editar Cuenta
                      </Button>
                    )}
                    <Button onClick={handlePrintPreCheck} variant="outline" size="sm" data-testid="pre-check-btn"
                      className={`h-8 text-[10px] border-muted-foreground/30 relative flex-1 ${table?.status === 'billed' ? 'flex-[2]' : ''}`}>
                      <FileText size={12} className="mr-1" /> Pre-Cuenta
                      {preCheckCount > 0 && <Lock size={8} className="ml-0.5 text-yellow-500" />}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right (visually): Categories & Products - Now rendered first but appears on right */}
      {!splitMode && !accessDenied && (
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
          {!activeCat && (
            <div 
              className={`p-2 grid ${largeMode ? 'gap-3' : 'gap-2'}`}
              style={{ gridTemplateColumns: `repeat(${gridSettings.categoryColumns}, minmax(0, 1fr))` }}
              data-testid="category-grid"
            >
              {categories.map(cat => {
                const catProductCount = products.filter(p => p.category_id === cat.id).length;
                const heightClass = largeMode 
                  ? (gridSettings.categoryColumns > 3 ? 'h-28' : 'h-32')
                  : (gridSettings.categoryColumns > 4 ? 'h-24' : 'h-28');
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
          {activeCat && (
            <div 
              className={`p-2 grid ${largeMode ? 'gap-3' : 'gap-2'}`}
              style={{ gridTemplateColumns: `repeat(${gridSettings.productColumns}, minmax(0, 1fr))` }}
              data-testid="product-grid"
            >
              {filteredProducts.map(product => {
                const heightClass = largeMode 
                  ? (gridSettings.productColumns > 3 ? 'h-28' : 'h-32')
                  : (gridSettings.productColumns > 4 ? 'h-24' : 'h-28');
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

      {/* Product Dialog with Numpad */}
      <Dialog open={modDialog.open} onOpenChange={(open) => !open && setModDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md bg-card border-border p-4" data-testid="modifier-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-base">{modDialog.product?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1 scrollbar-thin">
            {/* Compact Quantity Section */}
            <div className="flex items-center gap-3 bg-background rounded-lg border border-border p-2">
              <span className="text-xs font-semibold text-muted-foreground">Cantidad:</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setModDialog(p => ({ ...p, qty: String(Math.max(1, (parseInt(p.qty) || 1) - 1)) }))}
                  className="h-8 w-8 rounded-lg bg-muted hover:bg-destructive/20 font-bold text-lg">-</button>
                <span className="font-oswald text-2xl font-bold text-primary w-12 text-center" data-testid="qty-display">{modDialog.qty}</span>
                <button onClick={() => setModDialog(p => ({ ...p, qty: String((parseInt(p.qty) || 1) + 1) }))}
                  className="h-8 w-8 rounded-lg bg-muted hover:bg-primary hover:text-white font-bold text-lg">+</button>
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
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-semibold">{group.name}</span>
                  {isRequired && <Badge variant="destructive" className="text-[8px] h-3.5">Requerido</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {group.options.map(opt => {
                    const isSelected = (modDialog.selectedMods[group.id] || []).some(m => m.id === opt.id);
                    return (
                      <button key={opt.id} onClick={() => {
                        setModDialog(prev => {
                          const current = prev.selectedMods[group.id] || [];
                          const updated = maxSelections === 1 ? (isSelected ? [] : [opt]) : (isSelected ? current.filter(m => m.id !== opt.id) : [...current, opt]);
                          return { ...prev, selectedMods: { ...prev.selectedMods, [group.id]: updated } };
                        });
                      }} className={`p-1.5 rounded-lg text-left text-[11px] transition-all border ${
                        isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:border-primary/30'
                      }`}>
                        <span className="block font-medium">{opt.name}</span>
                        {opt.price > 0 && <span className="text-primary font-oswald text-[10px]">+{formatMoney(opt.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
                );
              });
            })()}

            <input value={modDialog.notes} onChange={e => setModDialog(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas especiales..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs" data-testid="item-notes-input" />
          </div>
          <Button onClick={handleConfirmModifiers} data-testid="confirm-modifiers-btn"
            className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold tracking-wider active:scale-95 mt-2">
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
                  Esta anulación requiere PIN de administrador
                </p>
              </div>
              
              {/* PIN Display */}
              <div className="flex justify-center gap-2 py-2">
                {[0, 1, 2, 3].map(i => (
                  <div 
                    key={i} 
                    className={`w-4 h-4 rounded-full transition-all ${
                      cancelDialog.managerPin.length > i ? 'bg-primary scale-110' : 'bg-border'
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
              
              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', '⌫'].map(key => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === 'CLR') {
                        setCancelDialog(prev => ({ ...prev, managerPin: '', managerAuthError: '' }));
                      } else if (key === '⌫') {
                        setCancelDialog(prev => ({ ...prev, managerPin: prev.managerPin.slice(0, -1), managerAuthError: '' }));
                      } else if (cancelDialog.managerPin.length < 6) {
                        const newPin = cancelDialog.managerPin + key;
                        setCancelDialog(prev => ({ ...prev, managerPin: newPin, managerAuthError: '' }));
                        // Auto-verify when 4 digits entered
                        if (newPin.length === 4) {
                          setTimeout(() => verifyManagerPin(), 100);
                        }
                      }
                    }}
                    className={`h-12 rounded-xl font-oswald text-lg font-bold transition-all active:scale-95 ${
                      key === 'CLR' ? 'bg-muted text-muted-foreground text-sm' :
                      key === '⌫' ? 'bg-muted text-muted-foreground' :
                      'bg-background border-2 border-border hover:border-primary/50'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
              
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

              {/* Inventory Toggle - Can override the default from reason */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {cancelDialog.returnToInventory ? (
                      <RotateCcw size={16} className="text-green-500" />
                    ) : (
                      <Ban size={16} className="text-red-500" />
                    )}
                    <span className="text-sm font-semibold">¿Devolver a Inventario?</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {cancelDialog.returnToInventory 
                      ? 'Los insumos volverán al stock' 
                      : 'Se registrará como merma/pérdida'}
                  </p>
                </div>
                <Switch 
                  checked={cancelDialog.returnToInventory}
                  onCheckedChange={(v) => setCancelDialog(prev => ({ ...prev, returnToInventory: v }))}
                  data-testid="toggle-return-inventory"
                />
              </div>

              {/* Manager Auth Required Notice */}
              {cancelDialog.requiresManagerAuth && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <Lock size={14} className="text-yellow-500" />
                  <span className="text-xs text-yellow-500">
                    {cancelDialog.authorizedBy 
                      ? `Autorizado por: ${cancelDialog.authorizedBy.name}` 
                      : 'Esta razón requiere autorización de gerente'}
                  </span>
                  {cancelDialog.authorizedBy && <Check size={14} className="text-green-500 ml-auto" />}
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
                  disabled={!cancelDialog.selectedReasonId}
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-white font-oswald font-bold"
                  data-testid="confirm-cancel-btn"
                >
                  {cancelDialog.requiresManagerAuth && !cancelDialog.authorizedBy ? (
                    <><Lock size={14} className="mr-1" /> Autorizar</>
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
          <div className="receipt-paper p-2" dangerouslySetInnerHTML={{ __html: preCheckHtml }} />
          <Button onClick={() => {
            const w = window.open('', '_blank', 'width=320,height=600');
            w.document.write(`<html><body style="margin:0;padding:0;">${preCheckHtml}</body></html>`);
            w.document.close(); w.print();
          }} className="w-full h-11 bg-gray-900 text-white font-oswald font-bold active:scale-95" data-testid="print-precheck-btn">
            <Printer size={16} className="mr-2" /> IMPRIMIR PRE-CUENTA
          </Button>
        </DialogContent>
      </Dialog>

      {/* Manager PIN Authorization Dialog */}
      <Dialog open={managerPinDialog.open} onOpenChange={(o) => !o && setManagerPinDialog({ open: false, pin: '' })}>
        <DialogContent className="max-w-xs bg-card border-border" data-testid="manager-pin-dialog">
          <DialogHeader><DialogTitle className="font-oswald flex items-center gap-2">
            <Lock size={18} className="text-yellow-500" /> Autorizacion de Gerente
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Esta pre-cuenta ya fue impresa. Se requiere PIN de gerente para reimprimir.</p>
            <input value={managerPinDialog.pin} onChange={e => setManagerPinDialog(p => ({ ...p, pin: e.target.value }))}
              type="password" maxLength={6} placeholder="PIN de gerente"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleManagerAuth(); }}
              className="w-full bg-background border border-border rounded-lg px-3 py-3 text-center text-2xl font-oswald tracking-widest"
              data-testid="manager-pin-input" />
            <Button onClick={handleManagerAuth} disabled={!managerPinDialog.pin || managerPinDialog.pin.length < 4}
              className="w-full h-11 bg-yellow-600 text-black font-oswald font-bold active:scale-95" data-testid="confirm-manager-pin">
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

    </div>
  );
}
