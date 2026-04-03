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
 * Long press hook — activates edit mode on 500ms hold.
 */
export function useLongPress(callback, ms = 500) {
  const timerRef = useRef(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const start = useCallback((e) => {
    if (e.button && e.button !== 0) return;
    timerRef.current = setTimeout(() => {
      callbackRef.current();
      timerRef.current = null;
    }, ms);
  }, [ms]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop };
}
