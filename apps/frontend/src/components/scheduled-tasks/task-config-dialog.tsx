"use client";

import React, { useState } from 'react';
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
import { Calendar, ArrowRight } from 'lucide-react';
import { useCreateTrigger, type SessionMode } from '@/hooks/scheduled-tasks';
import { useSandbox } from '@/hooks/platform/use-sandbox';
import { useServerStore } from '@/stores/server-store';
import { ensureSandbox } from '@/lib/platform-client';
import { toast } from 'sonner';
import { ScheduleBuilder } from './schedule-builder';

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

export function TaskConfigDialog({ open, onOpenChange, onCreated }: TaskConfigDialogProps) {
  const [name, setName] = React.useState('');
  const [cronExpr, setCronExpr] = React.useState('0 0 9 * * *');
  const [timezone, setTimezone] = React.useState('UTC');
  const [prompt, setPrompt] = React.useState('');
  const [sessionMode, setSessionMode] = useState<SessionMode>('new');
  const [agentName, setAgentName] = React.useState('');

  const { sandbox } = useSandbox();
  const createMutation = useCreateTrigger();

  const handleClose = () => {
    setName('');
    setCronExpr('0 0 9 * * *');
    setTimezone('UTC');
    setPrompt('');
    setSessionMode('new');
    setAgentName('');
    onOpenChange(false);
  };

  const resolveSandboxId = async (): Promise<string | null> => {
    try {
      const result = await ensureSandbox();
      return result.sandbox.sandbox_id;
    } catch {
      // Fall back to cached values
    }
    if (sandbox?.sandbox_id) return sandbox.sandbox_id;
    const store = useServerStore.getState();
    for (const s of store.servers) {
      if (s.sandboxId) return s.sandboxId;
    }
    return null;
  };

  const handleCreate = async () => {
    const sandboxId = await resolveSandboxId();
    if (!sandboxId) {
      toast.error('Could not find your sandbox — is the backend running?');
      return;
    }

    try {
      await createMutation.mutateAsync({
        sandbox_id: sandboxId,
        name: name.trim(),
        cron_expr: cronExpr.trim(),
        timezone,
        prompt: prompt.trim(),
        session_mode: sessionMode,
        agent_name: agentName.trim() || undefined,
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
              <Label>Schedule</Label>
              <ScheduleBuilder value={cronExpr} onChange={setCronExpr} />
            </div>

            {/* Timezone + Session Mode row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
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
              <div className="space-y-2">
                <Label>Session Mode</Label>
                <Select value={sessionMode} onValueChange={(v) => setSessionMode(v as SessionMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New Session</SelectItem>
                    <SelectItem value="reuse">Reuse Session</SelectItem>
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

            {/* Agent Name (optional) */}
            <div className="space-y-2">
              <Label htmlFor="agent-name">Agent Name (optional)</Label>
              <Input
                id="agent-name"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="@kortix-main"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the default agent
              </p>
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
