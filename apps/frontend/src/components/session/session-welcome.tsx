'use client';

import { WallpaperBackground } from '@/components/ui/wallpaper-background';

/**
 * Empty-state backdrop — shows the user's selected wallpaper, full height.
 * The parent renders the chat input on top.
 */
export function SessionWelcome() {
  return (
    <div className="flex-1 relative overflow-hidden">
      <WallpaperBackground />
    </div>
  );
}
