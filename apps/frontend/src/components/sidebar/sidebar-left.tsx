'use client';

import * as React from 'react';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  SquarePen,
  ListTree,
  ChevronDown,
  Search,
  ArrowDownToLine,
  Sparkles,
  Bug,
  Zap,
  X,
  Loader2,
  History,
  ArrowRightLeft,
  CheckCircle2,
} from 'lucide-react';
import posthog from 'posthog-js';

import { SessionList } from '@/components/sidebar/session-list';
import { useLegacyThreads, useMigrateAllLegacyThreads, useMigrateAllStatus } from '@/hooks/legacy/use-legacy-threads';
import { useGlobalSandboxUpdate } from '@/hooks/platform/use-global-sandbox-update';

import { UserMenu } from '@/components/sidebar/user-menu';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { ThreadIcon } from '@/components/sidebar/thread-icon';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { useIsMobile } from '@/hooks/utils';
import { cn } from '@/lib/utils';
import { useAdminRole } from '@/hooks/admin';
import { useDocumentModalStore } from '@/stores/use-document-modal-store';
import { isBillingEnabled } from '@/lib/config';
import { useAccountState, accountStateSelectors } from '@/hooks/billing';
import { getPlanIcon } from '@/components/billing/plan-utils';
import { useCreateOpenCodeSession, useOpenCodeSessions } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// Floating Mobile Menu Button
// ============================================================================
// Collapsed Icon Button with optional hover flyout
// ============================================================================

interface CollapsedIconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  flyoutContent?: React.ReactNode;
  disabled?: boolean;
}

function CollapsedIconButton({ icon, label, onClick, flyoutContent, disabled }: CollapsedIconButtonProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const buttonEl = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center w-full py-2 rounded-lg cursor-pointer',
        'transition-all duration-150 ease-out',
        'text-sidebar-foreground hover:bg-sidebar-accent',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {icon}
    </button>
  );

  // Flyout buttons: use Radix Popover (portal-based, no overflow issues)
  if (flyoutContent) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            onMouseEnter={() => { cancelClose(); setOpen(true); }}
            onMouseLeave={scheduleClose}
          >
            {buttonEl}
          </div>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          className="w-[280px] max-h-[75vh] p-0 overflow-hidden"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {flyoutContent}
        </PopoverContent>
      </Popover>
    );
  }

  // Non-flyout buttons: keep tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {buttonEl}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={12} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Sessions Flyout
// ============================================================================

function SessionsFlyout() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: sessions } = useOpenCodeSessions();
  const permissions = useOpenCodePendingStore((s) => s.permissions);
  const questions = useOpenCodePendingStore((s) => s.questions);

  const rootSessions = React.useMemo(() => {
    if (!sessions) return [];
    return sessions
      .filter((s) => !s.parentID && !(s.time as any).archived)
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, 40);
  }, [sessions]);

  const getPendingCount = (sessionId: string) => {
    const permCount = Object.values(permissions).filter((p) => p.sessionID === sessionId).length;
    const qCount = Object.values(questions).filter((q) => q.sessionID === sessionId).length;
    return permCount + qCount;
  };

  const handleClick = (sessionId: string) => {
    const session = rootSessions.find((s) => s.id === sessionId);
    openTabAndNavigate({
      id: sessionId,
      title: session?.title || 'Session',
      type: 'session',
      href: `/sessions/${sessionId}`,
      serverId: useServerStore.getState().activeServerId,
    });

  };

  return (
    <div className="overflow-y-auto flex-1 py-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {rootSessions.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No sessions yet
        </div>
      ) : (
        rootSessions.map((session) => {
          const isActive = pathname?.includes(session.id);
          const pendingCount = getPendingCount(session.id);
          return (
            <button
              key={session.id}
              onClick={() => handleClick(session.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 text-sm cursor-pointer',
                'transition-colors duration-150',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )}
            >
              <ThreadIcon
                iconName={(session as any).icon}
                className={cn(
                  'flex-shrink-0',
                  isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground',
                )}
                size={16}
              />
              <span className="flex-1 truncate text-left">{session.title || 'Untitled'}</span>
              {pendingCount > 0 && (
                <span className="flex-shrink-0 h-[18px] min-w-[18px] px-1 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-semibold flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

// ============================================================================
// User Profile Section
// ============================================================================

// ============================================================================
// Sidebar Update Indicator
// ============================================================================

const changeTypeIcon: Record<string, typeof Sparkles> = {
  feature: Sparkles,
  fix: Bug,
  improvement: Zap,
};
const changeTypeColor: Record<string, string> = {
  feature: 'text-emerald-500',
  fix: 'text-red-400',
  improvement: 'text-blue-400',
};

function SidebarUpdateIndicator({ collapsed }: { collapsed: boolean }) {
  const { updateAvailable, latestVersion, changelog, update, isUpdating, updateResult } = useGlobalSandboxUpdate();
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const dismissKey = `sidebar-update-dismissed-${latestVersion}`;

  React.useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(dismissKey) === 'true') setDismissed(true);
    } catch {}
  }, [dismissKey]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    try { localStorage.setItem(dismissKey, 'true'); } catch {}
  };

  const navigateToChangelog = () => {
    openTabAndNavigate(
      { id: 'page:/changelog', title: 'Changelog', type: 'page', href: '/changelog' },
      router,
    );
  };

  if (!mounted || !updateAvailable || dismissed || updateResult?.success) return null;

  // ── Collapsed state: icon with pulse dot ──
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <button
          onClick={navigateToChangelog}
          className="relative p-2 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer"
          title={`v${latestVersion} available`}
        >
          <ArrowDownToLine className="h-4 w-4 text-primary" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
        </button>
      </div>
    );
  }

  // ── Expanded state: rich card ──
  const changes = changelog?.changes ?? [];
  const previewChanges = changes.slice(0, 3);
  const remaining = changes.length - 3;

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/[0.03] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="text-xs font-semibold text-foreground truncate min-w-0">New Kortix version</span>
        <span className="flex-1" />
        <span className="text-[10px] text-muted-foreground flex-shrink-0">v{latestVersion}</span>
        <button
          onClick={handleDismiss}
          className="p-0.5 rounded hover:bg-muted/80 transition-colors cursor-pointer flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3 text-muted-foreground/60" />
        </button>
      </div>

      {/* Change list */}
      {previewChanges.length > 0 && (
        <div className="px-3 pb-1.5 space-y-0.5">
          {previewChanges.map((change, i) => {
            const Icon = changeTypeIcon[change.type] ?? Zap;
            const color = changeTypeColor[change.type] ?? 'text-muted-foreground';
            return (
              <div key={i} className="flex items-start gap-1.5">
                <Icon className={cn('h-3 w-3 mt-[1px] flex-shrink-0', color)} />
                <span className="text-[11px] text-muted-foreground leading-tight line-clamp-1">{change.text}</span>
              </div>
            );
          })}
          {remaining > 0 && (
            <button
              onClick={navigateToChangelog}
              className="text-[10px] text-primary/70 hover:text-primary font-medium pl-[18px] cursor-pointer transition-colors"
            >
              +{remaining} more
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
        {!isUpdating ? (
          <button
            onClick={() => update()}
            className="flex-1 flex items-center justify-center gap-1.5 h-7 text-[11px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowDownToLine className="h-3 w-3" />
            Update
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-1.5 h-7 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating...
          </div>
        )}
        <button
          onClick={navigateToChangelog}
          className="flex items-center justify-center h-7 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
        >
          Details
        </button>
      </div>
    </div>
  );
}

function UserProfileSection({ user }: { user: { name: string; email: string; avatar: string; isAdmin?: boolean } }) {
  const billingActive = isBillingEnabled();
  const { data: accountState } = useAccountState({ enabled: billingActive });

  if (!billingActive) {
    return <UserMenu user={{ ...user, planName: 'Self-Hosted', planIcon: undefined }} />;
  }

  const planName = accountStateSelectors.planName(accountState);
  return <UserMenu user={{ ...user, planName, planIcon: getPlanIcon(planName) ?? undefined }} />;
}

// ============================================================================
// Sessions + Legacy Threads Accordion
// ============================================================================

function SidebarSections() {
  const [legacyOpen, setLegacyOpen] = React.useState(false);
  const { data: legacyData, isLoading: legacyLoading } = useLegacyThreads();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const migrateAll = useMigrateAllLegacyThreads();
  const [migrateAllStarted, setMigrateAllStarted] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { data: migrateStatus } = useMigrateAllStatus(migrateAllStarted);

  const hasLegacy = !legacyLoading && legacyData && legacyData.threads.length > 0;
  const isMigrating = migrateStatus?.status === 'running';
  const migrateDone = migrateStatus?.status === 'done';

  const handleMigrateAll = React.useCallback(async () => {
    const server = useServerStore.getState();
    const active = server.servers.find((s) => s.id === server.activeServerId);
    if (!active?.sandboxId) return;

    setMigrateAllStarted(true);
    try {
      await migrateAll.mutateAsync({ sandboxExternalId: active.sandboxId });
    } catch {}
  }, [migrateAll]);

  const handleLegacyClick = (threadId: string, name: string) => {
    openTabAndNavigate({
      id: `legacy:${threadId}`,
      title: name || 'Previous Chat',
      type: 'page',
      href: `/legacy/${threadId}`,
    });
    if (isMobile) setOpenMobile(false);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Sessions — always visible, takes remaining space */}
      <Collapsible defaultOpen className="flex flex-col min-h-0 flex-1">
        <div className="px-3 flex-shrink-0">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer group">
              <ListTree className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">Sessions</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <SessionList projectId={null} />
        </CollapsibleContent>
      </Collapsible>

      {hasLegacy && (
        <div className="flex-shrink-0 py-2">
          <div className="px-3 flex items-center">
            <button
              onClick={() => setLegacyOpen((o) => !o)}
              className="flex items-center gap-3 flex-1 px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
            >
              <History className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">Previous Chats</span>
              <span className="text-[10px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {legacyData!.total}
              </span>
              <ChevronDown className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                !legacyOpen && '-rotate-90',
              )} />
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
                  disabled={isMigrating || migrateDone || migrateAll.isPending}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0 transition-colors duration-150',
                    migrateDone
                      ? 'text-emerald-500'
                      : isMigrating || migrateAll.isPending
                        ? 'text-muted-foreground cursor-not-allowed'
                        : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer',
                  )}
                >
                  {migrateDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isMigrating || migrateAll.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {migrateDone
                  ? `All converted${migrateStatus && migrateStatus.failed > 0 ? ` (${migrateStatus.failed} failed)` : ''}`
                  : isMigrating
                    ? `Converting ${migrateStatus?.completed ?? 0}/${migrateStatus?.total ?? 0}...`
                    : 'Convert all to sessions'}
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Progress bar — always visible when migrating */}
          {(isMigrating || migrateAll.isPending) && migrateStatus && migrateStatus.total > 0 && (
            <div className="px-6 pb-1.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-muted-foreground">
                  Converting {migrateStatus.completed}/{migrateStatus.total}
                  {migrateStatus.failed > 0 && <span className="text-destructive"> · {migrateStatus.failed} failed</span>}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${Math.round(((migrateStatus.completed + migrateStatus.failed) / migrateStatus.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {migrateDone && migrateStatus && (
            <div className="px-6 pb-1.5">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                Converted {migrateStatus.completed} chats
                {migrateStatus.failed > 0 && <span className="text-destructive"> · {migrateStatus.failed} failed</span>}
              </span>
            </div>
          )}
          {legacyOpen && (
            <div className="max-h-[40vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="px-4 pb-2">
                <div className="space-y-0.5">
                  {legacyData!.threads.map((thread) => {
                    const isActive = pathname?.includes(thread.thread_id);
                    return (
                      <button
                        key={thread.thread_id}
                        onClick={() => handleLegacyClick(thread.thread_id, thread.name)}
                        className={cn(
                          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] cursor-pointer',
                          'transition-colors duration-150',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                        )}
                      >
                        <span className="flex-1 truncate text-left">{thread.name || 'Untitled'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert all previous chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This will convert {legacyData?.total ?? 0} previous chats into sessions. The process runs in the background, but may take a few minutes depending on the number of chats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMigrateAll}>Convert all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Main Sidebar
// ============================================================================

export function SidebarLeft({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state, setOpen, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Project filtering for session list removed — projects page merged into workspace

  const { isOpen: isDocumentModalOpen } = useDocumentModalStore();

  const { data: adminRoleData } = useAdminRole();
  const isAdmin = adminRoleData?.isAdmin ?? false;

  const [user, setUser] = useState<{
    name: string;
    email: string;
    avatar: string;
    isAdmin?: boolean;
  }>({ name: 'Loading...', email: '', avatar: '', isAdmin: false });

  useEffect(() => {
    const fetchUserData = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser({
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
          email: data.user.email || '',
          avatar: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture || '',
          isAdmin,
        });
      }
    };
    fetchUserData();
  }, [isAdmin]);

  const createSession = useCreateOpenCodeSession();

  const handleNewSession = useCallback(async () => {
    posthog.capture('new_task_clicked', { source: 'new_session_button' });
    try {
      const session = await createSession.mutateAsync();
      openTabAndNavigate({
        id: session.id,
        title: 'New session',
        type: 'session',
        href: `/sessions/${session.id}`,
        serverId: useServerStore.getState().activeServerId,
      });
      // Focus the textarea in the newly visible session tab
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('focus-session-textarea'));
      });
      if (isMobile) setOpenMobile(false);
    } catch {
      router.push('/dashboard');
      if (isMobile) setOpenMobile(false);
    }
  }, [createSession, router, isMobile, setOpenMobile]);

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, searchParams, isMobile, setOpenMobile]);

  // Listen for right sidebar expansion → collapse left
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.expanded && state === 'expanded') {
        setOpen(false);
      }
    };
    window.addEventListener('sidebar-right-toggled', handler);
    return () => window.removeEventListener('sidebar-right-toggled', handler);
  }, [state, setOpen]);

  // Cmd+B is handled by the SidebarProvider in sidebar.tsx — do NOT duplicate
  // it here. Having two handlers on the same keypress caused a race condition:
  // the provider's toggleSidebar() would close the sidebar, then this handler
  // (reading stale `state`) would reopen it on the same tick.

  // Dispatch sidebar-left-toggled event when the sidebar state changes so the
  // right sidebar can auto-collapse (mutual exclusion).
  const prevStateRef = useRef(state);
  useEffect(() => {
    if (prevStateRef.current !== state) {
      prevStateRef.current = state;
      window.dispatchEvent(
        new CustomEvent('sidebar-left-toggled', {
          detail: { expanded: state === 'expanded' },
        }),
      );
    }
  }, [state]);

  // Cmd+J shortcut for new session (works globally, even when typing)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDocumentModalOpen) return;

      if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
        event.preventDefault();
        handleNewSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDocumentModalOpen, handleNewSession]);

  return (
    <Sidebar
      collapsible="icon"
      className="bg-sidebar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      {...props}
    >
      {/* ====== HEADER: Logo + collapse/expand ====== */}
      <SidebarHeader className="pt-3 pb-0 overflow-visible">
        <div className="relative flex h-[32px] items-center px-3 justify-between">
          {/* Collapsed: Kortix symbol (always visible), chevron on hover */}
          {state === 'collapsed' && (
            <div
              className="group/collapsed absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={() => {
                setOpen(true);
                window.dispatchEvent(new CustomEvent('sidebar-left-toggled', { detail: { expanded: true } }));
              }}
            >
              {/* Symbol — hides on hover */}
              <Link href="/dashboard" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openTabAndNavigate({
                  id: 'page:/dashboard',
                  title: 'Dashboard',
                  type: 'dashboard',
                  href: '/dashboard',
                }, router);
                if (isMobile) setOpenMobile(false);
              }} className="flex items-center justify-center group-hover/collapsed:hidden">
                <KortixLogo
                  variant="symbol"
                  size={20}
                  className="flex-shrink-0"
                />
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground hidden group-hover/collapsed:block" />
            </div>
          )}
          <div className={cn(
            'flex items-center transition-opacity duration-200',
            state === 'collapsed' && 'opacity-0 pointer-events-none'
          )}>
            <Link href="/dashboard" onClick={(e) => {
              e.preventDefault();
              openTabAndNavigate({
                id: 'page:/dashboard',
                title: 'Dashboard',
                type: 'dashboard',
                href: '/dashboard',
              }, router);
              if (isMobile) setOpenMobile(false);
            }} className="flex items-center">
              <KortixLogo
                variant="logomark"
                size={16}
                className="flex-shrink-0"
              />
            </Link>
          </div>

          <button
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-lg transition-colors duration-150 cursor-pointer',
        'text-sidebar-foreground hover:bg-sidebar-accent',
              state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
            onClick={() => isMobile ? setOpenMobile(false) : setOpen(false)}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarHeader>

      {/* ====== CONTENT ====== */}
      <SidebarContent className="[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] relative overflow-visible">
        {/* --- Collapsed: 3 icon buttons — New Chat, Projects, Sessions --- */}
        <div className={cn(
          'absolute inset-0 px-2 pt-2 space-y-0.5 flex flex-col items-center overflow-visible',
          state === 'collapsed' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}>
          <CollapsedIconButton
            icon={<SquarePen className="h-4 w-4" />}
            label="New session"
            onClick={handleNewSession}
            disabled={createSession.isPending}
          />
          <CollapsedIconButton
            icon={<Search className="h-4 w-4" />}
            label="Search"
            onClick={() => {
              const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
              document.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'k',
                  code: 'KeyK',
                  metaKey: isMac,
                  ctrlKey: !isMac,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            }}
          />
          <CollapsedIconButton
            icon={<ListTree className="h-4 w-4" />}
            label="Sessions"
            flyoutContent={<SessionsFlyout />}
          />


        </div>

        {/* --- Expanded layout --- */}
        <div className={cn(
          'flex flex-col h-full min-h-0',
          state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
        )}>
          {/* Navigation */}
          <nav className="flex-shrink-0 px-3 pt-2 pb-1 space-y-0.5">
            {/* New session */}
            <button
              onClick={handleNewSession}
              disabled={createSession.isPending}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] cursor-pointer',
                'transition-colors duration-150',
                'text-sidebar-foreground hover:bg-sidebar-accent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <SquarePen className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">{createSession.isPending ? 'Creating...' : 'New session'}</span>
              <kbd className="text-[10px] text-muted-foreground">
                {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318J' : 'Ctrl J'}
              </kbd>
            </button>

            {/* Search */}
            <button
              onClick={() => {
                const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
                document.dispatchEvent(
                  new KeyboardEvent('keydown', {
                    key: 'k',
                    code: 'KeyK',
                    metaKey: isMac,
                    ctrlKey: !isMac,
                    bubbles: true,
                    cancelable: true,
                  }),
                );
              }}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
            >
              <Search className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="text-[10px] text-muted-foreground">
                {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318K' : 'Ctrl K'}
              </kbd>
            </button>

            {/* Sessions — expandable, default open */}
          </nav>


          <SidebarSections />
        </div>
      </SidebarContent>

      {/* ====== FOOTER ====== */}
      <SidebarFooter className="px-3 pb-3 pt-0 group-data-[collapsible=icon]:px-0">
        <SidebarUpdateIndicator collapsed={state === 'collapsed'} />
        <UserProfileSection user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}


