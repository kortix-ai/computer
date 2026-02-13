'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — auto-scroll that respects user intent.
 *
 * Key principles:
 * - Detects user scroll-away via wheel, touch, keyboard, and generic scroll events
 * - Once the user scrolls up, auto-scroll is fully paused until they explicitly
 *   scroll back to the bottom (manually or via the FAB button)
 * - Auto-scroll only fires during `working` or the settling period
 * - ResizeObserver handles content growth; MutationObserver handles DOM changes
 *   (throttled to avoid scroll spam during rapid streaming)
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
const MUTATION_THROTTLE_MS = 150; // throttle MutationObserver scroll to avoid spam

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Internal state refs (no re-renders)
  const userScrolledRef = useRef(false);
  const isAutoScrollingRef = useRef(false); // true while we're programmatically scrolling
  const settlingRef = useRef(false);
  const settlingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mutationScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Helper: check if scroll container is near the bottom
  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

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

  // ---- Wheel event: user-intent detector ----
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
          if (checkAtBottom()) {
            userScrolledRef.current = false;
            setShowScrollButton(false);
          }
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [checkAtBottom]);

  // ---- Scroll event: detect user scroll via ANY mechanism ----
  // This catches touch scroll, keyboard scroll, trackpad momentum, etc.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Track the last known scroll position to detect direction
    let lastScrollTop = el.scrollTop;

    const handleScroll = () => {
      // Skip events caused by our own programmatic scrolling
      if (isAutoScrollingRef.current) return;

      const currentScrollTop = el.scrollTop;
      const atBottom = el.scrollHeight - currentScrollTop - el.clientHeight < BOTTOM_THRESHOLD;

      if (atBottom) {
        userScrolledRef.current = false;
        setShowScrollButton(false);
      } else if (currentScrollTop < lastScrollTop) {
        // User is scrolling up (scrollTop decreasing = moving away from bottom)
        userScrolledRef.current = true;
        setShowScrollButton(true);
      }

      lastScrollTop = currentScrollTop;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // ---- Touch events: detect touch scroll intent ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-scrollable]')) return;

      const touchY = e.touches[0]?.clientY ?? 0;
      const delta = touchStartY - touchY;

      // Swiping up (positive delta) = scrolling towards top = user wants to read
      if (delta > 10) {
        userScrolledRef.current = true;
        setShowScrollButton(true);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
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

  // ---- MutationObserver: auto-scroll on DOM changes during working (throttled) ----
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new MutationObserver(() => {
      if (userScrolledRef.current) return;
      if (!working && !settlingRef.current) return;

      // Throttle: only scroll once per MUTATION_THROTTLE_MS to avoid
      // rapid-fire scrolling during streaming (characterData fires on every char)
      if (mutationScrollTimerRef.current) return;
      mutationScrollTimerRef.current = setTimeout(() => {
        mutationScrollTimerRef.current = undefined;
        if (userScrolledRef.current) return;
        if (!working && !settlingRef.current) return;
        doScroll();
      }, MUTATION_THROTTLE_MS);
    });

    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      clearTimeout(mutationScrollTimerRef.current);
      mutationScrollTimerRef.current = undefined;
    };
  }, [working, doScroll]);

  return {
    scrollRef,
    contentRef,
    showScrollButton,
    scrollToBottom,
  };
}
