'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Check, Shield, RefreshCw, Bot, AlertCircle, ExternalLink, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
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

interface NewAPIKeyData {
  title: string;
  description: string;
  expiresInDays: string;
}

// ── Inline copy button with check feedback ─────────────────────────────────

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

// ── Auth guide ─────────────────────────────────────────────────────────────

function AuthGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">How Authentication Works</span>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />
        }
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-4 text-sm">
          {/* API Key Auth */}
          <div className="space-y-2">
            <h4 className="font-medium">API Key Authentication</h4>
            <p className="text-muted-foreground">
              API keys created here can be used for programmatic access to the Kortix API.
              Each key is a public/secret pair:
            </p>
            <div className="bg-muted rounded-lg p-3 space-y-1 font-mono text-xs">
              <div><span className="text-muted-foreground">Secret key:</span> kortix_{'<32 alphanumeric chars>'} <span className="text-muted-foreground">(39 chars)</span></div>
              <div><span className="text-muted-foreground">Public key:</span> pk_{'<32 alphanumeric chars>'} <span className="text-muted-foreground">(35 chars, safe to share)</span></div>
            </div>
            <p className="text-muted-foreground">
              The secret key is shown <strong>once</strong> at creation. Only an HMAC-SHA256 hash is stored server-side.
            </p>
          </div>

          {/* Usage */}
          <div className="space-y-2">
            <h4 className="font-medium">Usage</h4>
            <p className="text-muted-foreground">
              Pass the secret key as a Bearer token in the Authorization header:
            </p>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">
{`Authorization: Bearer kortix_<your-secret-key>`}
            </pre>
          </div>

          {/* E2E Flow */}
          <div className="space-y-2">
            <h4 className="font-medium">End-to-End Flow</h4>
            <div className="text-muted-foreground space-y-1.5">
              <div className="flex gap-2">
                <span className="text-foreground font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">1</span>
                <span>Client sends <code className="text-xs bg-muted px-1 rounded">Authorization: Bearer kortix_...</code> to the platform proxy</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">2</span>
                <span>Proxy validates: hashes the key with HMAC-SHA256, looks up the hash in the database</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">3</span>
                <span>Proxy strips client auth, injects <code className="text-xs bg-muted px-1 rounded">INTERNAL_SERVICE_KEY</code> as Bearer token</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">4</span>
                <span>Sandbox receives the request with the internal key — response streams back</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">
              Your API key is never forwarded to the sandbox. The sandbox only sees the internal service key.
            </p>
          </div>

          {/* Other auth methods */}
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground">Other Token Types</h4>
            <div className="text-muted-foreground space-y-1.5 text-xs">
              <p>
                <strong>Supabase JWT</strong> — Used by the dashboard frontend (ES256, ~900 chars).
                Passed as <code className="bg-muted px-1 rounded">Authorization: Bearer eyJhbGci...</code>. Handled automatically by the UI.
              </p>
              <p>
                <strong>Sandbox token</strong> — Auto-generated per sandbox (<code className="bg-muted px-1 rounded">kortix_sb_</code> prefix, 42 chars).
                Injected as the <code className="bg-muted px-1 rounded">KORTIX_TOKEN</code> env var. Used by AI agents running inside the sandbox to call back to the platform API.
              </p>
              <p>
                <strong>Supabase service/anon keys</strong> — These are <em>not</em> valid auth tokens. They are rejected by all endpoints.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function APIKeysPage() {
  // Re-render when active server changes (sandboxId may change)
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

  // Fetch API keys (sandbox-scoped)
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

  // Split into sandbox-managed and user-created keys
  const apiKeysData = apiKeysResponse?.data?.data;
  const { sandboxKeys, userKeys } = useMemo(() => {
    const all = apiKeysData || [];
    const sandbox: APIKeyResponse[] = [];
    const user: APIKeyResponse[] = [];
    for (const key of all) {
      if (key.type === 'sandbox') {
        sandbox.push(key);
      } else {
        user.push(key);
      }
    }
    return { sandboxKeys: sandbox, userKeys: user };
  }, [apiKeysData]);

  // Create API key mutation
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
    onError: () => {
      toast.warning('Failed to create API key');
    },
  });

  // Revoke API key mutation
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.revoke(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.info('API key revoked');
    },
    onError: () => {
      toast.warning('Failed to revoke API key');
    },
  });

  // Delete API key mutation
  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.delete(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.info('API key deleted');
    },
    onError: () => {
      toast.warning('Failed to delete API key');
    },
  });

  // Regenerate sandbox key mutation
  const regenerateMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.regenerate(keyId),
    onSuccess: (response) => {
      if (response.success && response.data?.data) {
        setCreatedApiKey(response.data.data);
        setShowCreatedKey(true);
        queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        const sandboxUpdated = (response.data as any)?.sandbox_updated;
        toast.info(
          sandboxUpdated
            ? 'Token regenerated and applied to sandbox'
            : 'Token regenerated — restart sandbox to apply',
        );
      } else {
        toast.warning(response.error?.message || 'Failed to regenerate key');
      }
    },
    onError: () => {
      toast.warning('Failed to regenerate sandbox key');
    },
  });

  const handleCreateAPIKey = () => {
    if (!activeSandboxId) {
      toast.warning('No active sandbox — start a sandbox first');
      return;
    }

    const request: APIKeyCreateRequest = {
      sandbox_id: activeSandboxId,
      title: newKeyData.title.trim(),
      description: newKeyData.description.trim() || undefined,
      expires_in_days:
        newKeyData.expiresInDays && newKeyData.expiresInDays !== 'never'
          ? parseInt(newKeyData.expiresInDays)
          : undefined,
    };

    createMutation.mutate(request);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="secondary">Active</Badge>;
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>;
      case 'expired':
        return <Badge variant="outline">Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const isKeyExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Find the active sandbox key (there should be exactly one active)
  const activeSandboxKey = sandboxKeys.find((k) => k.status === 'active');

  // Build the display value for the created key
  const createdKeyDisplayValue = createdApiKey && 'secret_key' in createdApiKey
    ? createdApiKey.secret_key
    : '';

  return (
    <div className="container mx-auto max-w-6xl px-3 sm:px-6 py-4 sm:py-6">
      <div className="space-y-4 sm:space-y-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-medium">API Keys</h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const base = getActiveOpenCodeUrl().replace(/\/+$/, '');
                const docsUrl = `${base}/docs`;
                // Inject auth token so the preview proxy sets a session cookie
                const token = await getAuthToken();
                if (token) {
                  const url = new URL(docsUrl);
                  url.searchParams.set('token', token);
                  window.open(url.toString(), '_blank');
                } else {
                  window.open(docsUrl, '_blank');
                }
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              API Docs
            </Button>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your API keys for programmatic access to Kortix
          </p>
        </div>

        {/* ── Sandbox Token ─────────────────────────────────────────────── */}
        {!isLoading && activeSandboxKey && (
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Bot className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{activeServer?.label || 'Sandbox'}</span>
                  {getStatusBadge(activeSandboxKey.status)}
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                  {activeSandboxKey.public_key}
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
                    This will revoke the current token and generate a new one.
                    The sandbox will need to restart for agents to keep working.
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

        {/* ── User API Keys Section ──────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                API Keys
              </h2>
              <div className="flex items-center gap-2 ml-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Public/secret key pair for secure authentication</span>
              </div>
            </div>

            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  New API Key
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Create a new API key for programmatic access to your sandbox.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title" className="m-1">
                      Title *
                    </Label>
                    <Input
                      id="title"
                      placeholder="My API Key"
                      value={newKeyData.title}
                      onChange={(e) =>
                        setNewKeyData((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newKeyData.title.trim()) {
                          handleCreateAPIKey();
                        }
                      }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="description" className="m-1">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Optional description for this API key"
                      value={newKeyData.description}
                      onChange={(e) =>
                        setNewKeyData((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="expires" className="m-1">
                      Expires In
                    </Label>
                    <Select
                      value={newKeyData.expiresInDays}
                      onValueChange={(value) =>
                        setNewKeyData((prev) => ({
                          ...prev,
                          expiresInDays: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Never expires" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never expires</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateAPIKey}
                    disabled={
                      !newKeyData.title.trim() || createMutation.isPending
                    }
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create API Key'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* User API Keys List */}
          {isLoading ? (
            <div className="grid gap-4">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : error || (apiKeysResponse && !apiKeysResponse.success) ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground text-sm">
                  {apiKeysResponse?.error?.message || 'Failed to load API keys.'}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try Again
                </Button>
              </CardContent>
            </Card>
          ) : userKeys.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <Key className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-medium mb-1">No API keys yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create an API key to access the Kortix API programmatically from external applications.
                </p>
                <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create API Key
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {userKeys.map((apiKey: APIKeyResponse) => (
                <Card
                  key={apiKey.key_id}
                  className={
                    isKeyExpired(apiKey.expires_at) ? 'border-yellow-500/30' : ''
                  }
                >
                  <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-lg truncate">{apiKey.title}</CardTitle>
                        {apiKey.description && (
                          <CardDescription className="mt-0.5 text-xs sm:text-sm line-clamp-2">
                            {apiKey.description}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {getStatusBadge(apiKey.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-4">
                    <div className="space-y-3">
                      {/* Public key identifier */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Key:</span>
                        <code className="font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {apiKey.public_key}
                        </code>
                        <CopyButton value={apiKey.public_key} size="icon" />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                        <div>
                          <p className="text-muted-foreground mb-0.5">Created</p>
                          <p className="font-medium truncate">
                            {formatDate(apiKey.created_at)}
                          </p>
                        </div>
                        {apiKey.expires_at && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Expires</p>
                            <p
                              className={`font-medium truncate ${isKeyExpired(apiKey.expires_at) ? 'text-yellow-600 dark:text-yellow-400' : ''}`}
                            >
                              {formatDate(apiKey.expires_at)}
                            </p>
                          </div>
                        )}
                        {apiKey.last_used_at && (
                          <div className="col-span-2 sm:col-span-1">
                            <p className="text-muted-foreground mb-0.5">
                              Last Used
                            </p>
                            <p className="font-medium truncate">
                              {formatDate(apiKey.last_used_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {apiKey.status === 'active' && (
                      <div className="flex gap-2 mt-3">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to revoke &quot;{apiKey.title}&quot;?
                                This action cannot be undone and any applications
                                using this key will stop working.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  revokeMutation.mutate(apiKey.key_id)
                                }
                                className="bg-destructive hover:bg-destructive/90 text-white"
                              >
                                Revoke Key
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}

                    {(apiKey.status === 'revoked' ||
                      apiKey.status === 'expired') && (
                        <div className="flex gap-2 mt-3">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to permanently delete &quot;
                                  {apiKey.title}&quot;? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    deleteMutation.mutate(apiKey.key_id)
                                  }
                                  className="bg-destructive hover:bg-destructive/90 text-white"
                                >
                                  Delete Key
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Authentication Guide ─────────────────────────────────────── */}
        <AuthGuide />

        {/* Show Created API Key Dialog */}
        <Dialog open={showCreatedKey} onOpenChange={setShowCreatedKey}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {createdApiKey && 'secret_key' in createdApiKey
                  ? createdApiKey.type === 'sandbox'
                    ? 'Sandbox Token Regenerated'
                    : 'API Key Created'
                  : 'API Key Created'}
              </DialogTitle>
              <DialogDescription>
                {createdApiKey?.type === 'sandbox'
                  ? 'Your sandbox token has been regenerated and applied to the running sandbox.'
                  : 'Your new API key is ready. Copy the secret key now — it won\'t be shown again.'}
              </DialogDescription>
            </DialogHeader>

            {createdApiKey && 'secret_key' in createdApiKey && (
              <div className="space-y-4">
                {/* Secret key */}
                <div>
                  <Label className="m-1">
                    {createdApiKey.type === 'sandbox' ? 'New Sandbox Token' : 'Secret Key'}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={createdKeyDisplayValue}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <CopyButton value={createdKeyDisplayValue} />
                  </div>
                </div>

                {/* Public key (for user keys) */}
                {createdApiKey.type !== 'sandbox' && (
                  <div>
                    <Label className="m-1">Public Key</Label>
                    <div className="flex gap-2">
                      <Input
                        value={createdApiKey.public_key}
                        readOnly
                        className="font-mono text-sm text-muted-foreground"
                      />
                      <CopyButton value={createdApiKey.public_key} />
                    </div>
                  </div>
                )}

                {/* Usage example for user API keys */}
                {createdApiKey.type !== 'sandbox' && (
                  <div>
                    <Label className="m-1">Usage</Label>
                    <div className="relative">
                      <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
{`curl https://api.kortix.ai/v1/chat/completions \\
  -H "Authorization: Bearer ${createdApiKey.secret_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"anthropic/claude-sonnet-4-20250514","messages":[{"role":"user","content":"Hello"}]}'`}
                      </pre>
                      <div className="absolute top-2 right-2">
                        <CopyButton
                          value={`curl https://api.kortix.ai/v1/chat/completions \\\n  -H "Authorization: Bearer ${createdApiKey.secret_key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"anthropic/claude-sonnet-4-20250514","messages":[{"role":"user","content":"Hello"}]}'`}
                          size="icon"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning */}
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    <strong>Important:</strong> Store this key securely.
                    For security reasons, we cannot show it again.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setShowCreatedKey(false)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
