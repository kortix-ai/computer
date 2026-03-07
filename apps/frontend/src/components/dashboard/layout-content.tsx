"use client";

import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useConnectionToasts } from "@/components/dashboard/connecting-screen";
import { AppProviders } from "@/components/layout/app-providers";
import { TabBar } from "@/components/tabs/tab-bar";
import { useAdminRole } from "@/hooks/admin";
import { useSystemStatusQuery } from "@/hooks/edge-flags";
import { OpenCodeEventStreamProvider } from "@/hooks/opencode/use-opencode-events";
import { useSandbox } from "@/hooks/platform/use-sandbox";
import { useSandboxConnection } from "@/hooks/platform/use-sandbox-connection";
import { useWebNotifications } from "@/hooks/use-web-notifications";
import { backendApi } from "@/lib/api-client";
import { featureFlags } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { useSandboxConnectionStore } from "@/stores/sandbox-connection-store";
import { useServerStore } from "@/stores/server-store";
import { useTabStore } from "@/stores/tab-store";
import { AnnouncementDialog } from "../announcements/announcement-dialog";
import { NovuInboxProvider } from "../notifications/novu-inbox-provider";
import { FilePreviewDialog } from "../common/file-preview-dialog";

/** Monitors session status transitions and fires browser notifications. Renders nothing. */
function WebNotificationProvider() {
	useWebNotifications();
	return null;
}

/** Monitors sandbox connection health + shows toast on connect/disconnect. Renders nothing. */
function SandboxConnectionProvider() {
	useSandboxConnection();
	useConnectionToasts();
	return null;
}

// Lazy load heavy components that aren't needed for initial render

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
const PageTabContent = lazy(() =>
	import("@/components/tabs/page-tab-content").then((mod) => ({
		default: mod.PageTabContent,
	})),
);
const RunningServicesPanel = lazy(() =>
	import("@/components/tabs/running-services-panel").then((mod) => ({
		default: mod.RunningServicesPanel,
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
	const servicesTabIds = tabOrder.filter((id) => tabs[id]?.type === "services");
	const pageTabIds = tabOrder.filter((id) => {
		const t = tabs[id]?.type;
		return t === "settings" || t === "page" || t === "project" || t === "dashboard";
	});
	const activeTab = activeTabId ? tabs[activeTabId] : null;
	// All tab types are now pre-mounted — route-based children are never shown
	const showingMountedTab = !!activeTab;

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

			{/* Services tabs — Running Services panel */}
			{servicesTabIds.map((id) => (
				<div
					key={id}
					className={cn(
						"absolute inset-0 flex flex-col",
						id !== activeTabId && "hidden",
					)}
				>
					<Suspense fallback={null}>
						<RunningServicesPanel />
					</Suspense>
				</div>
			))}

			{/* Page/settings/dashboard tabs — pre-mounted, shown/hidden via CSS */}
			{pageTabIds.map((id) => {
				const tab = tabs[id];
				if (!tab) return null;
				return (
					<div
						key={id}
						className={cn(
							"absolute inset-0 flex flex-col overflow-y-auto",
							id !== activeTabId && "hidden",
						)}
					>
						<Suspense fallback={null}>
							<PageTabContent href={tab.href} />
						</Suspense>
					</div>
				);
			})}

			{/* Route-based children (fallback — hidden since all types are pre-mounted) */}
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

	// IMPORTANT: useSandbox() MUST be called here — before the onboardingChecked
	// guard below. In cloud mode, getActiveServerUrl() returns '' until useSandbox
	// registers the sandbox in the server store. The onboarding check effect needs
	// a valid server URL to proceed, so the sandbox must be registered first.
	// Previously useSandbox() only ran inside SandboxInitProvider which rendered
	// AFTER the onboardingChecked guard, creating a deadlock: onboarding check
	// waited for a server URL that could never arrive because useSandbox never ran.
	useSandbox();

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
	// FAST PATH: sessionStorage cache eliminates redundant requests per session.
	// The cache is cleared on tab close so a reinstall + new tab works fine.
	//
	// CLOUD RACE FIX: In cloud mode getActiveServerUrl() returns '' before
	// useSandbox registers the real sandbox. We subscribe to activeServerId +
	// serverVersion so the effect re-runs once the sandbox is registered, rather
	// than firing immediately with an empty URL (which would hit the Next.js
	// frontend at /env/ONBOARDING_COMPLETE and get a 404).
	const activeServerId = useServerStore((s) => s.activeServerId);
	const serverVersion = useServerStore((s) => s.serverVersion);
	const [onboardingChecked, setOnboardingChecked] = useState(false);
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.has("skip_onboarding")) {
			setOnboardingChecked(true);
			return;
		}

		// If setup wizard is actively in progress (sessionStorage hint), redirect immediately.
		const wizardStep = sessionStorage.getItem("setup_wizard_step");
		if (wizardStep && parseInt(wizardStep, 10) > 1) {
			router.replace("/auth?setup=incomplete");
			return;
		}

		// Fast path: if we've already confirmed onboarding is complete this browser
		// session, skip all network calls. Onboarding complete implies setup complete.
		const cachedOnboarding = sessionStorage.getItem("onboarding_complete");
		if (cachedOnboarding === "true") {
			setOnboardingChecked(true);
			return;
		}

		const checkSetupAndOnboarding = async () => {
			const { authenticatedFetch } = await import("@/lib/auth-token");

			// 1. Check onboarding completion first (sandbox env var).
			//    If onboarding is already done, the user definitely passed setup too
			//    (even if setup_complete_at is null for pre-existing users).
			const instanceUrl = useServerStore.getState().getActiveServerUrl();

			// Sandbox not registered yet (cloud mode race) — wait for the store
			// to update (activeServerId/serverVersion change) before retrying.
			if (!instanceUrl) return;

			try {
				const res = await authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMPLETE`, undefined, { retryOnAuthError: false });

				if (res.ok) {
					const data = await res.json();
					if (data.ONBOARDING_COMPLETE === "true") {
						// Onboarding done → setup is implicitly done too
						sessionStorage.setItem("onboarding_complete", "true");
						sessionStorage.setItem("setup_complete", "true");
						setOnboardingChecked(true);
						return;
					}
				} else if (res.status >= 500) {
					// Server error — treat as not onboarded
					const { isBillingEnabled } = await import("@/lib/config");
					router.replace(isBillingEnabled() ? "/subscription" : "/onboarding");
					return;
				}
			} catch {
				// Sandbox not reachable — if billing enabled, user likely has no
				// subscription/sandbox yet, send them to pick a plan first.
				const { isBillingEnabled } = await import("@/lib/config");
				if (isBillingEnabled()) {
					router.replace("/subscription");
				} else {
					router.replace("/onboarding");
				}
				return;
			}

			// 2. Onboarding is NOT complete — check if setup wizard was completed (DB-backed).
			//    This catches the case where user refreshed mid-setup before onboarding.
			if (sessionStorage.getItem("setup_complete") !== "true") {
				try {
					const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8008/v1";
					const setupRes = await authenticatedFetch(`${backendUrl}/setup/setup-status`, undefined, { retryOnAuthError: false });
					if (setupRes.ok) {
						const setupData = await setupRes.json();
						if (!setupData.complete) {
							// Setup not done — send back to auth wizard
							router.replace("/auth?setup=incomplete");
							return;
						}
						sessionStorage.setItem("setup_complete", "true");
					}
				} catch {
					// Backend unreachable — fall through to onboarding redirect
				}
			}

			// 3. Setup is complete but onboarding is not — go to onboarding
			router.replace("/onboarding");
		};
		checkSetupAndOnboarding();
	}, [router, activeServerId, serverVersion]);

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

					</Suspense>
				}
			>
				<SandboxConnectionProvider />
				<OpenCodeEventStreamProvider />
				<WebNotificationProvider />
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

					<FilePreviewDialog />

					<Suspense fallback={null}>
						<CommandPalette />
					</Suspense>
					{/* UpdateBanner removed — update indicator lives in the sidebar footer */}
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
