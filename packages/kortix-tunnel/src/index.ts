/**
 * @kortix/tunnel — public API for programmatic usage.
 *
 * Primary usage is via CLI (`npx @kortix/tunnel connect`),
 * but this module can also be imported directly.
 */

export { TunnelAgent } from './agent';
export { loadConfig, type TunnelConfig } from './config';
export { CapabilityRegistry } from './capabilities/index';
export type { Capability, RpcHandler } from './capabilities/index';
