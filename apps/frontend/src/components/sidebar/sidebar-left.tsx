'use client';

import * as React from 'react';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Menu,
  Plus,
  PanelLeftOpen,
  PanelLeftClose,
  SquarePen,
} from 'lucide-react';
import posthog from 'posthog-js';

import { SessionList } from '@/components/sidebar/session-list';
import { ProjectSelector } from '@/components/sidebar/project-selector';

import { UserMenu } from '@/components/sidebar/user-menu';
import { KortixLogo } from '@/components/sidebar/kortix-logo';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/utils';
import { cn } from '@/lib/utils';
import { useAdminRole } from '@/hooks/admin';
import { useDocumentModalStore } from '@/stores/use-document-modal-store';
import { isLocalMode } from '@/lib/config';
import { useAccountState, accountStateSelectors } from '@/hooks/billing';
import { getPlanIcon } from '@/components/billing/plan-utils';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
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
// User Profile Section (bridges auth data to UserMenu)
// ============================================================================

function UserProfileSection({ user }: { user: { name: string; email: string; avatar: string; isAdmin?: boolean } }) {
  const { data: accountState } = useAccountState({ enabled: true });
  const isLocal = isLocalMode();
  const planName = accountStateSelectors.planName(accountState);

  return <UserMenu user={{ ...user, planName, planIcon: getPlanIcon(planName, isLocal) }} />;
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

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { isOpen: isDocumentModalOpen } = useDocumentModalStore();

  // Auth
  const { data: adminRoleData } = useAdminRole();
  const isAdmin = adminRoleData?.isAdmin ?? false;

  const [user, setUser] = useState<{
    name: string;
    email: string;
    avatar: string;
    isAdmin?: boolean;
  }>({
    name: 'Loading...',
    email: '',
    avatar: '',
    isAdmin: false,
  });

  useEffect(() => {
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
  }, [isAdmin]);

  // Session creation
  const createSession = useCreateOpenCodeSession();

  const handleNewSession = useCallback(async () => {
    posthog.capture('new_task_clicked', { source: 'new_session_button' });
    try {
      const session = await createSession.mutateAsync();
      router.push(`/sessions/${session.id}`);
      if (isMobile) setOpenMobile(false);
    } catch {
      router.push('/dashboard');
      if (isMobile) setOpenMobile(false);
    }
  }, [createSession, router, isMobile, setOpenMobile]);

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, searchParams, isMobile, setOpenMobile]);

  // Keyboard shortcuts
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
      className="border-r border-border/50 bg-background [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      {...props}
    >
      {/* ====== HEADER: Logo + collapse/expand ====== */}
      <SidebarHeader className="pt-4 pb-0 overflow-visible">
        <div className="relative flex h-[32px] items-center px-4 justify-between">
          {/* Logo area — symbol is always rendered & centered in collapsed rail */}
          <div className={cn(
            'relative flex items-center group/logo',
            state === 'collapsed' && 'absolute left-1/2 -translate-x-1/2'
          )}>
            <Link href="/dashboard" onClick={() => isMobile && setOpenMobile(false)} className="flex items-center">
              {/* Symbol: always rendered, fixed position in collapsed rail.
                  In expanded state it's hidden behind the logomark. */}
              <KortixLogo
                variant="symbol"
                size={18}
                className={cn(
                  'flex-shrink-0 transition-[transform,opacity] duration-300 ease-out transform-gpu',
                  state === 'collapsed'
                    ? 'opacity-100 scale-100 group-hover/logo:opacity-0 group-hover/logo:scale-90'
                    : 'opacity-0 scale-90 absolute'
                )}
              />
              {/* Logomark: visible only when expanded */}
              <KortixLogo
                variant="logomark"
                size={16}
                className={cn(
                  'flex-shrink-0 transition-[opacity] duration-300 ease-out',
                  state === 'collapsed' ? 'opacity-0 absolute pointer-events-none' : 'opacity-100'
                )}
              />
            </Link>
            {/* Expand button overlays the symbol on hover when collapsed */}
            {state === 'collapsed' && (
              <button
                className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0 scale-75 group-hover/logo:opacity-100 group-hover/logo:scale-100 transition-[opacity,transform] duration-300 ease-out transform-gpu"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>

          {/* Collapse button (only visible when expanded) */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 transition-opacity duration-200',
              state === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
            onClick={() => isMobile ? setOpenMobile(false) : setOpen(false)}
          >
            <PanelLeftClose className="!h-5 !w-5" />
          </Button>
        </div>
      </SidebarHeader>

      {/* ====== CONTENT ====== */}
      <SidebarContent className="[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] relative overflow-hidden">
        {/* --- Collapsed layout: icon-only actions --- */}
        <div className={cn(
          'absolute inset-0 px-2 pt-4 space-y-2 flex flex-col items-center transition-opacity duration-150 ease-out',
          state === 'collapsed' ? 'opacity-100 pointer-events-auto delay-100' : 'opacity-0 pointer-events-none delay-0'
        )}>
          <Button variant="outline" size="icon" className="h-10 w-10 shadow-none" onClick={handleNewSession} disabled={createSession.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* --- Expanded layout --- */}
        <div className={cn(
          'flex flex-col h-full transition-opacity duration-150 ease-out',
          state === 'collapsed' ? 'opacity-0 pointer-events-none delay-0' : 'opacity-100 pointer-events-auto delay-100'
        )}>
          {/* New session button */}
          <div className="px-2 pt-1 pb-0.5">
            <button
              onClick={handleNewSession}
              disabled={createSession.isPending}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              <SquarePen className="h-[18px] w-[18px] flex-shrink-0" />
              <span>{createSession.isPending ? 'Creating...' : 'New session'}</span>
            </button>
          </div>

          {/* Projects section */}
          <div>
            <ProjectSelector
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
            />
          </div>

          {/* Sessions */}
          <div className="flex-1 min-h-0 flex flex-col">
            <SessionList projectId={selectedProjectId} />
          </div>
        </div>
      </SidebarContent>

      {/* ====== FOOTER ====== */}
      <SidebarFooter className="px-4 pb-4 pt-0">
        <UserProfileSection user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export { FloatingMobileMenuButton };
