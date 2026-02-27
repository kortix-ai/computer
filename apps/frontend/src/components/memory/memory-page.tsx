'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
	Brain,
	BookOpen,
	Wrench,
	Eye,
	Database,
	Search,
	RefreshCw,
	Tag,
	FileText,
	Clock,
	Trash2,
	ChevronDown,
	ChevronRight,
	X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Ripple } from '@/components/ui/ripple';
import { cn } from '@/lib/utils';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { authenticatedFetch } from '@/lib/auth-token';

// ============================================================================
// Types
// ============================================================================

interface MemoryEntry {
	id: number;
	source: 'ltm' | 'observation';
	type: string;
	content: string;
	title?: string;
	narrative?: string;
	context?: string | null;
	sessionId?: string | null;
	tags: string[];
	files: string[];
	facts?: string[];
	toolName?: string;
	promptNumber?: number;
	createdAt: string;
	updatedAt?: string | null;
}

interface MemoryListResponse {
	entries: MemoryEntry[];
	total: { ltm: number; observations: number };
}

interface MemorySearchResponse {
	entries: MemoryEntry[];
	query: string;
}

interface MemoryStats {
	ltm: { total: number; byType: Record<string, number> };
	observations: { total: number; byType: Record<string, number> };
	sessions: number;
}

type TabFilter = 'all' | 'ltm' | 'observation';

// ============================================================================
// Type config
// ============================================================================

const TYPE_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
	episodic: {
		icon: BookOpen,
		label: 'Episodic',
		color: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
	},
	semantic: {
		icon: Brain,
		label: 'Semantic',
		color: 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/50',
	},
	procedural: {
		icon: Wrench,
		label: 'Procedural',
		color: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
	},
	observation: {
		icon: Eye,
		label: 'Observation',
		color: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50',
	},
	file_read: {
		icon: FileText,
		label: 'File Read',
		color: 'bg-slate-100 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800/50',
	},
	file_edit: {
		icon: FileText,
		label: 'File Edit',
		color: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/50',
	},
	command: {
		icon: Wrench,
		label: 'Command',
		color: 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/50',
	},
	code_search: {
		icon: Search,
		label: 'Code Search',
		color: 'bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800/50',
	},
	web: {
		icon: Search,
		label: 'Web',
		color: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50',
	},
};

function getTypeConfig(type: string) {
	return (
		TYPE_CONFIG[type] ?? {
			icon: Database,
			label: type,
			color: 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800/50',
		}
	);
}

function formatTimestamp(ts: string): string {
	try {
		const d = new Date(ts.includes('T') ? ts : `${ts}Z`);
		return d.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	} catch {
		return ts;
	}
}

// ============================================================================
// Main page
// ============================================================================

export function MemoryPage() {
	const [entries, setEntries] = useState<MemoryEntry[]>([]);
	const [stats, setStats] = useState<MemoryStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [activeSearch, setActiveSearch] = useState('');
	const [tabFilter, setTabFilter] = useState<TabFilter>('all');
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const searchTimer = useRef<ReturnType<typeof setTimeout>>();

	const fetchEntries = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const baseUrl = getActiveOpenCodeUrl();
			const sourceParam = tabFilter !== 'all' ? `&source=${tabFilter}` : '';
			const res = await authenticatedFetch(`${baseUrl}/memory/entries?limit=200${sourceParam}`);
			if (res.ok) {
				const data: MemoryListResponse = await res.json();
				setEntries(data.entries);
				setStats((prev) =>
					prev
						? { ...prev, ltm: { ...prev.ltm, total: data.total.ltm }, observations: { ...prev.observations, total: data.total.observations } }
						: null,
				);
			} else {
				setEntries([]);
				setError('Could not load memories. The memory database may not exist yet.');
			}
		} catch {
			setEntries([]);
			setError('Could not connect to sandbox. Make sure your sandbox is running.');
		}
		setLoading(false);
	}, [tabFilter]);

	const fetchStats = useCallback(async () => {
		try {
			const baseUrl = getActiveOpenCodeUrl();
			const res = await authenticatedFetch(`${baseUrl}/memory/stats`);
			if (res.ok) {
				const data: MemoryStats = await res.json();
				setStats(data);
			}
		} catch { /* stats are supplementary */ }
	}, []);

	const doSearch = useCallback(async (q: string) => {
		if (!q.trim()) {
			setActiveSearch('');
			fetchEntries();
			return;
		}
		setLoading(true);
		setActiveSearch(q);
		try {
			const baseUrl = getActiveOpenCodeUrl();
			const sourceParam = tabFilter !== 'all' ? `&source=${tabFilter}` : '';
			const res = await authenticatedFetch(`${baseUrl}/memory/search?q=${encodeURIComponent(q)}${sourceParam}`);
			if (res.ok) {
				const data: MemorySearchResponse = await res.json();
				setEntries(data.entries);
			} else {
				setEntries([]);
			}
		} catch {
			setEntries([]);
		}
		setLoading(false);
	}, [tabFilter, fetchEntries]);

	const deleteEntry = useCallback(async (source: string, id: number) => {
		try {
			const baseUrl = getActiveOpenCodeUrl();
			const res = await authenticatedFetch(`${baseUrl}/memory/entries/${source}/${id}`, { method: 'DELETE' });
			if (res.ok) {
				setEntries((prev) => prev.filter((e) => !(e.source === source && e.id === id)));
				fetchStats();
			}
		} catch { /* ignore */ }
	}, [fetchStats]);

	const onSearchChange = useCallback(
		(value: string) => {
			setSearchQuery(value);
			if (searchTimer.current) clearTimeout(searchTimer.current);
			searchTimer.current = setTimeout(() => doSearch(value), 350);
		},
		[doSearch],
	);

	useEffect(() => {
		if (activeSearch) {
			doSearch(activeSearch);
		} else {
			fetchEntries();
		}
		fetchStats();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabFilter]);

	useEffect(() => {
		fetchEntries();
		fetchStats();
	}, [fetchEntries, fetchStats]);

	const ltmCount = stats?.ltm.total ?? entries.filter((e) => e.source === 'ltm').length;
	const obsCount = stats?.observations.total ?? entries.filter((e) => e.source === 'observation').length;

	const toggleExpand = (key: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	if (error && !loading && entries.length === 0) {
		return (
			<div className="flex-1 overflow-y-auto">
				<div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
					<PageHeader icon={Brain}>
						<div className="space-y-2 sm:space-y-4">
							<div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
								<span className="text-primary">Memory</span>
							</div>
						</div>
					</PageHeader>
				</div>
				<div className="container mx-auto max-w-7xl px-3 sm:px-4">
					<div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
						<MemoryEmptyState message={error} />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto">
			{/* Hero */}
			<div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
				<PageHeader icon={Brain}>
					<div className="space-y-2 sm:space-y-4">
						<div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
							<span className="text-primary">Memory</span>
						</div>
						{stats && (
							<div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
								<span>{stats.ltm.total} long-term</span>
								<span className="text-border">|</span>
								<span>{stats.observations.total} observations</span>
								<span className="text-border">|</span>
								<span>{stats.sessions} sessions</span>
							</div>
						)}
					</div>
				</PageHeader>
			</div>

			<div className="container mx-auto max-w-7xl px-3 sm:px-4">
				{/* Search + Filters */}
				<div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
					<div className="flex items-center gap-2 sm:gap-4 pb-4 pt-2">
						<div className="flex-1 max-w-md">
							<div className="relative group">
								<input
									type="text"
									placeholder="Search memories..."
									value={searchQuery}
									onChange={(e) => onSearchChange(e.target.value)}
									className="h-11 w-full rounded-2xl border border-input bg-card px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
								/>
								<div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
									<Search className="h-4 w-4" />
								</div>
								{searchQuery && (
									<button
										onClick={() => {
											setSearchQuery('');
											setActiveSearch('');
											fetchEntries();
										}}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
									>
										<X className="h-4 w-4" />
									</button>
								)}
							</div>
						</div>
						<div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/30 p-1">
							{(['all', 'ltm', 'observation'] as const).map((tab) => (
								<button
									key={tab}
									onClick={() => setTabFilter(tab)}
									className={cn(
										'px-3 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer',
										tabFilter === tab
											? 'bg-background text-foreground border border-border/50'
											: 'text-muted-foreground hover:text-foreground border border-transparent',
									)}
								>
									{tab === 'all'
										? `All (${ltmCount + obsCount})`
										: tab === 'ltm'
											? `LTM (${ltmCount})`
											: `Observations (${obsCount})`}
								</button>
							))}
						</div>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								setSearchQuery('');
								setActiveSearch('');
								fetchEntries();
								fetchStats();
							}}
							disabled={loading}
							className="h-11 w-11 rounded-2xl shrink-0"
						>
							<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
						</Button>
					</div>
				</div>

				{/* Content */}
				<div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both pb-6 sm:pb-8">
					{loading ? (
						<MemoryLoadingSkeleton />
					) : entries.length === 0 ? (
						<MemoryEmptyState
							message={
								activeSearch
									? `No memories matching "${activeSearch}"`
									: 'No memories found for this filter.'
							}
						/>
					) : (
						<div className="space-y-3">
							{entries.map((entry) => {
								const key = `${entry.source}-${entry.id}`;
								return (
									<MemoryCard
										key={key}
										entry={entry}
										isExpanded={expandedIds.has(key)}
										onToggle={() => toggleExpand(key)}
										onDelete={() => deleteEntry(entry.source, entry.id)}
									/>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Memory card (SpotlightCard)
// ============================================================================

function MemoryCard({
	entry,
	isExpanded,
	onToggle,
	onDelete,
}: {
	entry: MemoryEntry;
	isExpanded: boolean;
	onToggle: () => void;
	onDelete: () => void;
}) {
	const config = getTypeConfig(entry.type);
	const Icon = config.icon;
	const isLTM = entry.source === 'ltm';
	const displayTitle = entry.title || entry.content.slice(0, 80);

	return (
		<SpotlightCard
			className={cn(
				'transition-colors group',
				isExpanded ? 'bg-muted/30' : 'bg-card',
			)}
		>
			<div className="flex items-center justify-between p-4 sm:p-5 cursor-pointer" onClick={onToggle}>
				<div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
					<div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-card border border-border/50 shrink-0">
						<Icon className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-0.5">
							<h3 className="font-medium text-foreground text-sm truncate">{displayTitle}</h3>
							<Badge
								variant="outline"
								className={cn('text-[10px] shrink-0', config.color)}
							>
								{isLTM ? config.label : entry.type.replace(/_/g, ' ')}
							</Badge>
							<Badge
								variant={isLTM ? 'highlight' : 'secondary'}
								className="text-[10px] shrink-0"
							>
								{isLTM ? 'LTM' : 'OBS'}
							</Badge>
						</div>
						{!isExpanded && (
							<p className="text-sm text-muted-foreground truncate">
								{entry.content.slice(0, 200)}
							</p>
						)}
					</div>
				</div>
				<div className="ml-4 flex items-center gap-3 shrink-0">
					{entry.createdAt && (
						<div className="flex-col items-end gap-1 hidden sm:flex">
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Clock className="h-3 w-3" />
								<span>{formatTimestamp(entry.createdAt)}</span>
							</div>
						</div>
					)}
					<button
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						className={cn(
							'p-2 rounded-lg transition-all cursor-pointer',
							'opacity-0 group-hover:opacity-100 focus:opacity-100',
							'text-muted-foreground hover:text-red-500 hover:bg-red-500/10',
						)}
						title="Delete memory"
					>
						<Trash2 className="h-4 w-4" />
					</button>
					<div className="text-muted-foreground/50">
						{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
					</div>
				</div>
			</div>

			{isExpanded && (
				<div className="border-t border-border/30 px-5 py-4 space-y-4">
					{/* Content */}
					<p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
						{entry.content}
					</p>

					{/* Facts */}
					{entry.facts && entry.facts.length > 0 && (
						<div className="space-y-1.5">
							<div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Facts
							</div>
							{entry.facts.map((fact, i) => (
								<div key={i} className="text-sm text-foreground/70 pl-3 border-l-2 border-primary/30">
									{fact}
								</div>
							))}
						</div>
					)}

					{/* Tags */}
					{entry.tags.length > 0 && (
						<div className="flex items-center gap-2 flex-wrap">
							<Tag className="h-3.5 w-3.5 text-muted-foreground" />
							{entry.tags.map((tag) => (
								<Badge key={tag} variant="secondary" className="text-xs font-normal">
									{tag}
								</Badge>
							))}
						</div>
					)}

					{/* Files */}
					{entry.files.length > 0 && (
						<div className="flex items-center gap-2 flex-wrap">
							<FileText className="h-3.5 w-3.5 text-muted-foreground" />
							{entry.files.slice(0, 5).map((f) => (
								<span
									key={f}
									className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-lg"
								>
									{f}
								</span>
							))}
							{entry.files.length > 5 && (
								<span className="text-xs text-muted-foreground">
									+{entry.files.length - 5} more
								</span>
							)}
						</div>
					)}

					{/* Metadata */}
					<div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
						{entry.toolName && (
							<span className="font-mono bg-muted px-2 py-0.5 rounded-lg">{entry.toolName}</span>
						)}
						{entry.sessionId && (
							<span className="font-mono truncate max-w-[160px]">{entry.sessionId}</span>
						)}
						<span className="font-mono text-muted-foreground/50">#{entry.id}</span>
					</div>
				</div>
			)}
		</SpotlightCard>
	);
}

// ============================================================================
// Loading skeleton
// ============================================================================

function MemoryLoadingSkeleton() {
	return (
		<div className="space-y-3">
			{Array.from({ length: 6 }).map((_, i) => (
				<div key={i} className="rounded-2xl border bg-card p-4 sm:p-5">
					<div className="flex items-center gap-3 sm:gap-4">
						<Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-48 sm:w-64" />
							<Skeleton className="h-3 w-full max-w-sm" />
						</div>
						<Skeleton className="h-3 w-24 hidden sm:block" />
					</div>
				</div>
			))}
		</div>
	);
}

// ============================================================================
// Empty state
// ============================================================================

function MemoryEmptyState({ message }: { message: string }) {
	return (
		<div className="relative bg-muted/20 rounded-3xl border border-dashed border-border/50 flex flex-col items-center justify-center py-20 px-4 overflow-hidden">
			<Ripple mainCircleSize={160} mainCircleOpacity={0.12} numCircles={6} />
			<div className="relative z-10 flex flex-col items-center">
				<div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
					<Brain className="h-8 w-8 text-muted-foreground" />
				</div>
				<h3 className="text-lg font-semibold text-foreground mb-2">
					{message}
				</h3>
				<p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md">
					Observations are captured automatically as the agent works.
					Long-term memories are consolidated when sessions end.
					You can also ask the agent to remember something specific.
				</p>
			</div>
		</div>
	);
}
