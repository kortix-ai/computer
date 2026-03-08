'use client';

import { memo } from 'react';
import Image from 'next/image';
import { useUserPreferencesStore } from '@/stores/user-preferences-store';
import { getWallpaperById, DEFAULT_WALLPAPER_ID } from '@/lib/wallpapers';

/**
 * Full-screen wallpaper background used on the dashboard, onboarding, and login screens.
 * Reads the user's selected wallpaper from preferences.
 *
 * - Default ("brandmark"): renders the SVG brandmark centered (same as the original).
 * - Image wallpapers: renders a full-bleed light/dark image pair.
 */
export const WallpaperBackground = memo(function WallpaperBackground() {
  const wallpaperId = useUserPreferencesStore(
    (s) => s.preferences.wallpaperId ?? DEFAULT_WALLPAPER_ID
  );
  const wallpaper = getWallpaperById(wallpaperId);

  if (wallpaper.type === 'svg') {
    return (
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <Image
          src={wallpaper.svgUrl}
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          className="object-contain select-none invert dark:invert-0 scale-[1.4] sm:scale-[1.6] lg:scale-[1.62]"
          draggable={false}
        />
      </div>
    );
  }

  // Image-based wallpaper with light/dark variants
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 dark:block hidden">
        <Image
          src={wallpaper.darkUrl!}
          alt=""
          fill
          sizes="100vw"
          className="object-cover select-none"
          unoptimized
          priority
          draggable={false}
        />
      </div>
      <div className="absolute inset-0 dark:hidden">
        <Image
          src={wallpaper.lightUrl!}
          alt=""
          fill
          sizes="100vw"
          className="object-cover select-none"
          unoptimized
          priority
          draggable={false}
        />
      </div>
      <div className="absolute inset-0 bg-black/5 dark:bg-black/20" />
    </div>
  );
});
