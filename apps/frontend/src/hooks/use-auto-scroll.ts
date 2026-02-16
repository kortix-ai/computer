'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — auto-scroll that respects user intent.
 *
 * The approach:
 * - We track whether the user has intentionally scrolled away via wheel/touch/keyboard.
 * - Once `userScrolled` is true, ALL programmatic scrolling stops.
 * - It only resets when the user clicks the "Scroll to bottom" button or
 *   actively scrolls (wheel/touch) back down to the bottom.
 * - We use a single shared throttle for both ResizeObserver and MutationObserver
 *   to prevent rapid-fire scrolls that race with user input.
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

const BOTTOM_THRESHOLD = 50; // px from bottom to consider "at bottom"
const SETTLING_MS = 300;
const SCROLL_THROTTLE_MS = 100;

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const userScrolledRef = useRef(false);
  const settlingRef = useRef(false);
  const settlingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollThrottleRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  // ---- Core programmatic scroll (instant) ----
  // Re-checks userScrolledRef right before scrolling to close any race window.
  const doScroll = useCallback(() => {
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // ---- Throttled scroll request ----
  // Both ResizeObserver and MutationObserver funnel through this single
  // throttle so we get at most one doScroll() per SCROLL_THROTTLE_MS.
  const requestScroll = useCallback(() => {
    if (userScrolledRef.current) return;
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = undefined;
      if (userScrolledRef.current) return;
      doScroll();
    }, SCROLL_THROTTLE_MS);
  }, [doScroll]);

  // ---- Public scrollToBottom (smooth, resets user intent) ----
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolledRef.current = false;
    setShowScrollButton(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // ---- Wheel: primary user-intent detector ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-scrollable]')) return;

      if (e.deltaY < 0) {
        // Scrolling UP — user wants to read previous content.
        // Cancel any pending auto-scroll immediately.
        userScrolledRef.current = true;
        if (scrollThrottleRef.current) {
          clearTimeout(scrollThrottleRef.current);
          scrollThrottleRef.current = undefined;
        }
        setShowScrollButton(true);
      } else if (e.deltaY > 0) {
        // Scrolling DOWN — re-engage auto-scroll only when user reaches the bottom
        requestAnimationFrame(() => {
          if (isAtBottom()) {
            userScrolledRef.current = false;
            setShowScrollButton(false);
          }
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isAtBottom]);

  // ---- Touch: detect swipe-up intent ----
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

      if (delta > 10) {
        // Swiping content up = scrolling toward top.
        // Cancel any pending auto-scroll immediately.
        userScrolledRef.current = true;
        if (scrollThrottleRef.current) {
          clearTimeout(scrollThrottleRef.current);
          scrollThrottleRef.current = undefined;
        }
        setShowScrollButton(true);
      } else if (delta < -10) {
        // Swiping content down = scrolling toward bottom
        requestAnimationFrame(() => {
          if (isAtBottom()) {
            userScrolledRef.current = false;
            setShowScrollButton(false);
          }
        });
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isAtBottom]);

  // ---- Scroll event: catch-all for keyboard / scrollbar-drag / momentum ----
  // Detects scrolling UP via mechanisms not covered by wheel/touch.
  // Also detects scrolling back to bottom to re-engage auto-scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let lastScrollTop = el.scrollTop;

    const handleScroll = () => {
      const currentScrollTop = el.scrollTop;
      const scrolledUp = currentScrollTop < lastScrollTop;
      lastScrollTop = currentScrollTop;

      if (scrolledUp && !isAtBottom()) {
        // User scrolled up via keyboard, scrollbar drag, momentum, etc.
        userScrolledRef.current = true;
        if (scrollThrottleRef.current) {
          clearTimeout(scrollThrottleRef.current);
          scrollThrottleRef.current = undefined;
        }
        setShowScrollButton(true);
      } else if (!scrolledUp && isAtBottom() && userScrolledRef.current) {
        // User scrolled back to bottom via scrollbar drag or keyboard
        userScrolledRef.current = false;
        setShowScrollButton(false);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isAtBottom]);

  // ---- Show/hide scroll button when not working ----
  // When the AI finishes and the user is not at the bottom, show the button.
  // When at bottom, hide it.
  useEffect(() => {
    if (working) return;
    const el = scrollRef.current;
    if (!el) return;

    // After work ends, check position
    const timer = setTimeout(() => {
      if (isAtBottom()) {
        setShowScrollButton(false);
        userScrolledRef.current = false;
      } else {
        setShowScrollButton(true);
      }
    }, SETTLING_MS + 50);

    return () => clearTimeout(timer);
  }, [working, isAtBottom]);

  // ---- ResizeObserver: auto-scroll on content growth (throttled) ----
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (userScrolledRef.current) return;
      if (!working && !settlingRef.current) return;
      requestScroll();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [requestScroll, working]);

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
      requestScroll();
    });

    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      clearTimeout(scrollThrottleRef.current);
      scrollThrottleRef.current = undefined;
    };
  }, [working, requestScroll]);

  return {
    scrollRef,
    contentRef,
    showScrollButton,
    scrollToBottom,
  };
}
