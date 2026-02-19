'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — ChatGPT-style auto-scroll.
 *
 * Dynamic spacer: sized so that the browser's natural max-scroll
 * (scrollHeight - clientHeight) lands exactly where the last turn's
 * user bubble sits at the top with TURN_TOP_OFFSET padding.
 *
 * Formula: spacer = viewportH - lastTurnH - TURN_TOP_OFFSET  (min 0)
 *
 * This means:
 *   - Short last turn → big spacer → lots of empty space below
 *   - Tall last turn  → small/no spacer → content fills viewport
 *   - No clamp needed — the natural scroll limit IS the right limit
 *
 * MutationObserver + ResizeObserver keep the spacer in sync as content
 * changes (new messages, streaming text, steps collapsing).
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
  scrollToEnd: () => void;
  spacerHeight: number;
}

const BOTTOM_THRESHOLD = 80;
const TURN_TOP_OFFSET = 24;

// ── Hook ────────────────────────────────────────────────────────────

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  // Start with a generous default so the first render has room to scroll.
  const [spacerHeight, setSpacerHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );

  const userScrolledRef = useRef(false);
  const rafIdRef = useRef<number>(0);
  const lastScrollHeightRef = useRef(0);
  const prevWorkingRef = useRef(working);

  // ── Dynamic spacer ────────────────────────────────────────────────
  // Recalculates whenever:
  //   - The scroll container resizes (ResizeObserver)
  //   - Content changes: new messages, streaming text (MutationObserver)
  // RAF-throttled to avoid layout thrashing.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    let rafId = 0;

    const recalc = () => {
      const viewportH = el.clientHeight;
      const turns = content.querySelectorAll<HTMLElement>('[data-turn-id]');
      const lastTurn = turns[turns.length - 1];
      if (!lastTurn) {
        // No turns yet — full viewport spacer so optimistic message can scroll up.
        setSpacerHeight(viewportH);
        return;
      }
      const lastTurnH = lastTurn.offsetHeight;
      setSpacerHeight(Math.max(0, viewportH - lastTurnH - TURN_TOP_OFFSET));
    };

    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        recalc();
      });
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(el);

    const mo = new MutationObserver(schedule);
    mo.observe(content, { childList: true, subtree: true, characterData: true });

    // Initial calc.
    recalc();

    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  // ── "At bottom" — with the dynamic spacer, the absolute bottom IS
  //    the last-turn-at-top position, so we just check scrollHeight. ──
  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  // ── Instant: scroll to bottom (= last turn at top) ────────────────
  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolledRef.current = false;
    setShowScrollButton(false);
    el.scrollTop = el.scrollHeight;
  }, []);

  // ── Smooth: scroll to bottom (= last turn at top) ─────────────────
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolledRef.current = false;
    setShowScrollButton(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // ── Alias used by handleSend — smooth scroll to last turn ─────────
  const scrollToLastTurn = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // ── Re-anchor on working → idle ───────────────────────────────────
  // The DOM changes dramatically (steps collapse, response moves).
  // Re-position the last turn at the top so it doesn't disappear.
  useEffect(() => {
    const was = prevWorkingRef.current;
    prevWorkingRef.current = working;
    if (was && !working && !userScrolledRef.current) {
      // Staggered instant scrolls to cover layout settling.
      const t1 = setTimeout(scrollToEnd, 50);
      const t2 = setTimeout(scrollToEnd, 200);
      const t3 = setTimeout(scrollToEnd, 600);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [working, scrollToEnd]);

  // ── RAF auto-scroll during streaming ──────────────────────────────
  useEffect(() => {
    if (!working) {
      // Not streaming — check if FAB should show.
      const timer = setTimeout(() => {
        if (!isAtBottom()) setShowScrollButton(true);
        else { setShowScrollButton(false); userScrolledRef.current = false; }
      }, 400);
      return () => clearTimeout(timer);
    }

    let active = true;
    lastScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;

    const tick = () => {
      if (!active) return;
      const el = scrollRef.current;
      if (el) {
        const newH = el.scrollHeight;
        const grew = newH - lastScrollHeightRef.current;
        if (grew > 0) {
          const dist = newH - el.scrollTop - el.clientHeight;
          if (dist <= grew + BOTTOM_THRESHOLD && !userScrolledRef.current) {
            // Follow growing content — just go to the bottom.
            // With the dynamic spacer this = last turn at top.
            el.scrollTop = newH;
          } else if (!userScrolledRef.current) {
            userScrolledRef.current = true;
            setShowScrollButton(true);
          }
        }
        lastScrollHeightRef.current = newH;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(rafIdRef.current); };
  }, [working, isAtBottom]);

  // ── Wheel intent ──────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handle = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-scrollable]')) return;
      if (e.deltaY < 0) {
        if (!userScrolledRef.current) { userScrolledRef.current = true; setShowScrollButton(true); }
      } else if (e.deltaY > 0) {
        requestAnimationFrame(() => {
          if (isAtBottom()) { userScrolledRef.current = false; setShowScrollButton(false); }
        });
      }
    };
    el.addEventListener('wheel', handle, { passive: true });
    return () => el.removeEventListener('wheel', handle);
  }, [isAtBottom]);

  // ── Touch intent ──────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0; };
    const onMove = (e: TouchEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-scrollable]')) return;
      const dy = startY - (e.touches[0]?.clientY ?? 0);
      if (dy < -10 && !userScrolledRef.current) { userScrolledRef.current = true; setShowScrollButton(true); }
      else if (dy > 10) {
        requestAnimationFrame(() => {
          if (isAtBottom()) { userScrolledRef.current = false; setShowScrollButton(false); }
        });
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); };
  }, [isAtBottom]);

  // ── Keyboard / scrollbar drag catch-all ───────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let last = el.scrollTop;
    const handle = () => {
      const cur = el.scrollTop;
      if (cur < last && !isAtBottom() && !userScrolledRef.current) {
        userScrolledRef.current = true;
        setShowScrollButton(true);
      }
      last = cur;
    };
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, [isAtBottom]);

  return {
    scrollRef,
    contentRef,
    showScrollButton,
    scrollToBottom,
    scrollToLastTurn,
    scrollToEnd,
    spacerHeight,
  };
}
