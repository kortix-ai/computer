import { EventEmitter } from 'events';
import { signMessage } from '../shared/crypto';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
  type PendingRPC,
  type RelayRpcOptions,
  type AgentInfo,
  type TunnelRelayConfig,
  type TunnelRelayEvents,
  TunnelErrorCode,
} from '../shared/types';

interface AgentConnection {
  ws: WebSocket;
  signingKey: string;
  nonce: number;
  connectedAt: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_RPC_TIMEOUT_MS = 30_000;

export class TunnelRelay extends EventEmitter {
  private agents = new Map<string, AgentConnection>();
  private pendingRPCs = new Map<string, PendingRPC>();
  private config: Required<TunnelRelayConfig>;

  constructor(config?: TunnelRelayConfig) {
    super();
    this.config = {
      rpcTimeoutMs: config?.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      maxWsMessageSize: config?.maxWsMessageSize ?? 5 * 1024 * 1024,
    };
  }

  emitEvent<K extends keyof TunnelRelayEvents>(event: K, data: TunnelRelayEvents[K]): boolean {
    return this.emit(event, data);
  }

  registerAgent(
    tunnelId: string,
    ws: WebSocket,
    signingKey: string,
    metadata?: Record<string, unknown>,
  ): void {
    const existing = this.agents.get(tunnelId);
    if (existing) {
      try { existing.ws.close(1000, 'replaced by new connection'); } catch {}
      this.emitEvent('connection:replaced', { tunnelId });
    }

    this.agents.set(tunnelId, { ws, signingKey, nonce: 0, connectedAt: Date.now(), metadata });
    this.emitEvent('agent:connect', { tunnelId, metadata });
    console.log(`[tunnel-relay] Agent registered: ${tunnelId} (total: ${this.agents.size})`);
  }

  unregisterAgent(tunnelId: string): void {
    this.agents.delete(tunnelId);

    for (const [requestId, pending] of this.pendingRPCs) {
      if (pending.tunnelId === tunnelId) {
        clearTimeout(pending.timer);
        pending.reject(new TunnelRelayError(
          TunnelErrorCode.NOT_CONNECTED,
          'Agent disconnected while RPC was pending',
        ));
        this.pendingRPCs.delete(requestId);
      }
    }

    this.emitEvent('agent:disconnect', { tunnelId });
    console.log(`[tunnel-relay] Agent unregistered: ${tunnelId} (total: ${this.agents.size})`);
  }

  isConnected(tunnelId: string): boolean {
    return this.agents.has(tunnelId);
  }

  getConnectedCount(): number {
    return this.agents.size;
  }

  getConnectedAgents(): Map<string, AgentInfo> {
    const result = new Map<string, AgentInfo>();
    for (const [tunnelId, conn] of this.agents) {
      result.set(tunnelId, {
        tunnelId,
        signingKey: conn.signingKey,
        connectedAt: conn.connectedAt,
        metadata: conn.metadata,
      });
    }
    return result;
  }

  getAgentMetadata(tunnelId: string): Record<string, unknown> | undefined {
    return this.agents.get(tunnelId)?.metadata;
  }

  handleAgentMessage(tunnelId: string, raw: string | Buffer): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'));
    } catch {
      console.warn(`[tunnel-relay] Invalid JSON from agent ${tunnelId}`);
      return;
    }

    if ('method' in msg && (msg as any).method === 'tunnel.pong') {
      this.emitEvent('message:pong', { tunnelId, params: (msg as any).params });
      return;
    }

    if (!('id' in msg) || !msg.id) {
      this.emitEvent('message:raw', { tunnelId, message: msg });
      return;
    }

    const pending = this.pendingRPCs.get(msg.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRPCs.delete(msg.id);

    const durationMs = Date.now() - pending.startedAt;

    if ('error' in msg && msg.error) {
      const error = new TunnelRelayError(msg.error.code, msg.error.message, msg.error.data);
      this.emitEvent('rpc:error', {
        tunnelId,
        method: pending.method,
        requestId: msg.id,
        error,
      });
      pending.reject(error);
    } else {
      this.emitEvent('rpc:response', {
        tunnelId,
        method: pending.method,
        requestId: msg.id,
        durationMs,
      });
      pending.resolve((msg as any).result);
    }
  }

  async relayRPC(
    tunnelId: string,
    method: string,
    params: Record<string, unknown>,
    options?: RelayRpcOptions,
  ): Promise<unknown> {
    const agent = this.agents.get(tunnelId);
    if (!agent) {
      throw new TunnelRelayError(
        TunnelErrorCode.NOT_CONNECTED,
        `Tunnel agent ${tunnelId} is not connected`,
      );
    }

    const requestId = crypto.randomUUID();
    const timeoutMs = options?.timeoutMs ?? this.config.rpcTimeoutMs;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const nonce = ++agent.nonce;
    const payload = JSON.stringify(request);
    const sig = signMessage(agent.signingKey, payload, nonce);
    const signedRequest = { ...request, _sig: sig, _nonce: nonce };

    this.emitEvent('rpc:request', { tunnelId, method, requestId });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRPCs.delete(requestId);
        const error = new TunnelRelayError(
          TunnelErrorCode.TIMEOUT,
          `RPC timeout after ${timeoutMs}ms for ${method}`,
        );
        this.emitEvent('rpc:error', { tunnelId, method, requestId, error });
        reject(error);
      }, timeoutMs);

      this.pendingRPCs.set(requestId, {
        resolve,
        reject,
        timer,
        method,
        tunnelId,
        startedAt: Date.now(),
      });

      try {
        agent.ws.send(JSON.stringify(signedRequest));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRPCs.delete(requestId);
        reject(new TunnelRelayError(
          TunnelErrorCode.NOT_CONNECTED,
          `Failed to send RPC to agent: ${err}`,
        ));
      }
    });
  }

  sendNotification(tunnelId: string, method: string, params?: Record<string, unknown>): boolean {
    const agent = this.agents.get(tunnelId);
    if (!agent) return false;

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const nonce = ++agent.nonce;
    const payload = JSON.stringify(notification);
    const sig = signMessage(agent.signingKey, payload, nonce);
    const signedNotification = { ...notification, _sig: sig, _nonce: nonce };

    try {
      agent.ws.send(JSON.stringify(signedNotification));
      return true;
    } catch {
      return false;
    }
  }

  shutdown(): void {
    for (const [_requestId, pending] of this.pendingRPCs) {
      clearTimeout(pending.timer);
      pending.reject(new TunnelRelayError(
        TunnelErrorCode.NOT_CONNECTED,
        'Tunnel relay shutting down',
      ));
    }
    this.pendingRPCs.clear();

    for (const [_tunnelId, agent] of this.agents) {
      try { agent.ws.close(1001, 'server shutting down'); } catch {}
    }
    this.agents.clear();

    console.log('[tunnel-relay] Shutdown complete');
  }
}

export class TunnelRelayError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'TunnelRelayError';
  }
}
