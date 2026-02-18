import { eq, and } from 'drizzle-orm';
import { db } from '../shared/db';
import { sandboxes, integrations, sandboxIntegrations } from '@kortix/db';

export async function insertIntegration(data: {
  accountId: string;
  app: string;
  appName?: string;
  providerName: string;
  providerAccountId: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(integrations)
    .values({
      accountId: data.accountId,
      app: data.app,
      appName: data.appName ?? null,
      providerName: data.providerName,
      providerAccountId: data.providerAccountId,
      scopes: data.scopes ?? [],
      metadata: data.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [integrations.accountId, integrations.app, integrations.providerName],
      set: {
        providerAccountId: data.providerAccountId,
        appName: data.appName ?? null,
        scopes: data.scopes ?? [],
        status: 'active',
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function listIntegrationsByAccount(accountId: string) {
  return db.select().from(integrations).where(eq(integrations.accountId, accountId));
}

export async function getIntegrationById(integrationId: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.integrationId, integrationId))
    .limit(1);
  return row ?? null;
}

export async function getIntegrationByApp(accountId: string, app: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.accountId, accountId), eq(integrations.app, app)))
    .limit(1);
  return row ?? null;
}

export async function deleteIntegration(integrationId: string) {
  await db.delete(integrations).where(eq(integrations.integrationId, integrationId));
}

export async function updateIntegrationLastUsed(integrationId: string) {
  await db
    .update(integrations)
    .set({ lastUsedAt: new Date() })
    .where(eq(integrations.integrationId, integrationId));
}

export async function linkSandboxIntegration(sandboxId: string, integrationId: string) {
  const [row] = await db
    .insert(sandboxIntegrations)
    .values({ sandboxId, integrationId })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function unlinkSandboxIntegration(sandboxId: string, integrationId: string) {
  await db
    .delete(sandboxIntegrations)
    .where(
      and(
        eq(sandboxIntegrations.sandboxId, sandboxId),
        eq(sandboxIntegrations.integrationId, integrationId),
      ),
    );
}

export async function listSandboxIntegrations(_sandboxId: string, accountId?: string) {
  if (!accountId) return [];
  const rows = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.accountId, accountId), eq(integrations.status, 'active')));
  return rows.map(r => ({
    id: null,
    sandboxId: _sandboxId,
    integrationId: r.integrationId,
    grantedAt: null,
    integration: {
      integrationId: r.integrationId,
      app: r.app,
      appName: r.appName,
      status: r.status,
      providerName: r.providerName,
    },
  }));
}

export async function hasSandboxIntegration(_sandboxId: string, app: string, accountId?: string): Promise<boolean> {
  if (!accountId) return false;
  const [row] = await db
    .select({ id: integrations.integrationId })
    .from(integrations)
    .where(
      and(
        eq(integrations.accountId, accountId),
        eq(integrations.app, app),
        eq(integrations.status, 'active'),
      ),
    )
    .limit(1);
  return !!row;
}

export async function getIntegrationForSandbox(_sandboxId: string, app: string, accountId?: string) {
  if (!accountId) return null;
  const [row] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.accountId, accountId),
        eq(integrations.app, app),
        eq(integrations.status, 'active'),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function verifySandboxOwnership(sandboxId: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ sandboxId: sandboxes.sandboxId })
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, accountId)))
    .limit(1);
  return !!row;
}
