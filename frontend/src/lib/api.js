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
  sendToKitchen: (id) => api.post(`/orders/${id}/send-kitchen`),
  moveToTable: (orderId, targetTableId, merge = false) => api.post(`/orders/${orderId}/move`, { target_table_id: targetTableId, merge }),
  splitToNewOrder: (orderId, itemIds) => api.post(`/orders/${orderId}/split-to-new`, { item_ids: itemIds }),
  getTableOrders: (tableId) => api.get(`/tables/${tableId}/orders`),
  createNewAccount: (tableId) => api.post(`/tables/${tableId}/orders/new`),
};

// Kitchen
export const kitchenAPI = {
  orders: () => api.get('/kitchen/orders'),
  updateItem: (orderId, itemId, data) => api.put(`/kitchen/items/${orderId}/${itemId}`, data),
};

// Bills
export const billsAPI = {
  list: (params) => api.get('/bills', { params }),
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

export default api;
