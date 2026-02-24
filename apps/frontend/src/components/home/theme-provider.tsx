'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { useUserPreferencesStore, getZoomValue } from '@/stores/user-preferences-store';
import { getThemeClassName, getAllThemeClassNames } from '@/lib/themes';

function ThemeClassSync() {
  const themeId = useUserPreferencesStore((s) => s.preferences.themeId);

  React.useEffect(() => {
    const html = document.documentElement;
    // Remove all existing theme classes
    const allClasses = getAllThemeClassNames();
    html.classList.remove(...allClasses);
    // Apply the selected theme class (if not default)
    const className = getThemeClassName(themeId);
    if (className) {
      html.classList.add(className);
    }
  }, [themeId]);

  return null;
}

function ZoomSync() {
  const uiZoom = useUserPreferencesStore((s) => s.preferences.uiZoom ?? 'default');

  React.useEffect(() => {
    const html = document.documentElement;
    const zoomValue = getZoomValue(uiZoom);
    if (zoomValue === 100) {
      html.style.removeProperty('zoom');
    } else {
      html.style.zoom = `${zoomValue}%`;
    }
  }, [uiZoom]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeClassSync />
      <ZoomSync />
      {children}
    </NextThemesProvider>
  );
}
