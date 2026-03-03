'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * useThrottledValue — throttles a rapidly-changing value to limit re-renders.
 *
 * Returns the latest value, but only updates at most once per `intervalMs`.
 * When the value stops changing, the final value is flushed immediately.
 *
 * Matches SolidJS reference `createThrottledValue()` (100ms default).
 */
export function useThrottledValue<T>(value: T, intervalMs = 100): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdateRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const latestRef = useRef(value);

  useEffect(() => {
    latestRef.current = value;
    pendingRef.current = true;

    if (frameRef.current !== null) return;

    const tick = () => {
      if (!pendingRef.current) {
        frameRef.current = null;
        return;
      }

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastUpdateRef.current >= intervalMs) {
        pendingRef.current = false;
        lastUpdateRef.current = now;
        setThrottled(latestRef.current);
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value, intervalMs]);

  return throttled;
}
