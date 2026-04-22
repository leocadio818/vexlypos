import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Zap, X, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'vexly_quick_order_tour_step';
const VALUES = { PENDING_FAB: '1', PENDING_ORDER: '2', PENDING_QUEUE: '3', DONE: 'done' };

function getStep() {
  if (typeof window === 'undefined') return VALUES.DONE;
  try { return localStorage.getItem(STORAGE_KEY) || VALUES.PENDING_FAB; } catch { return VALUES.DONE; }
}
function setStep(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch {} }

// Pulse ring + tooltip anchored to a target selector
function Spotlight({ targetSelector, title, body, onDismiss, onSkipAll, placement = 'auto', ctaLabel = 'Entendido' }) {
  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(targetSelector);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const onAny = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(update); };
    window.addEventListener('scroll', onAny, true);
    window.addEventListener('resize', onAny);
    const iv = setInterval(update, 500);
    return () => { window.removeEventListener('scroll', onAny, true); window.removeEventListener('resize', onAny); clearInterval(iv); cancelAnimationFrame(rafRef.current); };
  }, [targetSelector]);

  if (!rect) return null;

  // Decide placement — smart: try right, fall back to left, clamp within viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tipWidth = 320;
  const tipHeight = 150;
  const gap = 14;
  let tipTop;
  let tipLeft;
  if (placement === 'below') {
    tipTop = rect.top + rect.height + gap;
    tipLeft = rect.left;
  } else {
    // auto / right / left
    const spaceRight = vw - (rect.left + rect.width);
    if (spaceRight < tipWidth + gap) {
      tipLeft = rect.left - tipWidth - gap; // left
    } else {
      tipLeft = rect.left + rect.width + gap; // right
    }
    tipTop = rect.top + rect.height / 2 - tipHeight / 2;
  }
  // Clamp within viewport (8px padding)
  tipLeft = Math.max(8, Math.min(vw - tipWidth - 8, tipLeft));
  tipTop = Math.max(8, Math.min(vh - tipHeight - 8, tipTop));
  const tipStyle = { top: tipTop, left: tipLeft, width: tipWidth };

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none" data-testid="quick-order-tour-overlay">
      {/* Pulse ring around target */}
      <div
        className="absolute rounded-full animate-pulse"
        style={{
          top: rect.top - 8, left: rect.left - 8,
          width: rect.width + 16, height: rect.height + 16,
          boxShadow: '0 0 0 4px rgba(249,115,22,0.6), 0 0 0 10px rgba(249,115,22,0.25), 0 0 24px rgba(249,115,22,0.5)',
        }}
      />
      {/* Tooltip */}
      <div
        className="absolute pointer-events-auto bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-xl shadow-2xl p-4 border border-white/20"
        style={tipStyle}
        data-testid="quick-order-tour-tooltip"
      >
        <button
          onClick={onSkipAll}
          className="absolute top-2 right-2 opacity-80 hover:opacity-100"
          aria-label="Cerrar tour"
          data-testid="quick-order-tour-skip"
        >
          <X size={14} />
        </button>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Zap size={14} className="fill-white" />
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">Tour rápido</span>
        </div>
        <h4 className="font-oswald font-bold text-sm mb-1">{title}</h4>
        <p className="text-xs opacity-95 leading-snug">{body}</p>
        <div className="flex justify-end mt-3">
          <button
            onClick={onDismiss}
            className="bg-white/25 hover:bg-white/40 px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1 transition-colors"
            data-testid="quick-order-tour-next"
          >
            {ctaLabel} <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * QuickOrderTour — onboarding overlay for first-time Quick Order users.
 * 3 steps, each triggered by a different location in the app:
 *   1. /tables → highlights the ⚡ FAB
 *   2. /order/quick/:id (first time entering a quick order) → highlights the header
 *   3. Back on /tables after first quick order is paid → highlights the queue badge (if present)
 */
export default function QuickOrderTour({ location }) {
  const [step, setStepState] = useState(() => getStep());
  const [tick, setTick] = useState(0);

  useEffect(() => { setStepState(getStep()); setTick(t => t + 1); }, [location]);

  if (step === VALUES.DONE) return null;

  const advance = (next) => {
    setStep(next);
    setStepState(next);
    setTick(t => t + 1);
  };
  const dismissAll = () => advance(VALUES.DONE);

  // Step 1 — on /tables, highlight the FAB
  if (step === VALUES.PENDING_FAB && location === '/tables') {
    return (
      <Spotlight
        key={`s1-${tick}`}
        targetSelector='[data-testid="quick-order-btn"]'
        title="⚡ Orden Rápida"
        body="Úsalo para clientes que ordenan al paso (comida para llevar, counter service). No ocupa mesa ni requiere mesero. Cualquier cajero autorizado puede hacerlo. Tócalo cuando estés listo para crear tu primera orden rápida."
        placement="auto"
        onDismiss={() => advance(VALUES.PENDING_ORDER)}
        onSkipAll={dismissAll}
      />
    );
  }

  // Step 2 — first time on /order/quick/:id
  if (step === VALUES.PENDING_ORDER && location.startsWith('/order/quick/')) {
    return (
      <Spotlight
        key={`s2-${tick}`}
        targetSelector='h2'
        title="Orden sin mesa"
        body="Agrega productos como en cualquier mesa (combos, modificadores, artículos libres — todo funciona). Al terminar toca FACTURAR para cobrar. El tipo de venta es PARA LLEVAR (E32) automáticamente."
        placement="below"
        onDismiss={() => advance(VALUES.PENDING_QUEUE)}
        onSkipAll={dismissAll}
      />
    );
  }

  // Step 3 — back on /tables, highlight the queue badge if present, else finish
  if (step === VALUES.PENDING_QUEUE && location === '/tables') {
    // Only show if badge exists, otherwise quietly finish
    const exists = typeof document !== 'undefined' && document.querySelector('[data-testid="quick-order-queue-badge"]');
    if (!exists) {
      // defer completion until badge exists, or user opts out — but don't block
      return (
        <Spotlight
          key={`s3b-${tick}`}
          targetSelector='[data-testid="quick-order-btn"]'
          title="¡Listo!"
          body="Cuando tengas órdenes rápidas activas, verás un contador rojo sobre el botón. Al tocarlo abres la cola y puedes cobrar o entregar. Las órdenes cobradas se marcan como entregadas automáticamente tras 7 min (configurable en Config → Ventas → Orden Rápida)."
          placement="auto"
          ctaLabel="Terminar"
          onDismiss={dismissAll}
          onSkipAll={dismissAll}
        />
      );
    }
    return (
      <Spotlight
        key={`s3-${tick}`}
        targetSelector='[data-testid="quick-order-queue-badge"]'
        title="Cola de órdenes activas"
        body="Este número muestra cuántas órdenes rápidas están en curso. Tócalo para ver la cola completa y cobrar, ver detalles o marcar como entregada. Las cobradas se entregan automáticamente tras 7 min."
        placement="auto"
        ctaLabel="Terminar"
        onDismiss={dismissAll}
        onSkipAll={dismissAll}
      />
    );
  }

  return null;
}
