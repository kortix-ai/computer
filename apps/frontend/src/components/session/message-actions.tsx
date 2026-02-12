'use client';

import { useState, useCallback } from 'react';
import { GitFork, Undo2, MoreHorizontal, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ============================================================================
// Types
// ============================================================================

interface MessageActionsProps {
  /** The user message ID at this turn boundary */
  messageId: string;
  /** Current session ID */
  sessionId: string;
  /** Whether this is the first turn (no revert for first message) */
  isFirstTurn: boolean;
  /** Whether the session is currently busy */
  isBusy: boolean;
  /** Whether the session is in a reverted state */
  isReverted: boolean;
  /** Callback to fork the session at this message */
  onFork: (messageId: string) => Promise<void>;
  /** Callback to revert the session to this message */
  onRevert: (messageId: string) => Promise<void>;
}

// ============================================================================
// Confirmation Dialog
// ============================================================================

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  actionLabel,
  variant = 'default',
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={action}
            disabled={loading}
            className={cn(
              variant === 'destructive' &&
                'bg-destructive text-white hover:bg-destructive/90',
            )}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : null}
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// MessageActions — hover-visible action buttons on each turn
// ============================================================================

export function MessageActions({
  messageId,
  sessionId,
  isFirstTurn,
  isBusy,
  isReverted,
  onFork,
  onRevert,
}: MessageActionsProps) {
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [loading, setLoading] = useState<'fork' | 'revert' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleFork = useCallback(async () => {
    setLoading('fork');
    try {
      await onFork(messageId);
    } finally {
      setLoading(null);
      setForkDialogOpen(false);
    }
  }, [messageId, onFork]);

  const handleRevert = useCallback(async () => {
    setLoading('revert');
    try {
      await onRevert(messageId);
    } finally {
      setLoading(null);
      setRevertDialogOpen(false);
    }
  }, [messageId, onRevert]);

  const disabled = isBusy || isReverted;

  return (
    <>
      {/* Actions container — visible on hover of the parent group */}
      <div
        className={cn(
          'flex items-center gap-0.5',
          // Only show on group hover unless menu is open
          !menuOpen && 'opacity-0 group-hover/turn:opacity-100',
          'transition-opacity duration-150',
        )}
      >
        {/* Fork button — always available */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setForkDialogOpen(true)}
              disabled={disabled}
              className={cn(
                'p-1.5 rounded-md transition-colors cursor-pointer',
                'text-muted-foreground/60 hover:text-foreground hover:bg-muted/60',
                'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60',
              )}
            >
              {loading === 'fork' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <GitFork className="size-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Fork from here
          </TooltipContent>
        </Tooltip>

        {/* Revert button — not shown on first turn */}
        {!isFirstTurn && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setRevertDialogOpen(true)}
                disabled={disabled}
                className={cn(
                  'p-1.5 rounded-md transition-colors cursor-pointer',
                  'text-muted-foreground/60 hover:text-foreground hover:bg-muted/60',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60',
                )}
              >
                {loading === 'revert' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Undo2 className="size-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Revert to before this
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Fork confirmation dialog */}
      <ConfirmDialog
        open={forkDialogOpen}
        onOpenChange={setForkDialogOpen}
        title="Fork session"
        description="This will create a new session branching off from this point. The current session remains unchanged. You can continue the conversation in the new fork."
        action={handleFork}
        actionLabel="Fork session"
        loading={loading === 'fork'}
      />

      {/* Revert confirmation dialog */}
      <ConfirmDialog
        open={revertDialogOpen}
        onOpenChange={setRevertDialogOpen}
        title="Revert to this point"
        description="This will undo all messages and file changes after this point. You can restore them later by clicking the undo button in the revert banner."
        action={handleRevert}
        actionLabel="Revert"
        variant="destructive"
        loading={loading === 'revert'}
      />
    </>
  );
}

// ============================================================================
// RevertBanner — shown at the top of the chat when session is reverted
// ============================================================================

interface RevertBannerProps {
  sessionId: string;
  /** The message ID the session was reverted to */
  revertMessageId: string;
  /** Whether unrevert is in progress */
  loading: boolean;
  /** Callback to unrevert (restore) the session */
  onUnrevert: () => Promise<void>;
}

export function RevertBanner({
  sessionId,
  revertMessageId,
  loading,
  onUnrevert,
}: RevertBannerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex-shrink-0">
        {/* Amber accent stripe */}
        <div className="h-[2px] bg-gradient-to-r from-amber-500/80 via-orange-500/80 to-red-500/60" />
        {/* Banner content */}
        <div className="flex items-center h-10 px-3 gap-3 border-b border-border/50 bg-amber-500/5 dark:bg-amber-500/[0.03]">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Undo2 className="size-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs text-foreground/80 truncate">
              Session reverted
            </span>
            <span className="text-[11px] text-muted-foreground/60 truncate hidden sm:inline">
              Messages after this point are hidden
            </span>
          </div>

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={loading}
            className={cn(
              'flex items-center gap-1.5 h-7 px-3 rounded-md',
              'text-xs font-medium',
              'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              'hover:bg-amber-500/20 active:bg-amber-500/25',
              'border border-amber-500/20',
              'transition-colors cursor-pointer',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Undo2 className="size-3" />
            )}
            <span>Restore</span>
          </button>
        </div>
      </div>

      {/* Unrevert confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Restore reverted messages"
        description="This will restore all previously reverted messages and file changes. The session will return to its full state."
        action={async () => {
          await onUnrevert();
          setConfirmOpen(false);
        }}
        actionLabel="Restore all"
        loading={loading}
      />
    </>
  );
}
