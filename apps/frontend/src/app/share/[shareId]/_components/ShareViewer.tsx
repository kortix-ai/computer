'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { KortixLoader } from '@/components/ui/kortix-loader';
import {
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { getActiveOpenCodeUrl } from '@/stores/server-store';

// ============================================================================
// Types matching the enterprise share data API response
// ============================================================================

interface ShareSession {
  id: string;
  title: string;
  version?: string;
  directory?: string;
  time: { created: number; updated?: number };
}

interface ShareMessage {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  modelID?: string;
  model?: { providerID: string; modelID: string };
  time: { created: number; updated?: number };
}

interface SharePart {
  id: string;
  messageID: string;
  type: string;
  content?: any;
  time?: { created: number; updated?: number };
  // Text part
  text?: string;
  // Tool part
  tool?: string;
  state?: string;
  input?: Record<string, any>;
  output?: string;
  // Reasoning part
  reasoning?: string;
  // File part
  file?: string;
}

interface ShareFileDiff {
  file: string;
  before: string;
  after: string;
}

type ShareDataItem =
  | { type: 'session'; data: ShareSession }
  | { type: 'message'; data: ShareMessage }
  | { type: 'part'; data: SharePart }
  | { type: 'session_diff'; data: ShareFileDiff[] }
  | { type: 'model'; data: any[] };

// ============================================================================
// Data fetching
// ============================================================================

async function fetchShareData(shareId: string): Promise<ShareDataItem[]> {
  // Try the enterprise API at the current OpenCode server URL
  const baseUrl = getActiveOpenCodeUrl();
  const res = await fetch(`${baseUrl}/api/share/${shareId}/data`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    // Fallback: try opncd.ai (the default enterprise host)
    const fallbackRes = await fetch(`https://opncd.ai/api/share/${shareId}/data`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!fallbackRes.ok) {
      throw new Error(fallbackRes.status === 404 ? 'Share not found' : `Failed to load share data (${fallbackRes.status})`);
    }
    return fallbackRes.json();
  }

  return res.json();
}

// ============================================================================
// Share Viewer Component
// ============================================================================

export function ShareViewer({ shareId }: { shareId: string }) {
  const [data, setData] = useState<ShareDataItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchShareData(shareId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load share');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [shareId]);

  // Parse the flat data array into structured data
  const parsed = useMemo(() => {
    if (!data) return null;

    let session: ShareSession | null = null;
    const messages: ShareMessage[] = [];
    const parts: Record<string, SharePart[]> = {};
    let diffs: ShareFileDiff[] = [];

    for (const item of data) {
      switch (item.type) {
        case 'session':
          session = item.data;
          break;
        case 'message':
          messages.push(item.data);
          break;
        case 'part':
          if (!parts[item.data.messageID]) parts[item.data.messageID] = [];
          parts[item.data.messageID].push(item.data);
          break;
        case 'session_diff':
          diffs = item.data;
          break;
      }
    }

    // Sort messages by creation time
    messages.sort((a, b) => a.time.created - b.time.created);

    // Sort parts by creation time within each message
    for (const msgId of Object.keys(parts)) {
      parts[msgId].sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0));
    }

    return { session, messages, parts, diffs };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <KortixLoader size="medium" />
          <p className="text-sm text-muted-foreground">Loading shared session...</p>
        </div>
      </div>
    );
  }

  if (error || !parsed?.session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="rounded-full bg-muted p-3">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-base font-medium">
            {error === 'Share not found' ? 'Share Not Found' : 'Error Loading Share'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {error === 'Share not found'
              ? 'This shared session does not exist or has been removed.'
              : error || 'The session data could not be loaded.'}
          </p>
        </div>
      </div>
    );
  }

  const { session, messages, parts, diffs } = parsed;
  const userMessages = messages.filter((m) => m.role === 'user');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background border-b border-border/40">
        <div className="h-12 sm:h-14 flex items-center justify-between px-4 sm:px-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/kortix-logomark-white.svg"
              alt="Kortix"
              className="dark:invert-0 invert flex-shrink-0"
              style={{ height: '14px', width: 'auto' }}
            />
            <span className="text-sm font-medium truncate">{session.title}</span>
          </div>
          <CopyLinkButton />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {/* Session info */}
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="text-lg font-semibold">{session.title}</h1>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {session.version && (
                <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                  v{session.version}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(session.time.created).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span>{userMessages.length} turn{userMessages.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Message turns */}
          <div className="space-y-8">
            {messages.map((message) => (
              <ShareMessageView
                key={message.id}
                message={message}
                parts={parts[message.id] || []}
              />
            ))}
          </div>

          {/* Diffs section */}
          {diffs.length > 0 && (
            <div className="mt-12 border-t border-border pt-8">
              <h2 className="text-sm font-medium mb-4">
                {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
              </h2>
              <div className="space-y-4">
                {diffs.map((diff) => (
                  <ShareDiffView key={diff.file} diff={diff} />
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-center pt-16 pb-8">
            <img
              src="/kortix-logomark-white.svg"
              alt="Kortix"
              className="dark:invert-0 invert opacity-10"
              style={{ height: '24px', width: 'auto' }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Share link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-8 px-2.5 gap-1.5 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline text-xs">{copied ? 'Copied!' : 'Copy Link'}</span>
    </Button>
  );
}

function ShareMessageView({
  message,
  parts,
}: {
  message: ShareMessage;
  parts: SharePart[];
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    // Find text parts for user message
    const textParts = parts.filter((p) => p.type === 'text');
    const text = textParts.map((p) => p.text || p.content?.text || '').join('\n').trim();
    if (!text) return null;

    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-card border px-4 py-3">
          <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  const textParts = parts.filter((p) => p.type === 'text');
  const toolParts = parts.filter((p) => p.type === 'tool');
  const reasoningParts = parts.filter((p) => p.type === 'reasoning');

  const hasContent = textParts.length > 0 || toolParts.length > 0;
  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Agent header */}
      <div className="flex items-center">
        <img
          src="/kortix-logomark-white.svg"
          alt="Kortix"
          className="dark:invert-0 invert flex-shrink-0"
          style={{ height: '12px', width: 'auto' }}
        />
      </div>

      {/* Reasoning (collapsed by default) */}
      {reasoningParts.length > 0 && (
        <ShareReasoningSection
          content={reasoningParts.map((p) => p.reasoning || p.text || p.content?.text || '').join('\n')}
        />
      )}

      {/* Tool calls */}
      {toolParts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {toolParts.map((part) => (
            <ShareToolView key={part.id} part={part} />
          ))}
        </div>
      )}

      {/* Text content */}
      {textParts.map((part) => {
        const text = part.text || part.content?.text || '';
        if (!text.trim()) return null;
        return (
          <div key={part.id} className="break-words overflow-hidden">
            <UnifiedMarkdown content={text} />
          </div>
        );
      })}
    </div>
  );
}

function ShareReasoningSection({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!content.trim()) return null;

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="flex items-start gap-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
    >
      {expanded ? <ChevronDown className="h-3 w-3 mt-0.5 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />}
      <div>
        <span className="font-medium">Reasoning</span>
        {expanded && (
          <pre className="mt-1 whitespace-pre-wrap text-muted-foreground/70 font-normal text-[11px] leading-relaxed max-h-64 overflow-y-auto">
            {content}
          </pre>
        )}
      </div>
    </button>
  );
}

function ShareToolView({ part }: { part: SharePart }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = part.tool || 'tool';
  const isSuccess = part.state === 'completed' || part.state === 'success';
  const isError = part.state === 'error';

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
        <span className="font-mono text-xs truncate">{toolName}</span>
        {part.state && (
          <span className={cn(
            'ml-auto px-1.5 py-0.5 rounded text-[10px]',
            isSuccess && 'bg-green-500/10 text-green-600 dark:text-green-400',
            isError && 'bg-red-500/10 text-red-600 dark:text-red-400',
            !isSuccess && !isError && 'bg-muted text-muted-foreground',
          )}>
            {part.state}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          {part.input && Object.keys(part.input).length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Input</p>
              <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Output</p>
              <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {part.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShareDiffView({ diff }: { diff: ShareFileDiff }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-mono text-xs truncate">{diff.file}</span>
      </button>
      {expanded && (
        <div className="border-t border-border/50 max-h-96 overflow-y-auto">
          <pre className="text-[11px] font-mono p-3 whitespace-pre-wrap break-words">
            {diff.after || diff.before || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  );
}
