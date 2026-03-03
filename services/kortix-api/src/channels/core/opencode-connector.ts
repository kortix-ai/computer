import type { SandboxTarget } from '../types';
import { getProvider } from '../../platform/providers';
import type { ProviderName } from '../../platform/providers';
import { getDaytona, isDaytonaConfigured } from '../../shared/daytona';
import { config } from '../../config';
import { db } from '../../shared/db';
import { sandboxes } from '@kortix/db';
import { eq } from 'drizzle-orm';

export interface ResolvedEndpoint {
  url: string;
  headers: Record<string, string>;
}

export async function resolveDirectEndpoint(target: SandboxTarget): Promise<ResolvedEndpoint> {
  if (target.externalId && isDaytonaConfigured()) {
    try {
      const daytona = getDaytona();
      const sandbox = await daytona.get(target.externalId);
      const link = await (sandbox as any).getPreviewLink(8000);
      const url = (link.url || String(link)).replace(/\/$/, '');
      const token = link.token || null;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Daytona-Skip-Preview-Warning': 'true',
        'X-Daytona-Disable-CORS': 'true',
      };
      if (token) {
        headers['X-Daytona-Preview-Token'] = token;
      }

      return { url, headers };
    } catch (err) {
      console.warn(`[OPENCODE-CONNECTOR] Failed to resolve direct URL, falling back to baseUrl:`, err);
    }
  }

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
