'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — auto-scroll that respects user intent.
 *
 * Key principles:
 * - Wheel-up is the single source of truth for "user wants to scroll freely"
 * - Once the user scrolls up, auto-scroll is fully paused until they explicitly
 *   scroll back to the bottom (manually or via the FAB button)
 * - Auto-scroll only fires during `working` or the settling period
 * - ResizeObserver handles content growth; MutationObserver handles DOM changes
 */

interface UseAutoScrollOptions {
  working: boolean;
}

interface UseAutoScrollReturn {
  scrollRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

const BOTTOM_THRESHOLD = 80; // px from bottom to consider "at bottom"
const SETTLING_MS = 300;

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Internal state refs (no re-renders)
  const userScrolledRef = useRef(false);
  const isAutoScrollingRef = useRef(false); // true while we're programmatically scrolling
  const settlingRef = useRef(false);
  const settlingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---- Core instant scroll-to-bottom ----
  const doScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollTop = el.scrollHeight;
    // Reset the flag after a frame so the scroll event handler can distinguish
    requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
    });
  }, []);

  // ---- Public scrollToBottom (smooth, resets user-scrolled) ----
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    userScrolledRef.current = false;
    setShowScrollButton(false);
    // Reset after the smooth scroll completes (~300ms)
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 400);
  }, []);

  // ---- Wheel event: the primary user-intent detector ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Ignore wheel events inside nested scrollable regions
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-scrollable]')) return;

      if (e.deltaY < 0) {
        // Scrolling UP = user wants to read previous content
        userScrolledRef.current = true;
        setShowScrollButton(true);
      } else if (e.deltaY > 0) {
        // Scrolling DOWN — check if user reached the bottom
        requestAnimationFrame(() => {
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
          if (atBottom) {
            userScrolledRef.current = false;
            setShowScrollButton(false);
          }
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // ---- Scroll event: only used for showScrollButton when NOT auto-scrolling ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      // Skip events caused by our own programmatic scrolling
      if (isAutoScrollingRef.current) return;

      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
      if (atBottom) {
        userScrolledRef.current = false;
        setShowScrollButton(false);
      }
      // Don't set userScrolledRef to true here — that's the wheel handler's job
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // ---- ResizeObserver: auto-scroll on content growth (only when not user-scrolled) ----
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (userScrolledRef.current) return;
      if (!working && !settlingRef.current) return;
      doScroll();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [doScroll, working]);

  // ---- Settling period ----
  useEffect(() => {
    if (working) {
      clearTimeout(settlingTimerRef.current);
      settlingRef.current = false;
    } else {
      settlingRef.current = true;
      settlingTimerRef.current = setTimeout(() => {
        settlingRef.current = false;
      }, SETTLING_MS);
    }
    return () => clearTimeout(settlingTimerRef.current);
  }, [working]);

  // ---- MutationObserver: auto-scroll on DOM changes during working ----
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new MutationObserver(() => {
      if (userScrolledRef.current) return;
      if (!working && !settlingRef.current) return;
      doScroll();
    });

    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [working, doScroll]);

  return {
    scrollRef,
    contentRef,
    showScrollButton,
    scrollToBottom,
  };
}
