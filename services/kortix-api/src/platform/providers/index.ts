/**
 * Sandbox Provider abstraction.
 *
 * Both Daytona and Local Docker implement the same interface so the
 * platform service can provision sandboxes without caring about the backend.
 */

import { config } from '../../config';
import { DaytonaProvider } from './daytona';
import { LocalDockerProvider } from './local-docker';
import { HetznerProvider } from './hetzner';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProviderName = 'daytona' | 'local_docker' | 'hetzner';
// Re-export from config for convenience — same type
export type { SandboxProviderName } from '../../config';

export interface CreateSandboxOpts {
  accountId: string;
  userId: string;
  name: string;
  envVars?: Record<string, string>;
  hetznerServerType?: 'cpx22' | 'cpx32';
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

  // Verify the requested provider is in the allowed list
  if (!config.ALLOWED_SANDBOX_PROVIDERS.includes(name)) {
    throw new Error(
      `Sandbox provider '${name}' is not allowed. ` +
      `Allowed: ${config.ALLOWED_SANDBOX_PROVIDERS.join(', ')}. ` +
      `Set ALLOWED_SANDBOX_PROVIDERS in your .env.`
    );
  }

  switch (name) {
    case 'daytona':
      if (!config.DAYTONA_API_KEY) {
        throw new Error('Daytona provider is allowed but not configured. Set DAYTONA_API_KEY.');
      }
      provider = new DaytonaProvider();
      break;

    case 'local_docker':
      provider = new LocalDockerProvider();
      break;

    case 'hetzner':
      if (!config.HETZNER_API_KEY) {
        throw new Error('Hetzner provider is allowed but not configured. Set HETZNER_API_KEY.');
      }
      provider = new HetznerProvider();
      break;

    default:
      throw new Error(`Unknown sandbox provider: ${name}`);
  }

  providers.set(name, provider);
  return provider;
}

/**
 * Get the default provider — first entry in ALLOWED_SANDBOX_PROVIDERS.
 */
export function getDefaultProviderName(): ProviderName {
  return config.getDefaultProvider();
}

/**
 * List which providers are allowed and actually configured.
 * A provider must be in ALLOWED_SANDBOX_PROVIDERS AND have its
 * required credentials set (e.g. Daytona needs DAYTONA_API_KEY).
 */
export function getAvailableProviders(): ProviderName[] {
  const available: ProviderName[] = [];
  if (config.isDaytonaEnabled()) available.push('daytona');
  if (config.isLocalDockerEnabled()) available.push('local_docker');
  if (config.isHetznerEnabled()) available.push('hetzner');
  return available;
}
