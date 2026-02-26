'use client';

import React from 'react';
import {
  ExternalLink,
  RotateCcw,
  Square,
  Trash2,
  ScrollText,
  GitBranch,
  FileCode2,
  Files,
  Archive,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import type { Deployment, DeploymentStatus, DeploymentSource } from '@/hooks/deployments/use-deployments';

// ─── Helpers ────────────────────────────────────────────────────────────────

const statusConfig: Record<DeploymentStatus, {
  label: string;
  variant: 'highlight' | 'secondary' | 'destructive' | 'outline' | 'beta';
  dotColor: string;
}> = {
  active: { label: 'Active', variant: 'highlight', dotColor: 'bg-green-500' },
  pending: { label: 'Pending', variant: 'beta', dotColor: 'bg-blue-500 animate-pulse' },
  building: { label: 'Building', variant: 'beta', dotColor: 'bg-blue-500 animate-pulse' },
  deploying: { label: 'Deploying', variant: 'beta', dotColor: 'bg-blue-500 animate-pulse' },
  failed: { label: 'Failed', variant: 'destructive', dotColor: 'bg-red-500' },
  stopped: { label: 'Stopped', variant: 'secondary', dotColor: 'bg-gray-400' },
};

const sourceIcons: Record<DeploymentSource, React.ElementType> = {
  git: GitBranch,
  code: FileCode2,
  files: Files,
  tar: Archive,
};

const sourceLabels: Record<DeploymentSource, string> = {
  git: 'Git',
  code: 'Code',
  files: 'Files',
  tar: 'Tar',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absDiff = Math.abs(diffMs);

  if (absDiff < 60_000) return 'just now';
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return `${mins}m ago`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000);
    return `${hrs}h ago`;
  }
  const days = Math.round(absDiff / 86_400_000);
  return `${days}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface DeploymentCardProps {
  deployment: Deployment;
  onViewLogs: (deployment: Deployment) => void;
  onStop: (deployment: Deployment) => void;
  onRedeploy: (deployment: Deployment) => void;
  onDelete: (deployment: Deployment) => void;
  isStopPending?: boolean;
  isRedeployPending?: boolean;
  isDeletePending?: boolean;
}

export function DeploymentCard({
  deployment,
  onViewLogs,
  onStop,
  onRedeploy,
  onDelete,
  isStopPending,
  isRedeployPending,
  isDeletePending,
}: DeploymentCardProps) {
  const status = statusConfig[deployment.status] || statusConfig.pending;
  const SourceIcon = sourceIcons[deployment.sourceType] || FileCode2;
  const domain = deployment.domains?.[0] || null;
  const isInProgress = deployment.status === 'pending' || deployment.status === 'building' || deployment.status === 'deploying';

  return (
    <SpotlightCard className="bg-card transition-colors group">
      <div className="p-5">
        {/* Top row: icon + info + status */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-card border border-border/50 shrink-0">
              <Globe className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-medium text-foreground truncate">
                  {domain || deployment.deploymentId.slice(0, 8)}
                </h3>
                <Badge variant={status.variant} className="text-xs">
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1', status.dotColor)} />
                  {status.label}
                </Badge>
                {deployment.version > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    v{deployment.version}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <SourceIcon className="h-3 w-3" />
                  {sourceLabels[deployment.sourceType]}
                </span>
                {deployment.framework && (
                  <>
                    <span className="text-border">|</span>
                    <span>{deployment.framework}</span>
                  </>
                )}
                {deployment.sourceRef && (
                  <>
                    <span className="text-border">|</span>
                    <span className="truncate max-w-[200px]">{deployment.sourceRef}</span>
                  </>
                )}
                <span className="text-border">|</span>
                <span>{formatRelativeTime(deployment.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {deployment.liveUrl && (
              <a
                href={deployment.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Open live URL"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={() => onViewLogs(deployment)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="View logs"
            >
              <ScrollText className="h-4 w-4" />
            </button>
            {(deployment.status === 'active' || deployment.status === 'failed' || deployment.status === 'stopped') && (
              <button
                onClick={() => onRedeploy(deployment)}
                disabled={isRedeployPending}
                className={cn(
                  'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
                  isRedeployPending && 'opacity-50 cursor-not-allowed',
                )}
                title="Redeploy"
              >
                <RotateCcw className={cn('h-4 w-4', isRedeployPending && 'animate-spin')} />
              </button>
            )}
            {(deployment.status === 'active' || isInProgress) && (
              <button
                onClick={() => onStop(deployment)}
                disabled={isStopPending}
                className={cn(
                  'p-2 rounded-lg text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 transition-colors',
                  isStopPending && 'opacity-50 cursor-not-allowed',
                )}
                title="Stop deployment"
              >
                <Square className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => onDelete(deployment)}
              disabled={isDeletePending}
              className={cn(
                'p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors',
                isDeletePending && 'opacity-50 cursor-not-allowed',
              )}
              title="Delete deployment"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live URL row */}
        {deployment.liveUrl && deployment.status === 'active' && (
          <div className="mt-3 pl-16">
            <a
              href={deployment.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {deployment.liveUrl}
            </a>
          </div>
        )}

        {/* Error message */}
        {deployment.status === 'failed' && deployment.error && (
          <div className="mt-3 pl-16">
            <div className="flex items-start gap-2 text-sm text-red-500 dark:text-red-400 bg-red-500/5 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{deployment.error}</span>
            </div>
          </div>
        )}
      </div>
    </SpotlightCard>
  );
}
