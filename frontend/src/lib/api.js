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

// Tables (with offline localStorage cache)
export const tablesAPI = {
  list: (areaId) => api.get('/tables', { params: areaId ? { area_id: areaId } : {} })
    .then(res => {
      try { localStorage.setItem('vexly_mesas', JSON.stringify(res.data)); } catch {}
      return res;
    })
    .catch(err => {
      if (!err.response) {
        const cached = localStorage.getItem('vexly_mesas');
        if (cached) return { data: JSON.parse(cached) };
      }
      throw err;
    }),
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
  listAll: () => api.get('/products', { params: { include_inactive: true } }),
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

// Orders (with offline localStorage cache)
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
  splitToNewOrder: (orderId, itemIds, label = '') => api.post(`/orders/${orderId}/split`, { item_ids: itemIds, label }),
  getTableOrders: (tableId) => api.get(`/tables/${tableId}/orders`)
    .then(res => {
      try {
        // Merge: keep orders from other tables, replace orders for this table
        const existing = JSON.parse(localStorage.getItem('vexly_orders') || '[]');
        const other = Array.isArray(existing) ? existing.filter(o => o.table_id !== tableId) : [];
        localStorage.setItem('vexly_orders', JSON.stringify([...other, ...(res.data || [])]));
      } catch {}
      return res;
    })
    .catch(err => {
      if (!err.response) {
        const cached = localStorage.getItem('vexly_orders');
        if (cached) {
          const all = JSON.parse(cached);
          return { data: Array.isArray(all) ? all.filter(o => o.table_id === tableId) : [] };
        }
      }
      throw err;
    }),
  createNewAccount: (tableId, label = '') => api.post(`/tables/${tableId}/new-account`, { label }),
  deleteEmpty: (orderId) => api.delete(`/orders/${orderId}/empty`),
  mergeOrders: (sourceOrderId, targetOrderId) => api.post(`/orders/${sourceOrderId}/merge/${targetOrderId}`),
  moveAllToTable: (sourceTableId, targetTableId) => api.post(`/tables/${sourceTableId}/move-all`, { target_table_id: targetTableId }),
  moveItems: (orderId, targetOrderId, itemIds, quantities) => api.post(`/orders/${orderId}/move-items`, { target_order_id: targetOrderId, item_ids: itemIds, quantities }),
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

// Shifts (Legacy MongoDB)
export const shiftsAPI = {
  list: () => api.get('/shifts'),
  current: () => api.get('/shifts/current'),
  open: (data) => api.post('/shifts/open', data),
  close: (id, data) => api.put(`/shifts/${id}/close`, data),
};

// POS Sessions (Supabase)
export const posSessionsAPI = {
  health: () => api.get('/pos-sessions/health'),
  check: () => api.get('/pos-sessions/check'),
  current: () => api.get('/pos-sessions/current'),
  open: (data) => api.post('/pos-sessions/open', data),
  close: (id, data) => api.put(`/pos-sessions/${id}/close`, data),
  history: (params) => api.get('/pos-sessions/history', { params }),
  terminals: () => api.get('/pos-sessions/terminals'),
  terminalsInUse: () => api.get('/pos-sessions/terminals/in-use'),
  movementReasons: () => api.get('/pos-sessions/movement-reasons'),
  // Movements
  addMovement: (sessionId, data) => api.post(`/pos-sessions/${sessionId}/movements`, data),
  getMovements: (sessionId) => api.get(`/pos-sessions/${sessionId}/movements`),
  registerSale: (sessionId, amount, method) => api.put(`/pos-sessions/${sessionId}/register-sale`, null, { params: { amount, payment_method: method } }),
  salesBreakdown: (sessionId) => api.get(`/pos-sessions/${sessionId}/sales-breakdown`),
};

// Business Days (Jornadas de Trabajo)
export const businessDaysAPI = {
  // Estado actual
  check: () => api.get('/business-days/check'),
  current: () => api.get('/business-days/current'),
  // Operaciones
  authorize: (pin, action) => api.post('/business-days/authorize', { pin, action }),
  open: (data) => api.post('/business-days/open', data),
  close: (data) => api.post('/business-days/close', data),
  // Historial
  history: (params) => api.get('/business-days/history', { params }),
  get: (id) => api.get(`/business-days/${id}`),
  getTransactions: (id) => api.get(`/business-days/${id}/transactions`),
  // Reportes X y Z
  reportZ: (dayId) => api.get(`/business-days/${dayId}/report-z`),
  reportZCurrent: () => api.get('/business-days/current/report-z'),
  reportX: (sessionId) => api.get(`/business-days/session/${sessionId}/report-x`),
};

// Tax Configuration (Sistema de Impuestos Dinámico)
export const taxesAPI = {
  // Config
  getConfigs: () => api.get('/taxes/config'),
  createConfig: (data) => api.post('/taxes/config', data),
  updateConfig: (code, data) => api.put(`/taxes/config/${code}`, data),
  deleteConfig: (code) => api.delete(`/taxes/config/${code}`),
  seedDefaults: () => api.post('/taxes/seed-defaults'),
  // Product taxes
  getProductTaxes: (productId) => api.get(`/taxes/products/${productId}`),
  assignTax: (data) => api.post('/taxes/products/assign', data),
  removeTax: (productId, taxCode) => api.delete(`/taxes/products/${productId}/${taxCode}`),
  bulkAssign: (productIds, taxCode) => api.post('/taxes/products/bulk-assign', { product_ids: productIds, tax_code: taxCode }),
  assignToCategory: (categoryId, taxCode) => api.post('/taxes/category/assign', null, { params: { category_id: categoryId, tax_code: taxCode } }),
  // Calculation
  calculate: (productId, quantity, unitPrice, isDelivery = false) => 
    api.post('/taxes/calculate', null, { params: { product_id: productId, quantity, unit_price: unitPrice, is_delivery: isDelivery } }),
  // Report
  getTaxSummary: (params) => api.get('/taxes/report/summary', { params }),
};

// NCF - Comprobantes Fiscales (Supabase)
export const ncfAPI = {
  // Types
  getTypes: () => api.get('/ncf/types'),
  getType: (code) => api.get(`/ncf/types/${code}`),
  // Sequences CRUD
  getSequences: (activeOnly = true, includeAlerts = true) => 
    api.get('/ncf/sequences', { params: { active_only: activeOnly, include_alerts: includeAlerts } }),
  getSequence: (id) => api.get(`/ncf/sequences/${id}`),
  createSequence: (data) => api.post('/ncf/sequences', data),
  updateSequence: (id, data) => api.put(`/ncf/sequences/${id}`, data),
  deleteSequence: (id) => api.delete(`/ncf/sequences/${id}`),
  // Generation
  generate: (ncfTypeCode, billTotal) => 
    api.post(`/ncf/generate/${ncfTypeCode}`, null, { params: { bill_total: billTotal } }),
  // Return reasons
  getReturnReasons: () => api.get('/ncf/return-reasons'),
  // Alerts
  getAlerts: () => api.get('/ncf/alerts'),
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
  getAffectedRecipes: (id) => api.get(`/ingredients/${id}/affected-recipes`),
  getAuditLogs: (id, limit = 50) => api.get(`/ingredients/${id}/audit-logs`, { params: { limit } }),
  getAllAuditLogs: (params) => api.get('/ingredients/audit-logs/all', { params }),
  getConversionAnalysis: (id) => api.get(`/ingredients/${id}/conversion-analysis`),
};

// Unit Definitions (Custom Units)
export const unitDefinitionsAPI = {
  list: () => api.get('/unit-definitions'),
  create: (data) => api.post('/unit-definitions', data),
  update: (id, data) => api.put(`/unit-definitions/${id}`, data),
  delete: (id) => api.delete(`/unit-definitions/${id}`),
};

// Stock
export const stockAPI = {
  list: (params) => api.get('/stock', { params }),
  listMultilevel: (params) => api.get('/stock/multilevel', { params }),
  byIngredient: (ingredientId) => api.get(`/stock/by-ingredient/${ingredientId}`),
  upsert: (data) => api.post('/stock', data),
  transfer: (data) => api.post('/stock/transfer', data),
  waste: (data) => api.post('/stock/waste', data),
  difference: (data) => api.post('/stock/difference', data),
  listDifferences: (params) => api.get('/stock/differences', { params }),
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
  update: (id, data) => api.put(`/recipes/${id}`, data),
  delete: (id) => api.delete(`/recipes/${id}`),
  deleteForce: (id) => api.delete(`/recipes/${id}`, { params: { force: true } }),
  deleteByProduct: (productId) => api.delete(`/recipes/product/${productId}`),
  getCost: (productId) => api.get(`/inventory/recipe-cost/${productId}`),
  recalculateCosts: () => api.post('/inventory/recalculate-costs'),
  getHistory: (recipeId) => api.get(`/recipes/${recipeId}/history`),
  getAllHistory: (params) => api.get('/recipes/history/all', { params }),
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

// Shopping Assistant & Cost Control
export const purchasingAPI = {
  getSuggestions: (params) => api.get('/purchasing/suggestions', { params }),
  generatePO: (data) => api.post('/purchasing/generate-po', data),
  getPriceAlerts: () => api.get('/purchasing/price-alerts'),
  recalculateMargins: () => api.post('/purchasing/recalculate-recipe-margins'),
  getIngredientPriceHistory: (id, limit = 50) => api.get(`/ingredients/${id}/price-history`, { params: { limit } }),
};

// Reports
export const reportsAPI = {
  inventoryValuation: (params) => api.get('/reports/inventory-valuation', { params }),
  valuationTrends: (params) => api.get('/reports/valuation-trends', { params }),
  inventory: () => api.get('/reports/inventory'),
  profit: (date) => api.get('/reports/profit', { params: date ? { date } : {} }),
  voids: (params) => api.get('/reports/voids', { params }),
  stockAdjustments: (params) => api.get('/reports/stock-adjustments', { params }),
};

export default api;
