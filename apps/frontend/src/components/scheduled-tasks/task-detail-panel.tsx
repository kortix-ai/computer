"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  X,
  Trash2,
  Power,
  PowerOff,
  Save,
  Play,
  Timer,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
  Loader2,
  ExternalLink,
  Webhook,
} from 'lucide-react';
import { ScheduleBuilder } from './schedule-builder';
import {
  useUpdateTrigger,
  useDeleteTrigger,
  useToggleTrigger,
  useRunTrigger,
  useTriggerExecutions,
  type Trigger,
  type Execution,
  type SessionMode,
  type ExecutionStatus,
  useSandboxAgents,
} from '@/hooks/scheduled-tasks';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSandbox } from '@/hooks/platform/use-sandbox';
import { useServerStore } from '@/stores/server-store';
import { ensureSandbox } from '@/lib/platform-client';
import { ScheduledTaskAgentSelector } from './agent-selector';
import { useFilePreviewStore } from '@/stores/file-preview-store';
import { FileText } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

function describeCron(expr: string): string {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 6) return expr;
    const [sec, min, hour, day, month, weekday] = parts;
    if (sec.startsWith('*/') && min === '*' && hour === '*') return `Every ${sec.slice(2)}s`;
    if (sec === '0' && min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)}m`;
    if (sec === '0' && min === '0' && hour.startsWith('*/')) return `Every ${hour.slice(2)}h`;
    if (sec === '0' && !min.includes('*') && !hour.includes('*') && day === '*' && month === '*' && weekday === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    }
    return expr;
  } catch { return expr; }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

function getStatusIcon(status: ExecutionStatus) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'failed': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'timeout': return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case 'skipped': return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'running': return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
    case 'pending': return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getStatusColor(status: ExecutionStatus): string {
  switch (status) {
    case 'completed': return 'text-emerald-600 dark:text-emerald-400';
    case 'failed': return 'text-red-600 dark:text-red-400';
    case 'timeout': return 'text-amber-600 dark:text-amber-400';
    case 'skipped': return 'text-muted-foreground';
    case 'running': return 'text-blue-600 dark:text-blue-400';
    default: return 'text-muted-foreground';
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
  trigger: Trigger;
  onClose: () => void;
}

export function TaskDetailPanel({ trigger, onClose }: TaskDetailPanelProps) {
  const router = useRouter();
  const { sandbox } = useSandbox();
  const [sandboxId, setSandboxId] = useState<string | null>(trigger.sandboxId ?? null);
  const [tab, setTab] = useState<'settings' | 'executions'>('settings');
  const [name, setName] = useState(trigger.name);
  const [cronExpr, setCronExpr] = useState(trigger.cronExpr || '');
  const [timezone, setTimezone] = useState(trigger.timezone || 'UTC');
  const [prompt, setPrompt] = useState(trigger.prompt);
  const [sessionMode, setSessionMode] = useState<SessionMode>(trigger.sessionMode as SessionMode);
  const [agentName, setAgentName] = useState(trigger.agentName || '');
  const [isDirty, setIsDirty] = useState(false);

  const openFilePreview = useFilePreviewStore((s) => s.openPreview);

  const updateMutation = useUpdateTrigger();
  const deleteMutation = useDeleteTrigger();
  const toggleMutation = useToggleTrigger();
  const runMutation = useRunTrigger();
  const { data: agents = [], isLoading: agentsLoading } = useSandboxAgents(sandboxId);
  const { data: executions = [] } = useTriggerExecutions(
    tab === 'executions' && trigger.triggerId ? trigger.triggerId : '',
  );

  useEffect(() => {
    if (!trigger.sandboxId && sandboxId) return;
    if (trigger.sandboxId) {
      setSandboxId(trigger.sandboxId);
      return;
    }

    void (async () => {
      try {
        const result = await ensureSandbox();
        setSandboxId(result.sandbox.sandbox_id);
        return;
      } catch {}

      if (sandbox?.sandbox_id) {
        setSandboxId(sandbox.sandbox_id);
        return;
      }

      const store = useServerStore.getState();
      for (const server of store.servers) {
        if (server.sandboxId) {
          setSandboxId(server.sandboxId);
          return;
        }
      }
    })();
  }, [sandbox?.sandbox_id, sandboxId, trigger.sandboxId]);

  // Sync state when trigger prop changes
  React.useEffect(() => {
    setName(trigger.name);
    setCronExpr(trigger.cronExpr || '');
    setTimezone(trigger.timezone || 'UTC');
    setPrompt(trigger.prompt);
    setSessionMode(trigger.sessionMode as SessionMode);
    setAgentName(trigger.agentName || '');
    setIsDirty(false);
  }, [trigger.id, trigger.name, trigger.cronExpr, trigger.timezone, trigger.prompt, trigger.sessionMode, trigger.agentName]);

  const markDirty = () => setIsDirty(true);

  const handleSave = async () => {
    if (!trigger.triggerId) return;
    try {
      await updateMutation.mutateAsync({
        id: trigger.triggerId,
        data: {
          name,
          cron_expr: cronExpr,
          timezone,
          prompt,
          session_mode: sessionMode,
          agent_name: agentName.trim() || null,
        },
      });
      toast.success('Task updated');
      setIsDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleToggle = async () => {
    if (!trigger.triggerId) return;
    try {
      await toggleMutation.mutateAsync({ id: trigger.triggerId, isActive: !trigger.isActive });
      toast.success(trigger.isActive ? 'Task paused' : 'Task resumed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };

  const handleRun = async () => {
    if (!trigger.triggerId) return;
    try {
      await runMutation.mutateAsync(trigger.triggerId);
      toast.success('Task triggered manually');
      // Switch to executions tab to show result
      setTab('executions');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run');
    }
  };

  const handleDelete = async () => {
    if (!trigger.triggerId) return;
    if (!confirm('Are you sure you want to delete this task? This cannot be undone.')) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(trigger.triggerId);
      toast.success('Task deleted');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
            {trigger.type === 'cron' ? <Timer className="h-5 w-5" /> : <Webhook className="h-5 w-5" />}
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{trigger.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {trigger.type === 'cron' ? describeCron(trigger.cronExpr || '') : `${trigger.webhook?.method || 'POST'} ${trigger.webhook?.path || ''}`}
              </span>
              <Badge variant={trigger.isActive ? 'highlight' : 'secondary'} className="text-xs">
                {trigger.type === 'cron' ? (trigger.isActive ? 'Active' : 'Paused') : 'Webhook'}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setTab('settings')}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors",
            tab === 'settings'
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Settings
        </button>
        <button
          onClick={() => setTab('executions')}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors",
            tab === 'executions'
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Executions
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-12">
        {tab === 'settings' ? (
          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => { setName(e.target.value); markDirty(); }}
                disabled={!trigger.editable}
              />
            </div>

            {trigger.type === 'cron' ? (
              <>
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <ScheduleBuilder
                    value={cronExpr}
                    onChange={(v) => { setCronExpr(v); markDirty(); }}
                    compact
                    disabled={!trigger.editable}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={(v) => { setTimezone(v); markDirty(); }} disabled={!trigger.editable}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Endpoint</span>
                  <span className="font-medium break-all text-right">{trigger.webhook?.method || 'POST'} {trigger.webhook?.path || ''}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Secret</span>
                  <span className="font-medium">{trigger.webhook?.secretProtected ? 'Protected' : 'None'}</span>
                </div>
                <div className="text-xs text-muted-foreground">Webhook triggers are defined in the agent markdown source and are view-only here.</div>
              </div>
            )}

            {/* Prompt */}
            <div className="space-y-2">
              <Label htmlFor="edit-prompt">Prompt</Label>
              <Textarea
                id="edit-prompt"
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); markDirty(); }}
                placeholder="The instruction sent to your agent..."
                rows={4}
                disabled={!trigger.editable}
              />
            </div>

            {/* Session Mode */}
            <div className="space-y-2">
              <Label>Session Mode</Label>
              <Select
                value={sessionMode}
                onValueChange={(v) => { setSessionMode(v as SessionMode); markDirty(); }}
                disabled={!trigger.editable}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New Session</SelectItem>
                  <SelectItem value="reuse">Reuse Session</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agent Name */}
            <div className="space-y-2">
              <Label>Agent</Label>
              {agentsLoading ? (
                <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading agents...
                </div>
              ) : trigger.editable ? (
                <ScheduledTaskAgentSelector
                  agents={agents}
                  selectedAgent={agentName}
                  onSelect={(value) => {
                    setAgentName(value);
                    markDirty();
                  }}
                />
              ) : (
                <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  {trigger.agentName || 'Default'}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next run</span>
                 <span className="font-medium">
                   {trigger.type === 'cron' ? (trigger.isActive ? formatDateTime(trigger.nextRunAt) : 'Paused') : 'On demand'}
                 </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last run</span>
                <span className="font-medium">{formatDateTime(trigger.lastRunAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="font-medium">
                  {trigger.modelId || 'Default (Sonnet)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span className="font-medium">
                  {trigger.agentName || 'Default'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Retries</span>
                <span className="font-medium">{trigger.maxRetries}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timeout</span>
                <span className="font-medium">{formatDuration(trigger.timeoutMs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{new Date(trigger.createdAt).toLocaleDateString()}</span>
              </div>
              {trigger.sourceType === 'agent' && trigger.agentFilePath && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-border/50">
                  <span className="text-muted-foreground text-xs font-medium">Defined in agent file</span>
                  <button
                    type="button"
                    onClick={() => openFilePreview(trigger.agentFilePath!)}
                    className="flex items-center gap-2 w-full rounded-md border border-border bg-background px-2.5 py-2 text-left hover:bg-muted/50 transition-colors group"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <code className="text-xs font-mono text-foreground/80 break-all flex-1 leading-relaxed">{trigger.agentFilePath}</code>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                  <p className="text-xs text-muted-foreground">Click to open. Set <code className="font-mono text-xs">enabled: false</code> to disable this trigger.</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
               {trigger.editable && isDirty && (
                 <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="w-full"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
              {trigger.type === 'cron' && trigger.triggerId && (
              <Button
                variant="outline"
                onClick={handleRun}
                disabled={runMutation.isPending}
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                {runMutation.isPending ? 'Running...' : 'Run Now'}
              </Button>
              )}
              {trigger.editable && trigger.triggerId && (
              <Button
                variant="outline"
                onClick={handleToggle}
                disabled={toggleMutation.isPending}
                className="w-full"
              >
                {trigger.isActive ? (
                  <>
                    <PowerOff className="h-4 w-4 mr-2" />
                    Pause Task
                  </>
                ) : (
                  <>
                    <Power className="h-4 w-4 mr-2" />
                    Resume Task
                  </>
                )}
              </Button>
              )}
              {trigger.editable && trigger.triggerId && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Task'}
              </Button>
              )}
            </div>
          </div>
        ) : (
          /* Executions Tab */
          <div className="space-y-3">
            {trigger.type !== 'cron' ? (
              <div className="text-center py-8">
                <Webhook className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Webhook triggers do not have sandbox execution history here yet</p>
              </div>
            ) : executions.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No executions yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Executions will appear here once the task runs
                </p>
              </div>
            ) : (
                executions.map((exec) => (
                  <ExecutionItem key={exec.executionId} execution={exec} onOpenSession={(sessionId) => router.push(`/sessions/${sessionId}`)} />
                ))
              )}
            </div>
        )}
      </div>
    </div>
  );
}

// ─── Execution Item ─────────────────────────────────────────────────────────

function ExecutionItem({
  execution,
  onOpenSession,
}: {
  execution: Execution;
  onOpenSession: (sessionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canOpenSession = !!execution.sessionId;

  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-sm transition-colors',
        canOpenSession ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default'
      )}
      onClick={() => {
        if (execution.sessionId) {
          onOpenSession(execution.sessionId);
          return;
        }
        setExpanded(!expanded);
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon(execution.status)}
          <span className={cn("font-medium capitalize", getStatusColor(execution.status))}>
            {execution.status}
          </span>
          {execution.retryCount > 0 && (
            <span className="text-xs text-muted-foreground">(retry {execution.retryCount})</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {execution.sessionId && <ExternalLink className="h-3.5 w-3.5" />}
          <span>{formatDuration(execution.durationMs)}</span>
          <span>{execution.startedAt ? new Date(execution.startedAt).toLocaleString() : '--'}</span>
        </div>
      </div>
      {execution.sessionId && (
        <div className="mt-2 text-xs text-muted-foreground">
          Open session `{execution.sessionId}`
        </div>
      )}
      {expanded && execution.errorMessage && (
        <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
          {execution.errorMessage}
        </div>
      )}
    </div>
  );
}
