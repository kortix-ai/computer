import { eq, and } from 'drizzle-orm';
import { db } from '../shared/db';
import { sandboxes, integrations, sandboxIntegrations } from '@kortix/db';

export async function insertIntegration(data: {
  accountId: string;
  app: string;
  appName?: string;
  providerName: string;
  providerAccountId: string;
  label?: string;
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
      label: data.label ?? null,
      scopes: data.scopes ?? [],
      metadata: data.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [integrations.accountId, integrations.providerAccountId],
      set: {
        appName: data.appName ?? null,
        label: data.label ?? undefined,
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

export async function updateIntegrationLabel(integrationId: string, label: string) {
  const [row] = await db
    .update(integrations)
    .set({ label, updatedAt: new Date() })
    .where(eq(integrations.integrationId, integrationId))
    .returning();
  return row ?? null;
}

export async function getSandboxAppConflict(sandboxId: string, integrationId: string, app: string) {
  const [row] = await db
    .select({
      integrationId: integrations.integrationId,
      label: integrations.label,
      appName: integrations.appName,
    })
    .from(sandboxIntegrations)
    .innerJoin(integrations, eq(sandboxIntegrations.integrationId, integrations.integrationId))
    .where(
      and(
        eq(sandboxIntegrations.sandboxId, sandboxId),
        eq(integrations.app, app),
      ),
    )
    .limit(1);

  if (!row || row.integrationId === integrationId) return null;
  return row;
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

export async function listSandboxIntegrations(sandboxId: string, _accountId?: string) {
  const rows = await db
    .select({
      id: sandboxIntegrations.id,
      sandboxId: sandboxIntegrations.sandboxId,
      integrationId: sandboxIntegrations.integrationId,
      grantedAt: sandboxIntegrations.grantedAt,
      integration: {
        integrationId: integrations.integrationId,
        app: integrations.app,
        appName: integrations.appName,
        label: integrations.label,
        status: integrations.status,
        providerName: integrations.providerName,
        providerAccountId: integrations.providerAccountId,
      },
    })
    .from(sandboxIntegrations)
    .innerJoin(integrations, eq(sandboxIntegrations.integrationId, integrations.integrationId))
    .where(
      and(
        eq(sandboxIntegrations.sandboxId, sandboxId),
        eq(integrations.status, 'active'),
      ),
    );
  return rows;
}

export async function hasSandboxIntegration(sandboxId: string, app: string, _accountId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sandboxIntegrations.id })
    .from(sandboxIntegrations)
    .innerJoin(integrations, eq(sandboxIntegrations.integrationId, integrations.integrationId))
    .where(
      and(
        eq(sandboxIntegrations.sandboxId, sandboxId),
        eq(integrations.app, app),
        eq(integrations.status, 'active'),
      ),
    )
    .limit(1);
  return !!row;
}

export async function getIntegrationForSandbox(sandboxId: string, app: string, _accountId?: string) {
  const [row] = await db
    .select({
      integrationId: integrations.integrationId,
      accountId: integrations.accountId,
      app: integrations.app,
      appName: integrations.appName,
      label: integrations.label,
      providerName: integrations.providerName,
      providerAccountId: integrations.providerAccountId,
      status: integrations.status,
      scopes: integrations.scopes,
      metadata: integrations.metadata,
      connectedAt: integrations.connectedAt,
      lastUsedAt: integrations.lastUsedAt,
      createdAt: integrations.createdAt,
      updatedAt: integrations.updatedAt,
    })
    .from(sandboxIntegrations)
    .innerJoin(integrations, eq(sandboxIntegrations.integrationId, integrations.integrationId))
    .where(
      and(
        eq(sandboxIntegrations.sandboxId, sandboxId),
        eq(integrations.app, app),
        eq(integrations.status, 'active'),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getLinkedSandboxes(integrationId: string) {
  const rows = await db
    .select({
      sandboxId: sandboxes.sandboxId,
      name: sandboxes.name,
      status: sandboxes.status,
      grantedAt: sandboxIntegrations.grantedAt,
    })
    .from(sandboxIntegrations)
    .innerJoin(sandboxes, eq(sandboxIntegrations.sandboxId, sandboxes.sandboxId))
    .where(eq(sandboxIntegrations.integrationId, integrationId));
  return rows;
}

export async function getAppSandboxLinks(accountId: string, app: string) {
  const rows = await db
    .select({
      sandboxId: sandboxIntegrations.sandboxId,
      sandboxName: sandboxes.name,
      integrationId: integrations.integrationId,
      label: integrations.label,
    })
    .from(sandboxIntegrations)
    .innerJoin(integrations, eq(sandboxIntegrations.integrationId, integrations.integrationId))
    .innerJoin(sandboxes, eq(sandboxIntegrations.sandboxId, sandboxes.sandboxId))
    .where(
      and(
        eq(integrations.accountId, accountId),
        eq(integrations.app, app),
        eq(integrations.status, 'active'),
      ),
    );
  return rows;
}

export async function verifySandboxOwnership(sandboxId: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ sandboxId: sandboxes.sandboxId })
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, accountId)))
    .limit(1);
  return !!row;
}
