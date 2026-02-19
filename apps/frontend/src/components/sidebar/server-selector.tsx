'use client';

import * as React from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Check,
  X,
  Box,
  Settings2,
  Cloud,
  Container,
  Loader2,
  ArrowDownToLine,
  KeyRound,
  Copy,
} from 'lucide-react';
import { useServerStore, CLOUD_SANDBOX_SERVER_ID, type ServerEntry } from '@/stores/server-store';
import { useSandboxAuthStore } from '@/stores/sandbox-auth-store';
import { useTabStore } from '@/stores/tab-store';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/auth-token';
import { ensureSandbox, getSandboxUrl, extractMappedPorts, removeSandbox, regenerateSandboxToken, type SandboxProviderName, type ChangelogEntry } from '@/lib/platform-client';

import { useSandboxUpdate } from '@/hooks/platform/use-sandbox-update';
import { isLocalMode } from '@/lib/config';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ============================================================================
// Connection status
// ============================================================================

type ConnectionStatus = 'unknown' | 'checking' | 'connected' | 'error';

function useConnectionStatus(url: string, enabled: boolean) {
  const [status, setStatus] = React.useState<ConnectionStatus>('unknown');
  const [version, setVersion] = React.useState<string | null>(null);

  const check = React.useCallback(async () => {
    if (!url) return;
    setStatus('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      await authenticatedFetch(`${url}/session`, {
        method: 'GET',
        signal: controller.signal,
      }, { handleSandboxAuth: false, retryOnAuthError: false });
      clearTimeout(timeout);
      setStatus('connected');

      // Try to get version from /kortix/health
      try {
        const hres = await authenticatedFetch(`${url}/kortix/health`, {
          signal: AbortSignal.timeout(3000),
        }, { handleSandboxAuth: false, retryOnAuthError: false });
        if (hres.ok) {
          const data = await hres.json();
          if (data.version && data.version !== '0.0.0') {
            setVersion(data.version);
          }
        }
      } catch {
        // Not a cloud sandbox or health endpoint unavailable — that's fine
      }
    } catch {
      setStatus('error');
    }
  }, [url]);

  React.useEffect(() => {
    if (enabled) check();
  }, [enabled, check]);

  return { status, version, check };
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span className="relative flex-shrink-0 inline-flex">
      {status === 'connected' && (
        <>
          <span className="size-[7px] rounded-full bg-emerald-500" />
          <span className="absolute inset-0 size-[7px] rounded-full bg-emerald-400 animate-ping opacity-40" />
        </>
      )}
      {status === 'error' && <span className="size-[7px] rounded-full bg-red-400" />}
      {status === 'checking' && <span className="size-[7px] rounded-full bg-amber-400 animate-pulse" />}
      {status === 'unknown' && <span className="size-[7px] rounded-full bg-muted-foreground/20" />}
    </span>
  );
}

const statusLabel: Record<ConnectionStatus, string> = {
  unknown: '',
  checking: 'Connecting...',
  connected: 'Connected',
  error: 'Unreachable',
};

// ============================================================================
// Instance row — compact (sidebar inline list)
// ============================================================================

function CompactInstanceRow({
  server,
  isActive,
  onSelect,
}: {
  server: ServerEntry;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { status } = useConnectionStatus(server.url, isActive);
  const displayUrl = server.url.replace(/^https?:\/\//, '');
  const hasCustomLabel = server.label && server.label !== displayUrl;

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all group/row cursor-pointer',
        isActive ? 'bg-primary/[0.06] dark:bg-primary/[0.08]' : 'hover:bg-muted/50',
      )}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      <StatusDot status={isActive ? status : 'unknown'} />
      <div className="flex-1 min-w-0">
        <div className={cn(
          'truncate text-[11px] leading-tight',
          isActive ? 'text-foreground font-medium' : 'text-foreground/70',
          !hasCustomLabel && 'font-mono',
        )}>
          {hasCustomLabel ? server.label : displayUrl}
        </div>
        {hasCustomLabel && (
          <div className="truncate text-[9px] text-muted-foreground/50 font-mono leading-tight mt-px">
            {displayUrl}
          </div>
        )}
      </div>
      {isActive && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
    </div>
  );
}

// ============================================================================
// Instance row — full (dialog list). Stacked layout so URLs never cut off.
// ============================================================================

type SandboxUpdateInfo = {
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  changelog: ChangelogEntry | null;
  update: () => void;
  isUpdating: boolean;
  isLoading: boolean;
};

function DialogInstanceRow({
  server,
  isActive,
  onSelect,
  onEdit,
  onDelete,
  onGenerateToken,
  isDeleting,
  isGeneratingToken,
  sandboxUpdate,
  onVersionDetected,
}: {
  server: ServerEntry;
  isActive: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onGenerateToken?: () => void;
  isDeleting?: boolean;
  isGeneratingToken?: boolean;
  sandboxUpdate?: SandboxUpdateInfo;
  onVersionDetected?: (version: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { status, version } = useConnectionStatus(server.url, true);

  // Report version back to parent when detected
  React.useEffect(() => {
    if (version && onVersionDetected) onVersionDetected(version);
  }, [version, onVersionDetected]);
  const displayUrl = server.url.replace(/^https?:\/\//, '');
  const hasCustomLabel = server.label && server.label !== displayUrl;

  React.useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  return (
    <div
      className={cn(
        'relative rounded-xl transition-all group/row cursor-pointer',
        isActive
          ? 'bg-primary/[0.05] dark:bg-primary/[0.08] ring-1 ring-primary/15'
          : 'hover:bg-muted/50',
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      <div className="px-3.5 py-3">
        {/* Top line: label/name + badges + actions */}
        <div className="flex items-center gap-2">
          {server.provider === 'local_docker' ? (
            <Container className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/60')} />
          ) : server.provider === 'daytona' ? (
            <Cloud className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/60')} />
          ) : (
            <Box className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/60')} />
          )}
          <span className={cn(
            'text-sm leading-tight flex-1 min-w-0 break-all',
            isActive ? 'text-foreground font-semibold' : 'text-foreground/80 font-medium',
            !hasCustomLabel && 'font-mono text-[13px]',
          )}>
            {hasCustomLabel ? server.label : displayUrl}
          </span>

          {server.provider && (
            <span className={cn(
              'px-1.5 py-px text-[9px] font-medium rounded-full uppercase tracking-wider leading-none flex-shrink-0',
              server.provider === 'local_docker'
                ? 'text-blue-500/70 bg-blue-500/10'
                : 'text-violet-500/70 bg-violet-500/10',
            )}>
              {server.provider === 'local_docker' ? 'local' : 'cloud'}
            </span>
          )}
          {server.authToken && (
            <KeyRound className="h-3 w-3 text-amber-500/60 flex-shrink-0" title="Token configured" />
          )}
          {server.isDefault && (
            <span className="px-1.5 py-px text-[9px] font-medium text-muted-foreground/60 bg-muted/50 rounded-full uppercase tracking-wider leading-none flex-shrink-0">
              default
            </span>
          )}
          {isActive && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
        </div>

        {/* URL line — only if there's a custom label, show full URL below */}
        {hasCustomLabel && (
          <p className="mt-1 ml-6 text-xs text-muted-foreground/50 font-mono break-all leading-relaxed">
            {displayUrl}
          </p>
        )}

        {/* Status + version + actions line */}
        <div className="mt-1.5 ml-6 flex items-center gap-3">
          {status !== 'unknown' && (
            <span className={cn(
              'flex items-center gap-1 text-[10px] font-medium',
              status === 'connected' && 'text-emerald-500',
              status === 'error' && 'text-red-400',
              status === 'checking' && 'text-amber-500',
            )}>
              <StatusDot status={status} />
              {statusLabel[status]}
            </span>
          )}

          {/* Version badge — from /kortix/health (works for any sandbox) */}
          {version && (
            <span className="text-[10px] font-mono text-muted-foreground/60">
              v{version}
            </span>
          )}

          {/* Update button */}
          {sandboxUpdate && sandboxUpdate.updateAvailable && !sandboxUpdate.isUpdating && (
            <button
              type="button"
              className="flex items-center gap-1 h-5 px-2 text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-full transition-colors cursor-pointer"
              onClick={(e) => { e.stopPropagation(); sandboxUpdate.update(); }}
            >
              <ArrowDownToLine className="h-3 w-3" />
              Update to v{sandboxUpdate.latestVersion}
            </button>
          )}

          {/* Updating spinner */}
          {sandboxUpdate?.isUpdating && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating...
            </span>
          )}

          {/* Changelog preview — what's new */}
          {sandboxUpdate && sandboxUpdate.updateAvailable && !sandboxUpdate.isUpdating && sandboxUpdate.changelog && (
            <div className="basis-full mt-0.5 text-[10px] text-muted-foreground/70 space-y-0.5 max-w-[280px]">
              <p className="font-medium">{sandboxUpdate.changelog.title}</p>
              <ul className="list-disc list-inside">
                {sandboxUpdate.changelog.changes.slice(0, 3).map((c, i) => (
                  <li key={i} className="truncate">{c.text}</li>
                ))}
                {sandboxUpdate.changelog.changes.length > 3 && (
                  <li className="text-muted-foreground/50">+{sandboxUpdate.changelog.changes.length - 3} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Key / Edit / Delete — visible on hover */}
          {!confirmDelete && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
              {onGenerateToken && (
                <button
                  type="button"
                  disabled={isGeneratingToken}
                  className="p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={(e) => { e.stopPropagation(); onGenerateToken(); }}
                  aria-label="Generate access key"
                  title="Generate access key"
                >
                  {isGeneratingToken ? (
                    <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                  ) : (
                    <KeyRound className={cn('h-3.5 w-3.5', server.authToken ? 'text-amber-500' : 'text-muted-foreground')} />
                  )}
                </button>
              )}
              {!server.isDefault && onEdit && (
                <button
                  type="button"
                  className="p-1.5 rounded-lg hover:bg-muted/80 transition-colors cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  aria-label="Edit"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              {!server.isDefault && onDelete && (
                <button
                  type="button"
                  className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
          )}

          {confirmDelete && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                disabled={isDeleting}
                className="h-6 px-2.5 text-[11px] font-medium text-destructive-foreground bg-destructive rounded-md transition-colors cursor-pointer hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => { onDelete?.(); setConfirmDelete(false); }}
              >
                {isDeleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Remove'
                )}
              </button>
              {!isDeleting && (
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-muted cursor-pointer"
                  onClick={() => setConfirmDelete(false)}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Generated Key — inline display inside Instance Manager
// ============================================================================

function GeneratedKeyView({
  accessKey,
  onContinue,
}: {
  accessKey: string;
  onContinue: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accessKey);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = accessKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [accessKey]);

  return (
    <div className="flex flex-col px-5 pb-5 gap-4">
      {/* Key display */}
      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
        <code className="flex-1 text-sm font-mono break-all select-all">{accessKey}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Info */}
      <p className="text-xs text-muted-foreground">
        This key is saved in your browser automatically. If you clear browser data or switch browsers, you&apos;ll need it to reconnect. You can always generate a new one from here.
      </p>

      {/* Continue */}
      <button
        type="button"
        onClick={onContinue}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
      >
        Continue
      </button>
    </div>
  );
}

// ============================================================================
// Instance Manager Dialog
// ============================================================================

export function InstanceManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { servers, activeServerId, addServer, updateServer, removeServer, setActiveServer } =
    useServerStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [mode, setMode] = React.useState<'list' | 'add' | 'edit'>('list');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [isCreatingSandbox, setIsCreatingSandbox] = React.useState(false);
  const [sandboxError, setSandboxError] = React.useState<string | null>(null);
  /** One-time access key shown after sandbox creation. null = not showing. */
  const [pendingAccessKey, setPendingAccessKey] = React.useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = React.useState(false);

  // Track the cloud sandbox's current version (from /kortix/health, fetched by DialogInstanceRow)
  const [sandboxVersion, setSandboxVersion] = React.useState<string | null>(null);

  // Sandbox update state — only used for the cloud sandbox row
  const sandboxUpdate = useSandboxUpdate(sandboxVersion);

  // Form state
  const [formUrl, setFormUrl] = React.useState('');
  const [formLabel, setFormLabel] = React.useState('');
  const urlInputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return servers;
    const q = search.toLowerCase();
    return servers.filter((s) => s.label.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
  }, [servers, search]);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setMode('list');
      setSearch('');
      setEditingId(null);
      setFormUrl('');
      setFormLabel('');
      setSandboxError(null);
    }
  }, [open]);

  // Focus URL input when entering add/edit mode
  React.useEffect(() => {
    if ((mode === 'add' || mode === 'edit') && urlInputRef.current) {
      const timer = setTimeout(() => urlInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  function startAdd() {
    setFormUrl('');
    setFormLabel('');
    setMode('add');
  }

  function startEdit(server: ServerEntry) {
    setEditingId(server.id);
    setFormUrl(server.url);
    setFormLabel(server.label);
    setMode('edit');
  }

  function handleSave() {
    const url = formUrl.trim();
    if (!url) return;
    const label = formLabel.trim();

    if (mode === 'add') {
      const newServer = addServer(label, url);
      useTabStore.getState().swapForServer(newServer.id, activeServerId);
      setActiveServer(newServer.id);
      router.push('/dashboard');
      onOpenChange(false);
    } else if (mode === 'edit' && editingId) {
      updateServer(editingId, { label: label || url.replace(/^https?:\/\//, ''), url });
      setMode('list');
      setEditingId(null);
    }
  }

  // ─── Generate Token ─────────────────────────────────────────────────────
  async function handleGenerateToken() {
    setIsRegenerating(true);
    setSandboxError(null);

    // Suppress the SandboxTokenDialog while we're generating —
    // the container will be down briefly and the health monitor
    // would otherwise trigger the "enter your token" prompt.
    useSandboxAuthStore.getState().setIsGenerating(true);

    try {
      const { accessKey } = await regenerateSandboxToken();

      // Find the target server and persist via the centralized action
      const server = servers.find((s) => s.provider === 'local_docker');
      const store = useServerStore.getState();
      store.persistToken(server?.id ?? activeServerId, accessKey);

      // Show the key inline in the dialog
      setPendingAccessKey(accessKey);
    } catch (err: any) {
      setSandboxError(err?.message || 'Failed to generate token');
      // Clear the generating flag so the token dialog can show if needed
      useSandboxAuthStore.getState().setIsGenerating(false);
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleCreateSandbox(provider?: SandboxProviderName) {
    setIsCreatingSandbox(true);
    setSandboxError(null);
    try {
      const { sandbox } = await ensureSandbox(provider ? { provider } : undefined);
      const label = sandbox.name || (provider === 'local_docker' ? 'Local Sandbox' : 'Cloud Sandbox');

      let url: string;
      try {
        url = getSandboxUrl(sandbox);
      } catch (err) {
        throw new Error(`Failed to build sandbox URL: ${err}`);
      }

      const store = useServerStore.getState();
      const serverId = store.registerOrUpdateSandbox(
        {
          url,
          label,
          provider: sandbox.provider,
          sandboxId: sandbox.external_id,
          mappedPorts: extractMappedPorts(sandbox),
        },
        { isLocal: isLocalMode() },
      );

      queryClient.setQueryData(['platform', 'sandbox'], sandbox);
      useTabStore.getState().swapForServer(serverId, activeServerId);
      setActiveServer(serverId);
      router.push('/dashboard');
      onOpenChange(false);
    } catch (err: any) {
      setSandboxError(err?.message || 'Failed to create sandbox');
    } finally {
      setIsCreatingSandbox(false);
    }
  }

  function handleSelect(id: string) {
    if (id === activeServerId) return;
    useTabStore.getState().swapForServer(id, activeServerId);
    setActiveServer(id);
    router.push('/dashboard');
    onOpenChange(false);
  }

  const [isRemovingSandbox, setIsRemovingSandbox] = React.useState(false);

  async function handleRemove(id: string) {
    const server = servers.find((s) => s.id === id);

    // Cloud or Docker sandbox → destroy the actual VM/container via backend, then remove from store
    if (server && (server.provider === 'daytona' || server.provider === 'local_docker')) {
      setIsRemovingSandbox(true);
      try {
        await removeSandbox();
      } catch (err) {
        console.error('[InstanceManager] Failed to remove sandbox from backend:', err);
        // Still remove from local store so user isn't stuck
      } finally {
        setIsRemovingSandbox(false);
      }

      // Kill the cached sandbox query so useSandbox() doesn't auto-recreate it.
      // removeQueries wipes the data entirely — the hook won't refetch because
      // there's no stale data to trigger it until the user explicitly creates again.
      queryClient.removeQueries({ queryKey: ['platform', 'sandbox'] });
    }

    // Remove from local store (manual/localhost entries just get this)
    removeServer(id);

    // If we just deleted the active server, switch to the first remaining one
    if (id === activeServerId) {
      const remaining = useServerStore.getState().servers;
      if (remaining.length > 0) {
        const fallback = remaining[0];
        useTabStore.getState().swapForServer(fallback.id, id);
        setActiveServer(fallback.id);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden" aria-describedby="instance-dialog-desc">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {pendingAccessKey ? (
              <>
                <KeyRound className="h-4 w-4 text-emerald-500" />
                Access Key Generated
              </>
            ) : mode === 'list' ? (
              <>
                <Box className="h-4 w-4 text-muted-foreground" />
                Instances
              </>
            ) : mode === 'add' ? 'Add Instance' : 'Edit Instance'}
          </DialogTitle>
          <DialogDescription id="instance-dialog-desc" className="text-xs">
            {pendingAccessKey
              ? 'Copy this key — it won\u2019t be shown again.'
              : mode === 'list'
                ? 'Manage your Kortix instances. Switch between local and remote servers.'
                : mode === 'add'
                  ? 'Connect to a new Kortix instance by entering its address.'
                  : 'Update the connection details for this instance.'}
          </DialogDescription>
        </DialogHeader>

        {/* ---- Generated key view ---- */}
        {pendingAccessKey && (
          <GeneratedKeyView
            accessKey={pendingAccessKey}
            onContinue={() => setPendingAccessKey(null)}
          />
        )}

        {/* ---- List view ---- */}
        {mode === 'list' && !pendingAccessKey && (
          <div className="flex flex-col">
            {/* Search + Add bar */}
            <div className="flex items-center gap-2 px-4 pb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                <input
                  placeholder="Search instances..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 text-xs pl-8 pr-3 rounded-lg bg-muted/40 border border-border/40 outline-none placeholder:text-muted-foreground/40 focus:border-primary/30 focus:bg-muted/60 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={startAdd}
                className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors cursor-pointer flex-shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            {/* Instance list */}
            <div className="flex flex-col gap-1.5 px-3 pb-3 max-h-[400px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground/60">
                  {search ? `No instances match "${search}"` : 'No instances configured'}
                </div>
              ) : (
                filtered.map((server) => (
                  <DialogInstanceRow
                    key={server.id}
                    server={server}
                    isActive={server.id === activeServerId}
                    onSelect={() => handleSelect(server.id)}
                    onEdit={() => startEdit(server)}
                    onDelete={() => handleRemove(server.id)}
                    onGenerateToken={server.provider === 'local_docker' ? handleGenerateToken : undefined}
                    isDeleting={isRemovingSandbox}
                    isGeneratingToken={isRegenerating}
                    sandboxUpdate={server.id === CLOUD_SANDBOX_SERVER_ID ? sandboxUpdate : undefined}
                    onVersionDetected={server.id === CLOUD_SANDBOX_SERVER_ID ? setSandboxVersion : undefined}
                  />
                ))
              )}
            </div>

            {/* New Sandbox buttons */}
            <div className="border-t border-border/40 px-4 py-3">
              {sandboxError && (
                <p className="text-xs text-destructive mb-2">{sandboxError}</p>
              )}
              {isLocalMode() ? (
                /* Local mode: single "Start Local Sandbox" button */
                <>
                  <button
                    type="button"
                    onClick={() => handleCreateSandbox('local_docker')}
                    disabled={isCreatingSandbox}
                    className="flex items-center justify-center gap-2 w-full h-9 text-sm font-medium text-foreground bg-muted/50 hover:bg-muted/80 border border-border/50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingSandbox ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Container className="h-3.5 w-3.5" />
                        Start Local Sandbox
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
                    Creates or starts the local Docker sandbox on your machine.
                  </p>
                </>
              ) : (
                /* Cloud mode: Cloud + Local Docker buttons */
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCreateSandbox('daytona')}
                      disabled={isCreatingSandbox}
                      className="flex items-center justify-center gap-2 flex-1 h-9 text-sm font-medium text-foreground bg-muted/50 hover:bg-muted/80 border border-border/50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingSandbox ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Cloud className="h-3.5 w-3.5" />
                          Cloud
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateSandbox('local_docker')}
                      disabled={isCreatingSandbox}
                      className="flex items-center justify-center gap-2 flex-1 h-9 text-sm font-medium text-foreground bg-muted/50 hover:bg-muted/80 border border-border/50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingSandbox ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Container className="h-3.5 w-3.5" />
                          Local Docker
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
                    Cloud uses Daytona. Local Docker runs on your machine.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---- Add / Edit view ---- */}
        {(mode === 'add' || mode === 'edit') && (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="flex flex-col gap-4 px-5 pb-5"
          >
            <div className="flex flex-col gap-3">
              {/* URL */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Instance Address
                </label>
                <input
                  ref={urlInputRef}
                   placeholder="http://localhost:8008/v1/preview/kortix-sandbox/8000"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="w-full h-9 px-3 text-sm font-mono rounded-lg bg-muted/30 border border-border/60 outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  required
                />
                <p className="text-[10px] text-muted-foreground/50">
                  The full URL of the Kortix server, e.g. http://192.168.1.50:8008/v1/preview/kortix-sandbox/8000
                </p>
              </div>

              {/* Label */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Display Name <span className="text-muted-foreground/40">(optional)</span>
                </label>
                <input
                  placeholder="My dev instance"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-lg bg-muted/30 border border-border/60 outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                />
              </div>


            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                className="h-8 px-3 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
                onClick={() => setMode('list')}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!formUrl.trim()}
                className="h-8 px-4 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {mode === 'add' ? 'Add & Connect' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ServerSelector - the dropdown inline component
// ============================================================================

export function ServerSelector() {
  const { servers, activeServerId, setActiveServer } = useServerStore();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const handleSelect = (id: string) => {
    if (id === activeServerId) return;
    useTabStore.getState().swapForServer(id, activeServerId);
    setActiveServer(id);
    router.push('/dashboard');
  };

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {/* Header: "Instances" label + Manage button */}
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            Instances
          </span>
          <button
            type="button"
            className="flex items-center gap-1 h-5 px-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
            onClick={() => setDialogOpen(true)}
          >
            <Settings2 className="h-2.5 w-2.5" />
            Manage
          </button>
        </div>

        {/* Compact instance list */}
        <div className="flex flex-col gap-px px-1 max-h-[180px] overflow-y-auto">
          {servers.map((server) => (
            <CompactInstanceRow
              key={server.id}
              server={server}
              isActive={server.id === activeServerId}
              onSelect={() => handleSelect(server.id)}
            />
          ))}
        </div>

        {/* Quick add */}
        <button
          type="button"
          className="flex items-center gap-1.5 mx-1 px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40 transition-colors cursor-pointer"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3 w-3" />
          Add instance...
        </button>
      </div>

      {/* Instance Manager Dialog */}
      <InstanceManagerDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
