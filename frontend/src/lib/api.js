import axios from 'axios';

const API_BASE = process.env.REACT_APP_BACKEND_URL;
const API = `${API_BASE}/api`;

const QUEUE_KEY = 'pos_offline_queue';

const api = axios.create({ baseURL: API });

// Token interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Offline queue interceptor
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!navigator.onLine && err.config && ['post', 'put', 'delete'].includes(err.config.method)) {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ method: err.config.method, url: err.config.url, data: err.config.data });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
    return Promise.reject(err);
  }
);

// Process offline queue when back online
export async function processOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (queue.length === 0) return;
  const failed = [];
  for (const req of queue) {
    try {
      await api({ method: req.method, url: req.url, data: req.data ? JSON.parse(req.data) : undefined });
    } catch {
      failed.push(req);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
}

// Format money RD$
export function formatMoney(amount) {
  return `RD$ ${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0)}`;
}

// Auth
export const authAPI = {
  login: (pin) => api.post('/auth/login', { pin }),
  me: () => api.get('/auth/me'),
};

// Seed
export const seedAPI = {
  seed: () => api.post('/seed'),
};

// Areas
export const areasAPI = {
  list: () => api.get('/areas'),
  create: (data) => api.post('/areas', data),
  update: (id, data) => api.put(`/areas/${id}`, data),
  delete: (id) => api.delete(`/areas/${id}`),
};

// Tables
export const tablesAPI = {
  list: (areaId) => api.get('/tables', { params: areaId ? { area_id: areaId } : {} }),
  create: (data) => api.post('/tables', data),
  update: (id, data) => api.put(`/tables/${id}`, data),
  delete: (id) => api.delete(`/tables/${id}`),
};

// Categories
export const categoriesAPI = {
  list: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

// Products
export const productsAPI = {
  list: (categoryId) => api.get('/products', { params: categoryId ? { category_id: categoryId } : {} }),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.put(`/products/${id}`, { active: false }),
};

// Modifiers
export const modifiersAPI = {
  list: () => api.get('/modifiers'),
  get: (id) => api.get(`/modifiers/${id}`),
  create: (data) => api.post('/modifiers', data),
  update: (id, data) => api.put(`/modifiers/${id}`, data),
  delete: (id) => api.delete(`/modifiers/${id}`),
};

// Report Categories (for product classification)
export const reportCategoriesAPI = {
  list: () => api.get('/report-categories'),
  create: (data) => api.post('/report-categories', data),
  update: (id, data) => api.put(`/report-categories/${id}`, data),
  delete: (id) => api.delete(`/report-categories/${id}`),
};

// Orders
export const ordersAPI = {
  list: (params) => api.get('/orders', { params }),
  get: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  addItems: (id, items) => api.post(`/orders/${id}/items`, { items }),
  updateItem: (orderId, itemId, data) => api.put(`/orders/${orderId}/items/${itemId}`, data),
  cancelItem: (orderId, itemId, data) => api.post(`/orders/${orderId}/cancel-item/${itemId}`, data),
  cancelItems: (orderId, data) => api.post(`/orders/${orderId}/cancel-items`, data),
  sendToKitchen: (id) => api.post(`/orders/${id}/send-kitchen`),
  moveToTable: (orderId, targetTableId, merge = false) => api.post(`/orders/${orderId}/move`, { target_table_id: targetTableId, merge }),
  splitToNewOrder: (orderId, itemIds) => api.post(`/orders/${orderId}/split-to-new`, { item_ids: itemIds }),
  getTableOrders: (tableId) => api.get(`/tables/${tableId}/orders`),
  createNewAccount: (tableId) => api.post(`/tables/${tableId}/orders/new`),
  deleteEmpty: (orderId) => api.delete(`/orders/${orderId}/empty`),
  mergeOrders: (sourceOrderId, targetOrderId) => api.post(`/orders/${sourceOrderId}/merge/${targetOrderId}`),
  moveAllToTable: (sourceTableId, targetTableId) => api.post(`/tables/${sourceTableId}/move-all`, { target_table_id: targetTableId }),
};

// Void Audit Logs
export const voidAuditAPI = {
  list: (params) => api.get('/void-audit-logs', { params }),
};

// Kitchen
export const kitchenAPI = {
  orders: () => api.get('/kitchen/orders'),
  updateItem: (orderId, itemId, data) => api.put(`/kitchen/items/${orderId}/${itemId}`, data),
};

// Bills
export const billsAPI = {
  list: (params) => api.get('/bills', { params }),
  get: (id) => api.get(`/bills/${id}`),
  create: (data) => api.post('/bills', data),
  pay: (id, data) => api.post(`/bills/${id}/pay`, data),
  cancel: (id) => api.post(`/bills/${id}/cancel`),
};

// Cancellation Reasons
export const reasonsAPI = {
  list: () => api.get('/cancellation-reasons'),
  create: (data) => api.post('/cancellation-reasons', data),
  update: (id, data) => api.put(`/cancellation-reasons/${id}`, data),
};

// Shifts
export const shiftsAPI = {
  list: () => api.get('/shifts'),
  current: () => api.get('/shifts/current'),
  open: (data) => api.post('/shifts/open', data),
  close: (id, data) => api.put(`/shifts/${id}/close`, data),
};

// Table Movements Audit
export const tableMovementsAPI = {
  list: (params) => api.get('/reports/table-movements', { params }),
  stats: (date) => api.get('/reports/table-movements/stats', { params: date ? { date } : {} }),
};

// ─── INVENTORY MANAGEMENT ───

// Ingredients
export const ingredientsAPI = {
  list: (category) => api.get('/ingredients', { params: category ? { category } : {} }),
  get: (id) => api.get(`/ingredients/${id}`),
  create: (data) => api.post('/ingredients', data),
  update: (id, data) => api.put(`/ingredients/${id}`, data),
  delete: (id) => api.delete(`/ingredients/${id}`),
};

// Stock
export const stockAPI = {
  list: (params) => api.get('/stock', { params }),
  byIngredient: (ingredientId) => api.get(`/stock/by-ingredient/${ingredientId}`),
  upsert: (data) => api.post('/stock', data),
  transfer: (data) => api.post('/stock/transfer', data),
  waste: (data) => api.post('/stock/waste', data),
  adjust: (data) => api.post('/inventory/adjust', data),
  alerts: () => api.get('/inventory/alerts'),
};

// Stock Movements
export const stockMovementsAPI = {
  list: (params) => api.get('/stock-movements', { params }),
};

// Stock Alerts
export const stockAlertsAPI = {
  check: (sendEmail = false) => api.get('/inventory/check-alerts', { params: { send_email: sendEmail } }),
  getConfig: () => api.get('/inventory/alert-config'),
  updateConfig: (data) => api.put('/inventory/alert-config', data),
  getLogs: (limit = 20) => api.get('/inventory/alert-logs', { params: { limit } }),
  getSchedulerStatus: () => api.get('/inventory/scheduler-status'),
};

// Warehouses
export const warehousesAPI = {
  list: () => api.get('/warehouses'),
  create: (data) => api.post('/warehouses', data),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  delete: (id) => api.delete(`/warehouses/${id}`),
};

// Suppliers
export const suppliersAPI = {
  list: () => api.get('/suppliers'),
  get: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
};

// Recipes
export const recipesAPI = {
  list: () => api.get('/recipes'),
  get: (productId) => api.get(`/recipes/product/${productId}`),
  create: (data) => api.post('/recipes', data),
  delete: (id) => api.delete(`/recipes/${id}`),
  deleteByProduct: (productId) => api.delete(`/recipes/product/${productId}`),
  getCost: (productId) => api.get(`/inventory/recipe-cost/${productId}`),
  recalculateCosts: () => api.post('/inventory/recalculate-costs'),
};

// Inventory Explosion
export const inventoryExplosionAPI = {
  deductForProduct: (data) => api.post('/inventory/deduct-for-product', data),
  checkAvailability: (data) => api.post('/inventory/check-availability', data),
};

// Sub-recipe Production
export const productionAPI = {
  listSubrecipes: () => api.get('/inventory/subrecipes'),
  checkProduction: (data) => api.post('/inventory/check-production', data),
  produce: (data) => api.post('/inventory/produce', data),
  getHistory: (params) => api.get('/inventory/production-history', { params }),
};

// Inventory Settings
export const inventorySettingsAPI = {
  get: () => api.get('/inventory/settings'),
  update: (data) => api.put('/inventory/settings', data),
  getReorderAlerts: () => api.get('/inventory/reorder-alerts'),
  getProductsStockStatus: (warehouseId) => api.get('/inventory/products-stock', { params: warehouseId ? { warehouse_id: warehouseId } : {} }),
  getProductStockStatus: (productId, warehouseId) => api.get(`/inventory/product-stock/${productId}`, { params: warehouseId ? { warehouse_id: warehouseId } : {} }),
};

// Purchase Orders
export const purchaseOrdersAPI = {
  list: (params) => api.get('/purchase-orders', { params }),
  get: (id) => api.get(`/purchase-orders/${id}`),
  create: (data) => api.post('/purchase-orders', data),
  update: (id, data) => api.put(`/purchase-orders/${id}`, data),
  updateStatus: (id, status) => api.put(`/purchase-orders/${id}/status`, null, { params: { status } }),
  receive: (id, data) => api.post(`/purchase-orders/${id}/receive`, data),
  delete: (id) => api.delete(`/purchase-orders/${id}`),
};

export default api;
