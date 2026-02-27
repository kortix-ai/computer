'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Check, Shield, RefreshCw, Bot, AlertCircle, ExternalLink } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  apiKeysApi,
  APIKeyCreateRequest,
  APIKeyResponse,
  APIKeyCreateResponse,
  APIKeyRegenerateResponse,
} from '@/lib/api/api-keys';
import { getActiveSandboxId, getActiveServer, getActiveOpenCodeUrl } from '@/stores/server-store';
import { getAuthToken } from '@/lib/auth-token';
import { useServerStore } from '@/stores/server-store';

// ── Helpers ────────────────────────────────────────────────────────────────

interface NewAPIKeyData {
  title: string;
  description: string;
  expiresInDays: string;
}

function CopyButton({ value, label, size = 'sm' }: { value: string; label?: string; size?: 'sm' | 'icon' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.warning('Failed to copy to clipboard');
    }
  }, [value]);

  if (size === 'icon') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={handleCopy}>
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      {label && <span className="ml-1.5">{label}</span>}
    </Button>
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateFull(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isKeyExpired(expiresAt?: string) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      );
    case 'revoked':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Revoked
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          Expired
        </span>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function APIKeysPage() {
  const activeServerId = useServerStore((s) => s.activeServerId);
  const activeSandboxId = getActiveSandboxId();
  const activeServer = getActiveServer();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState<NewAPIKeyData>({
    title: '',
    description: '',
    expiresInDays: 'never',
  });
  const [createdApiKey, setCreatedApiKey] = useState<APIKeyCreateResponse | APIKeyRegenerateResponse | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(false);
  const queryClient = useQueryClient();

  // ── Queries & mutations ────────────────────────────────────────────────

  const {
    data: apiKeysResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['api-keys', activeSandboxId],
    queryFn: () => apiKeysApi.list(activeSandboxId!),
    enabled: !!activeSandboxId,
  });

  const apiKeysData = apiKeysResponse?.data?.data;
  const { sandboxKeys, userKeys } = useMemo(() => {
    const all = apiKeysData || [];
    const sandbox: APIKeyResponse[] = [];
    const user: APIKeyResponse[] = [];
    for (const key of all) {
      if (key.type === 'sandbox') sandbox.push(key);
      else user.push(key);
    }
    return { sandboxKeys: sandbox, userKeys: user };
  }, [apiKeysData]);

  const createMutation = useMutation({
    mutationFn: (request: APIKeyCreateRequest) => apiKeysApi.create(request),
    onSuccess: (response) => {
      if (response.success && response.data?.data) {
        setCreatedApiKey(response.data.data);
        setShowCreatedKey(true);
        setIsCreateDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        setNewKeyData({ title: '', description: '', expiresInDays: 'never' });
      } else {
        toast.warning(response.error?.message || 'Failed to create API key');
      }
    },
    onError: () => toast.warning('Failed to create API key'),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.revoke(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.info('API key revoked');
    },
    onError: () => toast.warning('Failed to revoke API key'),
  });

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.delete(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.info('API key deleted');
    },
    onError: () => toast.warning('Failed to delete API key'),
  });

  const regenerateMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.regenerate(keyId),
    onSuccess: (response) => {
      if (response.success && response.data?.data) {
        setCreatedApiKey(response.data.data);
        setShowCreatedKey(true);
        queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        toast.info('Token regenerated');
      } else {
        toast.warning(response.error?.message || 'Failed to regenerate key');
      }
    },
    onError: () => toast.warning('Failed to regenerate sandbox key'),
  });

  const handleCreateAPIKey = () => {
    if (!activeSandboxId) {
      toast.warning('No active sandbox');
      return;
    }
    createMutation.mutate({
      sandbox_id: activeSandboxId,
      title: newKeyData.title.trim(),
      description: newKeyData.description.trim() || undefined,
      expires_in_days:
        newKeyData.expiresInDays && newKeyData.expiresInDays !== 'never'
          ? parseInt(newKeyData.expiresInDays)
          : undefined,
    });
  };

  const activeSandboxKey = sandboxKeys.find((k) => k.status === 'active');
  const createdKeyDisplayValue = createdApiKey && 'secret_key' in createdApiKey
    ? createdApiKey.secret_key
    : '';

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-4xl px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-6 sm:space-y-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">API Keys</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage keys for programmatic access to your sandbox.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const base = getActiveOpenCodeUrl().replace(/\/+$/, '');
              const docsUrl = `${base}/docs`;
              const token = await getAuthToken();
              if (token) {
                try {
                  const url = new URL(docsUrl);
                  url.searchParams.set('token', token);
                  window.open(url.toString(), '_blank');
                } catch {
                  const sep = docsUrl.includes('?') ? '&' : '?';
                  window.open(`${docsUrl}${sep}token=${encodeURIComponent(token)}`, '_blank');
                }
              } else {
                window.open(docsUrl, '_blank');
              }
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            API Docs
          </Button>
        </div>

        {/* ── Sandbox Token ───────────────────────────────────────────── */}
        {!isLoading && activeSandboxKey && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Sandbox Token</span>
                  <StatusBadge status={activeSandboxKey.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Used by the agent inside your sandbox to call the platform API
                </p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Regenerate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate Sandbox Token</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will revoke the current token and create a new one.
                    It will be applied to the sandbox automatically.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => regenerateMutation.mutate(activeSandboxKey.key_id)}
                    disabled={regenerateMutation.isPending}
                  >
                    {regenerateMutation.isPending ? 'Regenerating...' : 'Regenerate'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* ── User API Keys ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Your Keys</h2>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Create Key
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>New API Key</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="title" className="text-xs text-muted-foreground">Name</Label>
                    <Input
                      id="title"
                      placeholder="e.g. CI/CD Pipeline"
                      value={newKeyData.title}
                      onChange={(e) => setNewKeyData((prev) => ({ ...prev, title: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newKeyData.title.trim()) handleCreateAPIKey();
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description" className="text-xs text-muted-foreground">Description <span className="font-normal">(optional)</span></Label>
                    <Input
                      id="description"
                      placeholder="What is this key for?"
                      value={newKeyData.description}
                      onChange={(e) => setNewKeyData((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="expires" className="text-xs text-muted-foreground">Expiration</Label>
                    <Select
                      value={newKeyData.expiresInDays}
                      onValueChange={(value) => setNewKeyData((prev) => ({ ...prev, expiresInDays: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Never" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">No expiration</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateAPIKey}
                    disabled={!newKeyData.title.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Keys list */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            {isLoading ? (
              <div className="divide-y">
                {[1, 2].map((i) => (
                  <div key={i} className="px-4 py-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-muted rounded w-1/4" />
                        <div className="h-3 bg-muted rounded w-1/3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error || (apiKeysResponse && !apiKeysResponse.success) ? (
              <div className="px-4 py-12 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground text-sm">
                  {apiKeysResponse?.error?.message || 'Failed to load API keys.'}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try Again
                </Button>
              </div>
            ) : userKeys.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Key className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No API keys</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Create a key to access your sandbox programmatically.
                </p>
                <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Create Key
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {userKeys.map((apiKey: APIKeyResponse) => (
                  <div
                    key={apiKey.key_id}
                    className={`px-4 py-3.5 flex items-center gap-3 ${
                      isKeyExpired(apiKey.expires_at) ? 'bg-yellow-500/5' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Key className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{apiKey.title}</span>
                        <StatusBadge status={apiKey.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>Created {formatDate(apiKey.created_at)}</span>
                        {apiKey.expires_at && (
                          <span className={isKeyExpired(apiKey.expires_at) ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                            {isKeyExpired(apiKey.expires_at) ? 'Expired' : 'Expires'} {formatDate(apiKey.expires_at)}
                          </span>
                        )}
                        {apiKey.last_used_at && (
                          <span>Last used {formatDate(apiKey.last_used_at)}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0">
                      {apiKey.status === 'active' ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke &quot;{apiKey.title}&quot;</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will immediately invalidate the key. Any applications using it will stop working.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => revokeMutation.mutate(apiKey.key_id)}
                                className="bg-destructive hover:bg-destructive/90 text-white"
                              >
                                Revoke
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete &quot;{apiKey.title}&quot;</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove the key. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(apiKey.key_id)}
                                className="bg-destructive hover:bg-destructive/90 text-white"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Usage hint ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border bg-card px-4 py-3">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Pass your secret key as a Bearer token: <code className="bg-muted px-1 py-0.5 rounded text-foreground">Authorization: Bearer kortix_...</code>
              </p>
              <p>
                Keys are hashed server-side and never stored in plain text. The secret is shown once at creation.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Created Key Dialog ──────────────────────────────────────────── */}
      <Dialog open={showCreatedKey} onOpenChange={setShowCreatedKey}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createdApiKey?.type === 'sandbox' ? 'Token Regenerated' : 'Key Created'}
            </DialogTitle>
            <DialogDescription>
              {createdApiKey?.type === 'sandbox'
                ? 'The new token has been applied to your sandbox.'
                : 'Copy your secret key now. It won\'t be shown again.'}
            </DialogDescription>
          </DialogHeader>

          {createdApiKey && 'secret_key' in createdApiKey && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{createdApiKey.type === 'sandbox' ? 'Sandbox Token' : 'Secret Key'}</Label>
                <div className="flex gap-2">
                  <Input
                    value={createdKeyDisplayValue}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <CopyButton value={createdKeyDisplayValue} label="Copy" />
                </div>
              </div>

              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-3 py-2.5">
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Store this key securely. It cannot be retrieved after closing this dialog.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button onClick={() => setShowCreatedKey(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
