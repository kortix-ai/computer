'use client';

import { lazy, Suspense, type ComponentType } from 'react';
import { KortixLoader } from '@/components/ui/kortix-loader';

const DEPLOYMENTS_ENABLED = process.env.NEXT_PUBLIC_KORTIX_DEPLOYMENTS_ENABLED === 'true';

// ---------------------------------------------------------------------------
// Lazy-load every route-based page component so they can be pre-mounted in the
// DOM and kept alive when the user switches tabs (CSS show/hide).
// ---------------------------------------------------------------------------

const DashboardContent = lazy(() =>
	import('@/components/dashboard/dashboard-content').then((m) => ({
		default: m.DashboardContent,
	})),
);

const SecretsPage = lazy(() =>
	import('@/app/(dashboard)/settings/credentials/page'),
);

const ApiKeysPage = lazy(() =>
	import('@/app/(dashboard)/settings/api-keys/page'),
);

const ProvidersPage = lazy(() =>
	import('@/app/(dashboard)/settings/providers/page'),
);

const CreditsPage = lazy(() =>
	import('@/app/(dashboard)/credits-explained/page'),
);

const ChangelogPage = lazy(() =>
	import('@/app/(dashboard)/changelog/page'),
);

const WorkspacePage = lazy(() =>
	import('@/app/(dashboard)/workspace/page'),
);

const ScheduledTasksPage = lazy(() =>
	import('@/components/scheduled-tasks/scheduled-tasks-page').then((m) => ({
		default: m.ScheduledTasksPage,
	})),
);

const ChannelsPage = lazy(() =>
	import('@/components/channels/channels-page').then((m) => ({
		default: m.ChannelsPage,
	})),
);

const IntegrationsPage = lazy(() =>
	import('@/components/integrations/integrations-page').then((m) => ({
		default: m.IntegrationsPage,
	})),
);

const TunnelOverviewPage = lazy(() =>
	import('@/components/tunnel/tunnel-overview').then((m) => ({
		default: m.TunnelOverview,
	})),
);

const FilesPage = lazy(() =>
	import('@/features/files/components/file-explorer-page').then((m) => ({
		default: m.FileExplorerPage,
	})),
);

const MemoryPage = lazy(() =>
	import('@/components/memory/memory-page').then((m) => ({
		default: m.MemoryPage,
	})),
);

const DeploymentsPage = lazy(() =>
	import('@/components/deployments/deployments-page').then((m) => ({
		default: m.DeploymentsPage,
	})),
);

// Admin pages
const AdminAnalyticsPage = lazy(() =>
	import('@/app/(dashboard)/admin/analytics/page'),
);
const AdminFeedbackPage = lazy(() =>
	import('@/app/(dashboard)/admin/feedback/page'),
);
const AdminNotificationsPage = lazy(() =>
	import('@/app/(dashboard)/admin/notifications/page'),
);
const AdminUtilsPage = lazy(() =>
	import('@/app/(dashboard)/admin/utils/page'),
);
const AdminSandboxPoolPage = lazy(() =>
	import('@/app/(dashboard)/admin/sandbox-pool/page'),
);
const AdminStatelessPage = lazy(() =>
	import('@/app/(dashboard)/admin/stateless/page'),
);
const AdminStressTestPage = lazy(() =>
	import('@/app/(dashboard)/admin/stress-test/page'),
);
const AdminAccessRequestsPage = lazy(() =>
	import('@/app/(dashboard)/admin/access-requests/page'),
);

const LegacyThreadPage = lazy(() =>
	import('@/app/(dashboard)/legacy/[threadId]/page'),
);

// ---------------------------------------------------------------------------
// Route → Component mapping
// ---------------------------------------------------------------------------

const PAGE_COMPONENTS: Record<string, ComponentType> = {
	'/dashboard': DashboardContent,
	'/configuration': WorkspacePage,
	'/settings/credentials': SecretsPage,
	'/settings/api-keys': ApiKeysPage,
	'/settings/providers': ProvidersPage,
	'/credits-explained': CreditsPage,
	'/changelog': ChangelogPage,
	'/workspace': WorkspacePage,
	'/projects': WorkspacePage,
	// Redirect-only routes point to workspace
	'/skills': WorkspacePage,
	'/tools': WorkspacePage,
	'/commands': WorkspacePage,
	'/agents': WorkspacePage,
	// Extra pages not in original ROUTE_MAP but exist as routes
	'/scheduled-tasks': ScheduledTasksPage,
	'/channels': ChannelsPage,
	'/integrations': IntegrationsPage,
	'/files': FilesPage,
	'/tunnel': TunnelOverviewPage,
	'/memory': MemoryPage,
	...(DEPLOYMENTS_ENABLED ? { '/deployments': DeploymentsPage } : {}),
	// Admin
	'/admin/analytics': AdminAnalyticsPage,
	'/admin/feedback': AdminFeedbackPage,
	'/admin/notifications': AdminNotificationsPage,
	'/admin/utils': AdminUtilsPage,
	'/admin/sandbox-pool': AdminSandboxPoolPage,
	'/admin/stateless': AdminStatelessPage,
	'/admin/stress-test': AdminStressTestPage,
	'/admin/access-requests': AdminAccessRequestsPage,
};

function resolveComponent(routeKey: string): { Component: ComponentType<any>; params?: Record<string, string> } | null {
	const exact = PAGE_COMPONENTS[routeKey];
	if (exact) return { Component: exact };

	const legacyMatch = routeKey.match(/^\/legacy\/(.+)$/);
	if (legacyMatch) {
		return { Component: LegacyThreadPage, params: { threadId: legacyMatch[1] } };
	}

	return null;
}

export function PageTabContent({ href }: { href: string }) {
	let routeKey = href;
	try {
		const parsed = new URL(href, window.location.origin);
		routeKey = parsed.pathname;
	} catch {
		routeKey = href.split('?')[0]?.split('#')[0] || href;
	}

	const resolved = resolveComponent(routeKey);

	if (!resolved) {
		return (
			<div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
				Page not found
			</div>
		);
	}

	const { Component, params } = resolved;

	return (
		<Suspense
			fallback={
				<div className="flex-1 flex items-center justify-center">
					<KortixLoader size="medium" />
				</div>
			}
		>
			<Component params={params ? Promise.resolve(params) : undefined} />
		</Suspense>
	);
}
