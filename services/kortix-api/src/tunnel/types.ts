/**
 * Tunnel sub-service type definitions.
 *
 * JSON-RPC 2.0 protocol types, capability scopes, and error codes
 * for the reverse-tunnel relay between kortix-api and the local agent.
 */

// ─── JSON-RPC 2.0 Protocol ──────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string;
  error: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export const TunnelErrorCode = {
  PERMISSION_DENIED: -32000,
  CAPABILITY_NOT_REGISTERED: -32001,
  TIMEOUT: -32002,
  LOCAL_ERROR: -32003,
  NOT_CONNECTED: -32004,
  EXPIRED: -32005,
  RATE_LIMITED: -32006,
} as const;

export type TunnelErrorCodeValue = (typeof TunnelErrorCode)[keyof typeof TunnelErrorCode];

export type TunnelCapability =
  | 'filesystem'
  | 'shell'
  | 'network'
  | 'apps'
  | 'hardware'
  | 'desktop'
  | 'gpu';

export const TunnelMethods = {
  'fs.read': 'filesystem',
  'fs.write': 'filesystem',
  'fs.list': 'filesystem',
  'fs.stat': 'filesystem',
  'fs.delete': 'filesystem',
  'shell.exec': 'shell',
  'desktop.screenshot': 'desktop',
  'desktop.mouse.click': 'desktop',
  'desktop.mouse.move': 'desktop',
  'desktop.mouse.drag': 'desktop',
  'desktop.mouse.scroll': 'desktop',
  'desktop.mouse.position': 'desktop',
  'desktop.keyboard.type': 'desktop',
  'desktop.keyboard.key': 'desktop',
  'desktop.window.list': 'desktop',
  'desktop.window.focus': 'desktop',
  'desktop.window.resize': 'desktop',
  'desktop.window.close': 'desktop',
  'desktop.window.minimize': 'desktop',
  'desktop.app.launch': 'desktop',
  'desktop.app.quit': 'desktop',
  'desktop.app.list': 'desktop',
  'desktop.clipboard.read': 'desktop',
  'desktop.clipboard.write': 'desktop',
  'desktop.screen.info': 'desktop',
  'desktop.cursor.image': 'desktop',
  'desktop.ax.tree': 'desktop',
  'desktop.ax.action': 'desktop',
  'desktop.ax.set_value': 'desktop',
  'desktop.ax.focus': 'desktop',
  'desktop.ax.search': 'desktop',
  'net.request': 'network',
  'net.port_forward.start': 'network',
  'net.port_forward.stop': 'network',
  'tunnel.ping': null,
  'tunnel.pong': null,
  'tunnel.permission.revoked': null,
  'tunnel.permissions.sync': null,
  'tunnel.token.rotated': null,
} as const;

export type TunnelMethod = keyof typeof TunnelMethods;

export interface PendingRPC {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
  tunnelId: string;
  startedAt: number;
}

export interface TunnelAgentWsData {
  type: 'tunnel-agent';
  tunnelId: string;
  accountId: string;
  capabilities: string[];
  signingKey: string;
}

export interface SignedJsonRpcRequest extends JsonRpcRequest {
  _sig: string;
  _nonce: number;
}

export interface SignedJsonRpcNotification extends JsonRpcNotification {
  _sig: string;
  _nonce: number;
}

export interface TunnelRpcParams {
  capability: TunnelCapability;
  operation: string;
  args: Record<string, unknown>;
  permissionId?: string;
}

export interface RelayRpcOptions {
  timeoutMs?: number;
}
