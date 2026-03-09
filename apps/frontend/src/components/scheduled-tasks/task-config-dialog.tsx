"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Calendar, ArrowRight, Loader2 } from 'lucide-react';
import {
  useCreateTrigger,
  useSandboxModels,
  useSandboxAgents,
  type SessionMode,
} from '@/hooks/scheduled-tasks';
import { useSandbox } from '@/hooks/platform/use-sandbox';
import { useServerStore } from '@/stores/server-store';
import { ensureSandbox } from '@/lib/platform-client';
import { toast } from 'sonner';
import { ScheduleBuilder } from './schedule-builder';
import { ScheduledTaskAgentSelector } from './agent-selector';

interface TaskConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

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

/** Sentinel value for "use default" in Select components */
const DEFAULT_VALUE = '__default__';

export function TaskConfigDialog({ open, onOpenChange, onCreated }: TaskConfigDialogProps) {
  const [name, setName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 0 9 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [prompt, setPrompt] = useState('');
  const [sessionMode, setSessionMode] = useState<SessionMode>('new');
  const [agentName, setAgentName] = useState('');
  const [modelSelection, setModelSelection] = useState(''); // "providerID::modelID" or ""
  const [sandboxId, setSandboxId] = useState<string | null>(null);

  const { sandbox } = useSandbox();
  const createMutation = useCreateTrigger();

  // Resolve sandbox ID eagerly so we can fetch models/agents
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const result = await ensureSandbox();
        setSandboxId(result.sandbox.sandbox_id);
        return;
      } catch {
        // Fall back to cached values
      }
      if (sandbox?.sandbox_id) {
        setSandboxId(sandbox.sandbox_id);
        return;
      }
      const store = useServerStore.getState();
      for (const s of store.servers) {
        if (s.sandboxId) {
          setSandboxId(s.sandboxId);
          return;
        }
      }
    })();
  }, [open, sandbox?.sandbox_id]);

  // Fetch models and agents from the sandbox
  const { data: providers, isLoading: modelsLoading } = useSandboxModels(sandboxId);
  const { data: agents, isLoading: agentsLoading } = useSandboxAgents(sandboxId);

  // Flatten providers → model options for the dropdown
  const modelOptions = useMemo(() => {
    if (!providers) return [];
    const options: { value: string; label: string }[] = [];
    for (const provider of providers) {
      for (const model of provider.models) {
        options.push({
          value: `${provider.id}::${model.id}`,
          label: `${model.name || model.id}`,
        });
      }
    }
    return options;
  }, [providers]);

  const handleClose = () => {
    setName('');
    setCronExpr('0 0 9 * * *');
    setTimezone('UTC');
    setPrompt('');
    setSessionMode('new');
    setAgentName('');
    setModelSelection('');
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!sandboxId) {
      toast.error('Could not find your sandbox — is the backend running?');
      return;
    }

    // Parse model selection
    let model_provider_id: string | undefined;
    let model_id: string | undefined;
    if (modelSelection && modelSelection !== DEFAULT_VALUE) {
      const parts = modelSelection.split('::');
      if (parts.length === 2) {
        model_provider_id = parts[0];
        model_id = parts[1];
      }
    }

    try {
      await createMutation.mutateAsync({
        sandbox_id: sandboxId,
        name: name.trim(),
        cron_expr: cronExpr.trim(),
        timezone,
        prompt: prompt.trim(),
        session_mode: sessionMode,
        agent_name: (agentName && agentName !== DEFAULT_VALUE) ? agentName : undefined,
        model_provider_id,
        model_id,
      });
      toast.success('Scheduled task created');
      handleClose();
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const isValid = (): boolean => {
    return !!(name.trim() && cronExpr.trim() && prompt.trim());
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            Create Scheduled Task
          </DialogTitle>
          <DialogDescription>
            Set up a recurring task for your agent to run on a schedule
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-1">
          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="task-name">Name</Label>
              <Input
                id="task-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daily Report"
              />
            </div>

            {/* Schedule — visual builder */}
            <div className="space-y-2">
              <div className="text-sm font-medium leading-none">Schedule Builder</div>
              <ScheduleBuilder value={cronExpr} onChange={setCronExpr} />
            </div>

            {/* Timezone + Session Mode row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="task-timezone" className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz} className="cursor-pointer data-[highlighted]:bg-muted/70">{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-session-mode">Session Mode</Label>
                <Select value={sessionMode} onValueChange={(v) => setSessionMode(v as SessionMode)}>
                  <SelectTrigger id="task-session-mode" className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new" className="cursor-pointer data-[highlighted]:bg-muted/70">New Session</SelectItem>
                    <SelectItem value="reuse" className="cursor-pointer data-[highlighted]:bg-muted/70">Reuse Session</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <Label htmlFor="task-prompt">Prompt</Label>
              <Textarea
                id="task-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Generate the daily status report and save it to /workspace/reports/"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                The instruction sent to your agent on each run
              </p>
            </div>

            {/* Model + Agent row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Model dropdown */}
              <div className="space-y-2">
                <Label>Model</Label>
                {modelsLoading ? (
                  <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading models...
                  </div>
                ) : (
                  <Select
                    value={modelSelection || DEFAULT_VALUE}
                    onValueChange={(v) => setModelSelection(v === DEFAULT_VALUE ? '' : v)}
                  >
                    <SelectTrigger className="cursor-pointer hover:bg-muted/40 transition-colors">
                      <SelectValue placeholder="Default (Sonnet)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_VALUE} className="cursor-pointer data-[highlighted]:bg-muted/70">Default (Sonnet)</SelectItem>
                      {modelOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="cursor-pointer data-[highlighted]:bg-muted/70">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Which AI model runs the task
                </p>
              </div>

              {/* Agent dropdown */}
              <div className="space-y-2">
                <Label>Agent</Label>
                {agentsLoading ? (
                  <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading agents...
                  </div>
                ) : (
                  <ScheduledTaskAgentSelector
                    agents={agents ?? []}
                    selectedAgent={agentName}
                    onSelect={setAgentName}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Which agent handles the prompt
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 shrink-0 border-t mt-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!isValid() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Task'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
