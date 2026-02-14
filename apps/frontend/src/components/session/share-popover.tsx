'use client';

import { useState, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Copy, Check, Globe, ExternalLink, Lock } from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  useOpenCodeSession,
  useShareSession,
  useUnshareSession,
} from '@/hooks/opencode/use-opencode-sessions';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ── Social icons ──

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

// ── Helper: rewrite opncd.ai share URL to our domain ──

function toOurShareUrl(serverUrl: string): string {
  try {
    const parsed = new URL(serverUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const shareIdx = segments.indexOf('share');
    const shareId =
      shareIdx !== -1 && segments[shareIdx + 1]
        ? segments[shareIdx + 1]
        : segments[segments.length - 1];
    const appBase =
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      process.env.NEXT_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://www.kortix.com';
    return `${appBase}/share/${shareId}`;
  } catch {
    return serverUrl;
  }
}

// ── Loading skeleton ──

const LoadingSkeleton = () => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2.5">
      <Skeleton className="h-7 w-7 rounded-lg" />
      <div className="space-y-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-32" />
      </div>
    </div>
    <Skeleton className="h-5 w-9 rounded-full" />
  </div>
);

// ── Popover content ──

function SharePopoverContent({
  sessionId,
  isOpen,
}: {
  sessionId: string;
  isOpen: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const { data: session, isLoading } = useOpenCodeSession(sessionId);
  const shareSession = useShareSession();
  const unshareSession = useUnshareSession();

  const isPublic = !!session?.share?.url;
  const isPending = shareSession.isPending || unshareSession.isPending;

  const shareLink = isPublic && session?.share?.url
    ? toOurShareUrl(session.share.url)
    : '';

  // Reset copied when popover closes
  useEffect(() => {
    if (!isOpen) setCopied(false);
  }, [isOpen]);

  const handleToggle = useCallback(
    async (checked: boolean) => {
      try {
        if (checked) {
          const updated = await shareSession.mutateAsync(sessionId);
          if (updated.share?.url) {
            const ourUrl = toOurShareUrl(updated.share.url);
            await navigator.clipboard.writeText(ourUrl);
            toast.success('Link enabled — copied to clipboard');
          } else {
            toast.success('Link enabled');
          }
        } else {
          await unshareSession.mutateAsync(sessionId);
          toast.success('Link disabled');
        }
      } catch {
        toast.error('Failed to update');
      }
    },
    [sessionId, shareSession, unshareSession],
  );

  const handleCopy = useCallback(async () => {
    if (!shareLink || copied) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [shareLink, copied]);

  const handleOpen = () =>
    window.open(shareLink, '_blank', 'noopener,noreferrer');

  const handleShareX = () => {
    const text = encodeURIComponent('Check out this conversation');
    const url = encodeURIComponent(shareLink);
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      '_blank',
    );
  };

  const handleShareLinkedIn = () => {
    const url = encodeURIComponent(shareLink);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      '_blank',
    );
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2.5">
      {/* Toggle Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-lg shrink-0 transition-all duration-200',
              isPublic
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {isPublic ? (
              <Globe className="h-3.5 w-3.5" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-[13px] font-medium leading-tight">
              {isPublic ? 'Public link enabled' : 'Enable public link'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {isPublic
                ? 'Anyone with the link can view'
                : 'Only you can access this session'}
            </p>
          </div>
        </div>
        <Switch
          checked={isPublic}
          onCheckedChange={handleToggle}
          disabled={isPending}
          className={cn('shrink-0 cursor-pointer', isPending && 'opacity-50')}
        />
      </div>

      {/* Link Actions — visible when public */}
      {isPublic && shareLink && (
        <div className="space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-150 pt-0.5">
          {/* Copy URL */}
          <button
            onClick={handleCopy}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 h-8 rounded-lg transition-all cursor-pointer',
              'bg-muted/50 hover:bg-muted active:scale-[0.99]',
              copied && 'bg-emerald-500/10',
            )}
          >
            <span className="flex-1 text-[11px] text-muted-foreground font-mono truncate text-left">
              {shareLink.replace(/^https?:\/\//, '')}
            </span>
            <div
              className={cn(
                'transition-colors shrink-0',
                copied
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground',
              )}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </div>
          </button>

          {/* Actions Row */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleOpen}
              className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-medium bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all cursor-pointer"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </button>
            <button
              onClick={handleShareX}
              className="flex items-center justify-center h-7 w-7 rounded-lg border border-border/60 hover:bg-muted transition-colors cursor-pointer"
              title="Share on X"
            >
              <XIcon />
            </button>
            <button
              onClick={handleShareLinkedIn}
              className="flex items-center justify-center h-7 w-7 rounded-lg border border-border/60 hover:bg-muted transition-colors cursor-pointer"
              title="Share on LinkedIn"
            >
              <LinkedInIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Exported popover wrapper ──

interface SharePopoverProps {
  sessionId: string;
  children?: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

export function SharePopover({
  sessionId,
  children,
  side = 'bottom',
  align = 'end',
}: SharePopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[280px] p-0 overflow-hidden"
        sideOffset={8}
      >
        <SharePopoverContent sessionId={sessionId} isOpen={open} />
      </PopoverContent>
    </Popover>
  );
}
