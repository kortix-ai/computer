import { eq, and, ne } from 'drizzle-orm';
import { sandboxes } from '@kortix/db';
import { db } from '../shared/db';
import { getSandboxBaseUrl } from '../daytona-proxy/routes/local-preview';
import { config } from '../config';
import type { TransformedSession, TransformedMessage, TransformedPart } from './types';

export async function writeSessionToSandbox(
  sandboxExternalId: string,
  session: TransformedSession,
  messages: TransformedMessage[],
  parts: TransformedPart[],
): Promise<string> {
  const { baseUrl, serviceKey } = await resolveSandboxEndpoint(sandboxExternalId);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(serviceKey ? { 'Authorization': `Bearer ${serviceKey}` } : {}),
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

async function resolveSandboxEndpoint(externalId: string): Promise<{ baseUrl: string; serviceKey: string }> {
  if (!config.SANDBOX_NETWORK) {
    return {
      baseUrl: getSandboxBaseUrl(externalId),
      serviceKey: config.INTERNAL_SERVICE_KEY || '',
    };
  }

  const [sandbox] = await db
    .select({ baseUrl: sandboxes.baseUrl, config: sandboxes.config })
    .from(sandboxes)
    .where(
      and(
        eq(sandboxes.externalId, externalId),
        ne(sandboxes.status, 'pooled'),
      ),
    )
    .limit(1);

  if (!sandbox) {
    throw new Error(`Sandbox not found: ${externalId}`);
  }

  const configJson = (sandbox.config || {}) as Record<string, unknown>;
  const serviceKey = typeof configJson.serviceKey === 'string' ? configJson.serviceKey : '';
  const baseUrl = sandbox.baseUrl || '';

  if (!baseUrl) {
    throw new Error(`Sandbox has no baseUrl: ${externalId}`);
  }

  return { baseUrl, serviceKey };
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
  if (msg.role === 'user') {
    return `INSERT OR IGNORE INTO message (id, session_id, role, created_at, format, summary, agent, model, system, tools, variant) VALUES (${esc(msg.id)}, ${esc(msg.sessionID)}, ${esc('user')}, ${msg.createdAt}, ${esc('{}')}, ${esc('{}')}, ${esc('kortix')}, ${esc(JSON.stringify({ providerID: 'anthropic', modelID: 'claude-sonnet-4-20250514' }))}, ${esc('')}, ${esc('{}')}, ${esc('')});`;
  }

  return `INSERT OR IGNORE INTO message (id, session_id, role, created_at, completed_at, error, parent_id, model_id, provider_id, mode, agent, path_cwd, path_root, summary, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, structured, variant, finish) VALUES (${esc(msg.id)}, ${esc(msg.sessionID)}, ${esc('assistant')}, ${msg.createdAt}, ${msg.createdAt}, ${esc('{}')}, ${esc(msg.parentID || '')}, ${esc('claude-sonnet-4-20250514')}, ${esc('anthropic')}, ${esc('default')}, ${esc('kortix')}, ${esc('/home/daytona')}, ${esc('/home/daytona')}, 0, 0, 0, 0, 0, 0, 0, ${esc('')}, ${esc('')}, ${esc('end_turn')});`;
}

function buildPartInsert(part: TransformedPart): string {
  if (part.type === 'text') {
    return `INSERT OR IGNORE INTO part (id, session_id, message_id, type, text, synthetic, ignored, time_start, time_end, metadata) VALUES (${esc(part.id)}, ${esc(part.sessionID)}, ${esc(part.messageID)}, 'text', ${esc(part.data.text as string)}, 0, 0, ${(part.data.time as any)?.start || 0}, ${(part.data.time as any)?.end || 0}, '{}');`;
  }

  if (part.type === 'tool') {
    const state = part.data.state as Record<string, unknown>;
    return `INSERT OR IGNORE INTO part (id, session_id, message_id, type, call_id, tool, state, metadata) VALUES (${esc(part.id)}, ${esc(part.sessionID)}, ${esc(part.messageID)}, 'tool', ${esc(part.data.callID as string)}, ${esc(part.data.tool as string)}, ${esc(JSON.stringify(state))}, '{}');`;
  }

  if (part.type === 'reasoning') {
    return `INSERT OR IGNORE INTO part (id, session_id, message_id, type, text, time_start, time_end, metadata) VALUES (${esc(part.id)}, ${esc(part.sessionID)}, ${esc(part.messageID)}, 'reasoning', ${esc(part.data.text as string)}, ${(part.data.time as any)?.start || 0}, ${(part.data.time as any)?.end || 0}, '{}');`;
  }

  return '';
}

function esc(value: string): string {
  if (value === null || value === undefined) return "''";
  return `'${String(value).replace(/'/g, "''")}'`;
}
