import { eq, and, sql } from 'drizzle-orm';
import { db } from '../shared/db';
import { sandboxes } from '@kortix/db';
import postgres from 'postgres';

// Direct SQL connection for integrations queries
// (Drizzle ORM hangs on the new integrations tables — likely a schema/pool issue)
function getDirectSql() {
  return postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
}

function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

export async function insertIntegration(data: {
  accountId: string;
  app: string;
  appName?: string;
  providerName: string;
  providerAccountId: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}) {
  const directSql = getDirectSql();
  try {
    const scopes = JSON.stringify(data.scopes || []);
    const metadata = JSON.stringify(data.metadata || {});
    const [row] = await directSql`
      INSERT INTO kortix.integrations (account_id, app, app_name, provider_name, provider_account_id, scopes, metadata)
      VALUES (${data.accountId}, ${data.app}, ${data.appName || null}, ${data.providerName}, ${data.providerAccountId}, ${scopes}::jsonb, ${metadata}::jsonb)
      ON CONFLICT (account_id, app, provider_name) DO UPDATE SET
        provider_account_id = ${data.providerAccountId},
        app_name = ${data.appName || null},
        scopes = ${scopes}::jsonb,
        status = 'active',
        updated_at = now()
      RETURNING *
    `;
    return toCamel(row);
  } finally {
    await directSql.end();
  }
}

export async function listIntegrationsByAccount(accountId: string) {
  const directSql = getDirectSql();
  try {
    const result = await directSql`SELECT * FROM kortix.integrations WHERE account_id = ${accountId}`;
    return result.map(r => toCamel(r));
  } finally {
    await directSql.end();
  }
}

export async function getIntegrationById(integrationId: string) {
  const directSql = getDirectSql();
  try {
    const [row] = await directSql`SELECT * FROM kortix.integrations WHERE integration_id = ${integrationId} LIMIT 1`;
    return row ? toCamel(row) : null;
  } finally {
    await directSql.end();
  }
}

export async function getIntegrationByApp(accountId: string, app: string) {
  const directSql = getDirectSql();
  try {
    const [row] = await directSql`SELECT * FROM kortix.integrations WHERE account_id = ${accountId} AND app = ${app} LIMIT 1`;
    return row ? toCamel(row) : null;
  } finally {
    await directSql.end();
  }
}

export async function deleteIntegration(integrationId: string) {
  const directSql = getDirectSql();
  try {
    await directSql`DELETE FROM kortix.integrations WHERE integration_id = ${integrationId}`;
  } finally {
    await directSql.end();
  }
}

export async function updateIntegrationLastUsed(integrationId: string) {
  const directSql = getDirectSql();
  try {
    await directSql`UPDATE kortix.integrations SET last_used_at = now() WHERE integration_id = ${integrationId}`;
  } finally {
    await directSql.end();
  }
}

export async function linkSandboxIntegration(sandboxId: string, integrationId: string) {
  const directSql = getDirectSql();
  try {
    const [row] = await directSql`
      INSERT INTO kortix.sandbox_integrations (sandbox_id, integration_id)
      VALUES (${sandboxId}, ${integrationId})
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    return row ? toCamel(row) : null;
  } finally {
    await directSql.end();
  }
}

export async function unlinkSandboxIntegration(sandboxId: string, integrationId: string) {
  const directSql = getDirectSql();
  try {
    await directSql`DELETE FROM kortix.sandbox_integrations WHERE sandbox_id = ${sandboxId} AND integration_id = ${integrationId}`;
  } finally {
    await directSql.end();
  }
}

export async function listSandboxIntegrations(sandboxId: string) {
  const directSql = getDirectSql();
  try {
    const rows = await directSql`
      SELECT si.id, si.sandbox_id, si.integration_id, si.granted_at,
             i.integration_id as i_integration_id, i.app, i.app_name, i.status, i.provider_name
      FROM kortix.sandbox_integrations si
      INNER JOIN kortix.integrations i ON si.integration_id = i.integration_id
      WHERE si.sandbox_id = ${sandboxId}
    `;
    return rows.map(r => ({
      id: r.id,
      sandboxId: r.sandbox_id,
      integrationId: r.integration_id,
      grantedAt: r.granted_at,
      integration: {
        integrationId: r.i_integration_id,
        app: r.app,
        appName: r.app_name,
        status: r.status,
        providerName: r.provider_name,
      },
    }));
  } finally {
    await directSql.end();
  }
}

export async function hasSandboxIntegration(sandboxId: string, app: string): Promise<boolean> {
  const directSql = getDirectSql();
  try {
    const rows = await directSql`
      SELECT si.id FROM kortix.sandbox_integrations si
      INNER JOIN kortix.integrations i ON si.integration_id = i.integration_id
      WHERE si.sandbox_id = ${sandboxId} AND i.app = ${app} AND i.status = 'active'
      LIMIT 1
    `;
    return rows.length > 0;
  } finally {
    await directSql.end();
  }
}

export async function getIntegrationForSandbox(sandboxId: string, app: string) {
  const directSql = getDirectSql();
  try {
    const [row] = await directSql`
      SELECT i.integration_id, i.account_id, i.app, i.provider_name, i.provider_account_id, i.status
      FROM kortix.sandbox_integrations si
      INNER JOIN kortix.integrations i ON si.integration_id = i.integration_id
      WHERE si.sandbox_id = ${sandboxId} AND i.app = ${app} AND i.status = 'active'
      LIMIT 1
    `;
    return row ? toCamel(row) : null;
  } finally {
    await directSql.end();
  }
}

export async function verifySandboxOwnership(sandboxId: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ sandboxId: sandboxes.sandboxId })
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, accountId)))
    .limit(1);
  return !!row;
}
