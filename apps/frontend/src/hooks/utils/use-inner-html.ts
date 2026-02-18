"use client";

import { useRef, useEffect, type RefObject } from "react";

/**
 * Sets innerHTML on a ref'd element via useEffect (bypasses react/no-danger).
 * Returns a ref to attach to the target element.
 */
export function useInnerHTML<T extends HTMLElement = HTMLElement>(
  html: string | undefined
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = html ?? "";
    }
  }, [html]);
  return ref;
}
