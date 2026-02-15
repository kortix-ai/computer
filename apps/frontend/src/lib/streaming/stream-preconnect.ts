import { StreamConnection, StreamConnectionOptions, createStreamConnection } from './stream-connection';
import { logger } from '@/lib/logger';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export interface PreconnectedStream {
  connection: StreamConnection;
  agentRunId: string;
  threadId: string;
  createdAt: number;
  messageBuffer: string[];
  adopted: boolean;
  getAuthToken: () => Promise<string | null>;
}

interface StreamPreconnectConfig {
  maxBufferSize: number;
  staleTimeoutMs: number;
  cleanupIntervalMs: number;
}

const DEFAULT_CONFIG: StreamPreconnectConfig = {
  maxBufferSize: 1000,
  staleTimeoutMs: 30000,
  cleanupIntervalMs: 5000,
};

class StreamPreconnectService {
  private streams: Map<string, PreconnectedStream> = new Map();
  private threadRunMap: Map<string, string> = new Map(); // threadId -> agentRunId
  private config: StreamPreconnectConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, Set<(data: string) => void>> = new Map();

  constructor(config: Partial<StreamPreconnectConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (typeof window === 'undefined') return;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleStreams();
    }, this.config.cleanupIntervalMs);
  }

  private cleanupStaleStreams(): void {
    const now = Date.now();
    const staleIds: string[] = [];

    this.streams.forEach((stream, id) => {
      const age = now - stream.createdAt;
      if (!stream.adopted && age > this.config.staleTimeoutMs) {
        staleIds.push(id);
      }
    });

    staleIds.forEach(id => {
      logger.info('StreamPreconnect cleaning up stale stream', { streamId: id });
      this.destroyStream(id);
    });
  }

  async preconnect(
    agentRunId: string,
    threadId: string,
    getAuthToken: () => Promise<string | null>
  ): Promise<PreconnectedStream> {
    const existing = this.streams.get(agentRunId);
    if (existing) {
      logger.info('StreamPreconnect reusing existing stream', { agentRunId });
      return existing;
    }

    logger.info('StreamPreconnect pre-connecting stream', { agentRunId });

    const messageBuffer: string[] = [];
    const preconnectedStream: PreconnectedStream = {
      connection: null as unknown as StreamConnection,
      agentRunId,
      threadId,
      createdAt: Date.now(),
      messageBuffer,
      adopted: false,
      getAuthToken,
    };

    const connection = createStreamConnection({
      apiUrl: API_URL,
      runId: agentRunId,
      getAuthToken,
      onMessage: (data: string) => {
        if (!preconnectedStream.adopted) {
          if (messageBuffer.length < this.config.maxBufferSize) {
            messageBuffer.push(data);
          }
        }
        const listeners = this.listeners.get(agentRunId);
        if (listeners) {
          listeners.forEach(listener => listener(data));
        }
      },
      onOpen: () => {
        logger.info('StreamPreconnect stream connected', { agentRunId });
      },
      onError: (error) => {
        logger.error('StreamPreconnect stream error', { agentRunId, error: String(error) });
      },
      onClose: () => {
        logger.info('StreamPreconnect stream closed', { agentRunId });
      },
    });

    preconnectedStream.connection = connection;
    this.streams.set(agentRunId, preconnectedStream);
    this.threadRunMap.set(threadId, agentRunId);

    connection.connect();

    return preconnectedStream;
  }

  adopt(agentRunId: string): { stream: PreconnectedStream; bufferedMessages: string[] } | null {
    const stream = this.streams.get(agentRunId);
    if (!stream) {
      logger.info('StreamPreconnect no pre-connected stream found', { agentRunId });
      return null;
    }

    if (stream.adopted) {
      logger.info('StreamPreconnect stream already adopted', { agentRunId });
      return null;
    }

    logger.info('StreamPreconnect adopting stream', { agentRunId, bufferedMessages: stream.messageBuffer.length });
    
    stream.adopted = true;
    const bufferedMessages = [...stream.messageBuffer];
    stream.messageBuffer.length = 0;

    return { stream, bufferedMessages };
  }

  addListener(agentRunId: string, listener: (data: string) => void): () => void {
    if (!this.listeners.has(agentRunId)) {
      this.listeners.set(agentRunId, new Set());
    }
    this.listeners.get(agentRunId)!.add(listener);

    return () => {
      const listeners = this.listeners.get(agentRunId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(agentRunId);
        }
      }
    };
  }

  has(agentRunId: string): boolean {
    return this.streams.has(agentRunId);
  }

  get(agentRunId: string): PreconnectedStream | undefined {
    return this.streams.get(agentRunId);
  }

  destroyStream(agentRunId: string): void {
    const stream = this.streams.get(agentRunId);
    if (stream) {
      stream.connection.destroy();
      this.streams.delete(agentRunId);
      this.listeners.delete(agentRunId);
      
      // Remove from threadRunMap
      for (const [threadId, runId] of this.threadRunMap.entries()) {
        if (runId === agentRunId) {
          this.threadRunMap.delete(threadId);
          break;
        }
      }
    }
  }

  getAgentRunIdForThread(threadId: string): string | undefined {
    return this.threadRunMap.get(threadId);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.streams.forEach((stream) => {
      stream.connection.destroy();
    });
    this.streams.clear();
    this.listeners.clear();
    this.threadRunMap.clear();
  }

  getStats(): {
    activeStreams: number;
    adoptedStreams: number;
    totalBufferedMessages: number;
  } {
    let adoptedStreams = 0;
    let totalBufferedMessages = 0;

    this.streams.forEach((stream) => {
      if (stream.adopted) adoptedStreams++;
      totalBufferedMessages += stream.messageBuffer.length;
    });

    return {
      activeStreams: this.streams.size,
      adoptedStreams,
      totalBufferedMessages,
    };
  }
}

let serviceInstance: StreamPreconnectService | null = null;

export function getStreamPreconnectService() {
  if (typeof window === 'undefined') {
    return {
      preconnect: async () => ({} as PreconnectedStream),
      adopt: () => null,
      addListener: () => () => {},
      has: () => false,
      get: () => undefined,
      destroyStream: () => {},
      destroy: () => {},
      getAgentRunIdForThread: () => undefined,
      getStats: () => ({ activeStreams: 0, adoptedStreams: 0, totalBufferedMessages: 0 }),
    };
  }

  if (!serviceInstance) {
    serviceInstance = new StreamPreconnectService();
  }
  return serviceInstance;
}

export function storePreconnectInfo(agentRunId: string, threadId: string): void {
  if (typeof window === 'undefined') return;
  
  sessionStorage.setItem('preconnect_agent_run_id', agentRunId);
  sessionStorage.setItem('preconnect_thread_id', threadId);
}

export function consumePreconnectInfo(): { agentRunId: string; threadId: string } | null {
  if (typeof window === 'undefined') return null;
  
  const agentRunId = sessionStorage.getItem('preconnect_agent_run_id');
  const threadId = sessionStorage.getItem('preconnect_thread_id');
  
  if (agentRunId && threadId) {
    sessionStorage.removeItem('preconnect_agent_run_id');
    sessionStorage.removeItem('preconnect_thread_id');
    return { agentRunId, threadId };
  }
  
  return null;
}
