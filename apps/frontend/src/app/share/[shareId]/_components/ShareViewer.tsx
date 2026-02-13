'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { KortixLoader } from '@/components/ui/kortix-loader';
import {
  AlertTriangle,
  Copy,
  Check,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

// ============================================================================
// Types
// ============================================================================

interface SessionInfo {
  id: string;
  title: string;
  version?: string;
  time: { created: number; updated?: number };
  share?: { url: string };
}

interface MessagePart {
  id: string;
  type: string;
  text?: string;
  content?: any;
  time?: { created: number; updated?: number };
}

interface MessageWithParts {
  info: {
    id: string;
    sessionID: string;
    role: 'user' | 'assistant';
    time: { created: number; updated?: number };
  };
  parts: MessagePart[];
}

interface ShareData {
  session: SessionInfo;
  messages: MessageWithParts[];
}

// ============================================================================
// Data fetching — uses the standard OpenCode session & message APIs
// ============================================================================

const OPENCODE_BASE_URL = (process.env.NEXT_PUBLIC_OPENCODE_URL || 'http://localhost:4096').replace(/\/+$/, '');

/**
 * Resolve a share ID (e.g. "t9RGzhWU") to a session, then fetch its messages.
 *
 * The share ID is the last 8 characters of the session ID.
 * We list all sessions, find the one whose ID ends with the shareId
 * and has an active share, then fetch its messages.
 */
async function fetchShareData(shareId: string): Promise<ShareData> {
  // 1. List sessions to find the one matching this share ID
  const sessionsRes = await fetch(`${OPENCODE_BASE_URL}/session`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!sessionsRes.ok) {
    throw new Error('Failed to load sessions');
  }

  const contentType = sessionsRes.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Unexpected response from server');
  }

  const sessions: SessionInfo[] = await sessionsRes.json();

  // Find the session whose ID ends with the shareId and has sharing enabled
  const session = sessions.find(
    (s) => s.id.endsWith(shareId) && s.share?.url
  );
  if (!session) {
    throw new Error('Share not found');
  }

  // 2. Fetch messages for this session
  const messagesRes = await fetch(`${OPENCODE_BASE_URL}/session/${session.id}/message`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!messagesRes.ok) {
    throw new Error('Failed to load messages');
  }

  const msgContentType = messagesRes.headers.get('content-type') || '';
  if (!msgContentType.includes('application/json')) {
    throw new Error('Unexpected response from server');
  }

  const messages: MessageWithParts[] = await messagesRes.json();

  return { session, messages };
}

// ============================================================================
// Share Viewer Component
// ============================================================================

export function ShareViewer({ shareId }: { shareId: string }) {
  const [data, setData] = useState<ShareData | null>(null);
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

  // Extract only text parts from messages
  const parsed = useMemo(() => {
    if (!data) return null;

    const { session, messages } = data;

    // Sort messages by creation time
    const sortedMessages = [...messages].sort(
      (a, b) => a.info.time.created - b.info.time.created
    );

    // Build a parts map with only text parts
    const textPartsByMessage: Record<string, MessagePart[]> = {};
    for (const msg of sortedMessages) {
      const textParts = msg.parts.filter((p) => p.type === 'text');
      if (textParts.length > 0) {
        textPartsByMessage[msg.info.id] = textParts;
      }
    }

    return { session, messages: sortedMessages, textPartsByMessage };
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

  const { session, messages, textPartsByMessage } = parsed;
  const userMessages = messages.filter((m) => m.info.role === 'user');

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

          {/* Message turns — chat content only */}
          <div className="space-y-8">
            {messages.map((msg) => {
              const parts = textPartsByMessage[msg.info.id];
              if (!parts || parts.length === 0) return null;
              return (
                <ShareMessageView
                  key={msg.info.id}
                  role={msg.info.role}
                  parts={parts}
                />
              );
            })}
          </div>

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
  role,
  parts,
}: {
  role: 'user' | 'assistant';
  parts: MessagePart[];
}) {
  const text = parts.map((p) => p.text || p.content?.text || '').join('\n').trim();
  if (!text) return null;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-card border px-4 py-3">
          <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
        </div>
      </div>
    );
  }

  // Assistant message — only text content
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

      {/* Text content only */}
      {parts.map((part) => {
        const partText = part.text || part.content?.text || '';
        if (!partText.trim()) return null;
        return (
          <div key={part.id} className="break-words overflow-hidden">
            <UnifiedMarkdown content={partText} />
          </div>
        );
      })}
    </div>
  );
}
