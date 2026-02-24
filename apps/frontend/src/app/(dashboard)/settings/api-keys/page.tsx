'use client';

import React, { useState, useMemo } from 'react';
import { Key, Plus, Trash2, Copy, Shield, RefreshCw, Bot } from 'lucide-react';
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
import { getActiveSandboxId, getActiveServer } from '@/stores/server-store';
import { useServerStore } from '@/stores/server-store';

interface NewAPIKeyData {
  title: string;
  description: string;
  expiresInDays: string;
}

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
  } = useQuery({
    queryKey: ['api-keys', activeSandboxId],
    queryFn: () => apiKeysApi.list(activeSandboxId!),
    enabled: !!activeSandboxId,
  });

  const allKeys = apiKeysResponse?.data?.data || [];

  // Split into sandbox-managed and user-created keys
  const { sandboxKeys, userKeys } = useMemo(() => {
    const sandbox: APIKeyResponse[] = [];
    const user: APIKeyResponse[] = [];
    for (const key of allKeys) {
      if (key.type === 'sandbox') {
        sandbox.push(key);
      } else {
        user.push(key);
      }
    }
    return { sandboxKeys: sandbox, userKeys: user };
  }, [allKeys]);

  // Create API key mutation
  const createMutation = useMutation({
    mutationFn: (request: APIKeyCreateRequest) => apiKeysApi.create(request),
    onSuccess: (response) => {
      if (response.success && response.data?.data) {
        setCreatedApiKey(response.data.data);
        setShowCreatedKey(true);
        setIsCreateDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        toast.success('API key created successfully');
        setNewKeyData({ title: '', description: '', expiresInDays: 'never' });
      } else {
        toast.error(response.error?.message || 'Failed to create API key');
      }
    },
    onError: () => {
      toast.error('Failed to create API key');
    },
  });

  // Revoke API key mutation
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.revoke(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked successfully');
    },
    onError: () => {
      toast.error('Failed to revoke API key');
    },
  });

  // Delete API key mutation
  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.delete(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete API key');
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
        toast.success(
          sandboxUpdated
            ? 'Token regenerated and applied to sandbox'
            : 'Token regenerated — restart sandbox to apply',
        );
      } else {
        toast.error(response.error?.message || 'Failed to regenerate key');
      }
    },
    onError: () => {
      toast.error('Failed to regenerate sandbox key');
    },
  });

  const handleCreateAPIKey = () => {
    if (!activeSandboxId) {
      toast.error('No active sandbox — start a sandbox first');
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

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleCopyFullKey = async (publicKey: string, secretKey: string) => {
    try {
      const fullKey = `${publicKey}:${secretKey}`;
      await navigator.clipboard.writeText(fullKey);
      toast.success('Full API key copied to clipboard');
    } catch {
      toast.error('Failed to copy full API key');
    }
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

  return (
    <div className="container mx-auto max-w-6xl px-3 sm:px-6 py-4 sm:py-6">
      <div className="space-y-4 sm:space-y-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-medium">API Keys</h1>
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
                    Create a new API key for programmatic access to your account.
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
          ) : error ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">
                  Failed to load API keys. Please try again.
                </p>
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
                    isKeyExpired(apiKey.expires_at) ? 'border-yellow-200' : ''
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
                              className={`font-medium truncate ${isKeyExpired(apiKey.expires_at) ? 'text-yellow-600' : ''}`}
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

        {/* Show Created API Key Dialog */}
        <Dialog open={showCreatedKey} onOpenChange={setShowCreatedKey}>
          <DialogContent className="max-w-md">
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
                  : 'Your API key has been created successfully.'}
              </DialogDescription>
            </DialogHeader>

            {createdApiKey && 'secret_key' in createdApiKey && (
              <div className="space-y-4">
                <div>
                  <Label className="m-1">
                    {createdApiKey.type === 'sandbox' ? 'New Sandbox Token' : 'API Key'}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={
                        createdApiKey.type === 'sandbox'
                          ? createdApiKey.secret_key
                          : `${createdApiKey.public_key}:${createdApiKey.secret_key}`
                      }
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (createdApiKey.type === 'sandbox') {
                          handleCopyKey(createdApiKey.secret_key);
                        } else {
                          handleCopyFullKey(
                            createdApiKey.public_key,
                            createdApiKey.secret_key,
                          );
                        }
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      <strong>Important:</strong> Store this key securely.
                      For security reasons, we cannot show it again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setShowCreatedKey(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
