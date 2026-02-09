import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, categoriesAPI, productsAPI, modifiersAPI, reasonsAPI, tablesAPI, areasAPI } from '@/lib/api';
import { formatMoney } from '@/lib/api';
import { ArrowLeft, Send, Trash2, AlertTriangle, Receipt, Grid3X3, SplitSquareHorizontal, FileText, Printer, Lock, MoveRight, Users, Check, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function OrderScreen() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const [table, setTable] = useState(null);
  const [order, setOrder] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [activeCat, setActiveCat] = useState(null); // null = show categories grid
  const [cancelReasons, setCancelReasons] = useState([]);
  const [modDialog, setModDialog] = useState({ open: false, product: null, selectedMods: {}, qty: '0', notes: '' });
  const [cancelDialog, setCancelDialog] = useState({ open: false, itemId: null });
  const [preCheckHtml, setPreCheckHtml] = useState('');
  const [preCheckOpen, setPreCheckOpen] = useState(false);
  const [preCheckCount, setPreCheckCount] = useState(0);
  const [managerPinDialog, setManagerPinDialog] = useState({ open: false, pin: '' });
  const [taxConfig, setTaxConfig] = useState([]);
  
  // Move Table Dialog
  const [moveDialog, setMoveDialog] = useState({ open: false });
  const [allTables, setAllTables] = useState([]);
  const [allAreas, setAllAreas] = useState([]);
  const [mergeConfirm, setMergeConfirm] = useState({ open: false, targetTableId: null, targetTableNumber: null });
  
  // Split/Divide Dialog
  const [splitMode, setSplitMode] = useState(false);
  const [divisions, setDivisions] = useState([{ id: 1, name: 'División 1', item_ids: [] }]);
  const [activeDivision, setActiveDivision] = useState(1);
  const [selectedSplitItems, setSelectedSplitItems] = useState([]);
  
  // Merge Accounts Dialog
  const [mergeAccountsDialog, setMergeAccountsDialog] = useState({ open: false, sourceOrderId: null });
  
  // Multiple orders per table support
  const [tableOrders, setTableOrders] = useState([]); // All orders for this table
  const [activeOrderId, setActiveOrderId] = useState(null); // Currently selected order
  
  const orderRef = useRef(null);
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  const fetchOrder = useCallback(async () => {
    try {
      const tableRes = await tablesAPI.list();
      const t = tableRes.data.find(tb => tb.id === tableId);
      setTable(t);
      
      // Fetch ALL orders for this table
      const ordersRes = await ordersAPI.getTableOrders(tableId);
      const orders = ordersRes.data || [];
      setTableOrders(orders);
      
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

  useEffect(() => { orderRef.current = order; }, [order]);

  // Auto-send pending items when leaving
  const autoSendPending = async () => {
    const cur = orderRef.current;
    if (cur) {
      const pending = cur.items?.filter(i => i.status === 'pending') || [];
      if (pending.length > 0) {
        try {
          await ordersAPI.sendToKitchen(cur.id);
          toast.success('Comanda enviada automaticamente');
        } catch {}
      }
    }
  };

  const handleBack = async () => { await autoSendPending(); navigate('/tables'); };

  const filteredProducts = activeCat ? products.filter(p => p.category_id === activeCat) : [];

  const handleProductClick = (product) => {
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

  const handleCancelItem = async (reasonId) => {
    const { itemId } = cancelDialog;
    const reason = cancelReasons.find(r => r.id === reasonId);
    try {
      const res = await ordersAPI.cancelItem(order.id, itemId, { reason_id: reasonId, return_to_inventory: reason?.return_to_inventory || false });
      setOrder(res.data); toast.success('Item anulado');
      setCancelDialog({ open: false, itemId: null });
    } catch { toast.error('Error anulando item'); }
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

  const doPrintPreCheck = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/print/pre-check/${order.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } });
      const d = await r.json();
      setPreCheckHtml(d.html);
      setPreCheckOpen(true);
      setPreCheckCount(d.print_number);
      // First print: change table status to billed (yellow glow)
      if (d.print_number === 1 && table) {
        try {
          await tablesAPI.update(table.id, { status: 'billed' });
        } catch {}
      }
    } catch { toast.error('Error generando pre-cuenta'); }
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
      const res = await ordersAPI.moveToTable(order.id, targetTableId, false);
      if (res.data.needs_merge) {
        // Target table is occupied, ask to merge
        setMoveDialog({ open: false });
        setMergeConfirm({ open: true, targetTableId, targetTableNumber: res.data.target_table_number });
      } else {
        toast.success('Mesa movida exitosamente');
        setMoveDialog({ open: false });
        navigate(`/order/${targetTableId}`);
      }
    } catch { toast.error('Error moviendo mesa'); }
  };

  const handleConfirmMerge = async () => {
    if (!order || !mergeConfirm.targetTableId) return;
    try {
      await ordersAPI.moveToTable(order.id, mergeConfirm.targetTableId, true);
      toast.success('Cuentas unidas exitosamente');
      setMergeConfirm({ open: false, targetTableId: null, targetTableNumber: null });
      navigate(`/order/${mergeConfirm.targetTableId}`);
    } catch { toast.error('Error uniendo cuentas'); }
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

  return (
    <div className="h-full flex flex-col lg:flex-row" data-testid="order-screen">
      {/* Left: Order Summary */}
      <div className="w-full lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-border flex flex-col bg-card/50 shrink-0">
        <div className="px-2 py-2 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={splitMode ? exitSplitMode : handleBack} data-testid="back-to-tables" className="h-9 w-9">
              {splitMode ? <X size={16} /> : <ArrowLeft size={16} />}
            </Button>
            <h2 className="font-oswald text-base font-bold">
              {splitMode ? 'DIVIDIR CUENTA' : tableOrders.length > 1 ? `Mesa ${table?.number || '?'} - Cuenta #${order?.account_number || 1}` : `Mesa ${table?.number || '?'}`}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {!splitMode && order && activeItems.length > 0 && (
              <>
                <Button onClick={openMoveDialog} variant="ghost" size="sm" data-testid="move-table-btn"
                  className="h-7 px-2 text-[10px] text-muted-foreground">
                  <MoveRight size={10} className="mr-1" /> Mover
                </Button>
                <Button onClick={enterSplitMode} variant="ghost" size="sm" data-testid="split-btn"
                  className="h-7 px-2 text-[10px] text-muted-foreground">
                  <SplitSquareHorizontal size={10} className="mr-1" /> Dividir
                </Button>
                <Button onClick={handlePrintPreCheck} variant="outline" size="sm" data-testid="pre-check-btn"
                  className="h-7 px-2 text-[10px] border-muted-foreground/30 text-muted-foreground relative">
                  <FileText size={10} className="mr-1" /> Pre-Cuenta
                  {preCheckCount > 0 && <Lock size={8} className="ml-0.5 text-yellow-500" />}
                </Button>
              </>
            )}
            {!splitMode && pendingCount > 0 && (
              <Button onClick={handleSendToKitchen} size="sm" data-testid="send-to-kitchen-btn"
                className="h-7 px-2 bg-primary text-primary-foreground font-oswald text-[10px] font-bold active:scale-95">
                <Send size={10} className="mr-1" /> ENVIAR ({pendingCount})
              </Button>
            )}
            {!splitMode && order && (
              <Button onClick={() => navigate(`/billing/${order.id}`)} variant="outline" size="sm" data-testid="go-to-billing" className="h-7 px-2 text-[10px] border-primary/50 text-primary">
                <Receipt size={10} className="mr-1" /> Facturar
              </Button>
            )}
          </div>
        </div>

        {/* Account Tabs - Show when table has multiple orders OR has at least one order */}
        {(tableOrders.length > 1 || (tableOrders.length === 1 && order)) && !splitMode && (
          <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto bg-card/30">
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
            {/* Add New Account Button */}
            <button
              onClick={createNewEmptyAccount}
              data-testid="add-new-account-btn"
              className="px-2 py-1.5 rounded-lg text-xs font-oswald whitespace-nowrap transition-all bg-green-600/20 border border-green-600/50 text-green-400 hover:bg-green-600/30 hover:border-green-500 flex items-center gap-1"
              title="Crear nueva cuenta"
            >
              <Plus size={12} /> Nueva
            </button>
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
                <p className="text-[10px] text-muted-foreground mb-2 text-center">
                  Selecciona items para mover a nueva cuenta
                </p>
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
                  <Button 
                    onClick={createNewOrderFromItems}
                    className="w-full h-10 bg-green-600 hover:bg-green-700 text-white font-oswald font-bold"
                  >
                    <SplitSquareHorizontal size={14} className="mr-2" /> CREAR NUEVA CUENTA
                  </Button>
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
                  activeItems.map(item => (
                    <div key={item.id} data-testid={`order-item-${item.id}`}
                      className="flex items-start gap-1.5 p-1.5 rounded-lg bg-background/50 border border-border/50">
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
                        <div className="mt-0.5">
                          {item.status === 'pending' && <Badge variant="outline" className="text-[7px] h-3 border-yellow-600 text-yellow-500">Pendiente</Badge>}
                          {item.status === 'sent' && <Badge variant="outline" className="text-[7px] h-3 border-blue-500 text-blue-400">Enviado</Badge>}
                          {item.status === 'preparing' && <Badge variant="outline" className="text-[7px] h-3 border-orange-500 text-orange-400">Preparando</Badge>}
                          {item.status === 'ready' && <Badge variant="outline" className="text-[7px] h-3 border-green-500 text-green-400">Listo</Badge>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-oswald text-[11px]">{formatMoney(item.unit_price * item.quantity)}</span>
                        {item.status === 'pending' && (
                          <button onClick={() => setCancelDialog({ open: true, itemId: item.id })} className="block ml-auto text-destructive/50 hover:text-destructive">
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
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
          </>
        )}
      </div>

      {/* Right: Categories & Products */}
      {!splitMode && (
        <div className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb when inside a category */}
        {activeCat && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/30">
            <button onClick={() => setActiveCat(null)} className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold" data-testid="back-to-categories">
              <Grid3X3 size={12} /> Categorias
            </button>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-semibold">{categories.find(c => c.id === activeCat)?.name}</span>
          </div>
        )}

        <ScrollArea className="flex-1">
          {/* Category Grid (when no category selected) */}
          {!activeCat && (
            <div className="p-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2" data-testid="category-grid">
              {categories.map(cat => {
                const catProductCount = products.filter(p => p.category_id === cat.id).length;
                return (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)} data-testid={`cat-card-${cat.id}`}
                    className="relative overflow-hidden rounded-xl border border-border hover:border-primary/50 transition-all active:scale-[0.97] p-4 h-24 text-left flex flex-col justify-between"
                    style={{ backgroundColor: cat.color + '15', borderColor: cat.color + '40' }}>
                    <span className="text-sm font-bold leading-tight" style={{ color: cat.color }}>{cat.name}</span>
                    <span className="text-[10px] text-muted-foreground">{catProductCount} productos</span>
                    <div className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: cat.color + '20' }}>
                      <span className="font-oswald text-xs font-bold" style={{ color: cat.color }}>{catProductCount}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Product Grid (when category selected) */}
          {activeCat && (
            <div className="p-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2" data-testid="product-grid">
              {filteredProducts.map(product => (
                <button key={product.id} onClick={() => handleProductClick(product)} data-testid={`product-${product.id}`}
                  className="group relative overflow-hidden bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.97] rounded-xl flex flex-col justify-between p-3 h-24 text-left">
                  <span className="text-xs font-semibold leading-tight line-clamp-2">{product.name}</span>
                  <span className="font-oswald text-base font-bold text-primary">{formatMoney(product.price)}</span>
                  {product.modifier_group_ids?.length > 0 && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary/60" />}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
      )}

      {/* Product Dialog with Numpad */}
      <Dialog open={modDialog.open} onOpenChange={(open) => !open && setModDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border p-4" data-testid="modifier-dialog">
          <DialogHeader><DialogTitle className="font-oswald text-base">{modDialog.product?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Cantidad</label>
              <div className="bg-background rounded-xl border border-border p-2">
                <div className="text-center mb-2">
                  <span className="font-oswald text-3xl font-bold text-primary" data-testid="qty-display">{modDialog.qty}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {['1','2','3','C','4','5','6','DEL','7','8','9','.','','0',''].map((k, i) => {
                    if (k === '') return <div key={i} />;
                    const isAction = k === 'C' || k === 'DEL';
                    return (
                      <button key={i} onClick={() => handleQtyKey(k)} data-testid={`qty-key-${k}`}
                        className={`h-10 rounded-lg font-oswald font-bold text-base transition-colors active:scale-95 ${
                          isAction ? 'bg-destructive/20 text-destructive text-xs' : 'bg-muted hover:bg-primary hover:text-white'
                        }`}>{k}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {modifierGroups.filter(mg => modDialog.product?.modifier_group_ids?.includes(mg.id)).map(group => (
              <div key={group.id}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-semibold">{group.name}</span>
                  {group.required && <Badge variant="destructive" className="text-[8px] h-3.5">Requerido</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {group.options.map(opt => {
                    const isSelected = (modDialog.selectedMods[group.id] || []).some(m => m.id === opt.id);
                    return (
                      <button key={opt.id} onClick={() => {
                        setModDialog(prev => {
                          const current = prev.selectedMods[group.id] || [];
                          const updated = group.max_selections === 1 ? (isSelected ? [] : [opt]) : (isSelected ? current.filter(m => m.id !== opt.id) : [...current, opt]);
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
            ))}

            <input value={modDialog.notes} onChange={e => setModDialog(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas especiales..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs" data-testid="item-notes-input" />
          </div>
          <Button onClick={handleConfirmModifiers} data-testid="confirm-modifiers-btn"
            className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold tracking-wider active:scale-95 mt-2">
            AGREGAR ({formatMoney((modDialog.product?.price || 0) * (parseFloat(modDialog.qty) || 1))})
          </Button>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => !open && setCancelDialog({ open: false, itemId: null })}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="cancel-dialog">
          <DialogHeader><DialogTitle className="font-oswald flex items-center gap-2">
            <AlertTriangle size={16} className="text-destructive" /> Razon de Anulacion
          </DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            {cancelReasons.map(reason => (
              <button key={reason.id} onClick={() => handleCancelItem(reason.id)} data-testid={`cancel-reason-${reason.id}`}
                className="w-full p-2.5 rounded-lg border border-border bg-background hover:border-destructive/50 text-left transition-colors active:scale-[0.98]">
                <span className="text-xs font-medium">{reason.name}</span>
                <span className={`block text-[9px] mt-0.5 ${reason.return_to_inventory ? 'text-table-free' : 'text-destructive'}`}>
                  {reason.return_to_inventory ? 'Retorna al inventario' : 'No retorna'}
                </span>
              </button>
            ))}
          </div>
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
                    const isOccupied = t.status === 'occupied' || t.status === 'billed';
                    const isFree = t.status === 'free';
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleMoveTable(t.id)}
                        className={`p-2 rounded-lg text-center font-oswald transition-all border ${
                          isFree 
                            ? 'border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/20' 
                            : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                        }`}
                      >
                        <span className="text-sm font-bold">#{t.number}</span>
                        <span className="block text-[8px] mt-0.5">
                          {isFree ? 'Libre' : 'Ocupada'}
                        </span>
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
    </div>
  );
}
