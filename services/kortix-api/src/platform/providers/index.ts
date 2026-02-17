/**
 * Sandbox Provider abstraction.
 *
 * Both Daytona and Local Docker implement the same interface so the
 * platform service can provision sandboxes without caring about the backend.
 */

import { config } from '../../config';
import { DaytonaProvider } from './daytona';
import { LocalDockerProvider } from './local-docker';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProviderName = 'daytona' | 'local_docker';

export interface CreateSandboxOpts {
  accountId: string;
  userId: string;
  name: string;
  envVars?: Record<string, string>;
}

export interface ProvisionResult {
  externalId: string;
  baseUrl: string;
  metadata: Record<string, unknown>;
}

export type SandboxStatus = 'running' | 'stopped' | 'removed' | 'unknown';

/** Resolved endpoint for making direct HTTP calls to a sandbox. */
export interface ResolvedEndpoint {
  url: string;
  headers: Record<string, string>;
}

export interface SandboxProvider {
  readonly name: ProviderName;
  create(opts: CreateSandboxOpts): Promise<ProvisionResult>;
  start(externalId: string): Promise<void>;
  stop(externalId: string): Promise<void>;
  remove(externalId: string): Promise<void>;
  getStatus(externalId: string): Promise<SandboxStatus>;

  /**
   * Resolve the direct HTTP endpoint for a sandbox.
   * Returns a URL + auth headers that can be used to call the sandbox's
   * Kortix Master / OpenCode API without going through the preview proxy.
   */
  resolveEndpoint(externalId: string): Promise<ResolvedEndpoint>;

  /**
   * Ensure the sandbox is running (wake it if sleeping).
   * Idempotent — if already running, returns immediately.
   */
  ensureRunning(externalId: string): Promise<void>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

const providers = new Map<ProviderName, SandboxProvider>();

export function getProvider(name: ProviderName): SandboxProvider {
  const existing = providers.get(name);
  if (existing) return existing;

  let provider: SandboxProvider;

  switch (name) {
    case 'daytona':
      if (!config.isDaytonaEnabled()) {
        throw new Error('Daytona provider is not configured. Set DAYTONA_API_KEY.');
      }
      provider = new DaytonaProvider();
      break;

    case 'local_docker':
      if (!config.isLocalDockerEnabled()) {
        throw new Error('Local Docker provider is not enabled. Set SANDBOX_PROVIDER=local_docker or auto.');
      }
      provider = new LocalDockerProvider();
      break;

    default:
      throw new Error(`Unknown sandbox provider: ${name}`);
  }

  providers.set(name, provider);
  return provider;
}

/**
 * Get the default provider based on config.
 * In 'auto' mode, prefers Daytona if configured, else falls back to local_docker.
 */
export function getDefaultProviderName(): ProviderName {
  if (config.SANDBOX_PROVIDER === 'daytona') return 'daytona';
  if (config.SANDBOX_PROVIDER === 'local_docker') return 'local_docker';
  // auto — prefer daytona if configured
  return config.isDaytonaEnabled() ? 'daytona' : 'local_docker';
}

/**
 * List which providers are available.
 */
export function getAvailableProviders(): ProviderName[] {
  const available: ProviderName[] = [];
  if (config.isDaytonaEnabled()) available.push('daytona');
  if (config.isLocalDockerEnabled()) available.push('local_docker');
  return available;
}
