import { openDB } from 'idb';

const DB_NAME = 'vexlypos-offline';
const DB_VERSION = 1;

const STORES = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  TABLES: 'tables',
  CONFIG: 'config',
  CUSTOMERS: 'customers',
  SYNC_QUEUE: 'sync_queue',
};

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.PRODUCTS))
          db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.CATEGORIES))
          db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.TABLES))
          db.createObjectStore(STORES.TABLES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.CONFIG))
          db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORES.CUSTOMERS))
          db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const store = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

async function cacheData(storeName, items) {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  await store.clear();
  for (const item of items) {
    await store.put(item);
  }
  await tx.done;
}

async function getSyncQueueCount() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const index = tx.objectStore(STORES.SYNC_QUEUE).index('status');
    const pending = await index.getAll('pending');
    return pending.length;
  } catch {
    return 0;
  }
}

async function syncWithServer(apiBase, token) {
  const db = await getDB();
  const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
  const index = tx.objectStore(STORES.SYNC_QUEUE).index('status');
  const actions = await index.getAll('pending');
  let synced = 0, failed = 0;

  for (const action of actions) {
    try {
      const res = await fetch(`${apiBase}${action.endpoint}`, {
        method: action.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });
      if (res.ok) {
        const txW = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
        const item = await txW.objectStore(STORES.SYNC_QUEUE).get(action.id);
        if (item) { item.status = 'completed'; await txW.objectStore(STORES.SYNC_QUEUE).put(item); }
        await txW.done;
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}

async function cacheEssentialData(apiBase, token) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const fetches = [
    { store: STORES.PRODUCTS, url: `${apiBase}/api/products` },
    { store: STORES.CATEGORIES, url: `${apiBase}/api/categories` },
    { store: STORES.TABLES, url: `${apiBase}/api/tables` },
    { store: STORES.CUSTOMERS, url: `${apiBase}/api/customers` },
  ];
  for (const { store, url } of fetches) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) await cacheData(store, data);
      }
    } catch {}
  }
  try {
    const res = await fetch(`${apiBase}/api/system/config`, { headers });
    if (res.ok) {
      const data = await res.json();
      const db = await getDB();
      const tx = db.transaction(STORES.CONFIG, 'readwrite');
      await tx.objectStore(STORES.CONFIG).put({ key: 'system', ...data });
      await tx.done;
    }
  } catch {}
}

async function cleanupSyncedData() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const all = await store.getAll();
    for (const item of all) {
      if (item.status === 'completed') await store.delete(item.id);
    }
    await tx.done;
  } catch {}
}

const offlineDB = {
  getSyncQueueCount,
  syncWithServer,
  cacheEssentialData,
  cleanupSyncedData,
};

export default offlineDB;
