'use client';

import React, { useCallback, useMemo } from 'react';
import {
  Activity,
  Braces,
  Clock,
  Code2,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Gem,
  Globe,
  Hexagon,
  Loader2,
  Server,
  TerminalSquare,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTabStore, openTabAndNavigate, type Tab } from '@/stores/tab-store';
import { useOpenCodePtyList } from '@/hooks/opencode/use-opencode-pty';
import { useSandboxServices, type SandboxService } from '@/hooks/use-sandbox-services';
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
  /** Whether this service is managed by the deployer */
  managed?: boolean;
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

const FRAMEWORK_STYLES: Record<string, { bg: string; text: string; label: string; icon: LucideIcon; iconBg: string; iconText: string }> = {
  nextjs:  { bg: 'bg-zinc-800 dark:bg-zinc-200', text: 'text-white dark:text-zinc-900', label: 'Next.js', icon: Hexagon, iconBg: 'bg-zinc-500/10', iconText: 'text-zinc-600 dark:text-zinc-300' },
  vite:    { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-300', label: 'Vite', icon: Zap, iconBg: 'bg-purple-500/10', iconText: 'text-purple-600 dark:text-purple-400' },
  cra:     { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-300', label: 'CRA', icon: Globe, iconBg: 'bg-cyan-500/10', iconText: 'text-cyan-600 dark:text-cyan-400' },
  node:    { bg: 'bg-green-500/15', text: 'text-green-600 dark:text-green-300', label: 'Node.js', icon: Hexagon, iconBg: 'bg-green-500/10', iconText: 'text-green-600 dark:text-green-400' },
  python:  { bg: 'bg-yellow-500/15', text: 'text-yellow-600 dark:text-yellow-300', label: 'Python', icon: Code2, iconBg: 'bg-yellow-500/10', iconText: 'text-yellow-600 dark:text-yellow-400' },
  static:  { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-300', label: 'Static', icon: FileCode2, iconBg: 'bg-blue-500/10', iconText: 'text-blue-600 dark:text-blue-400' },
  go:      { bg: 'bg-sky-500/15', text: 'text-sky-600 dark:text-sky-300', label: 'Go', icon: Braces, iconBg: 'bg-sky-500/10', iconText: 'text-sky-600 dark:text-sky-400' },
  ruby:    { bg: 'bg-red-500/15', text: 'text-red-600 dark:text-red-300', label: 'Ruby', icon: Gem, iconBg: 'bg-red-500/10', iconText: 'text-red-600 dark:text-red-400' },
  java:    { bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-300', label: 'Java', icon: Code2, iconBg: 'bg-orange-500/10', iconText: 'text-orange-600 dark:text-orange-400' },
  rust:    { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-300', label: 'Rust', icon: Braces, iconBg: 'bg-amber-500/10', iconText: 'text-amber-600 dark:text-amber-400' },
};

function getFrameworkStyle(fw: string) {
  if (!fw || fw === 'unknown') return null;
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
  const fwStyle = service.framework && service.framework !== 'unknown' ? getFrameworkStyle(service.framework) : null;
  // If status is unknown but it has an open tab, treat as running
  const isRunning = service.status === 'running' || (service.status === 'unknown' && !!service.hasTab);

  // Pick icon & color based on framework, falling back to generic icons
  const Icon = isTerminal
    ? TerminalSquare
    : fwStyle?.icon ?? (isDeployment ? Server : Globe);
  const iconBg = isTerminal
    ? undefined
    : (isRunning && fwStyle)
      ? fwStyle.iconBg
      : undefined;
  const iconText = isTerminal
    ? undefined
    : (isRunning && fwStyle)
      ? fwStyle.iconText
      : undefined;

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
            ? (iconBg || 'bg-emerald-500/10')
            : 'bg-muted text-muted-foreground',
          isRunning && (iconText || 'text-emerald-600 dark:text-emerald-400'),
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
      {(fwStyle || service.sourcePath || service.startedAt || service.pid || service.managed !== undefined) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-0.5">
          {fwStyle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  'inline-flex items-center text-[10px] font-semibold px-2 py-[3px] rounded-md leading-none',
                  fwStyle.bg, fwStyle.text,
                )}>
                  {fwStyle.label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Detected framework
              </TooltipContent>
            </Tooltip>
          )}

          {service.managed !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  'inline-flex items-center text-[10px] font-medium px-2 py-[3px] rounded-md leading-none',
                  service.managed
                    ? 'bg-primary/10 text-primary/70'
                    : 'bg-muted/60 text-muted-foreground/60',
                )}>
                  {service.managed ? 'deployed' : 'manual'}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {service.managed ? 'Started via the deploy system' : 'Started manually (e.g. from a terminal)'}
              </TooltipContent>
            </Tooltip>
          )}

          {service.sourcePath && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-[3px] rounded-md leading-none">
                  <FolderOpen className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="font-mono truncate max-w-[160px]">{shortenPath(service.sourcePath)}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Working directory: {service.sourcePath}
              </TooltipContent>
            </Tooltip>
          )}

          {service.startedAt && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-[3px] rounded-md leading-none">
                  <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="tabular-nums">{formatTimeAgo(service.startedAt)}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Started {new Date(service.startedAt).toLocaleString()}
              </TooltipContent>
            </Tooltip>
          )}

          {service.pid != null && service.pid > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center text-[10px] text-muted-foreground/40 bg-muted/40 px-2 py-[3px] rounded-md font-mono tabular-nums leading-none">
                  PID {service.pid}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Process ID inside the sandbox
              </TooltipContent>
            </Tooltip>
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
  const { data: services, isLoading: servicesLoading } = useSandboxServices();
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

  // Build preview tab lookup by port
  const previewTabByPort = useMemo(() => {
    const map = new Map<number, Tab>();
    for (const id of tabOrder) {
      const tab = tabs[id];
      if (tab?.type === 'preview') {
        const port = (tab.metadata?.port as number) || 0;
        if (port > 0) map.set(port, tab);
      }
    }
    return map;
  }, [tabs, tabOrder]);

  const { appServices, terminalServices } = useMemo(() => {
    const apps: RunningService[] = [];
    const terminals: RunningService[] = [];
    const seenPorts = new Set<number>();

    // ── 1. Start from backend services (the source of truth) ──
    if (services) {
      for (const svc of services) {
        seenPorts.add(svc.port);

        // Check if there's a preview tab open for this port
        const tab = previewTabByPort.get(svc.port);

        // Session context from the tab
        let sessionTitle: string | undefined;
        if (tab) {
          const sourceSessionId = tab.metadata?.sourceSessionId as string | undefined;
          const sourceSessionTitle = tab.metadata?.sourceSessionTitle as string | undefined;
          sessionTitle = sourceSessionTitle;
          if (!sessionTitle && sourceSessionId) {
            sessionTitle = sessionMap.get(sourceSessionId)?.title;
          }
        }

        // Build proxy URL for services without a tab
        let proxyUrl = tab ? ((tab.metadata?.url as string) || '') : '';
        if (!proxyUrl) {
          const subdomainOpts = getSubdomainOpts();
          proxyUrl = subdomainOpts
            ? getProxyBaseUrl(svc.port, serverUrl, subdomainOpts)
            : (activeServer ? getDirectPortUrl(activeServer, String(svc.port)) : null)
              || getProxyBaseUrl(svc.port, serverUrl, subdomainOpts);
        }

        // Name: prefer backend service name, fallback to tab title
        const svcNameIsGeneric = !svc.name || svc.name === `service:${svc.port}` || svc.name === `port-${svc.port}`;
        const name = svcNameIsGeneric
          ? (tab?.title || svc.name || `localhost:${svc.port}`)
          : svc.name;

        apps.push({
          id: `app:${svc.port}`,
          kind: 'deployment',
          name,
          port: svc.port,
          framework: svc.framework,
          status: svc.status,
          sessionId: tab ? (tab.metadata?.sourceSessionId as string | undefined) : undefined,
          sessionTitle,
          tabId: tab?.id,
          deploymentId: svc.id,
          proxyUrl,
          startedAt: svc.startedAt || undefined,
          sourcePath: svc.sourcePath || undefined,
          pid: svc.pid,
          hasTab: !!tab,
          managed: svc.managed,
        });
      }
    }

    // ── 2. Preview tabs that have no matching backend service ──
    //    (e.g. manually typed localhost URL, or service stopped but tab stayed)
    for (const [port, tab] of previewTabByPort) {
      if (seenPorts.has(port)) continue;

      const sourceSessionId = tab.metadata?.sourceSessionId as string | undefined;
      const sourceSessionTitle = tab.metadata?.sourceSessionTitle as string | undefined;
      let sessionTitle = sourceSessionTitle;
      if (!sessionTitle && sourceSessionId) {
        sessionTitle = sessionMap.get(sourceSessionId)?.title;
      }

      apps.push({
        id: `app:${port}`,
        kind: 'preview',
        name: tab.title || `localhost:${port}`,
        port,
        status: 'unknown',
        sessionId: sourceSessionId,
        sessionTitle,
        tabId: tab.id,
        proxyUrl: (tab.metadata?.url as string) || '',
        hasTab: true,
      });
    }

    // ── 3. Terminal tabs ──
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
  }, [tabs, tabOrder, services, previewTabByPort, activeServer, serverUrl, sessionMap]);

  const isLoading = servicesLoading || ptysLoading;
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
