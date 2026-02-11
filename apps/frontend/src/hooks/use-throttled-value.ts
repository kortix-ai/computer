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
  const lastUpdateRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestRef = useRef(value);

  useEffect(() => {
    latestRef.current = value;
    const elapsed = Date.now() - lastUpdateRef.current;

    if (elapsed >= intervalMs) {
      // Enough time has passed — update immediately
      setThrottled(value);
      lastUpdateRef.current = Date.now();
      clearTimeout(timerRef.current);
    } else {
      // Schedule a flush for the remaining time
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setThrottled(latestRef.current);
        lastUpdateRef.current = Date.now();
      }, intervalMs - elapsed);
    }

    return () => clearTimeout(timerRef.current);
  }, [value, intervalMs]);

  return throttled;
}
