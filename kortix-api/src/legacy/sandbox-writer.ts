import { eq, and, ne } from 'drizzle-orm';
import { sandboxes } from '@kortix/db';
import { db } from '../shared/db';
import { getSandboxBaseUrl } from '../daytona-proxy/routes/local-preview';
import { getDaytona, isDaytonaConfigured } from '../shared/daytona';
import { config } from '../config';
import type { TransformedSession, TransformedMessage, TransformedPart } from './types';

export async function writeSessionToSandbox(
  sandboxExternalId: string,
  session: TransformedSession,
  messages: TransformedMessage[],
  parts: TransformedPart[],
): Promise<string> {
  const { baseUrl, serviceKey, previewToken } = await resolveSandboxEndpoint(sandboxExternalId);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(serviceKey ? { 'Authorization': `Bearer ${serviceKey}` } : {}),
    ...(previewToken ? { 'X-Daytona-Preview-Token': previewToken } : {}),
    'X-Daytona-Skip-Preview-Warning': 'true',
  };

  const realSessionId = await createSessionViaOpenCode(baseUrl, headers, session);
  const remapped = remapSessionId(session.id, realSessionId, messages, parts);
  const sql = buildMigrationSQL(remapped.messages, remapped.parts);
  await executeMigrationSQL(baseUrl, headers, sql, realSessionId);

  return realSessionId;
}

async function createSessionViaOpenCode(
  baseUrl: string,
  headers: Record<string, string>,
  session: TransformedSession,
): Promise<string> {
  const res = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: session.title,
      directory: '/home/daytona',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenCode POST /session failed (${res.status}): ${body}`);
  }

  const data = await res.json().catch(() => null) as any;
  const id = data?.id;
  if (!id) {
    throw new Error('OpenCode created session but returned no ID');
  }

  console.log('[legacy] OpenCode session created:', id);
  return id;
}

function remapSessionId(
  oldId: string,
  newId: string,
  messages: TransformedMessage[],
  parts: TransformedPart[],
): { messages: TransformedMessage[]; parts: TransformedPart[] } {
  return {
    messages: messages.map((m) => ({ ...m, sessionID: newId })),
    parts: parts.map((p) => ({ ...p, sessionID: newId })),
  };
}

async function executeMigrationSQL(
  baseUrl: string,
  headers: Record<string, string>,
  sql: string,
  sessionId: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/legacy/migrate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql, sessionId }),
    signal: AbortSignal.timeout(30_000),
  });

  const result = await res.json().catch(() => null) as any;

  if (!res.ok) {
    throw new Error(`Migration SQL failed (${res.status}): ${JSON.stringify(result)}`);
  }

  console.log('[legacy] Migration result:', JSON.stringify(result));

  if (result?.verification && !result.verification.sessionFound) {
    throw new Error('Migration SQL executed but session not found in DB');
  }
}

async function resolveSandboxEndpoint(externalId: string): Promise<{ baseUrl: string; serviceKey: string; previewToken?: string }> {
  try {
    const [sandbox] = await db
      .select({ provider: sandboxes.provider, baseUrl: sandboxes.baseUrl, config: sandboxes.config })
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.externalId, externalId),
          ne(sandboxes.status, 'pooled'),
        ),
      )
      .limit(1);

    if (sandbox) {
      const configJson = (sandbox.config || {}) as Record<string, unknown>;
      const serviceKey = typeof configJson.serviceKey === 'string' ? configJson.serviceKey : '';

      if (sandbox.provider === 'daytona' && isDaytonaConfigured()) {
        try {
          const daytona = getDaytona();
          const dSandbox = await daytona.get(externalId);
          const link = await (dSandbox as any).getPreviewLink(8000);
          const previewUrl = (link.url || String(link)).replace(/\/$/, '');
          const previewToken = link.token || null;
          console.log('[legacy] Using Daytona preview link for', externalId);
          return { baseUrl: previewUrl, serviceKey, previewToken };
        } catch (err) {
          console.warn('[legacy] Daytona preview link failed, using DB baseUrl:', err);
        }
      }

      if (sandbox.baseUrl) {
        return { baseUrl: sandbox.baseUrl, serviceKey };
      }
    }
  } catch (err) {
    console.warn('[legacy] DB lookup failed, falling back to local:', err);
  }

  return {
    baseUrl: getSandboxBaseUrl(externalId),
    serviceKey: config.INTERNAL_SERVICE_KEY || '',
  };
}

function buildMigrationSQL(
  messages: TransformedMessage[],
  parts: TransformedPart[],
): string {
  const lines: string[] = [];
  lines.push('BEGIN TRANSACTION;');

  for (const msg of messages) {
    lines.push(buildMessageInsert(msg));
  }

  for (const part of parts) {
    lines.push(buildPartInsert(part));
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

function buildMessageInsert(msg: TransformedMessage): string {
  let data: Record<string, unknown>;

  if (msg.role === 'user') {
    data = {
      role: 'user',
      time: { created: msg.createdAt },
      summary: { title: '', diffs: [] },
      agent: 'kortix',
      model: { providerID: 'anthropic', modelID: 'claude-sonnet-4-20250514' },
    };
  } else {
    data = {
      role: 'assistant',
      time: { created: msg.createdAt, completed: msg.createdAt },
      error: {},
      parentID: msg.parentID || '',
      modelID: 'claude-sonnet-4-20250514',
      providerID: 'anthropic',
      mode: 'default',
      agent: 'kortix',
      path: { cwd: '/home/daytona', root: '/home/daytona' },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: 'end_turn',
    };
  }

  return `INSERT OR IGNORE INTO message (id, session_id, time_created, time_updated, data) VALUES (${esc(msg.id)}, ${esc(msg.sessionID)}, ${msg.createdAt}, ${msg.createdAt}, ${esc(JSON.stringify(data))});`;
}

function buildPartInsert(part: TransformedPart): string {
  const time = (part.data.time as any) || {};
  const timeCreated = time.start || time.created || 0;
  const timeUpdated = time.end || time.updated || timeCreated;

  const data = { type: part.type, ...part.data };
  return `INSERT OR IGNORE INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (${esc(part.id)}, ${esc(part.messageID)}, ${esc(part.sessionID)}, ${timeCreated}, ${timeUpdated}, ${esc(JSON.stringify(data))});`;
}

function esc(value: string): string {
  if (value === null || value === undefined) return "''";
  return `'${String(value).replace(/'/g, "''")}'`;
}
