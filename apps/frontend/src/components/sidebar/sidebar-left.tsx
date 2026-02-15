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
} from 'lucide-react';
import posthog from 'posthog-js';

import { SessionList } from '@/components/sidebar/session-list';
import { ProjectSelector } from '@/components/sidebar/project-selector';

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
import { useTabStore } from '@/stores/tab-store';
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
        'flex items-center justify-center h-10 w-10 rounded-xl cursor-pointer',
        'transition-all duration-150 ease-out',
        'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
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
    useTabStore.getState().openTab({
      id: sessionId,
      title: session?.title || 'Session',
      type: 'session',
      href: `/sessions/${sessionId}`,
      serverId: useServerStore.getState().activeServerId,
    });
    router.push(`/sessions/${sessionId}`);
  };

  return (
    <div className="overflow-y-auto flex-1 py-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {rootSessions.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground/60">
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
                'transition-all duration-150 ease-out',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <ThreadIcon
                iconName={(session as any).icon}
                className={cn(
                  'flex-shrink-0',
                  isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground/60',
                )}
                size={18}
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
    useTabStore.getState().openTab({
      id: `page:/projects/${projectId}`,
      title: name,
      type: 'project',
      href: `/projects/${projectId}`,
    });
    router.push(`/projects/${projectId}`);
  };

  const activeProjectId = React.useMemo(() => {
    const match = pathname?.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  return (
    <div className="overflow-y-auto flex-1 py-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {sortedProjects.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground/60">
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
                'transition-all duration-150 ease-out',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <FolderOpen
                className={cn(
                  'flex-shrink-0',
                  isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground/60',
                )}
                size={18}
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
      useTabStore.getState().openTab({
        id: session.id,
        title: 'New session',
        type: 'session',
        href: `/sessions/${session.id}`,
        serverId: useServerStore.getState().activeServerId,
      });
      // Use pushState (like handleActivate in tab-bar) so the pre-mounted
      // session tab becomes visible without a full Next.js navigation.
      window.history.pushState(null, '', `/sessions/${session.id}`);
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

      if ((event.metaKey || event.ctrlKey) && event.key === 'b' && !isEditing) {
        event.preventDefault();
        const newState = state !== 'expanded';
        setOpen(newState);
        window.dispatchEvent(new CustomEvent('sidebar-left-toggled', { detail: { expanded: newState } }));
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
        event.preventDefault();
        handleNewSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, setOpen, isDocumentModalOpen, handleNewSession]);

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
                useTabStore.getState().openTab({
                  id: 'page:/dashboard',
                  title: 'Dashboard',
                  type: 'dashboard',
                  href: '/dashboard',
                });
                router.push('/dashboard');
                if (isMobile) setOpenMobile(false);
              }} className="flex items-center justify-center group-hover/collapsed:hidden">
                <KortixLogo
                  variant="symbol"
                  size={20}
                  className="flex-shrink-0"
                />
              </Link>
              {/* Chevron — shows on hover */}
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 hidden group-hover/collapsed:block" />
            </div>
          )}

          {/* Expanded: Logo + collapse button */}
          <div className={cn(
            'flex items-center transition-opacity duration-200',
            state === 'collapsed' && 'opacity-0 pointer-events-none'
          )}>
            <Link href="/dashboard" onClick={(e) => {
              e.preventDefault();
              useTabStore.getState().openTab({
                id: 'page:/dashboard',
                title: 'Dashboard',
                type: 'dashboard',
                href: '/dashboard',
              });
              router.push('/dashboard');
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
              'flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-150 ease-out cursor-pointer',
              'text-muted-foreground/40 hover:text-muted-foreground hover:bg-sidebar-accent/50',
              state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
            onClick={() => isMobile ? setOpenMobile(false) : setOpen(false)}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </SidebarHeader>

      {/* ====== CONTENT ====== */}
      <SidebarContent className="[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] relative overflow-visible">
        {/* --- Collapsed: 3 icon buttons — New Chat, Projects, Sessions --- */}
        <div className={cn(
          'absolute inset-0 px-2 pt-3 space-y-0.5 flex flex-col items-center transition-opacity duration-150 ease-out overflow-visible',
          state === 'collapsed' ? 'opacity-100 pointer-events-auto delay-100' : 'opacity-0 pointer-events-none delay-0'
        )}>
          <CollapsedIconButton
            icon={<SquarePen className="h-[18px] w-[18px]" />}
            label="New session"
            onClick={handleNewSession}
            disabled={createSession.isPending}
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
          'flex flex-col h-full min-h-0 transition-opacity duration-150 ease-out',
          state === 'collapsed' ? 'opacity-0 pointer-events-none delay-0' : 'opacity-100 pointer-events-auto delay-100'
        )}>
          {/* Pinned: New session + Projects (always visible) */}
          <div className="flex-shrink-0">
            {/* New session + Open terminal buttons */}
            <div className="px-2 pt-1 pb-1 flex items-center gap-1">
              <button
                onClick={handleNewSession}
                disabled={createSession.isPending}
                className={cn(
                  'flex items-center gap-3 flex-1 min-w-0 px-3 py-2 rounded-lg text-sm cursor-pointer',
                  'transition-all duration-150 ease-out',
                  'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <SquarePen className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
                <span>{createSession.isPending ? 'Creating...' : 'New session'}</span>
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      const store = useKortixComputerStore.getState();
                      store.setActiveView('terminal');
                      store.openSidePanel();
                    }}
                    className={cn(
                      'flex items-center justify-center h-8 w-8 flex-shrink-0 rounded-lg cursor-pointer',
                      'transition-all duration-150 ease-out',
                      'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                    )}
                  >
                    <TerminalSquare className="h-4 w-4 text-muted-foreground/60" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Open Terminal <kbd className="ml-1.5 text-[10px] text-muted-foreground">⌘`</kbd>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Projects accordion */}
            <ProjectSelector
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
            />
          </div>

          {/* Sessions accordion (scrolls independently) */}
          <Collapsible defaultOpen className="flex flex-col min-h-0 flex-1">
            <div className="px-5 pt-1 flex-shrink-0">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full py-1.5 group cursor-pointer">
                  <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                    Sessions
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground/40 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
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
      <SidebarFooter className="px-3 pb-3 pt-0">
        <UserProfileSection user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export { FloatingMobileMenuButton };
