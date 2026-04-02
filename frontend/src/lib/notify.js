/**
 * Global notification emitter — drop-in replacement for sonner toast.
 * Usage:  import { notify } from '@/lib/notify';
 *         notify.success('Guardado');
 *         notify.error('Error', { description: 'Detalle' });
 *         notify.confirm('¿Seguro?', { onConfirm: () => {} });
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

export function onNotify(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
