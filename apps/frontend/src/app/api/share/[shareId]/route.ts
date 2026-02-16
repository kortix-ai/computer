import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Server-side API route for fetching shared session data.
//
// The share viewer cannot call the OpenCode server directly because it runs
// inside user sandboxes (not publicly accessible). This route:
//   1. Looks up the thread in Supabase to find the owning sandbox
//   2. Gets a Daytona preview URL for the sandbox
//   3. Proxies the OpenCode session & message APIs through it
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DAYTONA_API_URL = process.env.DAYTONA_SERVER_URL || process.env.DAYTONA_API_URL || 'https://app.daytona.io/api';
const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY!;

// Port where OpenCode (via kortix-master) listens inside the sandbox
const OPENCODE_PORT = 8000;

// In-memory cache for Daytona preview links (TTL: 5 minutes)
interface PreviewLinkCache {
  url: string;
  token: string | null;
  expiresAt: number;
}
const previewCache = new Map<string, PreviewLinkCache>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Supabase admin client (service role bypasses RLS) ──

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ── Look up sandbox external ID from a thread/share ID ──

async function lookupSandboxExternalId(shareId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // The shareId is the thread_id (or its suffix). Try exact match first.
  // Chain: threads.thread_id -> threads.account_id -> kortix.sandboxes.account_id -> external_id
  //
  // We use two queries:
  // 1. Look up the thread to get account_id (and verify is_public)
  // 2. Look up the active sandbox for that account

  // Step 1: Find the thread
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('thread_id, account_id, is_public')
    .eq('thread_id', shareId)
    .single();

  if (threadError || !thread) {
    // shareId might be a suffix; not supported in this path
    console.error('[SHARE API] Thread not found:', shareId, threadError?.message);
    return null;
  }

  if (!thread.is_public) {
    console.warn('[SHARE API] Thread is not public:', shareId);
    return null;
  }

  if (!thread.account_id) {
    console.error('[SHARE API] Thread has no account_id:', shareId);
    return null;
  }

  // Step 2: Find the active sandbox for this account (in the 'kortix' schema)
  const { data: sandbox, error: sandboxError } = await supabase
    .schema('kortix')
    .from('sandboxes')
    .select('external_id')
    .eq('account_id', thread.account_id)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (sandboxError || !sandbox?.external_id) {
    console.error('[SHARE API] No active sandbox found for account:', thread.account_id, sandboxError?.message);
    return null;
  }

  return sandbox.external_id;
}

// ── Get Daytona preview URL for a sandbox ──

async function getDaytonaPreviewUrl(
  sandboxId: string,
  port: number
): Promise<{ url: string; token: string | null }> {
  const cacheKey = `${sandboxId}:${port}`;
  const cached = previewCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { url: cached.url, token: cached.token };
  }

  if (!DAYTONA_API_KEY) {
    throw new Error('Missing DAYTONA_API_KEY');
  }

  const apiUrl = `${DAYTONA_API_URL}/sandbox/${encodeURIComponent(sandboxId)}/ports/${port}/preview-url`;
  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${DAYTONA_API_KEY}`,
      'X-Daytona-Source': 'kortix-frontend',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daytona preview URL failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const url = data.url || String(data);
  const token = data.token || null;

  previewCache.set(cacheKey, { url, token, expiresAt: Date.now() + CACHE_TTL_MS });
  return { url, token };
}

// ── Proxy a request to the OpenCode server through Daytona ──

async function proxyToOpenCode(
  sandboxExternalId: string,
  path: string
): Promise<Response> {
  const { url: previewUrl, token } = await getDaytonaPreviewUrl(sandboxExternalId, OPENCODE_PORT);

  const targetUrl = previewUrl.replace(/\/$/, '') + path;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Daytona-Skip-Preview-Warning': 'true',
    'X-Daytona-Disable-CORS': 'true',
  };
  if (token) {
    headers['X-Daytona-Preview-Token'] = token;
  }

  const upstream = await fetch(targetUrl, { headers });
  return upstream;
}

// ============================================================================
// GET /api/share/[shareId]
//
// Returns { session, messages } for the shared session, proxied from the
// OpenCode server running inside the owning user's sandbox.
// ============================================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params;

    if (!shareId) {
      return NextResponse.json({ error: 'Missing shareId' }, { status: 400 });
    }

    // 1. Look up the sandbox for this thread
    const externalId = await lookupSandboxExternalId(shareId);
    if (!externalId) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }

    // 2. Fetch all sessions from the OpenCode server
    const sessionsRes = await proxyToOpenCode(externalId, '/session');
    if (!sessionsRes.ok) {
      console.error('[SHARE API] Failed to fetch sessions:', sessionsRes.status);
      return NextResponse.json({ error: 'Failed to load sessions' }, { status: 502 });
    }

    const contentType = sessionsRes.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unexpected response from server' }, { status: 502 });
    }

    const sessions = await sessionsRes.json();
    const session = (sessions as any[]).find(
      (s) => s.id.endsWith(shareId) && s.share?.url
    );

    if (!session) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }

    // 3. Fetch messages for the session
    const messagesRes = await proxyToOpenCode(
      externalId,
      `/session/${session.id}/message`
    );
    if (!messagesRes.ok) {
      console.error('[SHARE API] Failed to fetch messages:', messagesRes.status);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 502 });
    }

    const messages = await messagesRes.json();

    // 4. Return combined data
    return NextResponse.json(
      { session, messages },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('[SHARE API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
