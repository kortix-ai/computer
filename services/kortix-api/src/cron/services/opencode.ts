import type { Sandbox } from '@kortix/db';
import { ExecutionError } from '../../errors';
import { getProvider, type ResolvedEndpoint, type ProviderName } from '../../platform/providers';

/**
 * OpenCode client — provider-agnostic.
 *
 * Prompt body format: { parts: [{ type: "text", text: "..." }] }
 * Endpoint: POST /session/:id/prompt_async (NOT /prompt — that serves the web UI)
 * Response is 204 No Content — the actual agent work happens async
 * inside the sandbox via SSE. We just confirm the prompt was accepted.
 */

interface CreateSessionResponse {
  id: string;
  [key: string]: unknown;
}

export interface ExecuteResult {
  sessionId: string;
  response?: unknown;
}

// ─── Retry config ────────────────────────────────────────────────────────────

const MAX_WAKE_RETRIES = 3;
const WAKE_RETRY_DELAYS_MS = [2000, 5000, 8000];

async function resolveEndpoint(sandbox: Sandbox): Promise<ResolvedEndpoint> {
  const providerName = sandbox.provider as ProviderName;
  const externalId = sandbox.externalId;

  if (!externalId) {
    console.warn(`[cron/opencode] Sandbox ${sandbox.sandboxId} has no externalId, using baseUrl`);
    return {
      url: sandbox.baseUrl.replace(/\/$/, ''),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const provider = getProvider(providerName);
  await provider.ensureRunning(externalId);
  return provider.resolveEndpoint(externalId);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries: number = MAX_WAKE_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') throw lastError;

      if (attempt < retries) {
        const delay = WAKE_RETRY_DELAYS_MS[attempt] ?? 5000;
        console.warn(
          `[cron/opencode] Request failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms: ${lastError.message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError!;
}

/** 
 * Build the prompt body in OpenCode's expected format.
 * OpenCode expects: { parts: [{ type: "text", text: "..." }] }
 */
/** Default model for cron prompts — matches the "kortix" provider in opencode.jsonc */
const DEFAULT_CRON_MODEL = { providerID: 'kortix', modelID: 'anthropic/claude-sonnet-4.6' };

interface ModelOverride {
  providerID?: string;
  modelID?: string;
}

function buildPromptBody(prompt: string, agentName?: string, model?: ModelOverride): Record<string, unknown> {
  const resolvedModel = (model?.providerID && model?.modelID)
    ? { providerID: model.providerID, modelID: model.modelID }
    : DEFAULT_CRON_MODEL;

  const body: Record<string, unknown> = {
    parts: [{ type: 'text', text: prompt }],
    model: resolvedModel,
  };
  if (agentName) {
    body.agent = agentName;
  }
  return body;
}

export class OpenCodeClient {
  private endpointPromise: Promise<ResolvedEndpoint>;

  constructor(sandbox: Sandbox) {
    this.endpointPromise = resolveEndpoint(sandbox);
  }

  /**
   * Create a new session and send a prompt.
   * The prompt is fire-and-forget — OpenCode processes it async via SSE.
   * We just verify the prompt was accepted (2xx).
   */
  async createAndPrompt(
    prompt: string,
    agentName?: string,
    timeoutMs: number = 300000,
    model?: ModelOverride,
  ): Promise<ExecuteResult> {
    const { url, headers } = await this.endpointPromise;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 1. Create session
      const sessionBody: Record<string, unknown> = {};
      if (agentName) sessionBody.agent = agentName;

      const sessionRes = await fetchWithRetry(`${url}/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sessionBody),
        signal: controller.signal,
      });

      if (!sessionRes.ok) {
        const errText = await sessionRes.text();
        throw new Error(`Failed to create session: ${sessionRes.status} ${errText}`);
      }

      const session = (await sessionRes.json()) as CreateSessionResponse;

      // 2. Send prompt — uses OpenCode's { parts: [...] } format
      const promptBody = buildPromptBody(prompt, agentName, model);
      const promptRes = await fetchWithRetry(`${url}/session/${session.id}/prompt_async`, {
        method: 'POST',
        headers,
        body: JSON.stringify(promptBody),
        signal: controller.signal,
      });

      if (!promptRes.ok) {
        const errText = await promptRes.text();
        throw new Error(`Failed to send prompt: ${promptRes.status} ${errText}`);
      }

      // prompt_async returns 204 No Content — consume to close connection
      await promptRes.text();

      return { sessionId: session.id, response: { accepted: true } };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Send a prompt to an existing session.
   */
  async promptExisting(
    sessionId: string,
    prompt: string,
    agentName?: string,
    timeoutMs: number = 300000,
    model?: ModelOverride,
  ): Promise<ExecuteResult> {
    const { url, headers } = await this.endpointPromise;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const promptBody = buildPromptBody(prompt, agentName, model);
      const res = await fetchWithRetry(`${url}/session/${sessionId}/prompt_async`, {
        method: 'POST',
        headers,
        body: JSON.stringify(promptBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to send prompt to session ${sessionId}: ${res.status} ${errText}`);
      }

      await res.text();

      return { sessionId, response: { accepted: true } };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { url, headers } = await this.endpointPromise;
      const res = await fetch(`${url}/kortix/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export async function executeTrigger(
  sandbox: Sandbox,
  prompt: string,
  options: {
    agentName?: string;
    modelProviderId?: string;
    modelId?: string;
    sessionMode: 'new' | 'reuse';
    sessionId?: string | null;
    timeoutMs: number;
    triggerId: string;
  },
): Promise<ExecuteResult> {
  const model: ModelOverride | undefined = (options.modelProviderId && options.modelId)
    ? { providerID: options.modelProviderId, modelID: options.modelId }
    : undefined;

  const client = new OpenCodeClient(sandbox);

  try {
    if (options.sessionMode === 'reuse' && options.sessionId) {
      return await client.promptExisting(options.sessionId, prompt, options.agentName, options.timeoutMs, model);
    } else {
      return await client.createAndPrompt(prompt, options.agentName, options.timeoutMs, model);
    }
  } catch (err) {
    throw new ExecutionError(
      `Trigger execution failed: ${err instanceof Error ? err.message : String(err)}`,
      options.triggerId,
      err instanceof Error ? err : undefined,
    );
  }
}
