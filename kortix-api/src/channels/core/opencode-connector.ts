import type { SandboxTarget } from '../types';
import { getProvider } from '../../platform/providers';
import type { ProviderName } from '../../platform/providers';
import { config } from '../../config';
import { db } from '../../shared/db';
import { sandboxes } from '@kortix/db';
import { eq } from 'drizzle-orm';

export interface ResolvedEndpoint {
  url: string;
  headers: Record<string, string>;
}

export async function resolveDirectEndpoint(target: SandboxTarget): Promise<ResolvedEndpoint> {
  // Use the provider interface's resolveEndpoint() — works for all providers
  if (target.externalId && target.provider) {
    try {
      const provider = getProvider(target.provider as ProviderName);
      return await provider.resolveEndpoint(target.externalId);
    } catch (err) {
      console.warn(`[OPENCODE-CONNECTOR] Failed to resolve via provider, falling back to baseUrl:`, err);
    }
  }

  // Fallback: use the stored baseUrl with service key auth
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.INTERNAL_SERVICE_KEY) {
    headers['Authorization'] = `Bearer ${config.INTERNAL_SERVICE_KEY}`;
  }
  return { url: target.baseUrl.replace(/\/$/, ''), headers };
}

export async function wakeUpSandbox(target: SandboxTarget): Promise<void> {
  if (!target.externalId) {
    throw new Error('Cannot wake sandbox: no external ID');
  }
  const provider = getProvider(target.provider as ProviderName);
  await provider.start(target.externalId);
}

export async function resolveSandboxTarget(sandboxId: string): Promise<SandboxTarget | null> {
  const [sandbox] = await db.select().from(sandboxes).where(eq(sandboxes.sandboxId, sandboxId));
  if (!sandbox) return null;
  return {
    sandboxId: sandbox.sandboxId,
    baseUrl: sandbox.baseUrl,
    provider: sandbox.provider,
    externalId: sandbox.externalId,
  };
}
