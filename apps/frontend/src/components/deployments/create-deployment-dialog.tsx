'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  GitBranch,
  FileCode2,
  Files,
  Archive,
  Plus,
  Trash2,
  ChevronDown,
  Loader2,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreateDeployment, type DeploymentSource, type CreateDeploymentData } from '@/hooks/deployments/use-deployments';
import { toast } from 'sonner';

// ─── Source type config ─────────────────────────────────────────────────────

const sourceTypes: Array<{
  value: DeploymentSource;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  { value: 'git', label: 'Git', icon: GitBranch, description: 'Deploy from a Git repository' },
  { value: 'code', label: 'Code', icon: FileCode2, description: 'Deploy inline code' },
  { value: 'files', label: 'Files', icon: Files, description: 'Deploy from file contents' },
  { value: 'tar', label: 'Tar', icon: Archive, description: 'Deploy from a tarball URL' },
];

// ─── Component ──────────────────────────────────────────────────────────────

interface CreateDeploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateDeploymentDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateDeploymentDialogProps) {
  const createMutation = useCreateDeployment();

  // Form state
  const [sourceType, setSourceType] = useState<DeploymentSource>('git');
  const [domains, setDomains] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Git fields
  const [sourceRef, setSourceRef] = useState('');
  const [branch, setBranch] = useState('');
  const [rootPath, setRootPath] = useState('');

  // Code field
  const [code, setCode] = useState('');

  // Files fields
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([
    { path: '', content: '' },
  ]);

  // Tar field
  const [tarUrl, setTarUrl] = useState('');

  // Advanced config
  const [entrypoint, setEntrypoint] = useState('');
  const [framework, setFramework] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [buildOutDir, setBuildOutDir] = useState('');
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [staticOnly, setStaticOnly] = useState(false);

  const resetForm = useCallback(() => {
    setSourceType('git');
    setDomains('');
    setSourceRef('');
    setBranch('');
    setRootPath('');
    setCode('');
    setFiles([{ path: '', content: '' }]);
    setTarUrl('');
    setEntrypoint('');
    setFramework('');
    setBuildCommand('');
    setBuildOutDir('');
    setEnvVars([]);
    setStaticOnly(false);
    setShowAdvanced(false);
  }, []);

  const handleSubmit = async () => {
    // Validate domains
    const domainList = domains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    if (domainList.length === 0) {
      toast.error('At least one domain is required');
      return;
    }

    // Build payload
    const payload: CreateDeploymentData = {
      source_type: sourceType,
      domains: domainList,
    };

    // Source-specific fields
    if (sourceType === 'git') {
      if (!sourceRef) {
        toast.error('Repository URL is required');
        return;
      }
      payload.source_ref = sourceRef;
      if (branch) payload.branch = branch;
      if (rootPath) payload.root_path = rootPath;
    } else if (sourceType === 'code') {
      if (!code) {
        toast.error('Code is required');
        return;
      }
      payload.code = code;
    } else if (sourceType === 'files') {
      const validFiles = files.filter((f) => f.path && f.content);
      if (validFiles.length === 0) {
        toast.error('At least one file with path and content is required');
        return;
      }
      payload.files = validFiles;
    } else if (sourceType === 'tar') {
      if (!tarUrl) {
        toast.error('Tar URL is required');
        return;
      }
      payload.tar_url = tarUrl;
    }

    // Advanced fields
    if (entrypoint) payload.entrypoint = entrypoint;
    if (framework) payload.framework = framework;
    if (staticOnly) payload.static_only = true;

    if (buildCommand || buildOutDir) {
      payload.build = {
        ...(buildCommand && { command: buildCommand }),
        ...(buildOutDir && { outDir: buildOutDir }),
      };
    }

    const validEnvVars = envVars.filter((e) => e.key);
    if (validEnvVars.length > 0) {
      payload.env_vars = Object.fromEntries(validEnvVars.map((e) => [e.key, e.value]));
    }

    try {
      const result = await createMutation.mutateAsync(payload);
      if (result.status === 'active') {
        toast.success('Deployment is live!', {
          description: result.liveUrl || undefined,
        });
      } else if (result.status === 'failed') {
        toast.error('Deployment failed', {
          description: result.error || 'Unknown error',
        });
      } else {
        toast.success('Deployment created');
      }
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create deployment');
    }
  };

  // File list management
  const addFile = () => setFiles((prev) => [...prev, { path: '', content: '' }]);
  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));
  const updateFile = (index: number, field: 'path' | 'content', value: string) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  // Env var management
  const addEnvVar = () => setEnvVars((prev) => [...prev, { key: '', value: '' }]);
  const removeEnvVar = (index: number) => setEnvVars((prev) => prev.filter((_, i) => i !== index));
  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    setEnvVars((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  const inputClass =
    'h-9 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  const textareaClass =
    'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono min-h-[100px] resize-y';
  const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="create-deployment-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            New Deployment
          </DialogTitle>
          <DialogDescription id="create-deployment-description">
            Deploy your application to production via Freestyle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Source Type Selector */}
          <div>
            <label className={labelClass}>Source Type</label>
            <div className="grid grid-cols-4 gap-2">
              {sourceTypes.map((st) => {
                const Icon = st.icon;
                return (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => setSourceType(st.value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-sm transition-colors',
                      sourceType === st.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Domain */}
          <div>
            <label className={labelClass}>
              Domain(s) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="my-app.style.dev"
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated list of domains. At least one is required.
            </p>
          </div>

          {/* Source-specific fields */}
          {sourceType === 'git' && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>
                  Repository URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Root Path</label>
                  <input
                    type="text"
                    value={rootPath}
                    onChange={(e) => setRootPath(e.target.value)}
                    placeholder="/"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {sourceType === 'code' && (
            <div>
              <label className={labelClass}>
                Code <span className="text-red-500">*</span>
              </label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={'// Your application code\nconsole.log("Hello, World!");'}
                className={textareaClass}
                rows={8}
              />
            </div>
          )}

          {sourceType === 'files' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass}>
                  Files <span className="text-red-500">*</span>
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={addFile}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add File
                </Button>
              </div>
              <div className="space-y-3">
                {files.map((file, i) => (
                  <div key={i} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={file.path}
                        onChange={(e) => updateFile(i, 'path', e.target.value)}
                        placeholder="index.ts"
                        className={cn(inputClass, 'flex-1')}
                      />
                      {files.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <textarea
                      value={file.content}
                      onChange={(e) => updateFile(i, 'content', e.target.value)}
                      placeholder="File content..."
                      className={cn(textareaClass, 'min-h-[60px]')}
                      rows={4}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {sourceType === 'tar' && (
            <div>
              <label className={labelClass}>
                Tarball URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={tarUrl}
                onChange={(e) => setTarUrl(e.target.value)}
                placeholder="https://example.com/app.tar.gz"
                className={inputClass}
              />
            </div>
          )}

          {/* Advanced config (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  showAdvanced && 'rotate-180',
                )}
              />
              Advanced Configuration
              {(entrypoint || framework || buildCommand || envVars.length > 0 || staticOnly) && (
                <Badge variant="secondary" className="text-xs">configured</Badge>
              )}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 pl-6 border-l-2 border-border/40">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Entrypoint</label>
                    <input
                      type="text"
                      value={entrypoint}
                      onChange={(e) => setEntrypoint(e.target.value)}
                      placeholder="server.js"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Framework</label>
                    <input
                      type="text"
                      value={framework}
                      onChange={(e) => setFramework(e.target.value)}
                      placeholder="nextjs, vite, etc."
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Build Command</label>
                    <input
                      type="text"
                      value={buildCommand}
                      onChange={(e) => setBuildCommand(e.target.value)}
                      placeholder="npm run build"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Build Output Dir</label>
                    <input
                      type="text"
                      value={buildOutDir}
                      onChange={(e) => setBuildOutDir(e.target.value)}
                      placeholder="dist"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="static-only"
                    type="checkbox"
                    checked={staticOnly}
                    onChange={(e) => setStaticOnly(e.target.checked)}
                    className="rounded border-border"
                  />
                  <label htmlFor="static-only" className="text-sm text-foreground">
                    Static site only (no server)
                  </label>
                </div>

                {/* Environment Variables */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelClass}>Environment Variables</label>
                    <Button type="button" variant="ghost" size="sm" onClick={addEnvVar}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  {envVars.length > 0 && (
                    <div className="space-y-2">
                      {envVars.map((ev, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ev.key}
                            onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                            placeholder="KEY"
                            className={cn(inputClass, 'flex-1')}
                          />
                          <input
                            type="text"
                            value={ev.value}
                            onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                            placeholder="value"
                            className={cn(inputClass, 'flex-1')}
                          />
                          <button
                            type="button"
                            onClick={() => removeEnvVar(i)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Deploy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
