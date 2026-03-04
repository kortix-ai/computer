'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, Loader2, Sparkles, Bug, Zap, AlertTriangle, ArrowUpCircle, Shield, RefreshCw, Check, Package, Container, Github, Cloud } from 'lucide-react';
import { getFullChangelog, type ChangelogEntry, type ChangelogChange, type ChangelogArtifact } from '@/lib/platform-client';
import { useGlobalSandboxUpdate } from '@/hooks/platform/use-global-sandbox-update';
import { useSandboxConnectionStore } from '@/stores/sandbox-connection-store';
import { cn } from '@/lib/utils';

// ─── Change type icons + colors ───────────────────────────────────────────

const changeTypeConfig: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  feature:      { icon: Sparkles,       color: 'text-emerald-500', label: 'Feature' },
  fix:          { icon: Bug,            color: 'text-red-400',     label: 'Fix' },
  improvement:  { icon: Zap,            color: 'text-blue-400',    label: 'Improvement' },
  breaking:     { icon: AlertTriangle,  color: 'text-amber-500',   label: 'Breaking' },
  upstream:     { icon: RefreshCw,      color: 'text-violet-400',  label: 'Upstream' },
  security:     { icon: Shield,         color: 'text-rose-400',    label: 'Security' },
  deprecation:  { icon: AlertTriangle,  color: 'text-orange-400',  label: 'Deprecated' },
};

function ChangeItem({ change }: { change: ChangelogChange }) {
  const config = changeTypeConfig[change.type] ?? changeTypeConfig.improvement;
  const Icon = config.icon;
  return (
    <div className="flex items-start gap-2.5 py-1">
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', config.color)} />
      <span className="text-sm text-foreground/80">{change.text}</span>
    </div>
  );
}

function VersionBadge({ version, isCurrent, isLatest }: { version: string; isCurrent: boolean; isLatest: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-lg font-semibold text-foreground">v{version}</span>
      {isCurrent && (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          Current
        </span>
      )}
      {isLatest && !isCurrent && (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          Latest
        </span>
      )}
    </div>
  );
}

const artifactTargetConfig: Record<string, { icon: typeof Package; label: string }> = {
  npm:              { icon: Package,   label: 'npm' },
  'docker-hub':     { icon: Container, label: 'Docker Hub' },
  'github-release': { icon: Github,    label: 'GitHub' },
  daytona:          { icon: Cloud,     label: 'Daytona' },
};

function ArtifactsList({ artifacts }: { artifacts: ChangelogArtifact[] }) {
  return (
    <div className="mt-3 pt-3 border-t border-border/30">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium mb-1.5">Published</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {artifacts.map((art) => {
          const config = artifactTargetConfig[art.target] ?? artifactTargetConfig.npm;
          const Icon = config.icon;
          return (
            <div key={`${art.name}-${art.target}`} className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
              <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
              <Icon className="h-3 w-3 flex-shrink-0" />
              <span className="font-mono text-[11px]">{art.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChangelogEntryCard({ entry, isCurrent, isLatest }: { entry: ChangelogEntry; isCurrent: boolean; isLatest: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border p-5 transition-colors',
      isLatest && !isCurrent ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/50',
    )}>
      <div className="flex items-start justify-between gap-4 mb-1">
        <VersionBadge version={entry.version} isCurrent={isCurrent} isLatest={isLatest} />
        <span className="text-xs text-muted-foreground/60 font-mono">{entry.date}</span>
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">{entry.title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{entry.description}</p>
      <div className="space-y-0.5">
        {entry.changes.map((change, i) => (
          <ChangeItem key={i} change={change} />
        ))}
      </div>
      {entry.artifacts && entry.artifacts.length > 0 && (
        <ArtifactsList artifacts={entry.artifacts} />
      )}
    </div>
  );
}

export default function ChangelogPage() {
  const { data: changelog, isLoading, error } = useQuery({
    queryKey: ['sandbox', 'changelog'],
    queryFn: getFullChangelog,
    staleTime: 5 * 60 * 1000,
  });

  const currentVersion = useSandboxConnectionStore((s) => s.sandboxVersion);
  const { updateAvailable, latestVersion, update, isUpdating, updateResult } = useGlobalSandboxUpdate();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Changelog</h1>
          <p className="text-sm text-muted-foreground">
            {currentVersion ? (
              <>Running <span className="font-mono font-medium text-foreground">v{currentVersion}</span></>
            ) : (
              'Version history for Kortix Computer'
            )}
            {latestVersion && currentVersion && latestVersion !== currentVersion && (
              <> &middot; Latest: <span className="font-mono font-medium text-primary">v{latestVersion}</span></>
            )}
          </p>

          {/* Update action */}
          {updateAvailable && !updateResult?.success && (
            <div className="mt-4 flex items-center gap-3">
              {!isUpdating ? (
                <button
                  onClick={() => update()}
                  className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Update to v{latestVersion}
                </button>
              ) : (
                <div className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating to v{latestVersion}...
                </div>
              )}
            </div>
          )}

          {updateResult?.success && (
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-500">
              <ArrowUpCircle className="h-4 w-4" />
              Updated to v{updateResult.currentVersion}. Refresh to see changes.
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-muted-foreground text-center py-20">
            Could not load changelog. The platform API may be unavailable.
          </div>
        )}

        {/* Changelog entries */}
        {changelog && changelog.length > 0 && (
          <div className="space-y-4">
            {changelog.map((entry, i) => (
              <ChangelogEntryCard
                key={entry.version}
                entry={entry}
                isCurrent={currentVersion === entry.version}
                isLatest={i === 0}
              />
            ))}
          </div>
        )}

        {changelog && changelog.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-20">
            No changelog entries found.
          </div>
        )}
      </div>
    </div>
  );
}
