'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Suspense, lazy } from 'react';
import { useAccounts } from '@/hooks/account';
import { useAuth } from '@/components/AuthProvider';
import { useSystemStatusQuery } from '@/hooks/edge-flags';
import { useRouter } from 'next/navigation';
import { useApiHealth } from '@/hooks/usage/use-health';
import { useAdminRole } from '@/hooks/admin';
import { usePresence } from '@/hooks/use-presence';
import { featureFlags } from '@/lib/feature-flags';
import { usePrefetchComposioIcons } from '@/hooks/composio/use-composio';

import { useProjects } from '@/hooks/threads/use-project';
import { useIsMobile } from '@/hooks/utils';
import { AppProviders } from '@/components/layout/app-providers';
import { backendApi } from '@/lib/api-client';
import { AnnouncementDialog } from '../announcements/announcement-dialog';
import { NovuInboxProvider } from '../notifications/novu-inbox-provider';
import { useOpenCodeEventStream } from '@/hooks/opencode/use-opencode-events';
import { useSandbox } from '@/hooks/platform/use-sandbox';
import { TabBar } from '@/components/tabs/tab-bar';
import { useTabStore } from '@/stores/tab-store';
import { cn } from '@/lib/utils';

function OpenCodeEventStreamProvider() {
  useOpenCodeEventStream();
  return null;
}

/** Initializes the user's sandbox on dashboard load. Renders nothing. */
function SandboxInitProvider() {
  useSandbox();
  return null;
}

// Lazy load heavy components that aren't needed for initial render
const FloatingMobileMenuButton = lazy(() => 
  import('@/components/sidebar/sidebar-left').then(mod => ({ default: mod.FloatingMobileMenuButton }))
);
const MaintenancePage = lazy(() => 
  import('@/components/maintenance/maintenance-page').then(mod => ({ default: mod.MaintenancePage }))
);
const StatusOverlay = lazy(() => 
  import('@/components/ui/status-overlay').then(mod => ({ default: mod.StatusOverlay }))
);
const PresentationViewerWrapper = lazy(() => 
  import('@/stores/presentation-viewer-store').then(mod => ({ default: mod.PresentationViewerWrapper }))
);

const OnboardingProvider = lazy(() => 
  import('@/components/onboarding/onboarding-provider').then(mod => ({ default: mod.OnboardingProvider }))
);
const DashboardPromoBanner = lazy(() => 
  import('@/components/home/dashboard-promo-banner').then(mod => ({ default: mod.DashboardPromoBanner }))
);

const PresenceDebug = lazy(() => 
  import('@/components/debug/presence-debug').then(mod => ({ default: mod.PresenceDebug }))
);

const KortixAppBanners = lazy(() => 
  import('@/components/announcements/kortix-app-banners').then(mod => ({ default: mod.KortixAppBanners }))
);

const TutorialsBanner = lazy(() => 
  import('@/components/announcements/tutorials-banner').then(mod => ({ default: mod.TutorialsBanner }))
);

const MobileAppInterstitial = lazy(() => 
  import('@/components/announcements/mobile-app-interstitial').then(mod => ({ default: mod.MobileAppInterstitial }))
);

const TechnicalIssueBanner = lazy(() => 
  import('@/components/announcements/technical-issue-banner').then(mod => ({ default: mod.TechnicalIssueBanner }))
);

const MaintenanceCountdownBanner = lazy(() =>
  import('@/components/announcements/maintenance-countdown-banner').then(mod => ({ default: mod.MaintenanceCountdownBanner }))
);

const CommandPalette = lazy(() =>
  import('@/components/command-palette').then(mod => ({ default: mod.CommandPalette }))
);

const SessionLayout = lazy(() =>
  import('@/components/session/session-layout').then(mod => ({ default: mod.SessionLayout }))
);
const SessionChat = lazy(() =>
  import('@/components/session/session-chat').then(mod => ({ default: mod.SessionChat }))
);
const FileTabContent = lazy(() =>
  import('@/components/tabs/file-tab-content').then(mod => ({ default: mod.FileTabContent }))
);
const PreviewTabContent = lazy(() =>
  import('@/components/tabs/preview-tab-content').then(mod => ({ default: mod.PreviewTabContent }))
);
const TerminalTabContent = lazy(() =>
  import('@/components/tabs/terminal-tab-content').then(mod => ({ default: mod.TerminalTabContent }))
);

// Skeleton shell that renders immediately for FCP
function DashboardSkeleton() {
  return (
    <div className="flex h-full w-full bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-[280px] flex-col bg-sidebar">
        <div className="p-4 space-y-4">
          <div className="h-8 w-32 bg-muted/40 rounded animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-3xl px-4 space-y-6">
            <div className="h-10 w-64 mx-auto bg-muted/30 rounded animate-pulse" />
            <div className="h-24 bg-muted/20 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Pre-mounted session tabs: keeps all open sessions alive in the DOM so
// switching between tabs is instant (no re-mount, no loading spinner).
// ============================================================================
function SessionTabsContainer({ children }: { children: React.ReactNode }) {
  const tabs = useTabStore((s) => s.tabs);
  const tabOrder = useTabStore((s) => s.tabOrder);
  const activeTabId = useTabStore((s) => s.activeTabId);

  // Collect tab IDs by type
  const sessionTabIds = tabOrder.filter((id) => tabs[id]?.type === 'session');
  const fileTabIds = tabOrder.filter((id) => tabs[id]?.type === 'file');
  const previewTabIds = tabOrder.filter((id) => tabs[id]?.type === 'preview');
  const terminalTabIds = tabOrder.filter((id) => tabs[id]?.type === 'terminal');
  const activeTab = activeTabId ? tabs[activeTabId] : null;
  const showingMountedTab = activeTab?.type === 'session'
    || activeTab?.type === 'file'
    || activeTab?.type === 'preview'
    || activeTab?.type === 'terminal';

  return (
    <div className={cn(
      'bg-background flex-1 min-h-0 flex flex-col overflow-hidden relative',
      'md:rounded-tl-xl md:rounded-tr-xl md:border-t md:border-l md:border-r md:border-border/50',
    )}>
      {/* Pre-mounted session tabs — always rendered, shown/hidden via CSS */}
      {sessionTabIds.map((id) => (
        <div
          key={id}
          className={cn(
            'absolute inset-0 flex flex-col',
            id !== activeTabId && 'hidden',
          )}
        >
          <Suspense fallback={null}>
            <SessionLayout sessionId={id}>
              <SessionChat sessionId={id} />
            </SessionLayout>
          </Suspense>
        </div>
      ))}

      {/* File tabs — rendered when active */}
      {fileTabIds.map((id) => {
        const tab = tabs[id];
        if (!tab) return null;
        // Extract file path from tab id (strip "file:" prefix)
        const filePath = id.startsWith('file:') ? id.slice(5) : id;
        return (
          <div
            key={id}
            className={cn(
              'absolute inset-0 flex flex-col',
              id !== activeTabId && 'hidden',
            )}
          >
            <Suspense fallback={null}>
              <FileTabContent tabId={id} filePath={filePath} />
            </Suspense>
          </div>
        );
      })}

      {/* Preview tabs — iframe previews of sandbox services */}
      {previewTabIds.map((id) => (
        <div
          key={id}
          className={cn(
            'absolute inset-0 flex flex-col',
            id !== activeTabId && 'hidden',
          )}
        >
          <Suspense fallback={null}>
            <PreviewTabContent tabId={id} />
          </Suspense>
        </div>
      ))}

      {/* Terminal tabs — 1 tab = 1 PTY */}
      {terminalTabIds.map((id) => {
        const ptyId = id.startsWith('terminal:') ? id.slice(9) : id;
        return (
          <div
            key={id}
            className={cn(
              'absolute inset-0 flex flex-col',
              id !== activeTabId && 'hidden',
            )}
          >
            <Suspense fallback={null}>
              <TerminalTabContent ptyId={ptyId} tabId={id} hidden={id !== activeTabId} />
            </Suspense>
          </div>
        );
      })}

      {/* Route-based children (dashboard, settings, etc.)
          Hidden when a pre-mounted tab is active. */}
      <div
        className={cn(
          'flex-1 min-h-0 flex flex-col overflow-hidden',
          showingMountedTab && 'hidden',
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface DashboardLayoutContentProps {
  children: React.ReactNode;
}

export default function DashboardLayoutContent({
  children,
}: DashboardLayoutContentProps) {
  const { user, isLoading } = useAuth();
  const params = useParams();
  const threadId = params?.threadId as string | undefined;
  
  usePresence(threadId);
  
  const { data: accounts } = useAccounts({ enabled: !!user });
  const personalAccount = accounts?.find((account) => account.personal_account);
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: systemStatus, isLoading: systemStatusLoading } = useSystemStatusQuery();
  const maintenanceNotice = systemStatus?.maintenanceNotice;
  const technicalIssue = systemStatus?.technicalIssue;
  const statusUpdatedAt = systemStatus?.updatedAt;
  const {
    data: healthData,
    isLoading: isCheckingHealth,
    error: healthError,
  } = useApiHealth();

  const { data: projects } = useProjects();
  const { data: adminRoleData, isLoading: isCheckingAdminRole } = useAdminRole();
  const isAdmin = adminRoleData?.isAdmin ?? false;
  
  // Prefetch popular Composio icons for faster UI
  const { prefetchPopularIcons } = usePrefetchComposioIcons();

  useEffect(() => {
    if (user) {
      backendApi.post('/prewarm', undefined, { showErrors: false });
    }
  }, [user])
  
  useEffect(() => {
    if (user) {
      prefetchPopularIcons();
    }
  }, [user, prefetchPopularIcons]);

  // Log data prefetching for debugging
  useEffect(() => {
    if (isMobile) {
      console.log('📱 Mobile Layout - Prefetched data:', {
        projects: projects?.length || 0,
        accounts: accounts?.length || 0,
        user: !!user
      });
    }
  }, [isMobile, projects, accounts, user]);

  // API health is now managed by useApiHealth hook
  const isApiHealthy = healthData?.status === 'ok' && !healthError;

  // Check authentication status
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth');
    }
  }, [user, isLoading, router]);

  const isMaintenanceActive = (() => {
    if (!maintenanceNotice?.enabled || !maintenanceNotice.startTime || !maintenanceNotice.endTime) {
      return false;
    }
    const now = new Date();
    const start = new Date(maintenanceNotice.startTime);
    const end = new Date(maintenanceNotice.endTime);
    return now >= start && now <= end;
  })();

  const isMaintenanceScheduled = (() => {
    if (!maintenanceNotice?.enabled || !maintenanceNotice.startTime || !maintenanceNotice.endTime) {
      return false;
    }
    const now = new Date();
    const start = new Date(maintenanceNotice.startTime);
    const end = new Date(maintenanceNotice.endTime);
    return now < start && now < end;
  })();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    return <DashboardSkeleton />;
  }

  if (isMaintenanceActive && !systemStatusLoading && !isCheckingAdminRole && !isAdmin) {
    return (
      <Suspense fallback={<DashboardSkeleton />}>
        <MaintenancePage />
      </Suspense>
    );
  }

  // Show maintenance page if API is not healthy
  if (!isCheckingHealth && !isCheckingAdminRole && (!isApiHealthy || healthError) && !isAdmin) {
    return (
      <Suspense fallback={<DashboardSkeleton />}>
        <MaintenancePage />
      </Suspense>
    );
  }

  return (
    <NovuInboxProvider>
    <AppProviders 
      showSidebar={true}
      sidebarSiblings={
        <Suspense fallback={null}>
          {/* Status overlay for deletion operations */}
          <StatusOverlay />
          {/* Floating mobile menu button */}
          <FloatingMobileMenuButton />
        </Suspense>
      }
    >
      <SandboxInitProvider />
      <OpenCodeEventStreamProvider />
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {technicalIssue?.enabled && technicalIssue.message && (
          <Suspense fallback={null}>
            <TechnicalIssueBanner 
              message={technicalIssue.message}
              statusUrl={technicalIssue.statusUrl}
              updatedAt={statusUpdatedAt}
            />
          </Suspense>
        )}
        
        {isMaintenanceScheduled && maintenanceNotice?.startTime && maintenanceNotice?.endTime && (
          <Suspense fallback={null}>
            <MaintenanceCountdownBanner 
              startTime={maintenanceNotice.startTime}
              endTime={maintenanceNotice.endTime}
              updatedAt={statusUpdatedAt}
            />
          </Suspense>
        )}
        
        {/* Site-wide promo banner for free tier users */}
        <Suspense fallback={null}>
          <DashboardPromoBanner />
        </Suspense>
        <Suspense fallback={null}>
          <AnnouncementDialog />
        </Suspense>
        
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
        <Suspense fallback={null}>
          <OnboardingProvider>
            <TabBar />
            <SessionTabsContainer>{children}</SessionTabsContainer>
          </OnboardingProvider>
        </Suspense>
        <Suspense fallback={null}>
          <PresentationViewerWrapper />
        </Suspense>
        {/* Kortix App announcement banners */}
        <Suspense fallback={null}>
          <KortixAppBanners disableMobileAdvertising={featureFlags.disableMobileAdvertising} />
        </Suspense>
        {/* Tutorials banner for new users */}
        <Suspense fallback={null}>
          <TutorialsBanner />
        </Suspense>
        {/* Mobile app install interstitial - shown on actual mobile devices */}
        {!featureFlags.disableMobileAdvertising ? (
          <Suspense fallback={null}>
            <MobileAppInterstitial />
          </Suspense>
        ) : null}
      </div>
    </AppProviders>
    </NovuInboxProvider>
  );
}
