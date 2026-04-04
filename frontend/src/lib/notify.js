/**
 * Smart Notification System
 * 
 * Uses different styles based on message importance:
 * - SUCCESS (green) → Bottom Sheet, auto-dismiss 3s
 * - WARNING (amber) → Bottom Sheet, auto-dismiss 5s  
 * - ERROR/FISCAL (red) → Centered Modal, requires user action
 * - INFO (blue) → Bottom Sheet, auto-dismiss 3s
 * - CONFIRM (blue) → Centered Modal with Cancel/Confirm buttons
 * 
 * Usage:
 *   import { notify, showNotification } from '@/lib/notify';
 *   
 *   notify.success('Guardado');
 *   notify.error('Error crítico', { description: 'Detalle' });
 *   notify.warning('Advertencia');
 *   notify.confirm('¿Seguro?', { onConfirm: () => {}, onCancel: () => {} });
 *   
 *   // Or use the global API:
 *   showNotification('success', 'Título', 'Mensaje opcional');
 */

const listeners = new Set();

function emit(type, title, opts = {}) {
  const msg = typeof opts === 'string' ? { description: opts } : opts;
  listeners.forEach(fn => fn({ type, title, ...msg }));
}

export const notify = {
  success:  (title, opts) => emit('success', title, opts),
  error:    (title, opts) => emit('error', title, opts),
  warning:  (title, opts) => emit('warning', title, opts),
  info:     (title, opts) => emit('info', title, opts),
  confirm:  (title, opts) => emit('confirm', title, opts),
  dismiss:  ()            => emit('dismiss'),
};

/**
 * Global showNotification API
 * @param {'success'|'warning'|'error'|'info'|'confirm'} type - Notification type
 * @param {string} title - Main message title
 * @param {string|object} messageOrOpts - Description string or options object
 */
export function showNotification(type, title, messageOrOpts) {
  const validTypes = ['success', 'warning', 'error', 'info', 'confirm'];
  if (!validTypes.includes(type)) {
    console.warn(`[notify] Invalid type "${type}". Using "info".`);
    type = 'info';
  }
  
  if (typeof messageOrOpts === 'string') {
    emit(type, title, { description: messageOrOpts });
  } else {
    emit(type, title, messageOrOpts || {});
  }
}

export function onNotify(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
