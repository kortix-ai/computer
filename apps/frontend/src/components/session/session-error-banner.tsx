'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  XCircle,
  Info,
  X,
  KeyRound,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSessionErrorStore,
  type SessionError,
} from '@/stores/opencode-session-error-store';
import {
  classifySessionError,
  type ErrorSeverity,
  type SessionErrorDisplay,
} from '@/ui';

// ============================================================================
// Severity → visual mapping
// ============================================================================

const SEVERITY_STYLES: Record<
  ErrorSeverity,
  {
    stripe: string;
    bg: string;
    border: string;
    icon: string;
    title: string;
    dismiss: string;
  }
> = {
  critical: {
    stripe: 'bg-gradient-to-r from-red-500/80 via-red-500/60 to-red-400/40',
    bg: 'bg-red-500/[0.06] dark:bg-red-500/[0.04]',
    border: 'border-red-500/20',
    icon: 'text-red-500',
    title: 'text-red-600 dark:text-red-400',
    dismiss: 'text-red-500/60 hover:text-red-500 hover:bg-red-500/10',
  },
  warning: {
    stripe: 'bg-gradient-to-r from-amber-500/80 via-orange-500/60 to-amber-400/40',
    bg: 'bg-amber-500/[0.06] dark:bg-amber-500/[0.04]',
    border: 'border-amber-500/20',
    icon: 'text-amber-500',
    title: 'text-amber-600 dark:text-amber-400',
    dismiss: 'text-amber-500/60 hover:text-amber-500 hover:bg-amber-500/10',
  },
  info: {
    stripe: 'bg-gradient-to-r from-blue-500/60 via-blue-400/40 to-blue-300/20',
    bg: 'bg-blue-500/[0.04] dark:bg-blue-500/[0.03]',
    border: 'border-blue-500/15',
    icon: 'text-blue-500',
    title: 'text-blue-600 dark:text-blue-400',
    dismiss: 'text-blue-500/60 hover:text-blue-500 hover:bg-blue-500/10',
  },
};

function SeverityIcon({
  severity,
  errorName,
  className,
}: {
  severity: ErrorSeverity;
  errorName?: string;
  className?: string;
}) {
  // Use specialised icons for known error types
  if (errorName === 'ProviderAuthError') {
    return <KeyRound className={className} />;
  }
  if (errorName === 'ContextOverflowError') {
    return <Layers className={className} />;
  }

  switch (severity) {
    case 'critical':
      return <XCircle className={className} />;
    case 'warning':
      return <AlertTriangle className={className} />;
    case 'info':
      return <Info className={className} />;
  }
}

// ============================================================================
// Single error row
// ============================================================================

function ErrorRow({
  error,
  display,
  onDismiss,
  onAction,
}: {
  error: SessionError;
  display: SessionErrorDisplay;
  onDismiss: (id: string) => void;
  onAction?: (display: SessionErrorDisplay, error: SessionError) => void;
}) {
  const styles = SEVERITY_STYLES[display.severity];
  const errorName = (error.error as any)?.name as string | undefined;

  return (
    <div className="flex-shrink-0">
      {/* Accent stripe */}
      <div className={cn('h-[2px]', styles.stripe)} />

      {/* Content */}
      <div
        className={cn(
          'flex items-start gap-3 px-4 py-3 border-b',
          styles.bg,
          styles.border,
        )}
      >
        {/* Icon */}
        <SeverityIcon
          severity={display.severity}
          errorName={errorName}
          className={cn('size-4 flex-shrink-0 mt-0.5', styles.icon)}
        />

        {/* Text */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold', styles.title)}>
              {display.title}
            </span>
            {display.isRetryable && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <RefreshCw className="size-2.5" />
                Retrying
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/70 leading-relaxed break-words">
            {display.description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {display.actionLabel && onAction && (
            <button
              onClick={() => onAction(display, error)}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded-md',
                'text-xs font-medium',
                styles.bg,
                styles.title,
                'hover:opacity-80 active:opacity-70',
                'border',
                styles.border,
                'transition-colors cursor-pointer',
              )}
            >
              {display.actionLabel}
            </button>
          )}
          <button
            onClick={() => onDismiss(error.id)}
            className={cn(
              'p-1 rounded-md transition-colors cursor-pointer',
              styles.dismiss,
            )}
            aria-label="Dismiss error"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SessionErrorBanner — renders all active errors for a session
// ============================================================================

interface SessionErrorBannerProps {
  sessionId: string;
  /** Optional callback for action buttons (e.g. "Check settings", "Compact session") */
  onErrorAction?: (display: SessionErrorDisplay, error: SessionError) => void;
}

export function SessionErrorBanner({
  sessionId,
  onErrorAction,
}: SessionErrorBannerProps) {
  const errors = useSessionErrorStore((s) => s.errors);
  const dismissError = useSessionErrorStore((s) => s.dismissError);

  // Filter to active errors for this session
  const activeErrors = useMemo(() => {
    return Object.values(errors)
      .filter((e) => e.sessionID === sessionId && !e.dismissed)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [errors, sessionId]);

  // Classify each error once
  const classified = useMemo(() => {
    return activeErrors.map((err) => ({
      error: err,
      display: classifySessionError(err.error),
    }));
  }, [activeErrors]);

  if (classified.length === 0) return null;

  return (
    <div className="flex flex-col">
      {classified.map(({ error, display }) => (
        <ErrorRow
          key={error.id}
          error={error}
          display={display}
          onDismiss={dismissError}
          onAction={onErrorAction}
        />
      ))}
    </div>
  );
}

// ============================================================================
// TurnErrorDisplay — improved inline turn error (replaces the old Info icon)
// ============================================================================

interface TurnErrorDisplayProps {
  error: SessionErrorDisplay;
  className?: string;
}

/**
 * Renders a turn-level error (from `AssistantMessage.error`) with proper
 * severity styling. Replaces the old plain `Info` icon + muted text pattern
 * used throughout `SessionTurn`.
 */
export function TurnErrorDisplay({ error, className }: TurnErrorDisplayProps) {
  const styles = SEVERITY_STYLES[error.severity];
  const errorName = error.title.includes('Auth')
    ? 'ProviderAuthError'
    : error.title.includes('Context')
      ? 'ContextOverflowError'
      : undefined;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 px-3 py-2.5 rounded-lg border',
        styles.bg,
        styles.border,
        className,
      )}
    >
      <SeverityIcon
        severity={error.severity}
        errorName={errorName}
        className={cn('size-3.5 flex-shrink-0 mt-0.5', styles.icon)}
      />
      <div className="flex-1 min-w-0 space-y-0.5">
        <span className={cn('text-xs font-medium', styles.title)}>
          {error.title}
        </span>
        <p className="text-xs text-foreground/60 leading-relaxed break-words">
          {error.description}
        </p>
      </div>
      {error.isRetryable && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex-shrink-0">
          <RefreshCw className="size-2.5" />
          Retrying
        </span>
      )}
    </div>
  );
}
