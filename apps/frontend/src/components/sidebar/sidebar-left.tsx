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
  FolderOpen,
  ListTree,
  ChevronDown,
  TerminalSquare,
  Search,
} from 'lucide-react';
import posthog from 'posthog-js';

import { SessionList } from '@/components/sidebar/session-list';

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
import { isLocalMode } from '@/lib/config';
import { useAccountState, accountStateSelectors } from '@/hooks/billing';
import { getPlanIcon } from '@/components/billing/plan-utils';
import { useCreateOpenCodeSession, useOpenCodeSessions, useOpenCodeProjects } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore, openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// Floating Mobile Menu Button
// ============================================================================

function FloatingMobileMenuButton() {
  const { setOpenMobile, openMobile, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const pathname = usePathname();

  const isDashboard = pathname === '/dashboard';
  const isThreadPage = pathname?.includes('/thread/') || pathname?.match(/^\/agents\/[^/]+\/[^/]+$/);
  const hasInlineMenu = isDashboard || isThreadPage;

  if (!isMobile || openMobile || hasInlineMenu) return null;

  return (
    <div className="fixed top-3 left-3 z-50 safe-area-top">
      <Button
        onClick={() => { setOpen(true); setOpenMobile(true); }}
        size="icon"
        className="h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm text-foreground border border-border shadow-md hover:bg-background transition-all duration-200 active:scale-95 touch-manipulation"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>
    </div>
  );
}

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
        'flex items-center justify-center w-full py-2.5 rounded-xl cursor-pointer',
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
                'flex items-center gap-3 w-full px-3.5 py-2 text-sm cursor-pointer',
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
// Projects Flyout
// ============================================================================

function ProjectsFlyout() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: projects } = useOpenCodeProjects();

  const sortedProjects = React.useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a: any, b: any) => {
      // Global project always first
      const aIsGlobal = a.id === 'global' || a.worktree === '/';
      const bIsGlobal = b.id === 'global' || b.worktree === '/';
      if (aIsGlobal && !bIsGlobal) return -1;
      if (!aIsGlobal && bIsGlobal) return 1;
      return b.time.updated - a.time.updated;
    });
  }, [projects]);

  const getProjectDisplayName = (project: any): string => {
    if (project.name) return project.name;
    if (project.worktree === '/' || project.id === 'global') return 'Global';
    const parts = project.worktree.split('/');
    return parts[parts.length - 1] || project.worktree;
  };

  const handleClick = (projectId: string, name: string) => {
    openTabAndNavigate({
      id: `page:/projects/${projectId}`,
      title: name,
      type: 'project',
      href: `/projects/${projectId}`,
    }, router);
  };

  const activeProjectId = React.useMemo(() => {
    const match = pathname?.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  return (
    <div className="overflow-y-auto flex-1 py-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {sortedProjects.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No projects detected
        </div>
      ) : (
        sortedProjects.map((project) => {
          const name = getProjectDisplayName(project);
          const isActive = activeProjectId === project.id;
          return (
            <button
              key={project.id}
              onClick={() => handleClick(project.id, name)}
              className={cn(
                'flex items-center gap-3 w-full px-3.5 py-2 text-sm cursor-pointer',
                'transition-colors duration-150',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )}
            >
              <FolderOpen
                className={cn(
                  'flex-shrink-0',
                  isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground',
                )}
                size={16}
                style={project.icon?.color ? { color: project.icon.color } : undefined}
              />
              <span className="flex-1 truncate text-left">{name}</span>
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

function UserProfileSection({ user }: { user: { name: string; email: string; avatar: string; isAdmin?: boolean } }) {
  const isLocal = isLocalMode();
  const { data: accountState } = useAccountState({ enabled: !isLocal });

  // In local mode, skip cloud plan info entirely
  if (isLocal) {
    return <UserMenu user={{ ...user, planName: 'Local', planIcon: undefined }} />;
  }

  const planName = accountStateSelectors.planName(accountState);
  return <UserMenu user={{ ...user, planName, planIcon: getPlanIcon(planName, isLocal) ?? undefined }} />;
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

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    const match = typeof window !== 'undefined' && window.location.pathname.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : null;
  });

  useEffect(() => {
    const match = pathname?.match(/^\/projects\/([^/]+)/);
    if (match) {
      setSelectedProjectId(match[1]);
    }
  }, [pathname]);

  const { isOpen: isDocumentModalOpen } = useDocumentModalStore();

  const { data: adminRoleData } = useAdminRole();
  const isAdmin = adminRoleData?.isAdmin ?? false;

  const isLocal = isLocalMode();

  const [user, setUser] = useState<{
    name: string;
    email: string;
    avatar: string;
    isAdmin?: boolean;
  }>(() =>
    isLocal
      ? { name: 'Local User', email: '', avatar: '', isAdmin: false }
      : { name: 'Loading...', email: '', avatar: '', isAdmin: false },
  );

  useEffect(() => {
    if (isLocal) return; // No Supabase auth in local mode

    const fetchUserData = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser({
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
          email: data.user.email || '',
          avatar: data.user.user_metadata?.avatar_url || '',
          isAdmin,
        });
      }
    };
    fetchUserData();
  }, [isAdmin, isLocal]);

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
      <SidebarHeader className="pt-4 pb-0 overflow-visible">
        <div className="relative flex h-[32px] items-center px-4 justify-between">
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
              {/* Chevron — shows on hover */}
              <ChevronRight className="h-4 w-4 text-sidebar-foreground hidden group-hover/collapsed:block" />
            </div>
          )}

          {/* Expanded: Logo + collapse button */}
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
          'absolute inset-0 px-3 pt-3 space-y-1 flex flex-col items-center overflow-visible',
          state === 'collapsed' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}>
          <CollapsedIconButton
            icon={<SquarePen className="h-[18px] w-[18px]" />}
            label="New session"
            onClick={handleNewSession}
            disabled={createSession.isPending}
          />
          <CollapsedIconButton
            icon={<Search className="h-[18px] w-[18px]" />}
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
            icon={<FolderOpen className="h-[18px] w-[18px]" />}
            label="Projects"
            flyoutContent={<ProjectsFlyout />}
          />
          <CollapsedIconButton
            icon={<ListTree className="h-[18px] w-[18px]" />}
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
          <nav className="flex-shrink-0 px-3 pt-3 pb-2 space-y-1">
            {/* New session */}
            <button
              onClick={handleNewSession}
              disabled={createSession.isPending}
              className={cn(
                'flex items-center gap-3.5 w-full px-3 py-2.5 rounded-xl text-sm cursor-pointer',
                'transition-colors duration-150',
                'text-sidebar-foreground hover:bg-sidebar-accent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <SquarePen className="h-[18px] w-[18px] flex-shrink-0" />
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
              className="flex items-center gap-3.5 w-full px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
            >
              <Search className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="text-[11px] text-muted-foreground">
                {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318K' : 'Ctrl K'}
              </kbd>
            </button>

            {/* Projects */}
            <button
              onClick={() => {
                openTabAndNavigate({
                  id: 'page:/projects',
                  title: 'Projects',
                  type: 'project',
                  href: '/projects',
                }, router);
                if (isMobile) setOpenMobile(false);
              }}
              className="flex items-center gap-3.5 w-full px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer"
            >
              <FolderOpen className="h-[18px] w-[18px] flex-shrink-0" />
              <span>Projects</span>
            </button>

            {/* Sessions — expandable, default open */}
          </nav>

          <Collapsible defaultOpen className="flex flex-col min-h-0 flex-1">
            <div className="px-3 flex-shrink-0">
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-3.5 w-full px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer group">
                  <ListTree className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="flex-1 text-left">Sessions</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <SessionList projectId={selectedProjectId} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </SidebarContent>

      {/* ====== FOOTER ====== */}
      <SidebarFooter className="px-3 pb-3 pt-0 group-data-[collapsible=icon]:px-0">
        <UserProfileSection user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export { FloatingMobileMenuButton };
