import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';

const STORAGE_PREFIX = 'vexly_layout';

/**
 * Hook for a single section's card order + hidden state.
 * Does NOT own editMode — that comes from the parent.
 */
export function useSectionLayout(screenId, sectionId, defaultCardIds) {
  const { user } = useAuth();
  const userId = user?.id || 'anon';
  const storageKey = `${STORAGE_PREFIX}_${screenId}_${sectionId}_${userId}`;

  // Memoize default to avoid re-renders
  const defaultStr = defaultCardIds.join(',');
  const defaults = useMemo(() => defaultCardIds, [defaultStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const [cardOrder, setCardOrder] = useState(defaults);
  const [hiddenCards, setHiddenCards] = useState([]);
  const [snapshot, setSnapshot] = useState(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.order?.length) {
          const newCards = defaults.filter(id => !parsed.order.includes(id) && !(parsed.hidden || []).includes(id));
          setCardOrder([...parsed.order.filter(id => defaults.includes(id)), ...newCards]);
          setHiddenCards((parsed.hidden || []).filter(id => defaults.includes(id)));
          return;
        }
      }
    } catch {}
    setCardOrder(defaults);
    setHiddenCards([]);
  }, [storageKey, defaults]);

  const takeSnapshot = useCallback(() => {
    setSnapshot({ order: [...cardOrder], hidden: [...hiddenCards] });
  }, [cardOrder, hiddenCards]);

  const save = useCallback(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ order: cardOrder, hidden: hiddenCards })); } catch {}
    setSnapshot(null);
  }, [storageKey, cardOrder, hiddenCards]);

  const cancel = useCallback(() => {
    if (snapshot) {
      setCardOrder(snapshot.order);
      setHiddenCards(snapshot.hidden);
    }
    setSnapshot(null);
  }, [snapshot]);

  const restore = useCallback(() => {
    setCardOrder(defaults);
    setHiddenCards([]);
  }, [defaults]);

  const reorder = useCallback((fromIndex, toIndex) => {
    setCardOrder(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const hideCard = useCallback((cardId) => {
    setHiddenCards(prev => [...prev, cardId]);
  }, []);

  const visibleCards = cardOrder.filter(id => !hiddenCards.includes(id));

  return {
    visibleCards,
    cardOrder,
    hiddenCards,
    hasHiddenCards: hiddenCards.length > 0,
    reorder,
    hideCard,
    save,
    cancel,
    restore,
    takeSnapshot,
  };
}

/**
 * Master hook for a full screen with multiple editable sections.
 * Manages the single editMode state and coordinates save/cancel across all sections.
 */
export function useScreenEditMode() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'owner' || (user?.role_level ?? 0) >= 90;
  const [editMode, setEditMode] = useState(false);
  const sectionsRef = useRef([]);

  const registerSection = useCallback((section) => {
    sectionsRef.current = section;
  }, []);

  const enterEditMode = useCallback(() => {
    if (!isAdmin || editMode) return;
    // Take snapshot of all sections
    sectionsRef.current.forEach(s => s.takeSnapshot());
    setEditMode(true);
  }, [isAdmin, editMode]);

  const save = useCallback(() => {
    sectionsRef.current.forEach(s => s.save());
    setEditMode(false);
  }, []);

  const cancel = useCallback(() => {
    sectionsRef.current.forEach(s => s.cancel());
    setEditMode(false);
  }, []);

  const restore = useCallback(() => {
    sectionsRef.current.forEach(s => s.restore());
  }, []);

  const hasHiddenCards = sectionsRef.current.some?.(s => s.hasHiddenCards) || false;

  return {
    isAdmin,
    editMode,
    enterEditMode,
    save,
    cancel,
    restore,
    registerSection,
    hasHiddenCards,
  };
}

/**
 * Long press hook — activates edit mode on 900ms hold with zero movement.
 * Cancels on: finger movement > 15px, native scroll detected, or touch end.
 * Listens for scroll events on the nearest scrollable ancestor to reliably
 * cancel the timer even when the browser intercepts touchMove for native scroll.
 */
export function useLongPress(callback, ms = 900) {
  const timerRef = useRef(null);
  const callbackRef = useRef(callback);
  const startPos = useRef(null);
  const activeRef = useRef(false);
  const scrollParentRef = useRef(null);
  callbackRef.current = callback;

  const MOVE_TOLERANCE = 15;

  // Cancel timer when parent scrolls (browser-intercepted scroll)
  const onScrollDetected = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
    activeRef.current = false;
  }, []);

  const removeScrollListener = useCallback(() => {
    if (scrollParentRef.current) {
      scrollParentRef.current.removeEventListener('scroll', onScrollDetected);
      scrollParentRef.current = null;
    }
  }, [onScrollDetected]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
    activeRef.current = false;
    removeScrollListener();
  }, [removeScrollListener]);

  // Walk up the DOM to find the nearest scrollable ancestor
  const findScrollParent = useCallback((el) => {
    let node = el?.parentElement;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflow + style.overflowY)) return node;
      node = node.parentElement;
    }
    return window;
  }, []);

  const beginPress = useCallback((x, y, target) => {
    if (activeRef.current) return;
    activeRef.current = true;
    startPos.current = { x, y };

    // Attach scroll listener to nearest scrollable parent
    removeScrollListener();
    const scrollParent = findScrollParent(target);
    scrollParentRef.current = scrollParent;
    scrollParent.addEventListener('scroll', onScrollDetected, { passive: true });

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      startPos.current = null;
      activeRef.current = false;
      removeScrollListener();
      callbackRef.current();
    }, ms);
  }, [ms, findScrollParent, onScrollDetected, removeScrollListener]);

  const checkMove = useCallback((x, y) => {
    if (!startPos.current || !timerRef.current) return;
    const dx = Math.abs(x - startPos.current.x);
    const dy = Math.abs(y - startPos.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      clearTimer();
    }
  }, [clearTimer]);

  // Touch handlers (primary on mobile)
  const onTouchStart = useCallback((e) => {
    if (!e.touches?.length) return;
    beginPress(e.touches[0].clientX, e.touches[0].clientY, e.target);
  }, [beginPress]);

  const onTouchMove = useCallback((e) => {
    if (!e.touches?.length) return;
    checkMove(e.touches[0].clientX, e.touches[0].clientY);
  }, [checkMove]);

  // Mouse handlers (desktop only — skip if touch already active)
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    beginPress(e.clientX, e.clientY, e.target);
  }, [beginPress]);

  const onMouseMove = useCallback((e) => {
    checkMove(e.clientX, e.clientY);
  }, [checkMove]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    removeScrollListener();
  }, [removeScrollListener]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: clearTimer,
    onTouchCancel: clearTimer,
    onMouseDown,
    onMouseMove,
    onMouseUp: clearTimer,
    onMouseLeave: clearTimer,
    onContextMenu: (e) => e.preventDefault(),
    style: { WebkitTouchCallout: 'none', userSelect: 'none', touchAction: 'pan-y' },
  };
}
