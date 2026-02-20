'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownToLine, X, Loader2, Sparkles, ChevronRight } from 'lucide-react';
import { useGlobalSandboxUpdate } from '@/hooks/platform/use-global-sandbox-update';
import { openTabAndNavigate } from '@/stores/tab-store';

/**
 * UpdateBanner — shows a slim top bar when a sandbox update is available.
 *
 * Placement: fixed top-0 full-width, slides down on mount.
 * Dismissible per version (localStorage).
 * Shows changelog title + "View changelog" link + "Update now" button.
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
  if (!mounted || isLoading || !updateAvailable || dismissed) return null;
  // After successful update, hide the banner
  if (updateResult?.success) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -36 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -36 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full bg-primary/10 border-b border-primary/20 z-[60]"
      >
        <div className="flex items-center justify-center gap-3 px-4 py-1.5 text-xs">
          {/* Icon */}
          <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />

          {/* Message */}
          <span className="text-foreground">
            <span className="font-medium">v{latestVersion}</span>
            {changelog?.title && (
              <span className="text-muted-foreground"> &mdash; {changelog.title}</span>
            )}
          </span>

          {/* View changelog link */}
          <button
            onClick={() => openTabAndNavigate({ id: 'page:/changelog', title: 'Changelog', type: 'page', href: '/changelog' }, router)}
            className="flex items-center gap-0.5 text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
          >
            What&apos;s new
            <ChevronRight className="h-3 w-3" />
          </button>

          {/* Update button */}
          {!isUpdating ? (
            <button
              onClick={() => update()}
              className="flex items-center gap-1.5 h-6 px-3 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-full transition-colors cursor-pointer"
            >
              <ArrowDownToLine className="h-3 w-3" />
              Update
            </button>
          ) : (
            <span className="flex items-center gap-1.5 h-6 px-3 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating...
            </span>
          )}

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="p-1 rounded-full hover:bg-primary/10 transition-colors cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
