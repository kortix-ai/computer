'use client';

import { usePathname } from 'next/navigation';
import { RawHTML } from '@/components/ui/raw-html';

export function CookieVisibility() {
  const pathname = usePathname();

  // Only show cookie button on homepage and dashboard
  const showOnPaths = ['/', '/dashboard'];
  const shouldShow = showOnPaths.some(path => pathname === path);

  if (shouldShow) return null;

  return (
    <RawHTML as="style" html={`.cky-btn-revisit-wrapper { display: none !important; }`} />
  );
}
