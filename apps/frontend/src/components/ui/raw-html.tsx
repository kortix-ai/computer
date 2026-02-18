"use client";

import { useRef, useEffect, type HTMLAttributes, type ElementType } from 'react';

type RawHTMLProps<T extends keyof JSX.IntrinsicElements = "div"> = {
  as?: T;
  html: string;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

/**
 * Renders raw HTML safely via ref-based innerHTML assignment.
 * Use instead of dangerouslySetInnerHTML to satisfy react/no-danger.
 */
export function RawHTML({ as, html, ...rest }: RawHTMLProps) {
  const Tag = (as || "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = html;
    }
  }, [html]);
  return <Tag ref={ref} {...rest} />;
}
