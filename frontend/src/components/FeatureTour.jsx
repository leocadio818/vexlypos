import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Zap, X, ArrowRight } from 'lucide-react';
import { TOURS, getEligibleTours, getTourProgress, setTourProgress } from '@/lib/tours';

/**
 * Generic spotlight — renders a pulse ring + tooltip anchored to a DOM target.
 */
function Spotlight({ targetSelector, title, body, onDismiss, onSkipAll, placement = 'auto', ctaLabel = 'Entendido', testIdPrefix = 'tour' }) {
  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const update = () => {
      let el = null;
      try { el = document.querySelector(targetSelector); } catch { el = null; }
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
    const spaceRight = vw - (rect.left + rect.width);
    if (spaceRight < tipWidth + gap) {
      tipLeft = rect.left - tipWidth - gap;
    } else {
      tipLeft = rect.left + rect.width + gap;
    }
    tipTop = rect.top + rect.height / 2 - tipHeight / 2;
  }
  tipLeft = Math.max(8, Math.min(vw - tipWidth - 8, tipLeft));
  tipTop = Math.max(8, Math.min(vh - tipHeight - 8, tipTop));

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none" data-testid={`${testIdPrefix}-overlay`}>
      <div
        className="absolute rounded-full animate-pulse"
        style={{
          top: rect.top - 8, left: rect.left - 8,
          width: rect.width + 16, height: rect.height + 16,
          boxShadow: '0 0 0 4px rgba(249,115,22,0.6), 0 0 0 10px rgba(249,115,22,0.25), 0 0 24px rgba(249,115,22,0.5)',
        }}
      />
      <div
        className="absolute pointer-events-auto bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-xl shadow-2xl p-4 border border-white/20"
        style={{ top: tipTop, left: tipLeft, width: tipWidth }}
        data-testid={`${testIdPrefix}-tooltip`}
      >
        <button
          onClick={onSkipAll}
          className="absolute top-2 right-2 opacity-80 hover:opacity-100"
          aria-label="Cerrar tour"
          data-testid={`${testIdPrefix}-skip`}
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
            data-testid={`${testIdPrefix}-next`}
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
 * FeatureTour — engine that selects the correct tour based on location + user permissions,
 * and the current progress from localStorage.
 */
export default function FeatureTour({ location, hasPermission }) {
  const [_tick, setTick] = useState(0);

  useEffect(() => { setTick(t => t + 1); }, [location]);

  const eligible = getEligibleTours(hasPermission);

  for (const tour of eligible) {
    const progress = getTourProgress(tour.key);
    if (progress === 'done') continue;
    const stepIdx = progress ? parseInt(progress, 10) - 1 : 0;
    const step = tour.steps[stepIdx];
    if (!step) continue;
    if (!location.startsWith(step.route)) continue;

    // Check that target exists — otherwise try fallback (only last step typically)
    let targetEl = null;
    try { targetEl = typeof document !== 'undefined' ? document.querySelector(step.target) : null; } catch { targetEl = null; }
    const useFallback = !targetEl && step.fallbackTarget;
    const target = useFallback ? step.fallbackTarget : step.target;
    const title = useFallback ? (step.fallbackTitle || step.title) : step.title;
    const body = useFallback ? (step.fallbackBody || step.body) : step.body;
    if (!useFallback && !targetEl) continue; // target missing — skip silently

    const isLast = stepIdx === tour.steps.length - 1;
    const advance = () => {
      if (isLast) setTourProgress(tour.key, 'done');
      else setTourProgress(tour.key, String(stepIdx + 2));
      setTick(t => t + 1);
    };
    const skipAll = () => { setTourProgress(tour.key, 'done'); setTick(t => t + 1); };

    return (
      <Spotlight
        key={`${tour.key}-${stepIdx}-${_tick}`}
        targetSelector={target}
        title={title}
        body={body}
        placement={step.placement || 'auto'}
        ctaLabel={isLast ? 'Terminar' : 'Entendido'}
        onDismiss={advance}
        onSkipAll={skipAll}
        testIdPrefix={`tour-${tour.key}`}
      />
    );
  }

  return null;
}

/** Helper re-export for consumers outside the engine */
export { TOURS };
