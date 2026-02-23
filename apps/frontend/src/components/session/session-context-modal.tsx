'use client';

import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { MessageWithParts } from '@/ui/types';
import type { ProviderListResponse } from '@/hooks/opencode/use-opencode-sessions';
import type { Session, AssistantMessage, Message, Part } from '@opencode-ai/sdk/v2/client';

// ============================================================================
// Context metrics — ported 1:1 from SolidJS session-context-metrics.ts
// ============================================================================

interface ContextMetrics {
  message: AssistantMessage;
  providerLabel: string;
  modelLabel: string;
  limit: number | undefined;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  usage: number | null;
}

interface Metrics {
  totalCost: number;
  context: ContextMetrics | undefined;
}

function tokenTotal(msg: AssistantMessage) {
  if (!msg.tokens) return 0;
  const t = msg.tokens;
  return (t.input ?? 0) + (t.output ?? 0) + (t.reasoning ?? 0) + ((t.cache?.read ?? 0) + (t.cache?.write ?? 0));
}

function getSessionContextMetrics(messages: Message[], providers: ProviderListResponse | undefined): Metrics {
  const totalCost = messages.reduce((sum, msg) => sum + (msg.role === 'assistant' ? (msg.cost ?? 0) : 0), 0);

  // Find last assistant with tokens
  let last: AssistantMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    if (tokenTotal(msg) <= 0) continue;
    last = msg;
    break;
  }
  if (!last) return { totalCost, context: undefined };

  const provider = (providers as any)?.all?.find((p: any) => p.id === last!.providerID);
  const model = provider?.models?.[last.modelID] as any;
  const limit = model?.limit?.context as number | undefined;
  const total = tokenTotal(last);

  return {
    totalCost,
    context: {
      message: last,
      providerLabel: (provider as any)?.name ?? last.providerID,
      modelLabel: model?.name ?? last.modelID,
      limit,
      input: last.tokens?.input ?? 0,
      output: last.tokens?.output ?? 0,
      reasoning: last.tokens?.reasoning ?? 0,
      cacheRead: last.tokens?.cache?.read ?? 0,
      cacheWrite: last.tokens?.cache?.write ?? 0,
      total,
      usage: limit ? Math.round((total / limit) * 100) : null,
    },
  };
}

// ============================================================================
// Context breakdown — ported 1:1 from SolidJS session-context-breakdown.ts
// ============================================================================

type BreakdownKey = 'system' | 'user' | 'assistant' | 'tool' | 'other';

interface BreakdownSegment {
  key: BreakdownKey;
  tokens: number;
  width: number;
  percent: number;
}

const BREAKDOWN_COLORS: Record<BreakdownKey, string> = {
  system: '#60a5fa',   // blue
  user: '#34d399',     // green
  assistant: '#a78bfa', // purple
  tool: '#fbbf24',     // yellow
  other: '#9ca3af',    // gray
};

const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
  other: 'Other',
};

function estimateTokens(chars: number) { return Math.ceil(chars / 4); }

function estimateBreakdown(messages: MessageWithParts[], input: number, systemPrompt?: string): BreakdownSegment[] {
  if (!input) return [];

  const counts = messages.reduce(
    (acc, msg) => {
      if (msg.info.role === 'user') {
        const user = msg.parts.reduce((sum, part) => {
          if (part.type === 'text') return sum + (part as any).text.length;
          if (part.type === 'file') return sum + ((part as any).source?.text?.value?.length ?? 0);
          if (part.type === 'agent') return sum + ((part as any).source?.value?.length ?? 0);
          return sum;
        }, 0);
        return { ...acc, user: acc.user + user };
      }
      if (msg.info.role !== 'assistant') return acc;
      const result = msg.parts.reduce(
        (sum, part) => {
          if (part.type === 'text') return { assistant: sum.assistant + (part as any).text.length, tool: sum.tool };
          if (part.type === 'reasoning') return { assistant: sum.assistant + (part as any).text.length, tool: sum.tool };
          if (part.type === 'tool') {
            const state = (part as any).state;
            const inputLen = Object.keys(state?.input ?? {}).length * 16;
            let toolLen = inputLen;
            if (state?.status === 'pending') toolLen += (state.raw?.length ?? 0);
            else if (state?.status === 'completed') toolLen += (state.output?.length ?? 0);
            else if (state?.status === 'error') toolLen += (state.error?.length ?? 0);
            return { assistant: sum.assistant, tool: sum.tool + toolLen };
          }
          return sum;
        },
        { assistant: 0, tool: 0 },
      );
      return { ...acc, assistant: acc.assistant + result.assistant, tool: acc.tool + result.tool };
    },
    { system: systemPrompt?.length ?? 0, user: 0, assistant: 0, tool: 0 },
  );

  const tokens = {
    system: estimateTokens(counts.system),
    user: estimateTokens(counts.user),
    assistant: estimateTokens(counts.assistant),
    tool: estimateTokens(counts.tool),
  };
  const estimated = tokens.system + tokens.user + tokens.assistant + tokens.tool;

  const buildSegments = (t: Record<string, number>, inp: number) => {
    return (['system', 'user', 'assistant', 'tool', 'other'] as BreakdownKey[])
      .filter((k) => (t[k] ?? 0) > 0)
      .map((k) => ({
        key: k,
        tokens: t[k] ?? 0,
        width: ((t[k] ?? 0) / inp) * 100,
        percent: Math.round(((t[k] ?? 0) / inp) * 1000) / 10,
      }));
  };

  if (estimated <= input) {
    return buildSegments({ ...tokens, other: input - estimated }, input);
  }
  const scale = input / estimated;
  const scaled = {
    system: Math.floor(tokens.system * scale),
    user: Math.floor(tokens.user * scale),
    assistant: Math.floor(tokens.assistant * scale),
    tool: Math.floor(tokens.tool * scale),
  };
  const total = scaled.system + scaled.user + scaled.assistant + scaled.tool;
  return buildSegments({ ...scaled, other: Math.max(0, input - total) }, input);
}

// ============================================================================
// Formatter — ported 1:1 from SolidJS session-context-format.ts
// ============================================================================

function createFormatter(locale = 'en-US') {
  return {
    number(value: number | null | undefined) {
      if (value === undefined || value === null) return '—';
      return value.toLocaleString(locale);
    },
    percent(value: number | null | undefined) {
      if (value === undefined || value === null) return '—';
      return value.toLocaleString(locale) + '%';
    },
    time(value: number | undefined) {
      if (!value) return '—';
      return new Date(value).toLocaleString(locale, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    },
  };
}

// ============================================================================
// Stat component
// ============================================================================

function Stat({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xs font-medium text-foreground">{value}</div>
    </div>
  );
}

// ============================================================================
// Raw message accordion item
// ============================================================================

function RawMessage({ message, parts, formatTime }: {
  message: Message;
  parts: Part[];
  formatTime: (v: number | undefined) => string;
}) {
  return (
    <AccordionItem value={message.id}>
      <AccordionTrigger className="py-2 px-3 text-xs hover:no-underline hover:bg-muted/40 rounded-md">
        <div className="flex items-center justify-between gap-2 w-full pr-2">
          <div className="min-w-0 truncate font-mono">
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase mr-2',
              message.role === 'user' ? 'bg-blue-500/20 text-blue-500' : 'bg-emerald-500/20 text-emerald-500',
            )}>
              {message.role}
            </span>
            <span className="text-muted-foreground">{message.id}</span>
          </div>
          <div className="shrink-0 text-[10px] text-muted-foreground/60">
            {formatTime(message.time?.created)}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-2">
        <pre className="p-3 rounded-md bg-muted/40 overflow-x-auto text-[11px] font-mono whitespace-pre-wrap break-all select-text max-h-[400px] overflow-y-auto">
          {JSON.stringify({ message, parts }, null, 2)}
        </pre>
      </AccordionContent>
    </AccordionItem>
  );
}

// ============================================================================
// Main modal component
// ============================================================================

interface SessionContextModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: MessageWithParts[] | undefined;
  session: Session | undefined;
  providers: ProviderListResponse | undefined;
}

export function SessionContextModal({
  open,
  onOpenChange,
  messages,
  session,
  providers,
}: SessionContextModalProps) {
  const [copiedAll, setCopiedAll] = useState(false);

  const rawMessages = useMemo(
    () => (messages ?? []).map((m) => m.info),
    [messages],
  );

  const metrics = useMemo(
    () => getSessionContextMetrics(rawMessages, providers),
    [rawMessages, providers],
  );

  const ctx = metrics.context;
  const fmt = useMemo(() => createFormatter(), []);

  const usd = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    [],
  );

  const counts = useMemo(() => {
    const all = rawMessages;
    const user = all.filter((m) => m.role === 'user').length;
    const assistant = all.filter((m) => m.role === 'assistant').length;
    return { all: all.length, user, assistant };
  }, [rawMessages]);

  const breakdown = useMemo(() => {
    if (!ctx?.input || !messages) return [];
    return estimateBreakdown(messages, ctx.input);
  }, [ctx?.input, messages]);

  const stats = useMemo(() => [
    { label: 'Session', value: session?.title ?? session?.id ?? '—' },
    { label: 'Messages', value: counts.all.toLocaleString() },
    { label: 'Provider', value: ctx?.providerLabel ?? '—' },
    { label: 'Model', value: ctx?.modelLabel ?? '—' },
    { label: 'Context Limit', value: fmt.number(ctx?.limit) },
    { label: 'Total Tokens', value: fmt.number(ctx?.total) },
    { label: 'Usage', value: fmt.percent(ctx?.usage) },
    { label: 'Input Tokens', value: fmt.number(ctx?.input) },
    { label: 'Output Tokens', value: fmt.number(ctx?.output) },
    { label: 'Reasoning Tokens', value: fmt.number(ctx?.reasoning) },
    { label: 'Cache Tokens', value: `${fmt.number(ctx?.cacheRead)} / ${fmt.number(ctx?.cacheWrite)}` },
    { label: 'User Messages', value: counts.user.toLocaleString() },
    { label: 'Assistant Messages', value: counts.assistant.toLocaleString() },
    { label: 'Total Cost', value: usd.format(metrics.totalCost) },
    { label: 'Session Created', value: fmt.time(session?.time?.created) },
    { label: 'Last Activity', value: fmt.time(ctx?.message?.time?.created) },
  ], [session, counts, ctx, fmt, usd, metrics.totalCost]);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(messages, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">Context</DialogTitle>
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 mr-8 rounded-md text-[11px] font-medium border border-border/50 hover:bg-muted/60 transition-colors cursor-pointer text-muted-foreground"
            >
              {copiedAll ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copiedAll ? 'Copied!' : 'Copy All JSON'}
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-4 space-y-8">
          {/* Stats grid — 1:1 from SolidJS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stats.map((stat) => (
              <Stat key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>

          {/* Context breakdown bar — 1:1 from SolidJS */}
          {breakdown.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground">Context Breakdown</div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                {breakdown.map((segment) => (
                  <div
                    key={segment.key}
                    className="h-full"
                    style={{ width: `${segment.width}%`, backgroundColor: BREAKDOWN_COLORS[segment.key] }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {breakdown.map((segment) => (
                  <div key={segment.key} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <div className="size-2 rounded-sm" style={{ backgroundColor: BREAKDOWN_COLORS[segment.key] }} />
                    <div>{BREAKDOWN_LABELS[segment.key]}</div>
                    <div className="text-muted-foreground/60">{segment.percent}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw messages — 1:1 from SolidJS */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              Raw Messages ({counts.all})
            </div>
            <Accordion type="multiple" className="border rounded-lg overflow-hidden">
              {(messages ?? []).map((msg) => (
                <RawMessage
                  key={msg.info.id}
                  message={msg.info}
                  parts={msg.parts}
                  formatTime={fmt.time}
                />
              ))}
            </Accordion>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
