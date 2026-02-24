import { openDB } from 'idb';

const DB_NAME = 'pos_offline_db';
const DB_VERSION = 1;

// Store names
const STORES = {
  PENDING_ORDERS: 'pending_orders',
  PENDING_ITEMS: 'pending_items',
  PENDING_ACTIONS: 'pending_actions',
  CACHED_DATA: 'cached_data',
  SYNC_QUEUE: 'sync_queue',
};

// Check if IndexedDB is available (not available in Safari private mode)
function isIndexedDBAvailable() {
  try {
    // Check if indexedDB exists
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      return false;
    }
    // Try to open a test database
    return true;
  } catch (e) {
    console.warn('IndexedDB not available:', e.message);
    return false;
  }
}

// Flag to track if IndexedDB is available
let indexedDBAvailable = null;

// Initialize IndexedDB
async function initDB() {
  // Check availability once
  if (indexedDBAvailable === null) {
    indexedDBAvailable = isIndexedDBAvailable();
  }
  
  // If IndexedDB is not available, return null
  if (!indexedDBAvailable) {
    console.warn('IndexedDB not available - offline features disabled');
    return null;
  }
  
  try {
    return await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store for pending orders created offline
        if (!db.objectStoreNames.contains(STORES.PENDING_ORDERS)) {
          const orderStore = db.createObjectStore(STORES.PENDING_ORDERS, { keyPath: 'localId' });
          orderStore.createIndex('tableId', 'tableId');
          orderStore.createIndex('createdAt', 'createdAt');
        }
        
        // Store for pending items to add to orders
        if (!db.objectStoreNames.contains(STORES.PENDING_ITEMS)) {
          const itemStore = db.createObjectStore(STORES.PENDING_ITEMS, { keyPath: 'localId' });
          itemStore.createIndex('orderId', 'orderId');
          itemStore.createIndex('createdAt', 'createdAt');
        }
        
        // Store for generic pending actions (split, move, etc.)
        if (!db.objectStoreNames.contains(STORES.PENDING_ACTIONS)) {
          const actionStore = db.createObjectStore(STORES.PENDING_ACTIONS, { keyPath: 'localId' });
          actionStore.createIndex('type', 'type');
          actionStore.createIndex('createdAt', 'createdAt');
        }
        
        // Store for cached data (products, categories, tables, areas)
        if (!db.objectStoreNames.contains(STORES.CACHED_DATA)) {
          db.createObjectStore(STORES.CACHED_DATA, { keyPath: 'key' });
        }
        
        // Store for sync queue
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('type', 'type');
          syncStore.createIndex('priority', 'priority');
          syncStore.createIndex('createdAt', 'createdAt');
        }
      },
    });
  } catch (e) {
    console.warn('Failed to initialize IndexedDB:', e.message);
    indexedDBAvailable = false;
    return null;
  }
}

// Generate local ID
function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// =====================
// CACHED DATA OPERATIONS
// =====================

export async function cacheData(key, data) {
  const db = await initDB();
  if (!db) return; // IndexedDB not available
  await db.put(STORES.CACHED_DATA, { 
    key, 
    data, 
    cachedAt: new Date().toISOString() 
  });
}

export async function getCachedData(key) {
  const db = await initDB();
  if (!db) return null; // IndexedDB not available
  const result = await db.get(STORES.CACHED_DATA, key);
  return result?.data || null;
}

export async function clearCachedData(key) {
  const db = await initDB();
  if (!db) return; // IndexedDB not available
  await db.delete(STORES.CACHED_DATA, key);
}

// Cache all essential data for offline use
export async function cacheEssentialData(apiBase, token) {
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const [products, categories, tables, areas, paymentMethods, modifiers] = await Promise.all([
      fetch(`${apiBase}/api/products`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/categories`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/tables`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/areas`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/payment-methods`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/modifiers`, { headers }).then(r => r.json()).catch(() => null),
    ]);
    
    if (products) await cacheData('products', products);
    if (categories) await cacheData('categories', categories);
    if (tables) await cacheData('tables', tables);
    if (areas) await cacheData('areas', areas);
    if (paymentMethods) await cacheData('payment_methods', paymentMethods);
    if (modifiers) await cacheData('modifiers', modifiers);
    
    console.log('[Offline] Essential data cached successfully');
    return true;
  } catch (error) {
    console.error('[Offline] Failed to cache essential data:', error);
    return false;
  }
}

// =====================
// SYNC QUEUE OPERATIONS
// =====================

export async function addToSyncQueue(action) {
  const db = await initDB();
  if (!db) return null; // IndexedDB not available
  const item = {
    ...action,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttempt: null,
  };
  const id = await db.add(STORES.SYNC_QUEUE, item);
  return { ...item, id };
}

export async function getSyncQueue() {
  const db = await initDB();
  if (!db) return []; // IndexedDB not available
  return db.getAllFromIndex(STORES.SYNC_QUEUE, 'createdAt');
}

export async function getSyncQueueCount() {
  const db = await initDB();
  if (!db) return 0; // IndexedDB not available
  return db.count(STORES.SYNC_QUEUE);
}

export async function removeSyncQueueItem(id) {
  const db = await initDB();
  if (!db) return; // IndexedDB not available
  await db.delete(STORES.SYNC_QUEUE, id);
}

export async function updateSyncQueueItem(id, updates) {
  const db = await initDB();
  if (!db) return; // IndexedDB not available
  const item = await db.get(STORES.SYNC_QUEUE, id);
  if (item) {
    await db.put(STORES.SYNC_QUEUE, { ...item, ...updates });
  }
}

export async function clearSyncQueue() {
  const db = await initDB();
  if (!db) return; // IndexedDB not available
  await db.clear(STORES.SYNC_QUEUE);
}

// =====================
// OFFLINE ORDER OPERATIONS
// =====================

// Create a new order offline
export async function createOfflineOrder(tableId, userId, userName) {
  const db = await initDB();
  if (!db) return null; // IndexedDB not available
  
  const localId = generateLocalId();
  const order = {
    localId,
    tableId,
    userId,
    userName,
    items: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    synced: false,
  };
  
  await db.put(STORES.PENDING_ORDERS, order);
  
  // Add to sync queue
  await addToSyncQueue({
    type: 'CREATE_ORDER',
    priority: 1,
    data: { tableId, localId },
  });
  
  return order;
}

// Add item to order (works for both online and offline orders)
export async function addOfflineItem(orderId, item, isLocalOrder = false) {
  const db = await initDB();
  if (!db) return null; // IndexedDB not available
  
  const localId = generateLocalId();
  const pendingItem = {
    localId,
    orderId,
    isLocalOrder,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    modifiers: item.modifiers || [],
    notes: item.notes || '',
    createdAt: new Date().toISOString(),
    synced: false,
  };
  
  await db.put(STORES.PENDING_ITEMS, pendingItem);
  
  // If it's a local order, also update the order's items
  if (isLocalOrder) {
    const order = await db.get(STORES.PENDING_ORDERS, orderId);
    if (order) {
      order.items.push(pendingItem);
      await db.put(STORES.PENDING_ORDERS, order);
    }
  }
  
  // Add to sync queue
  await addToSyncQueue({
    type: 'ADD_ITEM',
    priority: 2,
    data: { orderId, item: pendingItem, isLocalOrder },
  });
  
  return pendingItem;
}

// Get pending items for an order
export async function getPendingItemsForOrder(orderId) {
  const db = await initDB();
  return db.getAllFromIndex(STORES.PENDING_ITEMS, 'orderId', orderId);
}

// Get all pending orders
export async function getPendingOrders() {
  const db = await initDB();
  return db.getAll(STORES.PENDING_ORDERS);
}

// Get pending orders for a table
export async function getPendingOrdersForTable(tableId) {
  const db = await initDB();
  return db.getAllFromIndex(STORES.PENDING_ORDERS, 'tableId', tableId);
}

// =====================
// OFFLINE ACTIONS
// =====================

// Add a generic offline action (split, move items, etc.)
export async function addOfflineAction(type, data) {
  const localId = generateLocalId();
  const action = {
    localId,
    type,
    data,
    createdAt: new Date().toISOString(),
    synced: false,
  };
  
  const db = await initDB();
  await db.put(STORES.PENDING_ACTIONS, action);
  
  // Add to sync queue with appropriate priority
  const priorityMap = {
    'SPLIT_ORDER': 3,
    'MOVE_ITEMS': 3,
    'MERGE_ORDERS': 3,
    'UPDATE_TABLE_STATUS': 4,
    'SEND_TO_KITCHEN': 1,
  };
  
  await addToSyncQueue({
    type,
    priority: priorityMap[type] || 5,
    data: { ...data, localId },
  });
  
  return action;
}

// =====================
// SYNC ENGINE
// =====================

export async function syncWithServer(apiBase, token) {
  const queue = await getSyncQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };
  
  const headers = { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  let synced = 0;
  let failed = 0;
  const errors = [];
  
  // Sort by priority and creation time
  const sortedQueue = queue.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  
  for (const item of sortedQueue) {
    try {
      let success = false;
      
      switch (item.type) {
        case 'CREATE_ORDER': {
          const res = await fetch(`${apiBase}/api/tables/${item.data.tableId}/orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const newOrder = await res.json();
            // Update local references with server ID
            await updateLocalOrderReference(item.data.localId, newOrder.id);
            success = true;
          }
          break;
        }
        
        case 'ADD_ITEM': {
          const { orderId, item: itemData, isLocalOrder } = item.data;
          // If it was a local order, we need to find the server ID
          let serverOrderId = orderId;
          if (isLocalOrder) {
            serverOrderId = await getServerOrderId(orderId);
            if (!serverOrderId) {
              // Order hasn't been synced yet, skip for now
              continue;
            }
          }
          
          const res = await fetch(`${apiBase}/api/orders/${serverOrderId}/items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              items: [{
                product_id: itemData.product_id,
                quantity: itemData.quantity,
                modifiers: itemData.modifiers,
                notes: itemData.notes,
              }],
            }),
          });
          if (res.ok) success = true;
          break;
        }
        
        case 'SEND_TO_KITCHEN': {
          const res = await fetch(`${apiBase}/api/orders/${item.data.orderId}/send-to-kitchen`, {
            method: 'POST',
            headers,
          });
          if (res.ok) success = true;
          break;
        }
        
        case 'SPLIT_ORDER': {
          const res = await fetch(`${apiBase}/api/orders/${item.data.orderId}/split`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ item_ids: item.data.itemIds }),
          });
          if (res.ok) success = true;
          break;
        }
        
        case 'MOVE_ITEMS': {
          const res = await fetch(`${apiBase}/api/orders/${item.data.sourceOrderId}/move-items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              target_order_id: item.data.targetOrderId,
              item_ids: item.data.itemIds,
            }),
          });
          if (res.ok) success = true;
          break;
        }
        
        default:
          console.warn('[Sync] Unknown action type:', item.type);
          success = true; // Remove unknown items
      }
      
      if (success) {
        await removeSyncQueueItem(item.id);
        synced++;
      } else {
        await updateSyncQueueItem(item.id, {
          attempts: (item.attempts || 0) + 1,
          lastAttempt: new Date().toISOString(),
        });
        failed++;
      }
    } catch (error) {
      console.error('[Sync] Error syncing item:', error);
      errors.push({ item, error: error.message });
      await updateSyncQueueItem(item.id, {
        attempts: (item.attempts || 0) + 1,
        lastAttempt: new Date().toISOString(),
        lastError: error.message,
      });
      failed++;
    }
  }
  
  return { synced, failed, errors };
}

// Helper to update local order references when server ID is received
async function updateLocalOrderReference(localId, serverId) {
  const db = await initDB();
  
  // Update the pending order
  const order = await db.get(STORES.PENDING_ORDERS, localId);
  if (order) {
    order.serverId = serverId;
    order.synced = true;
    await db.put(STORES.PENDING_ORDERS, order);
  }
  
  // Update any pending items that reference this local order
  const items = await db.getAllFromIndex(STORES.PENDING_ITEMS, 'orderId', localId);
  for (const item of items) {
    item.serverOrderId = serverId;
    await db.put(STORES.PENDING_ITEMS, item);
  }
}

// Helper to get server order ID from local ID
async function getServerOrderId(localId) {
  const db = await initDB();
  const order = await db.get(STORES.PENDING_ORDERS, localId);
  return order?.serverId || null;
}

// =====================
// CLEANUP
// =====================

export async function cleanupSyncedData() {
  const db = await initDB();
  
  // Remove synced orders older than 24 hours
  const orders = await db.getAll(STORES.PENDING_ORDERS);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  for (const order of orders) {
    if (order.synced && new Date(order.createdAt) < oneDayAgo) {
      await db.delete(STORES.PENDING_ORDERS, order.localId);
    }
  }
  
  // Remove synced items older than 24 hours
  const items = await db.getAll(STORES.PENDING_ITEMS);
  for (const item of items) {
    if (item.synced && new Date(item.createdAt) < oneDayAgo) {
      await db.delete(STORES.PENDING_ITEMS, item.localId);
    }
  }
}

export default {
  // Cache
  cacheData,
  getCachedData,
  clearCachedData,
  cacheEssentialData,
  
  // Sync Queue
  addToSyncQueue,
  getSyncQueue,
  getSyncQueueCount,
  removeSyncQueueItem,
  clearSyncQueue,
  
  // Orders
  createOfflineOrder,
  addOfflineItem,
  getPendingOrders,
  getPendingOrdersForTable,
  getPendingItemsForOrder,
  
  // Actions
  addOfflineAction,
  
  // Sync
  syncWithServer,
  cleanupSyncedData,
};
