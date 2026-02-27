/**
 * TunnelRelay — singleton that manages WebSocket connections from local agents
 * and relays JSON-RPC requests between sandbox tools and local machines.
 *
 * Responsibilities:
 *   - Track connected agents (tunnelId → WebSocket + signing context)
 *   - Send JSON-RPC requests and await responses (with timeout)
 *   - Handle agent messages (route responses to pending RPCs)
 *   - Register/unregister agents on WS open/close
 *   - Sign all outbound messages with HMAC for integrity verification
 */

import { config } from '../../config';
import { signMessage } from '../../shared/crypto';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
  type PendingRPC,
  type TunnelAgentWsData,
  type RelayRpcOptions,
  TunnelErrorCode,
} from '../types';

interface AgentConnection {
  ws: WebSocket;
  signingKey: string;
  nonce: number;
  accountId: string;
}

export class TunnelRelay {
  private agents = new Map<string, AgentConnection>();
  private pendingRPCs = new Map<string, PendingRPC>();

  onConnectionReplaced: ((tunnelId: string, accountId: string) => void) | null = null;
  registerAgent(tunnelId: string, ws: WebSocket, signingKey: string, accountId: string): void {
    const existing = this.agents.get(tunnelId);
    if (existing) {
      try { existing.ws.close(1000, 'replaced by new connection'); } catch {}
      if (this.onConnectionReplaced) {
        this.onConnectionReplaced(tunnelId, existing.accountId);
      }
    }

    this.agents.set(tunnelId, { ws, signingKey, nonce: 0, accountId });
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

    console.log(`[tunnel-relay] Agent unregistered: ${tunnelId} (total: ${this.agents.size})`);
  }

  isConnected(tunnelId: string): boolean {
    return this.agents.has(tunnelId);
  }

  getConnectedCount(): number {
    return this.agents.size;
  }

  getAgentAccountId(tunnelId: string): string | undefined {
    return this.agents.get(tunnelId)?.accountId;
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
      return;
    }

    if (!('id' in msg) || !msg.id) {
      return;
    }

    const pending = this.pendingRPCs.get(msg.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRPCs.delete(msg.id);

    if ('error' in msg && msg.error) {
      pending.reject(new TunnelRelayError(
        msg.error.code,
        msg.error.message,
        msg.error.data,
      ));
    } else {
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
    const timeoutMs = options?.timeoutMs ?? config.TUNNEL_RPC_TIMEOUT_MS;

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

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRPCs.delete(requestId);
        reject(new TunnelRelayError(
          TunnelErrorCode.TIMEOUT,
          `RPC timeout after ${timeoutMs}ms for ${method}`,
        ));
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
    for (const [requestId, pending] of this.pendingRPCs) {
      clearTimeout(pending.timer);
      pending.reject(new TunnelRelayError(
        TunnelErrorCode.NOT_CONNECTED,
        'Tunnel relay shutting down',
      ));
    }
    this.pendingRPCs.clear();

    for (const [tunnelId, agent] of this.agents) {
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

export const tunnelRelay = new TunnelRelay();
