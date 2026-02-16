'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — auto-scroll that reliably respects user intent.
 *
 * Design:
 * - The RAF loop uses **direct DOM measurement** to decide whether to scroll,
 *   not a flag set by event handlers. This eliminates race conditions.
 * - On each frame: if new content arrived (scrollHeight grew) AND the user's
 *   distance from the bottom is roughly equal to the height growth (meaning
 *   they were already at the bottom before the content grew), we auto-scroll.
 *   If the user scrolled up, their distance from bottom is much larger than
 *   the height growth, so we leave them alone.
 * - Wheel/touch/scroll handlers still drive the "Scroll to bottom" button
 *   visibility via `userScrolledRef`.
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

const BOTTOM_THRESHOLD = 50;

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // userScrolledRef is now only used for scroll-button visibility,
  // NOT for the RAF auto-scroll decision.
  const userScrolledRef = useRef(false);
  const rafIdRef = useRef<number>(0);
  const lastScrollHeightRef = useRef(0);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  // ---- Public scrollToBottom (smooth, resets user intent) ----
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolledRef.current = false;
    setShowScrollButton(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // ---- RAF-based auto-scroll loop ----
  useEffect(() => {
    if (!working) {
      // When work stops, check if we should show the scroll button
      const timer = setTimeout(() => {
        if (!isAtBottom()) {
          setShowScrollButton(true);
        } else {
          setShowScrollButton(false);
          userScrolledRef.current = false;
        }
      }, 350);
      return () => clearTimeout(timer);
    }

    let active = true;
    lastScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;

    const tick = () => {
      if (!active) return;
      const el = scrollRef.current;
      if (el) {
        const newHeight = el.scrollHeight;
        const heightGrew = newHeight - lastScrollHeightRef.current;

        if (heightGrew > 0) {
          // Content changed — decide whether to follow it.
          // If the user was at the bottom before the growth, their distance
          // from the new bottom is approximately equal to the growth.
          // If they scrolled up, their distance is much larger.
          const distFromBottom = newHeight - el.scrollTop - el.clientHeight;

          if (distFromBottom <= heightGrew + BOTTOM_THRESHOLD) {
            el.scrollTop = newHeight;
          } else if (!userScrolledRef.current) {
            // User is far from the bottom — show the scroll button.
            userScrolledRef.current = true;
            setShowScrollButton(true);
          }
        }

        lastScrollHeightRef.current = newHeight;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [working, isAtBottom]);

  // ---- Wheel: user-intent detector (for scroll button) ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-scrollable]')) return;

      if (e.deltaY < 0) {
        // Scrolling UP — show the button
        if (!userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollButton(true);
        }
      } else if (e.deltaY > 0) {
        // Scrolling DOWN — hide the button when user reaches the bottom
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

  // ---- Touch: detect swipe intent (for scroll button) ----
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

      if (delta < -10) {
        // Swiping DOWN on screen → scrolling UP (seeing older content)
        if (!userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollButton(true);
        }
      } else if (delta > 10) {
        // Swiping UP on screen → scrolling DOWN — re-engage only at bottom
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

  // ---- Keyboard / scrollbar-drag catch-all (for scroll button) ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let lastScrollTop = el.scrollTop;

    const handleScroll = () => {
      const currentScrollTop = el.scrollTop;
      const scrolledUp = currentScrollTop < lastScrollTop;
      lastScrollTop = currentScrollTop;

      if (scrolledUp && !isAtBottom()) {
        if (!userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollButton(true);
        }
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isAtBottom]);

  return {
    scrollRef,
    contentRef,
    showScrollButton,
    scrollToBottom,
  };
}
