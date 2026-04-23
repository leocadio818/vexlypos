import { useEffect } from 'react';

/**
 * Atajo de teclado global "/" para enfocar el primer buscador visible de la página.
 * Convención: cualquier <input> con data-testid que contenga "search" es elegible.
 * No se activa si el usuario ya está escribiendo en un input/textarea/select/contentEditable
 * ni si se combina con Ctrl/Meta/Alt.
 */
export default function GlobalSearchShortcut() {
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const ae = document.activeElement;
      const tag = (ae?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || ae?.isContentEditable) return;

      const candidates = Array.from(
        document.querySelectorAll('input[data-testid*="search"]')
      ).filter((el) => {
        if (el.disabled || el.type === 'hidden') return false;
        // offsetParent === null when display:none or detached; guards against hidden modals
        if (el.offsetParent === null) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

      if (candidates.length === 0) return;
      e.preventDefault();
      const target = candidates[0];
      target.focus();
      target.select?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return null;
}
