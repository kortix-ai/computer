'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownToLine, X, Loader2, ChevronRight } from 'lucide-react';
import { useGlobalSandboxUpdate } from '@/hooks/platform/use-global-sandbox-update';
import { openTabAndNavigate } from '@/stores/tab-store';

/**
 * UpdateBanner — a slim, non-intrusive top bar when a sandbox update is available.
 *
 * Uses absolute positioning so it overlays on top of the content area
 * without pushing the layout down or breaking flex sizing.
 * Dismissible per version (localStorage).
 */
export function UpdateBanner() {
  const router = useRouter();
  const {
    updateAvailable,
    latestVersion,
    currentVersion,
    changelog,
    update,
    isUpdating,
    updateResult,
    isLoading,
  } = useGlobalSandboxUpdate();

  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const dismissKey = `update-banner-dismissed-${latestVersion}`;

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(dismissKey) === 'true') {
        setDismissed(true);
      }
    } catch {}
  }, [dismissKey]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey, 'true');
    } catch {}
  };

  // Don't show if: not mounted, loading, no update, dismissed, or just completed an update
  const visible = mounted && !isLoading && updateAvailable && !dismissed && !updateResult?.success;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-0 left-0 right-0 z-[60] pointer-events-none"
        >
          <div className="pointer-events-auto mx-3 mt-2">
            <div className="flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-lg bg-background/80 backdrop-blur-xl border border-border/60 shadow-sm">
              {/* Left group */}
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Accent dot */}
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>

                {/* Label + version */}
                <span className="text-foreground truncate">
                  <span className="font-semibold">New Kortix version</span>
                  <span className="text-muted-foreground"> &mdash; v{latestVersion}</span>
                </span>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Right group */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* What's new link */}
                <button
                  onClick={() =>
                    openTabAndNavigate(
                      { id: 'page:/changelog', title: 'Changelog', type: 'page', href: '/changelog' },
                      router,
                    )
                  }
                  className="flex items-center gap-0.5 text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  What&apos;s new
                  <ChevronRight className="h-3 w-3" />
                </button>

                {/* Separator */}
                <div className="h-3 w-px bg-border/60" />

                {/* Update button */}
                {!isUpdating ? (
                  <button
                    onClick={() => update()}
                    className="flex items-center gap-1.5 h-6 px-2.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ArrowDownToLine className="h-3 w-3" />
                    Update
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 h-6 px-2.5 text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Updating&hellip;
                  </span>
                )}

                {/* Dismiss */}
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-md hover:bg-muted/80 transition-colors cursor-pointer ml-0.5"
                  aria-label="Dismiss"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
