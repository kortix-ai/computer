/**
 * Daytona sandbox provider.
 *
 * Creates sandboxes in Daytona Cloud from a pre-built snapshot.
 * Extracted from the original account.ts provisioning logic.
 */

import { getDaytona } from '../lib/daytona';
import { config } from '../config';
import { generateSandboxToken } from '../lib/token';
import type {
  SandboxProvider,
  ProviderName,
  CreateSandboxOpts,
  ProvisionResult,
  SandboxStatus,
} from './index';

export class DaytonaProvider implements SandboxProvider {
  readonly name: ProviderName = 'daytona';

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    const snapshot = config.DAYTONA_SNAPSHOT;
    if (!snapshot) {
      throw new Error('DAYTONA_SNAPSHOT is not configured — set it to the snapshot name (e.g. kortix-sandbox-v0.4.1)');
    }

    const authToken = generateSandboxToken();
    const daytona = getDaytona();

    const daytonaSandbox = await daytona.create(
      {
        snapshot,
        envVars: {
          KORTIX_API_URL: config.KORTIX_URL,
          KORTIX_TOKEN: authToken,
          ENV_MODE: 'cloud',
          ...opts.envVars,
        },
        autoStopInterval: 15,
        autoArchiveInterval: 30,
        public: false,
      },
      { timeout: 300 },
    );

    const externalId = daytonaSandbox.id;
    const baseUrl = `https://kortix.cloud/${externalId}/8000`;

    return {
      externalId,
      baseUrl,
      metadata: {
        provisionedBy: opts.userId,
        daytonaSandboxId: externalId,
        authToken,
        snapshot,
      },
    };
  }

  async start(externalId: string): Promise<void> {
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    await sandbox.start();
  }

  async stop(externalId: string): Promise<void> {
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    await sandbox.stop();
  }

  async remove(externalId: string): Promise<void> {
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    await daytona.delete(sandbox);
  }

  async getStatus(externalId: string): Promise<SandboxStatus> {
    try {
      const daytona = getDaytona();
      const sandbox = await daytona.get(externalId);
      const state = String(sandbox.state ?? '').toLowerCase();
      if (state.includes('start') || state.includes('running') || state.includes('active')) return 'running';
      if (state.includes('stop') || state.includes('archive')) return 'stopped';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
