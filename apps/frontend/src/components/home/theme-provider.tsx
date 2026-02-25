'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { useUserPreferencesStore } from '@/stores/user-preferences-store';
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

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeClassSync />
      {children}
    </NextThemesProvider>
  );
}
