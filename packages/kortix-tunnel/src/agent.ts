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

import { hostname, platform, arch, release } from 'os';
import type { TunnelConfig } from './config';
import { CapabilityRegistry, type RpcHandler } from './capabilities/index';
import { PermissionGuard } from './security/permission-guard';
import type { LocalPermission } from './security/permission-guard';
import { deriveSigningKey, verifyMessageSignature } from './security/signature';

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

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  white:   '\x1b[97m',
  gray:    '\x1b[90m',
};

function log(icon: string, msg: string) {
  console.log(`  ${icon} ${c.dim}${msg}${c.reset}`);
}

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
    log(`${c.cyan}◆${c.reset}`, `Connecting…`);

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupWsHandlers();
    } catch (err) {
      log(`${c.red}✗${c.reset}`, `Connection failed`);
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
    log(`${c.gray}○${c.reset}`, `Disconnected`);
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

      log(`${c.green}●${c.reset}`, `Connected ${c.reset}${c.gray}(${this.registry.getCapabilityNames().join(', ')})${c.reset}`);
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
        log(`${c.yellow}○${c.reset}`, `Disconnected ${c.gray}(code: ${event.code})${c.reset}`);
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener('error', (event) => {
      log(`${c.red}✗${c.reset}`, `WebSocket error`);
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      log(`${c.yellow}!${c.reset}`, `Received invalid JSON`);
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
      log(`${c.green}●${c.reset}`, `Synced ${c.reset}${c.white}${permissions.length}${c.dim} permissions`);
      return;
    }

    // ── Permission granted notification ────────────────────────────
    if ('method' in msg && msg.method === 'tunnel.permission.granted') {
      const p = msg.params as LocalPermission | undefined;
      if (p?.permissionId) {
        this.permissionGuard.addPermission(p);
        log(`${c.green}+${c.reset}`, `Permission granted: ${p.capability} (${p.permissionId.slice(0, 12)}…)`);
      }
      return;
    }

    // ── Permission revocation notification ──────────────────────────
    if ('method' in msg && msg.method === 'tunnel.permission.revoked') {
      const permissionId = msg.params?.permissionId as string;
      if (permissionId) {
        this.permissionGuard.revokePermission(permissionId);
        log(`${c.yellow}○${c.reset}`, `Permission revoked: ${permissionId.slice(0, 12)}…`);
      }
      return;
    }

    // ── Token rotation notification ─────────────────────────────────
    if ('method' in msg && msg.method === 'tunnel.token.rotated') {
      log(`${c.yellow}!${c.reset}`, `Token rotated — reconnecting with new token`);
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
      log(`${c.yellow}!${c.reset}`, `Message missing signature fields`);
      return false;
    }

    // Replay protection: nonce must be strictly increasing
    if (nonce <= this.lastNonce) {
      log(`${c.red}✗${c.reset}`, `Replay detected: nonce ${nonce} <= ${this.lastNonce}`);
      return false;
    }

    // Build the payload to verify (message without _sig and _nonce)
    const { _sig, _nonce, ...payloadObj } = msg as any;
    const payload = JSON.stringify(payloadObj);

    if (!verifyMessageSignature(this.signingKey, payload, nonce, sig)) {
      log(`${c.red}✗${c.reset}`, `Invalid HMAC signature`);
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
        machineInfo: {
          hostname: hostname(),
          platform: platform(),
          arch: arch(),
          osVersion: release(),
          agentVersion: '0.1.0',
        },
      },
    });
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (err) {
        log(`${c.red}✗${c.reset}`, `Send failed`);
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

    log(`${c.cyan}◆${c.reset}`, `Reconnecting in ${c.reset}${c.white}${(delay / 1000).toFixed(1)}s${c.dim} (attempt ${this.reconnectAttempts})`);

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
