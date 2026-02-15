import type { SandboxTarget } from '../types';
import { getProvider } from '../../platform/providers';
import type { ProviderName } from '../../platform/providers';
import { getDaytona, isDaytonaConfigured } from '../../shared/daytona';

interface CreateSessionResponse {
  id: string;
  [key: string]: unknown;
}

export interface StreamEvent {
  type: 'text' | 'busy' | 'done' | 'error';
  data?: string;
}

interface ResolvedEndpoint {
  url: string;
  headers: Record<string, string>;
}

/**
 * Resolve the direct Daytona sandbox URL, bypassing the preview proxy.
 * The preview proxy requires a Supabase JWT (user auth), but the channel
 * engine is a backend service that talks to sandboxes directly.
 * Returns the direct URL + Daytona preview headers (same as the proxy uses).
 */
async function resolveDirectEndpoint(target: SandboxTarget): Promise<ResolvedEndpoint> {
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
      console.warn(`[SANDBOX-CONNECTOR] Failed to resolve direct URL, falling back to baseUrl:`, err);
    }
  }

  // Fallback: use base_url with Basic auth (local dev / non-Daytona)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (target.authToken) {
    headers['Authorization'] = `Basic ${btoa(target.authToken)}`;
  }
  return { url: target.baseUrl.replace(/\/$/, ''), headers };
}

export class SandboxConnector {
  private endpoint: ResolvedEndpoint | null = null;
  private target: SandboxTarget;

  constructor(target: SandboxTarget) {
    this.target = target;
  }

  private async getEndpoint(): Promise<ResolvedEndpoint> {
    if (!this.endpoint) {
      this.endpoint = await resolveDirectEndpoint(this.target);
    }
    return this.endpoint;
  }

  async isReady(): Promise<boolean> {
    try {
      const { url, headers } = await this.getEndpoint();
      const res = await fetch(`${url}/global/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async wakeUp(): Promise<void> {
    if (!this.target.externalId) {
      throw new Error('Cannot wake sandbox: no external ID');
    }
    const provider = getProvider(this.target.provider as ProviderName);
    await provider.start(this.target.externalId);
  }

  async createSession(agentName?: string): Promise<string> {
    const { url, headers } = await this.getEndpoint();
    const body: Record<string, unknown> = {};
    if (agentName) {
      body.agent = agentName;
    }

    const res = await fetch(`${url}/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create session: ${res.status} ${errText}`);
    }

    const session = (await res.json()) as CreateSessionResponse;
    return session.id;
  }

  async prompt(sessionId: string, content: string, agentName?: string, model?: { providerID: string; modelID: string }): Promise<string> {
    let fullText = '';

    for await (const event of this.promptStreaming(sessionId, content, agentName, model)) {
      if (event.type === 'text' && event.data) {
        fullText += event.data;
      }
      if (event.type === 'error') {
        throw new Error(`Agent error: ${event.data}`);
      }
    }

    return fullText;
  }

  async *promptStreaming(
    sessionId: string,
    content: string,
    agentName?: string,
    model?: { providerID: string; modelID: string },
  ): AsyncGenerator<StreamEvent> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    try {
      const { url, headers } = await this.getEndpoint();
      const sseRes = await fetch(`${url}/event`, {
        method: 'GET',
        headers: { ...headers, Accept: 'text/event-stream' },
        signal: controller.signal,
      });

      if (!sseRes.ok || !sseRes.body) {
        throw new Error(`Failed to connect to SSE: ${sseRes.status}`);
      }

      const promptBody: Record<string, unknown> = {
        parts: [{ type: 'text', text: content }],
      };
      if (agentName) {
        promptBody.agent = agentName;
      }
      if (model) {
        promptBody.model = model;
      }

      const promptPromise = fetch(`${url}/session/${sessionId}/prompt_async`, {
        method: 'POST',
        headers,
        body: JSON.stringify(promptBody),
        signal: controller.signal,
      });

      const assistantMsgIds = new Set<string>();
      let sawBusy = false;
      let gotText = false;

      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const promptRes = await promptPromise;
      if (!promptRes.ok) {
        const errText = await promptRes.text();
        throw new Error(`Failed to send prompt: ${promptRes.status} ${errText}`);
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n')) {
          const newlineIdx = buffer.indexOf('\n');
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);

          if (!line.startsWith('data:')) continue;

          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          const evt = data.type as string;
          const props = (data.properties || {}) as Record<string, unknown>;

          const sid =
            (props.sessionID as string) ||
            ((props.part as Record<string, unknown>)?.sessionID as string) ||
            ((props.info as Record<string, unknown>)?.sessionID as string);

          if (sid && sid !== sessionId) continue;

          if (evt === 'message.updated') {
            const info = (props.info || {}) as Record<string, unknown>;
            if (info.role === 'assistant') {
              assistantMsgIds.add(info.id as string);
            }
          }

          if (evt === 'message.part.updated') {
            const part = (props.part || {}) as Record<string, unknown>;
            const delta = props.delta as string;
            const msgId = part.messageID as string;

            if (msgId && !assistantMsgIds.has(msgId)) continue;

            if (part.type === 'text' && delta) {
              gotText = true;
              sawBusy = true;
              yield { type: 'text', data: delta };
            }
          }

          if (evt === 'session.status') {
            const status = (props.status as Record<string, unknown>)?.type as string;
            if (status === 'busy') {
              sawBusy = true;
              yield { type: 'busy' };
            }
          }

          if (evt === 'session.idle') {
            if (sawBusy || gotText) {
              yield { type: 'done' };
              return;
            }
          }

          if (evt === 'session.error') {
            const err = ((props.error as Record<string, unknown>)?.data as Record<string, unknown>)?.message as string;
            yield { type: 'error', data: err || 'unknown error' };
            return;
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }

  async abort(sessionId: string): Promise<void> {
    try {
      const { url, headers } = await this.getEndpoint();
      await fetch(`${url}/session/${sessionId}/abort`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Best effort
    }
  }
}
