import type { SandboxTarget } from '../types';
import { getProvider } from '../../platform/providers';
import type { ProviderName } from '../../platform/providers';
import { getDaytona, isDaytonaConfigured } from '../../shared/daytona';

interface CreateSessionResponse {
  id: string;
  [key: string]: unknown;
}

export interface StreamEvent {
  type: 'text' | 'busy' | 'done' | 'error' | 'permission' | 'file';
  data?: string;
  permission?: {
    id: string;
    tool: string;
    description: string;
  };
  file?: {
    name: string;
    url: string;
    mimeType?: string;
  };
}

const FILE_PRODUCING_TOOLS = new Set(['show_user', 'show-user']);
const FILE_ITEM_TYPES = new Set(['file', 'image']);

interface ResolvedEndpoint {
  url: string;
  headers: Record<string, string>;
}

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
    fileParts?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
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

      const parts: Array<Record<string, unknown>> = [{ type: 'text', text: content }];
      if (fileParts && fileParts.length > 0) {
        for (const fp of fileParts) {
          parts.push({ type: 'file', mime: fp.mime, url: fp.url, filename: fp.filename });
        }
      }
      const promptBody: Record<string, unknown> = { parts };
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
      const processedToolCalls = new Set<string>();
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

            if (part.type === 'file') {
              yield {
                type: 'file',
                file: {
                  name: (part.filename as string) || 'file',
                  url: (part.url as string) || '',
                  mimeType: part.mimeType as string | undefined,
                },
              };
            }

            if (part.type === 'tool') {
              const toolName = part.tool as string;
              const callID = (part.callID || part.id) as string;
              const state = part.state as Record<string, unknown> | undefined;

              if (
                FILE_PRODUCING_TOOLS.has(toolName) &&
                state?.status === 'completed' &&
                callID &&
                !processedToolCalls.has(callID)
              ) {
                processedToolCalls.add(callID);
                const fileEvent = this.extractFileFromToolOutput(toolName, state);
                if (fileEvent) {
                  console.log(`[SANDBOX-CONNECTOR] File from ${toolName} tool: ${fileEvent.name} (${fileEvent.url})`);
                  yield { type: 'file', file: fileEvent };
                }
              }
            }
          }

          if (evt === 'permission.asked' || evt === 'permission.requested') {
            const permProps = props as Record<string, unknown>;
            yield {
              type: 'permission',
              permission: {
                id: (permProps.id as string) || (permProps.requestID as string) || '',
                tool: (permProps.tool as string) || (permProps.toolName as string) || 'unknown',
                description: (permProps.description as string) || (permProps.message as string) || '',
              },
            };
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

  private extractFileFromToolOutput(
    toolName: string,
    state: Record<string, unknown>,
  ): { name: string; url: string; mimeType?: string } | null {
    const input = state.input as Record<string, unknown> | undefined;
    const output = state.output as string | undefined;

    if (toolName === 'show_user' || toolName === 'show-user') {
      const itemType = (input?.type as string) || '';
      let filePath: string | undefined;
      let publicUrl: string | undefined;

      if (output) {
        try {
          const parsed = JSON.parse(output);
          const entry = parsed.entry as Record<string, unknown> | undefined;
          if (entry) {
            publicUrl = entry.publicUrl as string | undefined;
            const entryType = (entry.type as string) || '';
            if (FILE_ITEM_TYPES.has(entryType) && entry.path) {
              filePath = entry.path as string;
            }
          }
        } catch {
        }
      }

      if (!filePath && FILE_ITEM_TYPES.has(itemType) && input?.path) {
        filePath = input.path as string;
      }

      if (publicUrl || filePath) {
        const name = (filePath || publicUrl || 'file').split('/').pop()?.split('?')[0] || 'file';
        const url = publicUrl || filePath!;
        const mimeType = itemType === 'image' ? this.guessImageMime(name) : undefined;
        console.log(`[SANDBOX-CONNECTOR] show-user file: name=${name} publicUrl=${!!publicUrl} url=${url.slice(0, 120)}`);
        return { name, url, mimeType };
      }
    }

    return null;
  }

  private guessImageMime(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimes: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    };
    return mimes[ext] || 'image/png';
  }

  async replyPermission(permissionId: string, approved: boolean): Promise<void> {
    try {
      const { url, headers } = await this.getEndpoint();
      const res = await fetch(`${url}/permission/${permissionId}/reply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ approved }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[SANDBOX-CONNECTOR] Permission reply failed: ${res.status} ${errText}`);
      }
    } catch (err) {
      console.error('[SANDBOX-CONNECTOR] Permission reply error:', err);
    }
  }

  async downloadFile(fileUrl: string): Promise<Buffer | null> {
    try {
      if (!fileUrl.startsWith('http')) {
        let filePath = fileUrl;
        for (const prefix of ['/workspace/', '/home/daytona/', '/home/user/']) {
          if (filePath.startsWith(prefix)) {
            filePath = filePath.slice(prefix.length);
            break;
          }
        }
        if (filePath.startsWith('/')) {
          filePath = filePath.slice(1);
        }
        console.log(`[SANDBOX-CONNECTOR] Downloading sandbox file via file content API: ${filePath}`);
        const result = await this.downloadFileByPath(filePath);
        if (result) return result;

        const fileName = fileUrl.split('/').pop();
        if (fileName && fileName !== filePath) {
          console.log(`[SANDBOX-CONNECTOR] Retrying with filename only: ${fileName}`);
          return await this.downloadFileByPath(fileName);
        }
        return null;
      }

      const { headers } = await this.getEndpoint();

      const res = await fetch(fileUrl, {
        headers,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        console.warn(`[SANDBOX-CONNECTOR] File download failed: ${res.status} ${fileUrl}`);
        return null;
      }

      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.warn(`[SANDBOX-CONNECTOR] File download error:`, err);
      return null;
    }
  }

  async getModifiedFiles(): Promise<Array<{ name: string; path: string }>> {
    try {
      const { url, headers } = await this.getEndpoint();
      const res = await fetch(`${url}/file/status`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.warn(`[SANDBOX-CONNECTOR] file/status failed: ${res.status}`);
        return [];
      }

      const data = await res.json();
      const files: Array<{ name: string; path: string }> = [];

      console.log(`[SANDBOX-CONNECTOR] file/status response:`, JSON.stringify(data).slice(0, 500));

      const entries = Array.isArray(data) ? data : Object.entries(data).map(([path, status]) => ({ path, status }));

      for (const entry of entries) {
        const filePath = (typeof entry === 'string' ? entry : entry.path || entry.file) as string | undefined;
        if (!filePath) continue;
        if (filePath.startsWith('.') || filePath.includes('node_modules') || filePath.includes('/.')) continue;
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const isOutputFile = /^(md|txt|pdf|html|csv|json|xml|doc|docx|xlsx|pptx|png|jpg|jpeg|gif|svg|mp3|mp4|wav)$/.test(ext);
        if (!isOutputFile) continue;

        const name = filePath.split('/').pop() || filePath;
        files.push({ name, path: filePath });
      }

      return files;
    } catch (err) {
      console.warn('[SANDBOX-CONNECTOR] Failed to get modified files:', err);
      return [];
    }
  }


  async downloadFileByPath(filePath: string): Promise<Buffer | null> {
    try {
      const { url, headers } = await this.getEndpoint();
      const params = new URLSearchParams({ path: filePath });
      const res = await fetch(`${url}/file/content?${params}`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        console.warn(`[SANDBOX-CONNECTOR] File read failed: ${res.status} ${filePath}`);
        return null;
      }

      const data = await res.json() as { type: string; content: string; encoding?: string };

      if (data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64');
      }

      return Buffer.from(data.content, 'utf-8');
    } catch (err) {
      console.warn(`[SANDBOX-CONNECTOR] File read error:`, err);
      return null;
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
    }
  }
}
