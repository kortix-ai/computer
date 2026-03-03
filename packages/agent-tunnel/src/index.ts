// ─── Server: Relay ───────────────────────────────────────────────────────────
export { TunnelRelay, TunnelRelayError } from './relay';
export { HeartbeatManager } from './heartbeat';
export { createWsHandlers } from './ws-handler';
export type { WsHandlers, WsHandlerOptions } from './ws-handler';
export { createTunnelRouter } from './routes';
export { startTunnelServer } from './server';
export type { TunnelServer } from './server';

// ─── Client: Agent ───────────────────────────────────────────────────────────
export { TunnelAgent } from './agent';
export { loadConfig, type TunnelConfig } from './config';
export { CapabilityRegistry } from './capabilities/index';
export type { Capability, RpcHandler } from './capabilities/index';
export { createFilesystemCapability } from './capabilities/filesystem';
export { createShellCapability } from './capabilities/shell';
export { createDesktopCapability } from './capabilities/desktop';
export { PermissionGuard } from './security/permission-guard';
export type { LocalPermission } from './security/permission-guard';
export { validateCommand } from './security/command-validator';
export { validatePath } from './security/path-validator';

// ─── Crypto ──────────────────────────────────────────────────────────────────
export {
  deriveSigningKey,
  signMessage,
  verifyMessageSignature,
  generateToken,
  hashToken,
  timingSafeStringEqual,
} from './crypto';

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  JsonRpcError,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcMessage,
  SignedJsonRpcRequest,
  SignedJsonRpcNotification,
  PendingRPC,
  TunnelRpcParams,
  RelayRpcOptions,
  AgentInfo,
  TunnelRelayEvents,
  TunnelRelayConfig,
  HeartbeatConfig,
  TunnelServerConfig,
  TunnelCapability,
  TunnelMethod,
  TunnelErrorCodeValue,
} from './types';

export { TunnelErrorCode, TunnelMethods } from './types';
