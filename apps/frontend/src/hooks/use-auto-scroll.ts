'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — ChatGPT-style scroll.
 *
 * Spacer = max(0, viewportH - lastTurnH - TURN_TOP_OFFSET).
 * Updated via DIRECT DOM manipulation (spacerRef.style.height), not
 * React state. This avoids re-renders that fight with the RAF loop.
 *
 * Key physics: as the last turn grows by X, the spacer shrinks by X.
 * scrollHeight stays CONSTANT. No scrolling is needed while the
 * response fits in the viewport — content fills in where the spacer was.
 * Once the spacer hits 0, scrollHeight grows and the RAF loop follows.
 *
 * MutationObserver recalculates the spacer on every content change.
 * This is now safe because scrollHeight doesn't change (turn growth
 * and spacer shrinkage cancel out), so there's nothing to fight.
 *
 * User scroll intent:
 * Once the user scrolls UP, auto-scroll is disabled and the "scroll to
 * bottom" FAB appears. Auto-scroll resumes ONLY when:
 *   - The user clicks the FAB (scrollToBottom)
 *   - The user sends a new message (scrollToBottom)
 *   - The user scrolls all the way back to the absolute bottom of the
 *     scrollable area (classic scrollHeight check, NOT measureTarget)
 */

interface UseAutoScrollOptions {
  working: boolean;
}

interface UseAutoScrollReturn {
  scrollRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  spacerElRef: React.RefObject<HTMLDivElement>;
  showScrollButton: boolean;
  scrollToBottom: () => void;
  scrollToLastTurn: () => void;
  scrollToEnd: () => void;
}

const BOTTOM_THRESHOLD = 80;
const TURN_TOP_OFFSET = 24;

/** scrollTop that puts the last [data-turn-id] at TURN_TOP_OFFSET from viewport top. */
function measureTarget(scrollEl: HTMLDivElement, contentEl: HTMLDivElement): number | null {
  const turns = contentEl.querySelectorAll<HTMLElement>('[data-turn-id]');
  const last = turns[turns.length - 1];
  if (!last) return null;
  const sr = scrollEl.getBoundingClientRect();
  const tr = last.getBoundingClientRect();
  return Math.max(0, scrollEl.scrollTop + (tr.top - sr.top) - TURN_TOP_OFFSET);
}

/** Classic "near the absolute bottom of scrollable content" check. */
function isNearScrollEnd(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
}

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerElRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const userScrolledRef = useRef(false);
  const rafIdRef = useRef<number>(0);
  const prevWorkingRef = useRef(working);
  // Current spacer value for the RAF loop's contentH calculation.
  const spacerValRef = useRef(0);

  // ── Spacer recalc (direct DOM, no React state) ────────────────────
  const recalcSpacer = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    const spacer = spacerElRef.current;
    if (!el || !content || !spacer) return;

    const vh = el.clientHeight;
    const turns = content.querySelectorAll<HTMLElement>('[data-turn-id]');
    const last = turns[turns.length - 1];
    const h = last
      ? Math.max(0, vh - last.offsetHeight - TURN_TOP_OFFSET)
      : vh;

    spacerValRef.current = h;
    spacer.style.height = h + 'px';
  }, []);

  // ── Observers: resize + content mutations ─────────────────────────
  // Re-run when `working` changes so that observers are created once the
  // scroll area actually mounts (it's conditionally rendered — refs may
  // be null on the initial mount during loading/welcome screen).
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    let rafId = 0;
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; recalcSpacer(); });
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(el);

    const mo = new MutationObserver(schedule);
    mo.observe(content, { childList: true, subtree: true, characterData: true });

    recalcSpacer();

    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(rafId); };
  }, [recalcSpacer, working]);

  // ── isAtBottom (DOM-measured, uses measureTarget) ─────────────────
  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return true;
    const target = measureTarget(el, content);
    if (target === null) return true;
    return el.scrollTop >= target - BOTTOM_THRESHOLD;
  }, []);

  // ── Instant scroll: last turn at top ──────────────────────────────
  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    // Ensure spacer is sized before measuring — covers the case where
    // observers haven't been set up yet (e.g. idle session first load).
    recalcSpacer();
    userScrolledRef.current = false;
    setShowScrollButton(false);
    const target = measureTarget(el, content);
    if (target !== null) el.scrollTop = target;
  }, [recalcSpacer]);

  // ── Smooth scroll: last turn at top ───────────────────────────────
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    // Ensure spacer is sized before measuring.
    recalcSpacer();
    userScrolledRef.current = false;
    setShowScrollButton(false);
    const target = measureTarget(el, content);
    if (target !== null) el.scrollTo({ top: target, behavior: 'smooth' });
  }, [recalcSpacer]);

  const scrollToLastTurn = useCallback(() => scrollToBottom(), [scrollToBottom]);

  // ── On working → idle: re-anchor after DOM settles ────────────────
  useEffect(() => {
    const was = prevWorkingRef.current;
    prevWorkingRef.current = working;
    if (was && !working && !userScrolledRef.current) {
      // Spacer is already correct (MO keeps it updated).
      // Just re-anchor in case steps collapsed / response moved.
      const t1 = setTimeout(scrollToEnd, 100);
      const t2 = setTimeout(scrollToEnd, 500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [working, scrollToEnd]);

  // ── RAF auto-scroll during streaming ──────────────────────────────
  // Phase 1 (spacer > 0): scrollHeight is constant, no scrolling needed.
  //   The spacer shrinks as the turn grows — content fills in naturally.
  // Phase 2 (spacer = 0): scrollHeight grows. Follow the growth.
  useEffect(() => {
    if (!working) {
      // Not streaming — calculate spacer once (covers idle session loads
      // where the observer setup may have been deferred).
      recalcSpacer();
      const timer = setTimeout(() => {
        if (!isAtBottom()) setShowScrollButton(true);
        else setShowScrollButton(false);
      }, 400);
      return () => clearTimeout(timer);
    }

    let active = true;

    const tick = () => {
      if (!active) return;
      const el = scrollRef.current;
      if (el && !userScrolledRef.current) {
        // Only scroll when the spacer has hit 0 and content overflows.
        const contentH = el.scrollHeight - spacerValRef.current;
        const viewportBottom = el.scrollTop + el.clientHeight;
        const overflow = contentH - viewportBottom;
        if (overflow > 0) {
          el.scrollTop += overflow;
        }
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(rafIdRef.current); };
  }, [working, isAtBottom, recalcSpacer]);

  // ── Wheel intent ──────────────────────────────────────────────────
  // Depends on `working` so listeners are (re-)attached when the scroll
  // area mounts (it's conditionally rendered; refs may be null on mount).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handle = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-scrollable]')) return;
      if (e.deltaY < 0) {
        // Scrolling up → disable auto-scroll, show FAB
        if (!userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollButton(true);
        }
      } else if (e.deltaY > 0) {
        // Scrolling down → resume auto-scroll only if the user reached
        // the absolute bottom of the scrollable area (classic check).
        // This avoids false positives from measureTarget.
        requestAnimationFrame(() => {
          if (isNearScrollEnd(el)) {
            userScrolledRef.current = false;
            setShowScrollButton(false);
          }
        });
      }
    };
    el.addEventListener('wheel', handle, { passive: true });
    return () => el.removeEventListener('wheel', handle);
  }, [working]);

  // ── Touch intent ──────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0; };
    const onMove = (e: TouchEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-scrollable]')) return;
      const dy = startY - (e.touches[0]?.clientY ?? 0);
      if (dy < -10 && !userScrolledRef.current) {
        // Swiping up → disable auto-scroll
        userScrolledRef.current = true;
        setShowScrollButton(true);
      } else if (dy > 10) {
        // Swiping down → resume only at absolute bottom
        requestAnimationFrame(() => {
          if (isNearScrollEnd(el)) {
            userScrolledRef.current = false;
            setShowScrollButton(false);
          }
        });
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); };
  }, [working]);

  // ── Keyboard / scrollbar drag catch-all ───────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let last = el.scrollTop;
    const handle = () => {
      const cur = el.scrollTop;
      // Detect upward scroll (keyboard, scrollbar drag, programmatic)
      if (cur < last - 2 && !userScrolledRef.current) {
        userScrolledRef.current = true;
        setShowScrollButton(true);
      }
      last = cur;
    };
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, [working]);

  return { scrollRef, contentRef, spacerElRef, showScrollButton, scrollToBottom, scrollToLastTurn, scrollToEnd };
}
