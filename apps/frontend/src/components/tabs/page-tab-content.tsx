'use client';

import { lazy, Suspense, type ComponentType } from 'react';
import { KortixLoader } from '@/components/ui/kortix-loader';

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

const FilesPage = lazy(() =>
	import('@/features/files/components/file-explorer-page').then((m) => ({
		default: m.FileExplorerPage,
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

// ---------------------------------------------------------------------------
// Route → Component mapping
// ---------------------------------------------------------------------------

const PAGE_COMPONENTS: Record<string, ComponentType> = {
	'/dashboard': DashboardContent,
	'/configuration': WorkspacePage,
	'/settings/credentials': SecretsPage,
	'/settings/api-keys': ApiKeysPage,
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
	// Admin
	'/admin/analytics': AdminAnalyticsPage,
	'/admin/feedback': AdminFeedbackPage,
	'/admin/notifications': AdminNotificationsPage,
	'/admin/utils': AdminUtilsPage,
	'/admin/sandbox-pool': AdminSandboxPoolPage,
	'/admin/stateless': AdminStatelessPage,
	'/admin/stress-test': AdminStressTestPage,
};

export function PageTabContent({ href }: { href: string }) {
	const Component = PAGE_COMPONENTS[href];

	if (!Component) {
		return (
			<div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
				Page not found
			</div>
		);
	}

	return (
		<Suspense
			fallback={
				<div className="flex-1 flex items-center justify-center">
					<KortixLoader size="large" />
				</div>
			}
		>
			<Component />
		</Suspense>
	);
}
