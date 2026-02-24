'use client';

import React, { useCallback, useMemo } from 'react';
import {
  Activity,
  Clock,
  ExternalLink,
  FolderOpen,
  Globe,
  Loader2,
  Server,
  TerminalSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTabStore, openTabAndNavigate, type Tab } from '@/stores/tab-store';
import { useOpenCodePtyList } from '@/hooks/opencode/use-opencode-pty';
import { useSandboxDeployments, type SandboxDeployment } from '@/hooks/use-sandbox-deployments';
import { useOpenCodeSessions, type Session } from '@/hooks/opencode/use-opencode-sessions';
import { useServerStore, getActiveOpenCodeUrl, getSubdomainOpts } from '@/stores/server-store';
import { getProxyBaseUrl } from '@/lib/utils/sandbox-url';
import { getDirectPortUrl } from '@/lib/platform-client';

// ============================================================================
// Types
// ============================================================================

interface RunningService {
  id: string;
  kind: 'preview' | 'deployment' | 'terminal';
  name: string;
  port?: number;
  framework?: string;
  status: 'running' | 'stopped' | 'unknown';
  sessionId?: string;
  sessionTitle?: string;
  tabId?: string;
  deploymentId?: string;
  proxyUrl?: string;
  startedAt?: string;
  sourcePath?: string;
  pid?: number;
  hasTab?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 0) return '';
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return '';
  }
}

const FRAMEWORK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  nextjs:  { bg: 'bg-zinc-800 dark:bg-zinc-200', text: 'text-white dark:text-zinc-900', label: 'Next.js' },
  vite:    { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-300', label: 'Vite' },
  cra:     { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-300', label: 'CRA' },
  node:    { bg: 'bg-green-500/15', text: 'text-green-600 dark:text-green-300', label: 'Node.js' },
  python:  { bg: 'bg-yellow-500/15', text: 'text-yellow-600 dark:text-yellow-300', label: 'Python' },
  static:  { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-300', label: 'Static' },
};

function getFrameworkStyle(fw: string) {
  return FRAMEWORK_STYLES[fw] || { bg: 'bg-muted', text: 'text-muted-foreground', label: fw };
}

function shortenPath(path: string): string {
  if (!path) return '';
  return path.replace(/^\/workspace\/?/, '') || '/';
}

// ============================================================================
// ServiceCard
// ============================================================================

function ServiceCard({ service }: { service: RunningService }) {
  const handleOpen = useCallback(() => {
    if (service.tabId) {
      const store = useTabStore.getState();
      const tab = store.tabs[service.tabId];
      if (tab) {
        store.setActiveTab(service.tabId);
        window.history.pushState(null, '', tab.href);
        return;
      }
    }
    if (service.port && service.proxyUrl) {
      openTabAndNavigate({
        id: `preview:${service.port}`,
        title: service.name || `localhost:${service.port}`,
        type: 'preview',
        href: `/preview/${service.port}`,
        metadata: {
          url: service.proxyUrl,
          port: service.port,
          originalUrl: `http://localhost:${service.port}/`,
        },
      });
    }
  }, [service]);

  const isDeployment = service.kind === 'deployment' || !!service.deploymentId;
  const isTerminal = service.kind === 'terminal';
  const Icon = isTerminal ? TerminalSquare : isDeployment ? Server : Globe;
  const fwStyle = service.framework ? getFrameworkStyle(service.framework) : null;
  const isRunning = service.status === 'running';

  return (
    <button
      onClick={handleOpen}
      className={cn(
        'w-full text-left rounded-xl border transition-all duration-200 cursor-pointer group/card',
        'bg-card hover:bg-accent/50',
        'border-border/40 hover:border-border/70',
        'shadow-sm hover:shadow-md',
      )}
    >
      {/* Top bar: icon + name + status */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
        {/* Icon */}
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
          isRunning
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground',
        )}>
          <Icon className="w-[18px] h-[18px]" />
        </div>

        {/* Name + port */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground truncate">
              {service.name}
            </span>
            {service.hasTab && (
              <Badge variant="outline" className="h-[18px] px-1.5 text-[9px] font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 flex-shrink-0">
                open
              </Badge>
            )}
          </div>
          {service.port != null && service.port > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground/60 tabular-nums">
              localhost:{service.port}
            </span>
          )}
        </div>

        {/* Status dot + open button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn(
            'h-2 w-2 rounded-full flex-shrink-0',
            isRunning ? 'bg-emerald-500' : 'bg-muted-foreground/40',
          )} />
          <div className="opacity-0 group-hover/card:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-1.5 -m-1 rounded-lg hover:bg-muted text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {service.hasTab ? 'Focus tab' : 'Open preview'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Metadata pills */}
      {(fwStyle || service.sourcePath || service.startedAt || service.pid) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-0.5">
          {fwStyle && (
            <span className={cn(
              'inline-flex items-center text-[10px] font-semibold px-2 py-[3px] rounded-md leading-none',
              fwStyle.bg, fwStyle.text,
            )}>
              {fwStyle.label}
            </span>
          )}

          {service.sourcePath && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-[3px] rounded-md leading-none">
              <FolderOpen className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="font-mono truncate max-w-[160px]">{shortenPath(service.sourcePath)}</span>
            </span>
          )}

          {service.startedAt && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-[3px] rounded-md leading-none">
              <Clock className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="tabular-nums">{formatTimeAgo(service.startedAt)}</span>
            </span>
          )}

          {service.pid != null && service.pid > 0 && (
            <span className="inline-flex items-center text-[10px] text-muted-foreground/40 bg-muted/40 px-2 py-[3px] rounded-md font-mono tabular-nums leading-none">
              PID {service.pid}
            </span>
          )}
        </div>
      )}

      {/* Session association */}
      {service.sessionTitle && (
        <div className="flex items-center gap-2 px-4 pb-3 pt-0">
          <div className="h-1 w-1 rounded-full bg-primary/50 flex-shrink-0" />
          <span className="text-[11px] text-primary/60 truncate leading-none">
            {service.sessionTitle}
          </span>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// Section header
// ============================================================================

function SectionHeader({
  title,
  icon: SectionIcon,
  count,
}: {
  title: string;
  icon: typeof Activity;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-5 pb-2.5">
      <SectionIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
      <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
        {title}
      </span>
      <Badge variant="secondary" className="h-[18px] px-1.5 text-[10px] font-mono bg-muted/50 text-muted-foreground/60">
        {count}
      </Badge>
    </div>
  );
}

// ============================================================================
// RunningServicesPanel
// ============================================================================

export function RunningServicesPanel() {
  const { data: deployments, isLoading: deploymentsLoading } = useSandboxDeployments();
  const { data: ptys, isLoading: ptysLoading } = useOpenCodePtyList();
  const { data: sessions } = useOpenCodeSessions();
  const tabs = useTabStore((s) => s.tabs);
  const tabOrder = useTabStore((s) => s.tabOrder);

  const activeServer = useServerStore((s) => {
    return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
  });
  const serverUrl = activeServer?.url || getActiveOpenCodeUrl();

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>();
    if (sessions) {
      for (const s of sessions) map.set(s.id, s);
    }
    return map;
  }, [sessions]);

  const deploymentByPort = useMemo(() => {
    const map = new Map<number, SandboxDeployment>();
    if (deployments) {
      for (const dep of deployments) map.set(dep.port, dep);
    }
    return map;
  }, [deployments]);

  const { appServices, terminalServices } = useMemo(() => {
    const apps: RunningService[] = [];
    const terminals: RunningService[] = [];
    const seenPorts = new Set<number>();

    // Preview tabs — merge with deployment data
    const previewTabs = tabOrder
      .map((id) => tabs[id])
      .filter((t): t is Tab => !!t && t.type === 'preview');

    for (const tab of previewTabs) {
      const port = (tab.metadata?.port as number) || 0;
      if (!port) continue;
      seenPorts.add(port);

      const dep = deploymentByPort.get(port);
      const sourceSessionId = tab.metadata?.sourceSessionId as string | undefined;
      const sourceSessionTitle = tab.metadata?.sourceSessionTitle as string | undefined;
      let sessionTitle = sourceSessionTitle;
      if (!sessionTitle && sourceSessionId) {
        sessionTitle = sessionMap.get(sourceSessionId)?.title;
      }

      apps.push({
        id: `app:${port}`,
        kind: dep ? 'deployment' : 'preview',
        name: dep?.deploymentId || tab.title || `localhost:${port}`,
        port,
        framework: dep?.framework,
        status: dep?.status || 'running',
        sessionId: sourceSessionId,
        sessionTitle,
        tabId: tab.id,
        deploymentId: dep?.deploymentId,
        proxyUrl: (tab.metadata?.url as string) || '',
        startedAt: dep?.startedAt,
        sourcePath: dep?.sourcePath,
        pid: dep?.pid,
        hasTab: true,
      });
    }

    // Deployments not yet opened as tabs
    if (deployments) {
      for (const dep of deployments) {
        if (seenPorts.has(dep.port)) continue;
        const subdomainOpts = getSubdomainOpts();
        const proxyUrl = activeServer
          ? (getDirectPortUrl(activeServer, String(dep.port)) || getProxyBaseUrl(dep.port, serverUrl, subdomainOpts))
          : getProxyBaseUrl(dep.port, serverUrl, subdomainOpts);

        apps.push({
          id: `app:${dep.port}`,
          kind: 'deployment',
          name: dep.deploymentId,
          port: dep.port,
          framework: dep.framework,
          status: dep.status,
          deploymentId: dep.deploymentId,
          proxyUrl,
          startedAt: dep.startedAt,
          sourcePath: dep.sourcePath,
          pid: dep.pid,
          hasTab: false,
        });
      }
    }

    // Terminal tabs
    const terminalTabs = tabOrder
      .map((id) => tabs[id])
      .filter((t): t is Tab => !!t && t.type === 'terminal');

    for (const tab of terminalTabs) {
      terminals.push({
        id: `terminal:${tab.id}`,
        kind: 'terminal',
        name: tab.title || 'Terminal',
        status: 'running',
        tabId: tab.id,
        hasTab: true,
      });
    }

    return { appServices: apps, terminalServices: terminals };
  }, [tabs, tabOrder, deployments, deploymentByPort, activeServer, serverUrl, sessionMap]);

  const isLoading = deploymentsLoading || ptysLoading;
  const totalCount = appServices.length + terminalServices.length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between h-12 px-4 border-b shrink-0">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-foreground/70" />
          <span className="text-sm font-medium text-foreground">Running Services</span>
          {totalCount > 0 && (
            <Badge variant="secondary" className="h-5 px-2 text-[10px] font-mono">
              {totalCount}
            </Badge>
          )}
        </div>
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {totalCount === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
              <Activity className="h-7 w-7 opacity-20" />
            </div>
            <p className="text-sm font-medium">No running services</p>
            <p className="text-xs text-muted-foreground/50 mt-1.5 text-center px-8 leading-relaxed">
              Services will appear here when you deploy apps, open previews, or start terminals.
            </p>
          </div>
        ) : (
          <>
            {appServices.length > 0 && (
              <>
                <SectionHeader title="Apps & Previews" icon={Globe} count={appServices.length} />
                <div className="px-4 space-y-2.5">
                  {appServices.map((s) => (
                    <ServiceCard key={s.id} service={s} />
                  ))}
                </div>
              </>
            )}

            {terminalServices.length > 0 && (
              <>
                <SectionHeader title="Terminals" icon={TerminalSquare} count={terminalServices.length} />
                <div className="px-4 space-y-2.5">
                  {terminalServices.map((s) => (
                    <ServiceCard key={s.id} service={s} />
                  ))}
                </div>
              </>
            )}

            {/* Bottom spacer */}
            <div className="h-4" />
          </>
        )}
      </ScrollArea>
    </div>
  );
}
