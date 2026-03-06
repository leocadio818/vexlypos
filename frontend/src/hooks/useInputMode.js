import { useState, useEffect } from 'react';

/**
 * Detect if the device is touch-only (no physical keyboard/mouse)
 * Touch-only → tablet/iPad without keyboard → needs on-screen keypad
 * Has pointer fine → has mouse/trackpad → likely has physical keyboard
 */
export function useInputMode() {
  const [isTouchOnly, setIsTouchOnly] = useState(false);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const fine = window.matchMedia('(pointer: fine)').matches;
      // Touch-only: has coarse pointer but NO fine pointer
      setIsTouchOnly(coarse && !fine);
    };
    check();
    // Re-check on media query change (e.g. keyboard connected/disconnected)
    const mq = window.matchMedia('(pointer: fine)');
    mq.addEventListener('change', check);
    return () => mq.removeEventListener('change', check);
  }, []);

  return { isTouchOnly };
}
