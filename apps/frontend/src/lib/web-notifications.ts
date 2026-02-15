/**
 * Web Notification utility module.
 *
 * Provides a thin wrapper around the browser Notification API that respects
 * the user's preferences stored in the web-notification-store.
 *
 * All notification dispatching flows through `sendWebNotification()` which
 * checks:
 *  1. Browser support for the Notification API
 *  2. Permission is granted
 *  3. Master enable toggle is on
 *  4. The specific notification category is enabled
 *  5. Optionally skips if tab is visible (onlyWhenHidden preference)
 */

import { useWebNotificationStore } from '@/stores/web-notification-store';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export type WebNotificationType = 'completion' | 'error' | 'question' | 'permission';

export interface WebNotificationPayload {
  /** Which category this notification belongs to */
  type: WebNotificationType;
  /** Notification title */
  title: string;
  /** Notification body text */
  body: string;
  /** Optional tag for deduplication (same tag replaces previous notification) */
  tag?: string;
  /** Optional click handler — by default focuses the window */
  onClick?: () => void;
}

// ============================================================================
// Preference key mapping
// ============================================================================

const TYPE_TO_PREF: Record<WebNotificationType, 'onCompletion' | 'onError' | 'onQuestion' | 'onPermission'> = {
  completion: 'onCompletion',
  error: 'onError',
  question: 'onQuestion',
  permission: 'onPermission',
};

// ============================================================================
// Sound
// ============================================================================

/**
 * Play a subtle notification sound.
 *
 * Uses the Web Audio API to generate a short ping tone.
 * Falls back silently if audio is not available.
 */
function playNotificationPing() {
  try {
    if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
      return;
    }
    const AudioCtx = AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);

    // Clean up
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      ctx.close().catch(() => {});
    };
  } catch {
    // Silently ignore — audio not critical
  }
}

// ============================================================================
// Core
// ============================================================================

/**
 * Check if the browser tab is currently hidden (user switched to another
 * tab or minimised the window).
 */
export function isTabHidden(): boolean {
  if (typeof document === 'undefined') return false;
  return document.hidden;
}

/**
 * Check if the browser supports the Notification API.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Send a browser web notification, respecting user preferences.
 *
 * Returns the Notification instance if one was created, or null.
 */
export function sendWebNotification(
  payload: WebNotificationPayload,
): Notification | null {
  // 1. Browser support check
  if (!isNotificationSupported()) return null;

  // 2. Permission check
  if (Notification.permission !== 'granted') return null;

  // 3. Preferences check
  const { preferences } = useWebNotificationStore.getState();

  if (!preferences.enabled) return null;

  // 4. Category check
  const prefKey = TYPE_TO_PREF[payload.type];
  if (!preferences[prefKey]) return null;

  // 5. Visibility check
  if (preferences.onlyWhenHidden && !isTabHidden()) return null;

  // 6. Fire notification
  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: '/favicon.png',
      tag: payload.tag,
      // Auto-close after 8 seconds
      requireInteraction: false,
    });

    notification.onclick = () => {
      // Focus the window
      window.focus();
      notification.close();
      payload.onClick?.();
    };

    // Auto-close after 8s (in case the browser doesn't)
    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // May already be closed
      }
    }, 8000);

    // 7. Sound
    if (preferences.playSound) {
      playNotificationPing();
    }

    return notification;
  } catch (err) {
    logger.error('Failed to send web notification', { error: String(err) });
    return null;
  }
}

// ============================================================================
// Convenience senders for each notification type
// ============================================================================

/**
 * Notify that a session task has completed.
 */
export function notifyTaskComplete(sessionId: string, sessionTitle?: string) {
  const label = sessionTitle
    ? `"${sessionTitle.slice(0, 60)}"`
    : `Session ${sessionId.slice(0, 8)}`;

  sendWebNotification({
    type: 'completion',
    title: 'Task Complete',
    body: `${label} has finished.`,
    tag: `completion:${sessionId}`,
  });
}

/**
 * Notify that a session encountered an error.
 */
export function notifySessionError(
  sessionId: string,
  errorTitle: string,
  sessionTitle?: string,
) {
  const label = sessionTitle
    ? `"${sessionTitle.slice(0, 50)}"`
    : `Session ${sessionId.slice(0, 8)}`;

  sendWebNotification({
    type: 'error',
    title: 'Session Error',
    body: `${label}: ${errorTitle}`,
    tag: `error:${sessionId}`,
  });
}

/**
 * Notify that Kortix is asking the user a question.
 */
export function notifyQuestion(
  sessionId: string,
  questionText: string,
  sessionTitle?: string,
) {
  const label = sessionTitle
    ? `"${sessionTitle.slice(0, 40)}"`
    : `Session ${sessionId.slice(0, 8)}`;

  sendWebNotification({
    type: 'question',
    title: 'Input Needed',
    body: `${label}: ${questionText.slice(0, 100)}`,
    tag: `question:${sessionId}`,
  });
}

/**
 * Notify that Kortix needs a permission grant.
 */
export function notifyPermissionRequest(
  sessionId: string,
  toolName: string,
  sessionTitle?: string,
) {
  const label = sessionTitle
    ? `"${sessionTitle.slice(0, 40)}"`
    : `Session ${sessionId.slice(0, 8)}`;

  sendWebNotification({
    type: 'permission',
    title: 'Permission Requested',
    body: `${label} needs permission for: ${toolName}`,
    tag: `permission:${sessionId}`,
  });
}
