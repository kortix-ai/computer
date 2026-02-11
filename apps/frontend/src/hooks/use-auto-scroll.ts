'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useAutoScroll — sophisticated auto-scroll hook matching SolidJS createAutoScroll.
 *
 * Features:
 * - Detects user manual scroll (wheel up, scrollbar drag) and pauses auto-scroll
 * - ResizeObserver on content for auto-scroll on content growth
 * - overflow-anchor management to prevent layout jumps
 * - [data-scrollable] nested scroll awareness — wheel events inside nested scrollable
 *   regions don't count as user scroll
 * - 300ms settling period after `working` goes false
 * - markAuto() timing guard to distinguish auto-scroll from user scroll
 * - Exposed scrollToBottom / showScrollButton for FAB
 */

interface UseAutoScrollOptions {
  /** Whether the session is actively working (busy/retry). */
  working: boolean;
}

interface UseAutoScrollReturn {
  scrollRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

const BOTTOM_THRESHOLD = 100; // px from bottom to consider "at bottom"
const AUTO_SCROLL_GUARD_MS = 150; // time window to treat scroll as auto-initiated
const SETTLING_MS = 300; // settling period after working stops

export function useAutoScroll({ working }: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Internal state refs (avoid re-renders)
  const userScrolledRef = useRef(false);
  const lastAutoScrollRef = useRef(0); // timestamp of last auto-scroll
  const settlingRef = useRef(false);
  const settlingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---- Mark a scroll as auto-initiated (timing guard) ----
  const markAuto = useCallback(() => {
    lastAutoScrollRef.current = Date.now();
  }, []);

  const isAutoScroll = useCallback(() => {
    return Date.now() - lastAutoScrollRef.current < AUTO_SCROLL_GUARD_MS;
  }, []);

  // ---- Core scroll-to-bottom ----
  const doScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    markAuto();
    el.scrollTop = el.scrollHeight;
  }, [markAuto]);

  // ---- Public scrollToBottom (smooth, resets user-scrolled flag) ----
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    markAuto();
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    userScrolledRef.current = false;
    setShowScrollButton(false);
  }, [markAuto]);

  // ---- Scroll event handler (detect user scroll) ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      // Ignore auto-initiated scrolls
      if (isAutoScroll()) return;

      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
      if (atBottom) {
        userScrolledRef.current = false;
        setShowScrollButton(false);
      } else {
        userScrolledRef.current = true;
        setShowScrollButton(true);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isAutoScroll]);

  // ---- Wheel event: nested [data-scrollable] awareness ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // If the wheel event originated inside a [data-scrollable] child,
      // don't count it as the user scrolling the main container.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-scrollable]')) return;

      // Scrolling up → user is exploring, mark as manually scrolled
      if (e.deltaY < 0) {
        userScrolledRef.current = true;
        setShowScrollButton(true);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // ---- overflow-anchor management ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // When user has scrolled away, disable overflow-anchor so new content
    // doesn't push the viewport. When auto-scrolling, use 'none' to prevent
    // the browser from fighting our scroll position assignment.
    el.style.overflowAnchor = userScrolledRef.current ? 'auto' : 'none';
  });

  // ---- ResizeObserver on content → auto-scroll on growth ----
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (!userScrolledRef.current) {
        doScroll();
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [doScroll]);

  // ---- Settling period: keep auto-scrolling for 300ms after working stops ----
  useEffect(() => {
    if (working) {
      // Cancel any settling timer
      clearTimeout(settlingTimerRef.current);
      settlingRef.current = false;
    } else {
      // Start settling period
      settlingRef.current = true;
      settlingTimerRef.current = setTimeout(() => {
        settlingRef.current = false;
      }, SETTLING_MS);
    }
    return () => clearTimeout(settlingTimerRef.current);
  }, [working]);

  // ---- Auto-scroll tick: whenever content updates while working/settling ----
  // We use a MutationObserver on the content for fine-grained detection
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
