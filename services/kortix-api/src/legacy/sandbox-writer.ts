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
): Promise<void> {
  const { baseUrl, serviceKey } = await resolveSandboxEndpoint(sandboxExternalId);
  const sql = buildMigrationSQL(session, messages, parts);

  const response = await fetch(`${baseUrl}/legacy/migrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ sql, sessionId: session.id }),
    signal: AbortSignal.timeout(30_000),
  });

  const result = await response.json().catch(() => null) as any;

  if (!response.ok) {
    throw new Error(`Migration request failed (${response.status}): ${JSON.stringify(result)}`);
  }

  console.log('[legacy] Migration result:', JSON.stringify(result));
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
  session: TransformedSession,
  messages: TransformedMessage[],
  parts: TransformedPart[],
): string {
  const lines: string[] = [];

  lines.push('BEGIN TRANSACTION;');
  lines.push(buildSessionInsert(session));

  for (const msg of messages) {
    lines.push(buildMessageInsert(msg));
  }

  for (const part of parts) {
    lines.push(buildPartInsert(part));
  }

  lines.push('COMMIT;');

  return lines.join('\n');
}

function buildSessionInsert(session: TransformedSession): string {
  return `INSERT OR IGNORE INTO session (id, slug, project_id, workspace_id, directory, parent_id, title, version, created_at, updated_at, summary, share, permission, revert) VALUES (${esc(session.id)}, ${esc(session.id.slice(4, 12))}, ${esc('default')}, ${esc('')}, ${esc('/home/daytona')}, ${esc('')}, ${esc(session.title)}, ${esc('0.0.0')}, ${session.createdAt}, ${session.updatedAt}, ${esc('{}')}, ${esc('{}')}, ${esc('{}')}, ${esc('{}')});`;
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
