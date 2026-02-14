import type { Sandbox } from '@kortix/db';
import { ExecutionError } from '../../errors';

/**
 * OpenCode SDK client wrapper.
 *
 * Communicates with the OpenCode API inside a sandbox via its Kortix Master
 * reverse proxy (base_url). The API is at /api/* through the proxy.
 *
 * Key endpoints used:
 *   POST /session          -> create a new session
 *   POST /session/:id/prompt -> send a prompt to an existing session
 *   GET  /session/:id      -> get session status
 *   GET  /agent            -> list available agents
 */

interface CreateSessionResponse {
  id: string;
  [key: string]: unknown;
}

interface PromptResponse {
  [key: string]: unknown;
}

export interface ExecuteResult {
  sessionId: string;
  response?: unknown;
}

export class OpenCodeClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(sandbox: Sandbox) {
    // Strip trailing slash
    this.baseUrl = sandbox.baseUrl.replace(/\/$/, '');

    this.headers = {
      'Content-Type': 'application/json',
    };

    // Kortix Master uses Basic auth derived from OPENCODE_AUTH
    if (sandbox.authToken) {
      this.headers['Authorization'] = `Basic ${btoa(sandbox.authToken)}`;
    }
  }

  /**
   * Create a new session and send a prompt.
   */
  async createAndPrompt(
    prompt: string,
    agentName?: string,
    timeoutMs: number = 300000,
  ): Promise<ExecuteResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 1. Create session
      const sessionBody: Record<string, unknown> = {};
      if (agentName) {
        sessionBody.agent = agentName;
      }

      const sessionRes = await fetch(`${this.baseUrl}/session`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(sessionBody),
        signal: controller.signal,
      });

      if (!sessionRes.ok) {
        const errText = await sessionRes.text();
        throw new Error(`Failed to create session: ${sessionRes.status} ${errText}`);
      }

      const session = (await sessionRes.json()) as CreateSessionResponse;

      // 2. Send prompt to session
      const promptRes = await fetch(`${this.baseUrl}/session/${session.id}/prompt`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ content: prompt }),
        signal: controller.signal,
      });

      if (!promptRes.ok) {
        const errText = await promptRes.text();
        throw new Error(`Failed to send prompt: ${promptRes.status} ${errText}`);
      }

      const response = (await promptRes.json()) as PromptResponse;

      return { sessionId: session.id, response };
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
    timeoutMs: number = 300000,
  ): Promise<ExecuteResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/session/${sessionId}/prompt`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ content: prompt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to send prompt to session ${sessionId}: ${res.status} ${errText}`);
      }

      const response = (await res.json()) as PromptResponse;

      return { sessionId, response };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check if the sandbox's OpenCode API is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/kortix/health`, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Execute a trigger against a sandbox.
 */
export async function executeTrigger(
  sandbox: Sandbox,
  prompt: string,
  options: {
    agentName?: string;
    sessionMode: 'new' | 'reuse';
    sessionId?: string | null;
    timeoutMs: number;
    triggerId: string;
  },
): Promise<ExecuteResult> {
  const client = new OpenCodeClient(sandbox);

  try {
    if (options.sessionMode === 'reuse' && options.sessionId) {
      return await client.promptExisting(options.sessionId, prompt, options.timeoutMs);
    } else {
      return await client.createAndPrompt(prompt, options.agentName, options.timeoutMs);
    }
  } catch (err) {
    throw new ExecutionError(
      `Trigger execution failed: ${err instanceof Error ? err.message : String(err)}`,
      options.triggerId,
      err instanceof Error ? err : undefined,
    );
  }
}
