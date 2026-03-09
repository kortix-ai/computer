import { TunnelRelay } from 'agent-tunnel';
import { config } from '../../config';

export const tunnelRelay = new TunnelRelay({
  rpcTimeoutMs: config.TUNNEL_RPC_TIMEOUT_MS,
  maxWsMessageSize: config.TUNNEL_MAX_WS_MESSAGE_SIZE,
});
