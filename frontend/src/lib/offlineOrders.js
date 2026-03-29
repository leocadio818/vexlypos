/**
 * Offline-aware wrappers for order operations.
 * When online: calls API normally.
 * When offline: generates local response + queues for sync.
 */
import { ordersAPI } from '@/lib/api';
import { addToSyncQueue } from '@/lib/offlineDB';
import { toast } from 'sonner';

function genLocalId() {
  return 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function nowISO() {
  return new Date().toISOString();
}

// Store offline orders in memory for the current session
const offlineOrders = new Map();

export function getOfflineOrder(orderId) {
  return offlineOrders.get(orderId) || null;
}

/**
 * Create order — offline fallback generates a local order object
 */
export async function createOrderOffline({ table_id, items, table_number, waiter_id, waiter_name }) {
  // Try online first
  try {
    const res = await ordersAPI.create({ table_id, items });
    return res;
  } catch (err) {
    if (!navigator.onLine) {
      const orderId = genLocalId();
      const localItems = items.map(item => ({
        id: genLocalId(),
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        modifiers: item.modifiers || [],
        notes: item.notes || '',
        status: 'pending',
        sent_to_kitchen: false,
        offline: true,
      }));

      const localOrder = {
        id: orderId,
        table_id,
        table_number: table_number || '',
        waiter_id: waiter_id || '',
        waiter_name: waiter_name || '',
        transaction_number: 'OFFLINE',
        status: 'active',
        items: localItems,
        training_mode: false,
        created_at: nowISO(),
        updated_at: nowISO(),
        _offline: true,
      };

      offlineOrders.set(orderId, localOrder);

      // Queue for sync
      await addToSyncQueue({
        endpoint: '/api/orders',
        method: 'POST',
        body: { table_id, items },
        type: 'create_order',
        local_id: orderId,
      });

      toast.info('Orden guardada offline', {
        description: 'Se sincronizara al reconectar',
      });

      return { data: localOrder };
    }
    throw err;
  }
}

/**
 * Add items to order — offline fallback appends to local order
 */
export async function addItemsOffline(orderId, items, currentOrder) {
  try {
    const res = await ordersAPI.addItems(orderId, items);
    return res;
  } catch (err) {
    if (!navigator.onLine && currentOrder) {
      const newItems = items.map(item => ({
        id: genLocalId(),
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        modifiers: item.modifiers || [],
        notes: item.notes || '',
        status: 'pending',
        sent_to_kitchen: false,
        offline: true,
      }));

      const updatedOrder = {
        ...currentOrder,
        items: [...(currentOrder.items || []), ...newItems],
        updated_at: nowISO(),
      };

      offlineOrders.set(orderId, updatedOrder);

      // Queue for sync (will be resolved when order syncs)
      await addToSyncQueue({
        endpoint: `/api/orders/${orderId}/items`,
        method: 'POST',
        body: { items },
        type: 'add_items',
        local_order_id: orderId,
      });

      toast.info('Items agregados offline', {
        description: `${items.length} item(s) — Se sincronizara al reconectar`,
      });

      return { data: updatedOrder };
    }
    throw err;
  }
}

/**
 * Send to kitchen — offline queues the action
 */
export async function sendToKitchenOffline(orderId, currentOrder) {
  try {
    const res = await ordersAPI.sendToKitchen(orderId);
    return res;
  } catch (err) {
    if (!navigator.onLine && currentOrder) {
      // Mark items as "sent" locally
      const updatedItems = (currentOrder.items || []).map(item => {
        if (item.status === 'pending') {
          return { ...item, status: 'sent', sent_to_kitchen: true, offline_sent: true };
        }
        return item;
      });

      const updatedOrder = {
        ...currentOrder,
        items: updatedItems,
        status: 'sent',
        updated_at: nowISO(),
      };

      offlineOrders.set(orderId, updatedOrder);

      await addToSyncQueue({
        endpoint: `/api/orders/${orderId}/send-kitchen`,
        method: 'POST',
        body: {},
        type: 'send_kitchen',
        local_order_id: orderId,
      });

      toast.info('Comanda guardada offline', {
        description: 'Se enviara a cocina al reconectar',
      });

      return { data: updatedOrder };
    }
    throw err;
  }
}
