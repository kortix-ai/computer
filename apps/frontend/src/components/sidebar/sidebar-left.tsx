'use client';

import * as React from 'react';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Menu,
  ChevronRight,
  ChevronLeft,
  SquarePen,
  ListTree,
  ChevronDown,
  Search,
  Blocks,
  ArrowDownToLine,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  MessageSquare,
  Calendar,
  Sparkles,
  Bug,
  Zap,
  X,
  Loader2,
  FolderOpen,
  Brain,
} from 'lucide-react';
import posthog from 'posthog-js';

const IntegrationsIcon = ({ className }: { className?: string }) => (
  <div className={cn('relative flex items-center', className)} style={{ width: 38, height: 20 }}>
    <div className="absolute left-0 w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden z-[3] shadow-sm">
      <svg viewBox="0 0 24 24" className="w-3 h-3">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    </div>
    <div className="absolute left-[11px] w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden z-[2] shadow-sm">
      <svg viewBox="0 0 24 24" className="w-3 h-3">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
        <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E"/>
      </svg>
    </div>
    <div className="absolute left-[22px] w-5 h-5 rounded-full bg-[#5865F2] border border-border/60 flex items-center justify-center overflow-hidden z-[1] shadow-sm">
      <svg viewBox="0 0 24 24" fill="white" className="w-2.5 h-2.5">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    </div>
  </div>
);

import { SessionList } from '@/components/sidebar/session-list';
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
import { useIsMobile } from '@/hooks/utils';
import { cn } from '@/lib/utils';
import { useAdminRole } from '@/hooks/admin';
import { useDocumentModalStore } from '@/stores/use-document-modal-store';
import { isBillingEnabled } from '@/lib/config';
import { useAccountState, accountStateSelectors } from '@/hooks/billing';
import { getPlanIcon } from '@/components/billing/plan-utils';
import { useCreateOpenCodeSession, useOpenCodeSessions } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore, openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
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

  // Cmd+J shortcut for new session
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDocumentModalOpen) return;

      const el = document.activeElement;
      const isEditing = el && (
        el.tagName.toLowerCase() === 'input' ||
        el.tagName.toLowerCase() === 'textarea' ||
        el.getAttribute('contenteditable') === 'true' ||
        el.closest('.cm-editor') ||
        el.closest('.ProseMirror')
      );

      if ((event.metaKey || event.ctrlKey) && event.key === 'j' && !isEditing) {
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
              <PanelLeftOpen className="h-5 w-5 text-sidebar-foreground hidden group-hover/collapsed:block" />
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
            <PanelLeftClose className="h-5 w-5" />
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
              <span>{createSession.isPending ? 'Creating...' : 'New session'}</span>
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


