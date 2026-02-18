'use client';

import * as React from 'react';
import { Search, Check, Monitor, Sun, Moon, Palette } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUserPreferencesStore } from '@/stores/user-preferences-store';
import { THEMES, DEFAULT_THEME_ID, type KortixTheme } from '@/lib/themes';

function ThemeItem({
  theme,
  isActive,
  onSelect,
}: {
  theme: KortixTheme;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors duration-150',
        'hover:bg-accent/60',
        isActive && 'bg-accent'
      )}
    >
      {/* Accent color dot */}
      <span
        className="size-5 rounded-full shrink-0 ring-1 ring-border/30"
        style={{ backgroundColor: theme.accentColor }}
      />
      {/* Name + badge */}
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {theme.name}
        </span>
        {theme.id === DEFAULT_THEME_ID && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
            Default
          </span>
        )}
      </span>
      {/* Check mark for active */}
      {isActive && (
        <Check className="size-4 text-primary ml-auto shrink-0" />
      )}
    </button>
  );
}

const BASE_MODES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function AppearanceTab() {
  const [search, setSearch] = React.useState('');
  const { theme: baseMode, setTheme: setBaseMode } = useTheme();
  const themeId = useUserPreferencesStore((s) => s.preferences.themeId);
  const setThemeId = useUserPreferencesStore((s) => s.setThemeId);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const filteredThemes = React.useMemo(() => {
    if (!search.trim()) return THEMES;
    const q = search.toLowerCase();
    return THEMES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="size-5 text-muted-foreground" />
          <h3 className="text-base font-semibold">Appearance</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose a theme and color mode for the interface.
        </p>
      </div>

      {/* Base mode selector */}
      <div className="px-1 pb-4">
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          Color Mode
        </label>
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          {BASE_MODES.map((mode) => {
            const Icon = mode.icon;
            const isActive = mounted && baseMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => setBaseMode(mode.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-3.5" />
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="px-1 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Theme list */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-0">
        <div className="flex flex-col gap-0.5">
          {filteredThemes.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No themes match &ldquo;{search}&rdquo;
            </div>
          ) : (
            filteredThemes.map((theme) => (
              <ThemeItem
                key={theme.id}
                theme={theme}
                isActive={themeId === theme.id}
                onSelect={() => setThemeId(theme.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Reset to default */}
      {themeId !== DEFAULT_THEME_ID && (
        <div className="pt-3 px-1 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setThemeId(DEFAULT_THEME_ID)}
          >
            Reset to default theme
          </Button>
        </div>
      )}
    </div>
  );
}
