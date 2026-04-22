// Central registry of interactive onboarding tours.
// Each tour is an ordered list of steps with route + target selector.
// Tours are gated by permissions (any of) and shown ONCE per user per tour.
//
// To add a new tour:
//   1. Add an entry here with a unique key.
//   2. Add permissions (any match = user sees the tour).
//   3. Add steps: { route, target, placement, title, body }.
//      - `route` is a prefix match ('/tables', '/order/quick/', etc.).
//      - `target` is a CSS selector for the pulse ring.
//      - `placement` is 'auto' | 'below' | 'right' | 'left'.
//
// The generic FeatureTour engine handles the rest: overlay, pulse, persistence.

export const TOURS = {
  // ─── ORDEN RÁPIDA ─────────────────────────────────────────────
  quick_order: {
    name: 'Orden Rápida',
    version: 1,
    releasedOn: '2026-04-22',
    permissions: ['open_table'],
    extraPermissions: ['collect_payment'],
    steps: [
      {
        route: '/tables',
        target: '[data-testid="quick-order-btn"]',
        placement: 'auto',
        title: '⚡ Orden Rápida',
        body: 'Para clientes que ordenan al paso (comida para llevar, counter service). No ocupa mesa ni requiere mesero. Tócalo para crear una.',
      },
      {
        route: '/order/quick/',
        target: 'h2',
        placement: 'below',
        title: 'Orden sin mesa',
        body: 'Agrega productos como en cualquier mesa (combos, modificadores, artículos libres). Al terminar toca FACTURAR. El tipo de venta es PARA LLEVAR (E32) automáticamente.',
      },
      {
        route: '/tables',
        target: '[data-testid="quick-order-queue-badge"]',
        placement: 'auto',
        title: 'Cola de órdenes activas',
        fallbackTarget: '[data-testid="quick-order-btn"]',
        fallbackTitle: '¡Listo!',
        fallbackBody: 'Cuando tengas órdenes rápidas activas verás un contador rojo. Las cobradas se entregan automáticamente tras 7 min (configurable en Config → Ventas → Orden Rápida).',
        body: 'Este número es tu cola. Tócalo para cobrar, entregar o ver detalles. Las cobradas se entregan automáticamente tras 7 min.',
      },
    ],
  },

  // ─── COMBOS + HAPPY HOUR ──────────────────────────────────────
  combos: {
    name: 'Combos y Happy Hour',
    version: 1,
    releasedOn: '2026-04-22',
    permissions: ['manage_products', 'config_productos'],
    steps: [
      {
        route: '/tables',
        target: '[data-testid="cat-card-combos"]',
        placement: 'auto',
        title: 'Combos',
        body: 'Los combos aparecen como una categoría más. Al tocarla ves todos los bundles activos. Cada combo tiene precio fijo pero incluye varios productos — el sistema descuenta inventario de cada uno.',
      },
      {
        route: '/settings',
        target: '[data-testid="nav-settings-ventas"], [role="tablist"]',
        placement: 'below',
        title: 'Crear un nuevo combo',
        body: 'En Configuración → Ventas → Combos puedes crear bundles: elige los productos, el precio final y actívalo. También configuras Happy Hour (ej: "Cervezas 2x1 entre 5-7 PM").',
      },
    ],
  },

  // ─── MODIFICADORES VINCULADOS A PRODUCTOS ─────────────────────
  modifiers: {
    name: 'Modificadores Avanzados',
    version: 1,
    releasedOn: '2026-04-22',
    permissions: ['manage_products', 'config_productos'],
    steps: [
      {
        route: '/settings',
        target: '[role="tablist"], .settings-tabs',
        placement: 'below',
        title: 'Modificadores vinculados',
        body: 'Los modificadores se vinculan a productos reales del catálogo. Ej: "Acompañante: Papas Fritas" descuenta una porción de Papas del inventario. Soporta precio A/B/C o incluido.',
      },
      {
        route: '/tables',
        target: '[data-testid="category-grid"]',
        placement: 'auto',
        title: 'Badge "Popular"',
        body: 'Cuando agregas un producto con modificadores, verás un badge "Popular" en los modificadores más vendidos (basado en 30 días de ventas). Ayuda al mesero a sugerir acompañantes ganadores.',
      },
    ],
  },

  // ─── ARTÍCULOS LIBRES ─────────────────────────────────────────
  open_items: {
    name: 'Artículos Libres (Off-menu)',
    version: 1,
    releasedOn: '2026-04-22',
    permissions: ['create_open_items'],
    steps: [
      {
        route: '/tables',
        target: '[data-testid="cat-card-open-items"]',
        placement: 'auto',
        title: '📝 Artículos Libres',
        body: 'Para vender productos que no están en el catálogo (ej: "Cocktail especial del chef"). Tócalo para crear un item custom con precio, canal de impresión (cocina o bar) y mapeo DGII.',
      },
      {
        route: '/reports',
        target: '[role="tablist"], .reports-nav',
        placement: 'below',
        title: 'Reporte de Candidatos',
        body: 'En el reporte "Artículos Libres", si un item se vendió 3+ veces aparece como "Candidato a producto permanente". Con 1 clic lo conviertes en producto oficial del menú con el precio promedio histórico.',
      },
    ],
  },

  // ─── CRM LOYALTY + TARJETA QR ─────────────────────────────────
  loyalty: {
    name: 'Fidelidad y Tarjeta QR',
    version: 1,
    releasedOn: '2026-04-22',
    permissions: ['collect_payment', 'manage_customers'],
    steps: [
      {
        route: '/customers',
        target: '[data-testid="customers-list"], table',
        placement: 'below',
        title: 'Acumulación automática',
        body: 'Los clientes acumulan puntos automáticamente en cada venta. Puedes generarles una tarjeta digital con QR que escanean para ver su saldo — la tarjeta se envía por email automáticamente al alcanzar thresholds configurados.',
      },
      {
        route: '/tables',
        target: '[data-testid="category-grid"]',
        placement: 'auto',
        title: 'Canjear puntos al cobrar',
        body: 'En pantalla de pago aparece la opción "Canjear puntos" si el cliente tiene saldo suficiente. El descuento se aplica antes del ITBIS y queda registrado en el e-CF.',
      },
    ],
  },

  // ─── MAPA DE MESAS (EDIT MODE) ────────────────────────────────
  table_map: {
    name: 'Mapa de Mesas Editable',
    version: 1,
    releasedOn: '2026-04-22',
    permissions: ['manage_tables', 'config_tables'],
    steps: [
      {
        route: '/tables',
        target: '[data-testid="table-edit-btn"], [aria-label="Editar"]',
        placement: 'below',
        title: 'Editar el mapa',
        body: 'Toca "Editar" para entrar en modo edición. Puedes arrastrar mesas, cambiar forma (redonda/cuadrada), agregar decoradores (barra, pared, zona), y ajustar capacidades. Los cambios se guardan solos.',
      },
    ],
  },

  // ─── CIERRE DE JORNADA ────────────────────────────────────────
  business_day: {
    name: 'Cierre de Jornada',
    version: 1,
    releasedOn: '2026-04-22',
    permissions: ['close_day'],
    steps: [
      {
        route: '/dashboard',
        target: '[data-testid="business-day-card"], .business-day',
        placement: 'auto',
        title: 'Jornada activa',
        body: 'Cada día debes abrir y cerrar la jornada contable. Al cerrar, el sistema calcula totales, genera el reporte Z, secuenciales e-CF y resetea contadores (como Orden Rápida #NN).',
      },
    ],
  },
};

/**
 * Return the list of tours the user should potentially see, filtered by permissions.
 */
export function getEligibleTours(hasPermission) {
  const result = [];
  for (const [key, tour] of Object.entries(TOURS)) {
    const perms = [...(tour.permissions || []), ...(tour.extraPermissions || [])];
    // User needs at least one declared permission (if none declared, show to everyone)
    const anyPerm = (tour.permissions || []).length === 0 || (tour.permissions || []).some(p => hasPermission?.(p));
    // If extraPermissions exist, ALL must be satisfied (these are gating-strict)
    const allExtras = (tour.extraPermissions || []).every(p => hasPermission?.(p));
    if (anyPerm && allExtras) result.push({ key, ...tour });
  }
  return result;
}

// localStorage: `vexly_tour_<key>` = 'done' | step number (1-based)
// localStorage: `vexly_tour_<key>_v` = last completed version (int)
// localStorage: `vexly_tours_first_seen_at` = ISO timestamp of first run (for NUEVO detection)
const storageKey = (tourKey) => `vexly_tour_${tourKey}`;
const versionKey = (tourKey) => `vexly_tour_${tourKey}_v`;
const FIRST_SEEN_KEY = 'vexly_tours_first_seen_at';

// One-time migration: old quick-order tour key -> new namespaced key
try {
  if (typeof localStorage !== 'undefined') {
    const legacy = localStorage.getItem('vexly_quick_order_tour_step');
    if (legacy && !localStorage.getItem('vexly_tour_quick_order')) {
      localStorage.setItem('vexly_tour_quick_order', legacy);
      localStorage.removeItem('vexly_quick_order_tour_step');
    }
    // Remember when this device first booted the tours system.
    if (!localStorage.getItem(FIRST_SEEN_KEY)) {
      localStorage.setItem(FIRST_SEEN_KEY, new Date().toISOString());
    }
  }
} catch {}

export function getFirstSeenAt() {
  try { return localStorage.getItem(FIRST_SEEN_KEY); } catch { return null; }
}

export function getTourProgress(tourKey) {
  try { return localStorage.getItem(storageKey(tourKey)); } catch { return null; }
}

export function setTourProgress(tourKey, value) {
  try {
    localStorage.setItem(storageKey(tourKey), String(value));
    if (value === 'done') {
      const v = (TOURS[tourKey] || {}).version || 1;
      localStorage.setItem(versionKey(tourKey), String(v));
    }
  } catch {}
}

export function getCompletedVersion(tourKey) {
  try {
    const v = localStorage.getItem(versionKey(tourKey));
    return v ? parseInt(v, 10) : 0;
  } catch { return 0; }
}

/**
 * Returns true if this tour was either never seen OR was released AFTER the user
 * first booted the tours system AND they haven't completed the current version.
 */
export function isTourNew(tourKey) {
  const tour = TOURS[tourKey];
  if (!tour) return false;
  const seenVersion = getCompletedVersion(tourKey);
  const currentVersion = tour.version || 1;
  if (seenVersion >= currentVersion) return false;
  const firstSeen = getFirstSeenAt();
  if (!firstSeen || !tour.releasedOn) return seenVersion === 0 && getTourProgress(tourKey) !== 'done' ? true : seenVersion < currentVersion;
  try {
    return new Date(tour.releasedOn) >= new Date(firstSeen.slice(0, 10));
  } catch { return seenVersion < currentVersion; }
}

export function resetTour(tourKey) {
  try {
    localStorage.removeItem(storageKey(tourKey));
    localStorage.removeItem(versionKey(tourKey));
  } catch {}
}

export function resetAllTours() {
  try {
    for (const key of Object.keys(TOURS)) {
      localStorage.removeItem(storageKey(key));
      localStorage.removeItem(versionKey(key));
    }
  } catch {}
}
