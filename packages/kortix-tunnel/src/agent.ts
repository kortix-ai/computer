/**
 * TunnelAgent — WebSocket client that connects to kortix-api
 * and handles JSON-RPC requests from the cloud sandbox.
 *
 * Responsibilities:
 *   - Maintain persistent WS connection with auto-reconnect
 *   - Respond to heartbeat pings
 *   - Dispatch incoming RPC requests to registered capabilities
 *   - Enforce permissions locally (defense-in-depth)
 *   - Verify HMAC signatures on incoming messages (replay protection)
 *   - Handle permission revocation / sync notifications
 *   - Handle token rotation notifications
 */

import type { TunnelConfig } from './config';
import { CapabilityRegistry, type RpcHandler } from './capabilities/index';
import { PermissionGuard } from './security/permission-guard';
import type { LocalPermission } from './security/permission-guard';
import { deriveSigningKey, verifyMessageSignature } from './security/message-signer';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
  _sig?: string;
  _nonce?: number;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  _sig?: string;
  _nonce?: number;
}

type IncomingMessage = JsonRpcRequest | JsonRpcNotification;

export class TunnelAgent {
  private ws: WebSocket | null = null;
  private registry: CapabilityRegistry;
  private permissionGuard: PermissionGuard;
  private config: TunnelConfig;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30_000;
  private baseReconnectDelay = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;
  private uptime = 0;
  private uptimeInterval: ReturnType<typeof setInterval> | null = null;

  // HMAC signature verification
  private signingKey: string;
  private lastNonce = 0;

  constructor(config: TunnelConfig, registry: CapabilityRegistry) {
    this.config = config;
    this.registry = registry;
    this.permissionGuard = new PermissionGuard();
    this.signingKey = deriveSigningKey(config.token);
  }

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    const wsUrl = this.buildWsUrl();
    console.log(`[tunnel-agent] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupWsHandlers();
    } catch (err) {
      console.error(`[tunnel-agent] Connection failed:`, err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.isShuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
      this.uptimeInterval = null;
    }

    if (this.ws) {
      try { this.ws.close(1000, 'client shutdown'); } catch {}
      this.ws = null;
    }

    this.permissionGuard.clear();
    console.log('[tunnel-agent] Disconnected');
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private setupWsHandlers(): void {
    if (!this.ws) return;

    this.ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.uptime = 0;
      this.lastNonce = 0; // Reset nonce on each new connection
      this.uptimeInterval = setInterval(() => { this.uptime++; }, 1000);

      console.log(`[tunnel-agent] Connected (capabilities: ${this.registry.getCapabilityNames().join(', ')})`);
    });

    this.ws.addEventListener('message', (event) => {
      this.handleMessage(event.data as string);
    });

    this.ws.addEventListener('close', (event) => {
      if (this.uptimeInterval) {
        clearInterval(this.uptimeInterval);
        this.uptimeInterval = null;
      }

      if (!this.isShuttingDown) {
        console.log(`[tunnel-agent] Disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener('error', (event) => {
      console.error(`[tunnel-agent] WebSocket error`);
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn('[tunnel-agent] Received invalid JSON');
      return;
    }

    // ── Heartbeat ping — no signature required ──────────────────────
    if ('method' in msg && msg.method === 'tunnel.ping') {
      this.sendPong();
      return;
    }

    // ── Verify HMAC signature on all other messages ─────────────────
    if (!this.verifyIncomingSignature(msg, raw)) {
      if ('id' in msg && msg.id) {
        this.sendError(msg.id, -32000, 'Invalid message signature');
      }
      return;
    }

    // ── Permission sync notification ────────────────────────────────
    if ('method' in msg && msg.method === 'tunnel.permissions.sync') {
      const permissions = (msg.params?.permissions || []) as LocalPermission[];
      this.permissionGuard.syncPermissions(permissions);
      console.log(`[tunnel-agent] Synced ${permissions.length} permissions`);
      return;
    }

    // ── Permission revocation notification ──────────────────────────
    if ('method' in msg && msg.method === 'tunnel.permission.revoked') {
      const permissionId = msg.params?.permissionId as string;
      if (permissionId) {
        this.permissionGuard.revokePermission(permissionId);
        console.log(`[tunnel-agent] Permission revoked: ${permissionId}`);
      }
      return;
    }

    // ── Token rotation notification ─────────────────────────────────
    if ('method' in msg && msg.method === 'tunnel.token.rotated') {
      console.log('[tunnel-agent] Token rotated — must reconnect with new token');
      // The server will close the WS shortly; the reconnect logic handles the rest.
      // Caller must update config.token before reconnect succeeds.
      return;
    }

    // ── RPC request dispatch ────────────────────────────────────────
    if ('id' in msg && msg.id) {
      await this.handleRpcRequest(msg as JsonRpcRequest);
      return;
    }
  }

  /**
   * Verify HMAC signature on incoming messages (excluding pings).
   * Returns true if valid, false if signature check fails.
   */
  private verifyIncomingSignature(msg: IncomingMessage, _raw: string): boolean {
    const sig = (msg as any)._sig as string | undefined;
    const nonce = (msg as any)._nonce as number | undefined;

    if (sig === undefined || nonce === undefined) {
      console.warn('[tunnel-agent] Message missing signature fields');
      return false;
    }

    // Replay protection: nonce must be strictly increasing
    if (nonce <= this.lastNonce) {
      console.warn(`[tunnel-agent] Replay detected: nonce ${nonce} <= lastNonce ${this.lastNonce}`);
      return false;
    }

    // Build the payload to verify (message without _sig and _nonce)
    const { _sig, _nonce, ...payloadObj } = msg as any;
    const payload = JSON.stringify(payloadObj);

    if (!verifyMessageSignature(this.signingKey, payload, nonce, sig)) {
      console.warn('[tunnel-agent] Invalid HMAC signature');
      return false;
    }

    this.lastNonce = nonce;
    return true;
  }

  private async handleRpcRequest(request: JsonRpcRequest): Promise<void> {
    const { id, method, params = {} } = request;

    // ── Permission enforcement (defense-in-depth) ───────────────────
    const permissionId = params.permissionId as string | undefined;
    if (!this.permissionGuard.checkPermission(permissionId)) {
      this.sendError(id, -32000, `Permission denied: ${permissionId ? 'invalid or expired permission' : 'no permissionId provided'}`);
      return;
    }

    const handler = this.registry.getHandler(method);
    if (!handler) {
      this.sendError(id, -32001, `Capability not registered for method: ${method}`);
      return;
    }

    try {
      const result = await handler(params);
      this.sendResult(id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendError(id, -32003, message);
    }
  }

  private sendResult(id: string, result: unknown): void {
    this.send({ jsonrpc: '2.0', id, result });
  }

  private sendError(id: string, code: number, message: string): void {
    this.send({ jsonrpc: '2.0', id, error: { code, message } });
  }

  private sendPong(): void {
    this.send({
      jsonrpc: '2.0',
      method: 'tunnel.pong',
      params: {
        uptime: this.uptime,
        capabilities: this.registry.getCapabilityNames(),
      },
    });
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (err) {
        console.error('[tunnel-agent] Failed to send:', err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    );

    console.log(`[tunnel-agent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private buildWsUrl(): string {
    const base = this.config.apiUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:');

    const params = new URLSearchParams({
      token: this.config.token,
      tunnelId: this.config.tunnelId,
    });

    return `${base}/v1/tunnel/ws?${params.toString()}`;
  }
}
