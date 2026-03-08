'use client';

import * as React from 'react';
import { Check, Monitor, Sun, Moon, Palette, ImageIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUserPreferencesStore } from '@/stores/user-preferences-store';
import { THEMES, DEFAULT_THEME_ID, type KortixTheme } from '@/lib/themes';
import { WALLPAPERS, DEFAULT_WALLPAPER_ID, type Wallpaper } from '@/lib/wallpapers';

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
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors duration-150',
        'hover:bg-accent/60',
        isActive && 'bg-accent'
      )}
    >
      <span
        className="size-5 rounded-full shrink-0 ring-1 ring-border/30"
        style={{ backgroundColor: theme.accentColor }}
      />
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
      {isActive && (
        <Check className="size-4 text-primary ml-auto shrink-0" />
      )}
    </button>
  );
}

function WallpaperCard({
  wallpaper,
  isActive,
  onSelect,
}: {
  wallpaper: Wallpaper;
  isActive: boolean;
  onSelect: () => void;
}) {
  const isSvg = wallpaper.type === 'svg';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative rounded-lg overflow-hidden transition-all duration-200',
        'ring-2 ring-offset-1 ring-offset-background',
        isActive
          ? 'ring-primary'
          : 'ring-transparent hover:ring-border/50'
      )}
    >
      <div className="relative w-full aspect-video bg-muted">
        {isSvg ? (
          /* SVG brandmark — theme-aware: dark bg in dark mode, light bg in light mode */
          <>
            <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden">
              <Image
                src={wallpaper.thumbnailUrl}
                alt={wallpaper.name}
                fill
                unoptimized
                sizes="160px"
                className="object-contain select-none opacity-30 dark:opacity-30 invert dark:invert-0 scale-[2]"
                draggable={false}
              />
            </div>
          </>
        ) : (
          /* Image wallpaper — show light variant in light mode, dark in dark */
          <>
            <div className="absolute inset-0 dark:hidden">
              <Image
                src={wallpaper.lightUrl!}
                alt={wallpaper.name}
                fill
                className="object-cover"
                unoptimized
                sizes="160px"
              />
            </div>
            <div className="absolute inset-0 hidden dark:block">
              <Image
                src={wallpaper.darkUrl!}
                alt={wallpaper.name}
                fill
                className="object-cover"
                unoptimized
                sizes="160px"
              />
            </div>
          </>
        )}
        {/* Hover overlay */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-200',
            isActive ? 'bg-black/10' : 'bg-black/0 group-hover:bg-black/10'
          )}
        />
        {/* Check badge */}
        {isActive && (
          <div className="absolute top-1 right-1 size-4 rounded-full bg-primary flex items-center justify-center shadow-md">
            <Check className="size-2.5 text-primary-foreground" />
          </div>
        )}
      </div>
      <div className="px-1.5 py-1">
        <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
          {wallpaper.name}
          {wallpaper.id === DEFAULT_WALLPAPER_ID && (
            <span className="text-[9px] font-medium px-1 py-px rounded-full bg-muted text-muted-foreground">
              Default
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

const BASE_MODES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function AppearanceTab() {
  const { theme: baseMode, setTheme: setBaseMode } = useTheme();
  const themeId = useUserPreferencesStore((s) => s.preferences.themeId);
  const setThemeId = useUserPreferencesStore((s) => s.setThemeId);
  const wallpaperId = useUserPreferencesStore(
    (s) => s.preferences.wallpaperId ?? DEFAULT_WALLPAPER_ID
  );
  const setWallpaperId = useUserPreferencesStore((s) => s.setWallpaperId);

  React.useEffect(() => {
    if (!THEMES.some((theme) => theme.id === themeId)) {
      setThemeId(DEFAULT_THEME_ID);
    }
  }, [themeId, setThemeId]);

  const hasCustomSettings =
    themeId !== DEFAULT_THEME_ID || wallpaperId !== DEFAULT_WALLPAPER_ID;

  return (
    <div className="p-4 sm:p-6 pb-12 sm:pb-6 space-y-5 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Palette className="size-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Appearance</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose a theme, color mode, and wallpaper.
        </p>
      </div>

      <div className="space-y-5 sm:space-y-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 block">
            Color Mode
          </p>
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            {BASE_MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = baseMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setBaseMode(mode.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
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

        <div>
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              Wallpaper
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {WALLPAPERS.map((wp) => (
              <WallpaperCard
                key={wp.id}
                wallpaper={wp}
                isActive={wallpaperId === wp.id}
                onSelect={() => setWallpaperId(wp.id)}
              />
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Palette className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              Theme Palette
            </p>
          </div>

          <div className="flex flex-col gap-0.5">
            {THEMES.map((theme) => (
              <ThemeItem
                key={theme.id}
                theme={theme}
                isActive={themeId === theme.id}
                onSelect={() => setThemeId(theme.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {hasCustomSettings && (
        <div className="pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              setThemeId(DEFAULT_THEME_ID);
              setWallpaperId(DEFAULT_WALLPAPER_ID);
            }}
          >
            Reset to defaults
          </Button>
        </div>
      )}
    </div>
  );
}
