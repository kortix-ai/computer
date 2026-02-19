'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — ChatGPT-style auto-scroll.
 *
 * The spacer is dynamically sized (viewport - lastTurnHeight - offset)
 * so the max scroll puts the last turn at the top — but no further.
 * scrollToLastTurn() uses direct DOM measurement for precise positioning;
 * scrollToBottom() goes to the absolute end (RAF loop / FAB button).
 *
 * The RAF loop follows growing content when the user is "at the bottom".
 * If the user scrolls up, auto-scroll stops and a button appears.
 */

interface UseAutoScrollOptions {
  working: boolean;
}

interface UseAutoScrollReturn {
  scrollRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  showScrollButton: boolean;
  scrollToBottom: () => void;
  scrollToLastTurn: () => void;
  spacerHeight: number;
}

const BOTTOM_THRESHOLD = 50;
// Padding above the user message bubble when scrolling to the last turn
const TURN_TOP_OFFSET = 24;

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [spacerHeight, setSpacerHeight] = useState(0);

  const userScrolledRef = useRef(false);
  const rafIdRef = useRef<number>(0);
  const lastScrollHeightRef = useRef(0);

  // ---- Dynamic spacer ----
  // Sized so that the maximum scroll puts the last turn's user message
  // at the top with TURN_TOP_OFFSET padding — but no further.
  // Formula: spacer = viewportH - lastTurnH - TURN_TOP_OFFSET (min 0).
  // Falls back to full viewport when there are no turns yet.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    let rafPending = 0;

    const recalc = () => {
      const viewportH = el.clientHeight;
      const turnEls = content.querySelectorAll<HTMLElement>('[data-turn-id]');
      const lastTurn = turnEls[turnEls.length - 1];
      if (!lastTurn) {
        setSpacerHeight(viewportH);
        return;
      }
      // Use offsetHeight instead of getBoundingClientRect to avoid
      // issues with transforms/scroll position affecting the measurement.
      const lastTurnH = lastTurn.offsetHeight;
      setSpacerHeight(Math.max(0, viewportH - lastTurnH - TURN_TOP_OFFSET));
    };

    const scheduleRecalc = () => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = 0;
        recalc();
      });
    };

    const ro = new ResizeObserver(scheduleRecalc);
    ro.observe(el);

    // Watch for content changes (new messages, streaming)
    const mo = new MutationObserver(scheduleRecalc);
    mo.observe(content, { childList: true, subtree: true, characterData: true });

    recalc();

    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(rafPending);
    };
  }, []);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  // ---- Public scrollToBottom ----
  // With the dynamic spacer, scrolling to the absolute bottom === last turn at top.
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolledRef.current = false;
    setShowScrollButton(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // ---- Scroll last turn's user message to the top of viewport ----
  // Uses direct DOM measurement so it works even before the spacer has recalculated.
  const scrollToLastTurn = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const turnEls = content.querySelectorAll<HTMLElement>('[data-turn-id]');
    const lastTurn = turnEls[turnEls.length - 1];
    if (!lastTurn) {
      scrollToBottom();
      return;
    }

    const elRect = el.getBoundingClientRect();
    const turnRect = lastTurn.getBoundingClientRect();
    const target = Math.max(0, el.scrollTop + (turnRect.top - elRect.top) - TURN_TOP_OFFSET);

    userScrolledRef.current = false;
    setShowScrollButton(false);
    el.scrollTo({ top: target, behavior: 'smooth' });
  }, [scrollToBottom]);

  // ---- RAF-based auto-scroll loop ----
  useEffect(() => {
    if (!working) {
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
          const distFromBottom = newHeight - el.scrollTop - el.clientHeight;

          if (distFromBottom <= heightGrew + BOTTOM_THRESHOLD) {
            // User was at the bottom — follow the content
            el.scrollTop = newHeight;
          } else if (!userScrolledRef.current) {
            // User is far from the bottom — they scrolled up
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

  // ---- Wheel: user-intent detector ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-scrollable]')) return;

      if (e.deltaY < 0) {
        if (!userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollButton(true);
        }
      } else if (e.deltaY > 0) {
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

  // ---- Touch: detect swipe intent ----
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
        if (!userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollButton(true);
        }
      } else if (delta > 10) {
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

  // ---- Keyboard / scrollbar-drag catch-all ----
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
    scrollToLastTurn,
    spacerHeight,
  };
}
