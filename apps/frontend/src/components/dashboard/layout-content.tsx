"use client";

import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useConnectionToasts } from "@/components/dashboard/connecting-screen";
import { AppProviders } from "@/components/layout/app-providers";
import { TabBar } from "@/components/tabs/tab-bar";
import { useAdminRole } from "@/hooks/admin";
import { useSystemStatusQuery } from "@/hooks/edge-flags";
import { useOpenCodeEventStream } from "@/hooks/opencode/use-opencode-events";
import { useSandbox } from "@/hooks/platform/use-sandbox";
import { useSandboxConnection } from "@/hooks/platform/use-sandbox-connection";
import { useWebNotifications } from "@/hooks/use-web-notifications";
import { backendApi } from "@/lib/api-client";
import { featureFlags } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { useSandboxConnectionStore } from "@/stores/sandbox-connection-store";
import { useServerStore } from "@/stores/server-store";
import { getSandboxToken, useSandboxAuthStore } from "@/stores/sandbox-auth-store";
import { useTabStore } from "@/stores/tab-store";
import { AnnouncementDialog } from "../announcements/announcement-dialog";
import { NovuInboxProvider } from "../notifications/novu-inbox-provider";

function OpenCodeEventStreamProvider() {
	useOpenCodeEventStream();
	return null;
}

/** Monitors session status transitions and fires browser notifications. Renders nothing. */
function WebNotificationProvider() {
	useWebNotifications();
	return null;
}

/** Initializes the user's sandbox on dashboard load. Renders nothing. */
function SandboxInitProvider() {
	useSandbox();
	return null;
}

/** Monitors sandbox connection health + shows toast on connect/disconnect. Renders nothing. */
function SandboxConnectionProvider() {
	useSandboxConnection();
	useConnectionToasts();
	return null;
}

/**
 * Syncs per-instance auth tokens to the global sandbox-auth-store when the
 * active server changes. This ensures that switching between instances with
 * different tokens works seamlessly — the token is loaded BEFORE any
 * connection attempt, avoiding the 401→dialog dance.
 */
function ServerTokenSyncProvider() {
  const activeServerId = useServerStore((s) => s.activeServerId);
  const servers = useServerStore((s) => s.servers);

  useEffect(() => {
    const server = servers.find((s) => s.id === activeServerId);
    if (!server) return;

    const authStore = useSandboxAuthStore.getState();
    if (server.authToken) {
      // Load the per-instance token into the global store
      authStore.setSandboxToken(server.authToken);
    } else if (authStore.sandboxToken && !server.authToken) {
      // Server has no token — clear the global store so we don't send
      // the previous instance's token to a different server.
      // BUT only clear if this is a genuine switch, not initial mount.
      authStore.clearSandboxToken();
    }
  }, [activeServerId, servers]);

  return null;
}

// Lazy load heavy components that aren't needed for initial render
const FloatingMobileMenuButton = lazy(() =>
	import("@/components/sidebar/sidebar-left").then((mod) => ({
		default: mod.FloatingMobileMenuButton,
	})),
);
const MaintenancePage = lazy(() =>
	import("@/components/maintenance/maintenance-page").then((mod) => ({
		default: mod.MaintenancePage,
	})),
);
const StatusOverlay = lazy(() =>
	import("@/components/ui/status-overlay").then((mod) => ({
		default: mod.StatusOverlay,
	})),
);
const PresentationViewerWrapper = lazy(() =>
	import("@/stores/presentation-viewer-store").then((mod) => ({
		default: mod.PresentationViewerWrapper,
	})),
);

const OnboardingProvider = lazy(() =>
	import("@/components/onboarding/onboarding-provider").then((mod) => ({
		default: mod.OnboardingProvider,
	})),
);
const DashboardPromoBanner = lazy(() =>
	import("@/components/home/dashboard-promo-banner").then((mod) => ({
		default: mod.DashboardPromoBanner,
	})),
);

const KortixAppBanners = lazy(() =>
	import("@/components/announcements/kortix-app-banners").then((mod) => ({
		default: mod.KortixAppBanners,
	})),
);

const TutorialsBanner = lazy(() =>
	import("@/components/announcements/tutorials-banner").then((mod) => ({
		default: mod.TutorialsBanner,
	})),
);

const MobileAppInterstitial = lazy(() =>
	import("@/components/announcements/mobile-app-interstitial").then((mod) => ({
		default: mod.MobileAppInterstitial,
	})),
);

const TechnicalIssueBanner = lazy(() =>
	import("@/components/announcements/technical-issue-banner").then((mod) => ({
		default: mod.TechnicalIssueBanner,
	})),
);

const MaintenanceCountdownBanner = lazy(() =>
	import("@/components/announcements/maintenance-countdown-banner").then(
		(mod) => ({ default: mod.MaintenanceCountdownBanner }),
	),
);

const UpdateBanner = lazy(() =>
	import("@/components/announcements/update-banner").then((mod) => ({
		default: mod.UpdateBanner,
	})),
);

const CommandPalette = lazy(() =>
	import("@/components/command-palette").then((mod) => ({
		default: mod.CommandPalette,
	})),
);

const ConnectingScreen = lazy(() =>
	import("@/components/dashboard/connecting-screen").then((mod) => ({
		default: mod.ConnectingScreen,
	})),
);

const SandboxTokenDialog = lazy(() =>
	import("@/components/auth/sandbox-token-dialog").then((mod) => ({
		default: mod.SandboxTokenDialog,
	})),
);

const SessionLayout = lazy(() =>
	import("@/components/session/session-layout").then((mod) => ({
		default: mod.SessionLayout,
	})),
);
const SessionChat = lazy(() =>
	import("@/components/session/session-chat").then((mod) => ({
		default: mod.SessionChat,
	})),
);
const FileTabContent = lazy(() =>
	import("@/components/tabs/file-tab-content").then((mod) => ({
		default: mod.FileTabContent,
	})),
);
const PreviewTabContent = lazy(() =>
	import("@/components/tabs/preview-tab-content").then((mod) => ({
		default: mod.PreviewTabContent,
	})),
);
const TerminalTabContent = lazy(() =>
	import("@/components/tabs/terminal-tab-content").then((mod) => ({
		default: mod.TerminalTabContent,
	})),
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
	const sessionTabIds = tabOrder.filter((id) => tabs[id]?.type === "session");
	const fileTabIds = tabOrder.filter((id) => tabs[id]?.type === "file");
	const previewTabIds = tabOrder.filter((id) => tabs[id]?.type === "preview");
	const terminalTabIds = tabOrder.filter((id) => tabs[id]?.type === "terminal");
	const activeTab = activeTabId ? tabs[activeTabId] : null;
	const showingMountedTab =
		activeTab?.type === "session" ||
		activeTab?.type === "file" ||
		activeTab?.type === "preview" ||
		activeTab?.type === "terminal";

	return (
		<div
			className={cn(
				"bg-background flex-1 min-h-0 flex flex-col overflow-hidden relative",
				"md:rounded-tl-xl md:rounded-tr-xl md:border-t md:border-l md:border-r md:border-border/50",
			)}
		>
			{/* Pre-mounted session tabs — always rendered, shown/hidden via CSS */}
			{sessionTabIds.map((id) => (
				<div
					key={id}
					className={cn(
						"absolute inset-0 flex flex-col",
						id !== activeTabId && "hidden",
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
				const filePath = id.startsWith("file:") ? id.slice(5) : id;
				return (
					<div
						key={id}
						className={cn(
							"absolute inset-0 flex flex-col",
							id !== activeTabId && "hidden",
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
						"absolute inset-0 flex flex-col",
						id !== activeTabId && "hidden",
					)}
				>
					<Suspense fallback={null}>
						<PreviewTabContent tabId={id} />
					</Suspense>
				</div>
			))}

			{/* Terminal tabs — 1 tab = 1 PTY */}
			{terminalTabIds.map((id) => {
				const ptyId = id.startsWith("terminal:") ? id.slice(9) : id;
				return (
					<div
						key={id}
						className={cn(
							"absolute inset-0 flex flex-col",
							id !== activeTabId && "hidden",
						)}
					>
						<Suspense fallback={null}>
							<TerminalTabContent
								ptyId={ptyId}
								tabId={id}
								hidden={id !== activeTabId}
							/>
						</Suspense>
					</div>
				);
			})}

			{/* Route-based children (dashboard, settings, etc.)
          Hidden when a pre-mounted tab is active. */}
			<div
				className={cn(
					"flex-1 min-h-0 flex flex-col overflow-y-auto",
					showingMountedTab && "hidden",
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
	const router = useRouter();
	const { data: systemStatus, isLoading: systemStatusLoading } =
		useSystemStatusQuery();
	const maintenanceNotice = systemStatus?.maintenanceNotice;
	const technicalIssue = systemStatus?.technicalIssue;
	const statusUpdatedAt = systemStatus?.updatedAt;
	// NOTE: useApiHealth was removed from the layout guards. Its momentary
	// failures were unmounting the ENTIRE component tree (including session
	// tabs and chat input), causing the "random refresh/flicker" bug.
	// Sandbox reachability is handled by ConnectingScreen (overlay, not
	// early return), which never unmounts children.

	const { data: adminRoleData, isLoading: isCheckingAdminRole } =
		useAdminRole();
	const isAdmin = adminRoleData?.isAdmin ?? false;

	useEffect(() => {
		if (user) {
			backendApi.post("/prewarm", undefined, { showErrors: false });
		}
	}, [user]);

	// Check authentication status
	useEffect(() => {
		if (!isLoading && !user) {
			router.push("/auth");
		}
	}, [user, isLoading, router]);

	// Hard gate: redirect to /onboarding if not complete
	// Checks the sandbox instance directly via /env/ONBOARDING_COMPLETE
	// Skip with ?skip_onboarding query param
	//
	// FAST PATH: If wasConnected is true (persisted in sessionStorage), the user
	// has previously connected successfully — they're already onboarded. Skip the
	// network call entirely so the dashboard renders instantly on hard refresh.
	const [onboardingChecked, setOnboardingChecked] = useState(false);
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.has("skip_onboarding")) {
			setOnboardingChecked(true);
			return;
		}
		// Fast path: previously connected = already onboarded
		if (useSandboxConnectionStore.getState().wasConnected) {
			setOnboardingChecked(true);
			return;
		}
		const checkOnboarding = async () => {
			try {
				const instanceUrl = useServerStore.getState().getActiveServerUrl();
				const headers: Record<string, string> = {};
				const sandboxToken = getSandboxToken();
				if (sandboxToken) headers['Authorization'] = `Bearer ${sandboxToken}`;
				const res = await fetch(`${instanceUrl}/env/ONBOARDING_COMPLETE`, { headers });

				// If 401 with sandbox_token auth, don't redirect — let the dialog handle it
				if (res.status === 401) {
					try {
						const body = await res.json();
						if (body?.authType === 'sandbox_token') {
							// The SandboxTokenDialog will handle this; just mark onboarding as checked
							// so we stay on the dashboard and the dialog can appear.
							setOnboardingChecked(true);
							return;
						}
					} catch { /* non-JSON */ }
				}

				if (res.ok) {
					const data = await res.json();
					if (data.ONBOARDING_COMPLETE !== "true") {
						router.replace("/onboarding");
						return;
					}
				} else {
					// Env key not found — not onboarded yet
					router.replace("/onboarding");
					return;
				}
			} catch {
				// Sandbox not reachable — treat as not onboarded
				router.replace("/onboarding");
				return;
			}
			setOnboardingChecked(true);
		};
		checkOnboarding();
	}, [router]);

	const isMaintenanceActive = (() => {
		if (
			!maintenanceNotice?.enabled ||
			!maintenanceNotice.startTime ||
			!maintenanceNotice.endTime
		) {
			return false;
		}
		const now = new Date();
		const start = new Date(maintenanceNotice.startTime);
		const end = new Date(maintenanceNotice.endTime);
		return now >= start && now <= end;
	})();

	const isMaintenanceScheduled = (() => {
		if (
			!maintenanceNotice?.enabled ||
			!maintenanceNotice.startTime ||
			!maintenanceNotice.endTime
		) {
			return false;
		}
		const now = new Date();
		const start = new Date(maintenanceNotice.startTime);
		const end = new Date(maintenanceNotice.endTime);
		return now < start && now < end;
	})();

	if (isLoading || !onboardingChecked) {
		return <DashboardSkeleton />;
	}

	if (!user) {
		return <DashboardSkeleton />;
	}

	if (
		isMaintenanceActive &&
		!systemStatusLoading &&
		!isCheckingAdminRole &&
		!isAdmin
	) {
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
				defaultSidebarOpen={true}
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
				<ServerTokenSyncProvider />
				<SandboxConnectionProvider />
				<OpenCodeEventStreamProvider />
				<WebNotificationProvider />
				<Suspense fallback={null}>
					<SandboxTokenDialog />
				</Suspense>
				<Suspense fallback={null}>
					<ConnectingScreen />
				</Suspense>
				{/* Fixed overlay banners — outside document flow, won't affect layout */}
				<Suspense fallback={null}>
					<DashboardPromoBanner />
				</Suspense>

				<div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
					<Suspense fallback={null}>
						<AnnouncementDialog />
					</Suspense>

					<Suspense fallback={null}>
						<CommandPalette />
					</Suspense>
					<Suspense fallback={null}>
						<UpdateBanner />
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
				</div>

				{/* Fixed-position notification toasts — rendered outside main flex to not affect layout */}
				{technicalIssue?.enabled && technicalIssue.message && (
					<Suspense fallback={null}>
						<TechnicalIssueBanner
							message={technicalIssue.message}
							statusUrl={technicalIssue.statusUrl}
							updatedAt={statusUpdatedAt}
						/>
					</Suspense>
				)}
				{isMaintenanceScheduled &&
					maintenanceNotice?.startTime &&
					maintenanceNotice?.endTime && (
						<Suspense fallback={null}>
							<MaintenanceCountdownBanner
								startTime={maintenanceNotice.startTime}
								endTime={maintenanceNotice.endTime}
								updatedAt={statusUpdatedAt}
							/>
						</Suspense>
					)}
				<Suspense fallback={null}>
					<KortixAppBanners
						disableMobileAdvertising={featureFlags.disableMobileAdvertising}
					/>
				</Suspense>
				<Suspense fallback={null}>
					<TutorialsBanner />
				</Suspense>
				{!featureFlags.disableMobileAdvertising ? (
					<Suspense fallback={null}>
						<MobileAppInterstitial />
					</Suspense>
				) : null}
			</AppProviders>
		</NovuInboxProvider>
	);
}
