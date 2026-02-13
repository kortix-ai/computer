# Kortix Channels — Implementation Plan

> A single service (`kortix-channels`) that receives messages from external platforms (Telegram, Slack, WhatsApp, Discord, MS Teams, Voice, Email, SMS), normalizes them, proxies to the appropriate sandbox's OpenCode API, and delivers responses back.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Why Channels Must Live Outside the Sandbox](#2-why-channels-must-live-outside-the-sandbox)
3. [Where It Fits](#3-where-it-fits)
4. [Reference: OpenClaw Analysis](#4-reference-openclaw-analysis)
5. [Core Engine](#5-core-engine)
6. [Adapter Interface](#6-adapter-interface)
7. [Database Schema](#7-database-schema)
8. [Session Strategy](#8-session-strategy)
9. [Sandbox Connectivity & Wake-Up](#9-sandbox-connectivity--wake-up)
10. [Groups, DMs & Access Control](#10-groups-dms--access-control)
11. [Per-Adapter Details](#11-per-adapter-details)
12. [Frontend Integration](#12-frontend-integration)
13. [Voice Migration](#13-voice-migration)
14. [Service Structure](#14-service-structure)
15. [Deployment](#15-deployment)
16. [Security](#16-security)
17. [Implementation Order](#17-implementation-order)
18. [Open Questions](#18-open-questions)

---

## 1. Architecture Overview

```
                     ┌──────────────────────────────────────────────────┐
                     │           kortix-channels (port 8012)            │
                     │            Hono / Bun service                    │
                     │              ALWAYS-ON                           │
                     │                                                  │
  Telegram ──webhook─┤  ┌──────────┐   ┌───────────────────────────┐   │
  Slack    ──webhook─┤  │ Channel   │   │      Core Engine          │   │
  WhatsApp ──webhook─┤  │ Adapters  │──▶│                           │   │
  Discord  ──gateway─┤  │           │   │  parseInbound()           │   │
  MS Teams ──webhook─┤  │ telegram  │   │  resolveSession()         │   │
  VAPI     ──http────┤  │ slack     │   │  checkSandbox/wakeUp()    │   │
  Email    ──imap────┤  │ whatsapp  │   │  sendTypingIndicator()    │   │
  SMS      ──webhook─┤  │ discord   │   │  proxySandbox()           │   │
                     │  │ teams     │   │  chunkResponse()          │   │
                     │  │ voice     │   │  deliverOutbound()        │   │
                     │  │ email     │   │                           │   │
                     │  │ sms       │   │  + SandboxConnector       │   │
                     │  └──────────┘   │  + SessionManager         │   │
                     │                 │  + MessageQueue            │   │
                     │                 │  + RateLimiter             │   │
                     │                 └───────────────────────────┘   │
                     │                          │                       │
                      │                    Supabase DB                   │
                      │           (kortix schema via @kortix/db)         │
                     └────────────────────┬─────────────────────────────┘
                                          │
                                    HTTP + SSE
                                          │
                                          ▼
                     ┌──────────────────────────────────┐
                     │     Sandbox (Kortix Master)       │
                     │     SLEEPS WHEN IDLE (Daytona)    │
                     │                                   │
                     │   POST /session                   │
                     │   POST /session/:id/prompt        │
                     │   POST /session/:id/prompt_async  │
                     │   GET  /event (SSE)               │
                     │   POST /session/:id/abort         │
                     └──────────────────────────────────┘
```

**Key principle:** Every channel does the same 5 things:
1. Receive a message from the external platform
2. Normalize it into a common format (`NormalizedMessage`)
3. Route to the right sandbox + OpenCode session (waking the sandbox if needed)
4. Proxy the prompt and consume the SSE response stream
5. Format the agent's response and deliver it back via the platform API

Adapters handle steps 1, 2, and 5 (platform-specific). The core engine handles 3 and 4 (universal).

---

## 2. Why Channels Must Live Outside the Sandbox

This is the most important architectural decision and the key difference from projects like OpenClaw.

### The Daytona Constraint

Kortix sandboxes run on [Daytona](https://www.daytona.io/) — a cloud workspace platform that provides scalability and security through container isolation. Sandboxes **sleep when idle** to save cost. A user with 0 active sessions has a stopped sandbox.

This means:
- **Sandboxes are not always-on.** They can be OFFLINE, STARTING, LIVE, or FAILED.
- **Webhooks need an always-on endpoint.** Telegram/Slack/Discord won't wait 60s for a sandbox to boot.
- **Platform WebSocket connections need persistence.** Discord's gateway WS must be maintained 24/7.
- **Immediate responses matter.** Typing indicators, ack messages, "I'm thinking..." — all need to happen before the sandbox is even awake.

### Comparison with OpenClaw

OpenClaw (185k stars, 14+ channels) runs all channels in-process on a single always-on Gateway. Their model works because:
- It's a **single-user personal assistant** running on your own VPS/laptop
- The Gateway **never sleeps** — it's always there to receive webhooks
- The agent runs **in the same process** (RPC, not HTTP) — zero network latency

We can't do that because:
- We're **multi-tenant** — hundreds of users, each with their own sandbox
- Sandboxes **sleep for cost/scalability** — Daytona bills for uptime
- The agent is in a **separate container** — communication is HTTP+SSE over the network

### The Decision: Option A — Fully Outside

Channel logic lives entirely in `kortix-channels`, a standalone always-on cloud service. The sandbox is a "dumb" prompt-response endpoint. This means:

- **We control all adapter code** — deployed as part of our service
- **The adapter interface is the extensibility surface** — adding a channel = adding a self-contained adapter directory + one line in the registry
- **Extensibility comes from interface quality**, not from runtime plugin discovery. If the `ChannelAdapter` interface is well-defined, anyone (our team, contributors, or users who fork/self-host) can add a channel without understanding the core engine.
- **Open-sourcing `kortix-channels` later** would enable the OpenClaw-style community contribution model

---

## 3. Where It Fits

### Relationship to existing services

| Service | Role | Channels interaction |
|---------|------|---------------------|
| **kortix-daytona-proxy** | Sandbox lifecycle via Daytona | Channels calls daytona-proxy's API to check sandbox status and trigger wake-up when a message arrives for an offline sandbox. |
| **kortix-router** | LLM + API proxy | No direct interaction. Channels talks directly to sandboxes. |
| **kortix-cron** | Scheduled triggers | Conceptually parallel — cron triggers agent by schedule, channels triggers by external message. Both use `OpenCodeClient` pattern. Could share the client code via `@agentpress/shared`. |
| **voice** (existing) | VAPI proxy | **Migrated into channels** as the `voice` adapter. The Python FastAPI server is replaced by a TypeScript adapter in the channels service. |
| **frontend** | Dashboard UI | Channels management UI added. Existing OAuth callback route (`/api/integrations/[provider]/callback`) now proxies to `kortix-channels` instead of a nonexistent backend. |

### Why a single service (not per-channel microservices)

- All webhook-based adapters are stateless HTTP handlers — trivial to colocate
- Shared DB connection pool, shared auth middleware, shared sandbox connector
- One deployment to manage, one set of env vars
- Discord's persistent WebSocket gateway runs as a background task inside the service
- Voice's SSE streaming runs as a long-lived handler (same as it does today in Python)

---

## 4. Reference: OpenClaw Analysis

We studied [OpenClaw](https://github.com/openclaw/openclaw) (185k stars, 14+ channels) as a reference implementation. Full analysis in `research/openclaw-channel-architecture/report.md`.

### What we adopt from OpenClaw

| Pattern | OpenClaw | Kortix Adaptation |
|---------|----------|-------------------|
| **Normalized message envelope** | `MsgContext` with 50+ fields: `Body`, `From`, `To`, `Provider`, `ChatType`, `SessionKey`, `WasMentioned`, `BodyForAgent`, `MediaPath`, etc. | Our `NormalizedMessage` enriched with `chatType`, `wasMentioned`, `bodyForAgent` fields (see Section 6). |
| **Capability-driven behavior** | `ChannelCapabilities`: `chatTypes[]`, `polls`, `reactions`, `edit`, `unsend`, `reply`, `threads`, `media`, `blockStreaming` | Our `ChannelCapabilities` expanded with `chatTypes`, `edit`, `reactions`, `blockStreaming` (see Section 6). |
| **Deterministic session keys** | `agent:<agentId>:<channel>:<chatType>:<peerId>` with configurable `dmScope` | Our session strategy uses same pattern: `{configId}:{strategy}:{discriminator}` (see Section 8). |
| **Per-channel text chunking** | `textChunkLimit` per channel + optional custom chunker (Telegram uses markdown-aware chunking) | Each adapter declares `textChunkLimit` in capabilities. Shared `message-splitter.ts` utility with markdown-aware splitting. |
| **AbortController lifecycle** | Every channel gets an `AbortSignal` for clean shutdown | Each adapter instance receives an `AbortSignal` at startup via `start(signal)`. |
| **Group/mention gating** | `ChannelGroupAdapter` with `resolveRequireMention`, per-group config, mention stripping patterns | Group support in `NormalizedMessage.chatType` + `wasMentioned`. Per-channel group config in `platformConfig`. |
| **Multi-account support** | Each channel can have multiple accounts (e.g., 2 Telegram bots) | `channel_configs` table supports multiple rows per channel type per user. Schema supports it from day 1. |
| **Self-contained adapter directories** | Each channel is a directory with adapter + webhook + API client. No cross-adapter imports. | Same structure: `adapters/{channel}/adapter.ts`, `webhook.ts`, `api.ts`. |

### What we do differently

| Aspect | OpenClaw | Kortix | Why |
|--------|----------|--------|-----|
| **Deployment** | Single local process, always-on | Separate cloud service | Sandboxes sleep (Daytona). Need always-on webhook receiver + sandbox wake-up. |
| **Agent connection** | In-process RPC | Remote HTTP+SSE | Agent is in a separate Daytona container. |
| **Configuration** | JSON file (`~/.openclaw/openclaw.json`) | Database (Supabase + Drizzle) | Multi-tenant. Users configure via frontend UI. |
| **Plugin discovery** | npm packages with `openclaw` manifest key, auto-discovered from workspace/global/bundled | Hardcoded registry. Adapters are TypeScript files in the service. | We deploy the service. No user-side plugin installation. Extensibility via interface quality + open source, not runtime discovery. |
| **Scale model** | One user, one Gateway | Many users, many sandboxes, one channels service | Multi-tenant SaaS. |
| **20 optional adapter interfaces** | `ChannelPlugin` has gateway, outbound, pairing, security, groups, mentions, threading, messaging, agentPrompt, directory, resolver, actions, heartbeat, agentTools, etc. | Simpler interface (see Section 6). Can decompose into sub-adapters later if complexity warrants. | Their granularity evolved over 9k+ commits. Start simpler, refine as we add channels. |

### Key insight: extensibility comes from interface quality

OpenClaw's npm plugin discovery is just sugar on top of a clean `ChannelPlugin` interface. The real extensibility comes from the fact that:
1. The interface is well-defined and documented
2. Each adapter is self-contained (its own directory, no cross-adapter imports)
3. The only shared contract is the types (`ChannelPlugin` + `MsgContext`)
4. Adding a channel = implementing the interface + one line in the registry

We get the same extensibility by designing a clean `ChannelAdapter` interface. Whether it's discovered from npm or hardcoded in a registry is a packaging detail, not an architecture decision.

---

## 5. Core Engine

### 5.1 Message Processing Pipeline

```typescript
// core/engine.ts

export class ChannelEngine {
  constructor(
    private sessionManager: SessionManager,
    private sandboxConnector: SandboxConnector,
    private messageQueue: MessageQueue,
    private rateLimiter: RateLimiter,
    private db: DrizzleDB,
  ) {}

  /**
   * Universal message handler — called by every adapter after normalization.
   * Returns the agent's response (adapter formats it for the platform).
   */
  async processMessage(
    msg: NormalizedMessage,
    adapter: ChannelAdapter,
  ): Promise<AgentResponse> {
    // 1. Resolve channel config
    const channelConfig = await this.getChannelConfig(msg.channelConfigId);

    // 2. Rate limit check
    if (!this.rateLimiter.allow(channelConfig.id, msg.platformUser.id)) {
      return { text: 'Rate limit exceeded. Please slow down.', attachments: [] };
    }

    // 3. Access control (is this platform user allowed?)
    if (!await this.checkAccess(channelConfig, msg)) {
      return null; // silently drop — or send pairing code (future)
    }

    // 4. Resolve sandbox target
    const sandbox = await this.resolveSandbox(channelConfig);

    // 5. Log inbound message
    await this.logMessage(msg, 'inbound');

    // 6. Send typing indicator while we work
    adapter.sendTypingIndicator?.(msg, channelConfig);

    // 7. Check sandbox health; queue if not ready
    const isReady = await this.sandboxConnector.isReady(sandbox);
    if (!isReady) {
      return this.handleOfflineSandbox(sandbox, channelConfig, msg, adapter);
    }

    // 8. Resolve or create OpenCode session
    const sessionId = await this.sessionManager.resolve(
      sandbox, channelConfig, msg,
    );

    // 9. Build the prompt (may include channel context)
    const prompt = this.buildPrompt(msg, channelConfig);

    // 10. Send prompt to sandbox and collect response
    const response = await this.sandboxConnector.prompt(
      sandbox, sessionId, prompt,
      { attachments: msg.attachments },
    );

    // 11. Chunk response per channel limits
    const chunked = this.chunkResponse(response, adapter.capabilities());

    // 12. Log outbound
    await this.logMessage(
      { ...msg, text: response.text, direction: 'outbound' },
      'outbound',
    );

    return chunked;
  }

  /**
   * Build the prompt text sent to OpenCode.
   * Includes channel context so the agent knows where the message came from.
   */
  private buildPrompt(msg: NormalizedMessage, config: ChannelConfig): string {
    const parts: string[] = [];

    // System prompt override
    if (config.systemPrompt) {
      parts.push(config.systemPrompt);
    }

    // Channel context (helps agent adapt response style)
    if (msg.chatType === 'group') {
      parts.push(`[Channel: ${msg.channelType}, group "${msg.groupName || msg.threadId}". Sender: ${msg.platformUser.name}. Keep responses concise for group chat.]`);
    } else {
      parts.push(`[Channel: ${msg.channelType}, DM from ${msg.platformUser.name}.]`);
    }

    // The actual message
    parts.push(msg.bodyForAgent || msg.text);

    return parts.join('\n\n');
  }

  /**
   * Chunk a response per the channel's text limits.
   */
  private chunkResponse(
    response: AgentResponse,
    capabilities: ChannelCapabilities,
  ): AgentResponse {
    if (response.text.length <= capabilities.textChunkLimit) {
      return response;
    }
    // Split using markdown-aware splitter
    return {
      ...response,
      textChunks: splitMessage(response.text, capabilities.textChunkLimit),
    };
  }

  /**
   * Streaming variant — for channels that support real-time updates.
   * Returns an async iterator of text chunks.
   */
  async *processMessageStreaming(
    msg: NormalizedMessage,
  ): AsyncGenerator<string> {
    // Same steps 1-8 as above, then:
    const sandbox = /* resolved */;
    const sessionId = /* resolved */;
    const prompt = /* built */;

    yield* this.sandboxConnector.promptStreaming(
      sandbox, sessionId, prompt,
      { attachments: msg.attachments },
    );
  }
}
```

### 5.2 Sandbox Connector

Reuses the same pattern as `kortix-cron`'s `OpenCodeClient`, but adds:
- **SSE consumption** for streaming responses (like voice does today)
- **Health check + wake-up** via `kortix-daytona-proxy` API
- **Abort** support for interruptions

```typescript
// core/sandbox-connector.ts

export class SandboxConnector {
  /**
   * Check if sandbox is live and responsive.
   */
  async isReady(sandbox: SandboxTarget): Promise<boolean> {
    try {
      const res = await fetch(`${sandbox.baseUrl}/kortix/health`, {
        headers: this.authHeaders(sandbox),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wake up an offline sandbox via kortix-daytona-proxy.
   */
  async wakeUp(sandbox: SandboxTarget): Promise<void> {
    await fetch(`${CLOUD_SERVICE_URL}/v1/sandboxes/${sandbox.daytonaId}/start`, {
      method: 'POST',
      headers: { /* service-to-service auth */ },
    });
  }

  /**
   * Send a prompt and wait for the full response.
   * Internally uses SSE to collect the complete response.
   */
  async prompt(
    sandbox: SandboxTarget,
    sessionId: string,
    text: string,
    opts?: { attachments?: Attachment[] },
  ): Promise<AgentResponse> {
    let fullText = '';
    for await (const chunk of this.promptStreaming(sandbox, sessionId, text, opts)) {
      fullText += chunk;
    }
    return { text: fullText, attachments: [] };
  }

  /**
   * Send a prompt and yield text chunks as they arrive via SSE.
   * Mirrors the voice service's SSE consumption pattern.
   */
  async *promptStreaming(
    sandbox: SandboxTarget,
    sessionId: string,
    text: string,
    opts?: { attachments?: Attachment[] },
  ): AsyncGenerator<string> {
    // 1. Connect to SSE event stream (persistent, like voice does)
    // 2. POST /session/:id/prompt_async
    // 3. Filter events for our session
    // 4. Yield text deltas
    // 5. Return on session.idle
  }

  /**
   * Abort an in-flight prompt (for voice interruptions, etc).
   */
  async abort(sandbox: SandboxTarget, sessionId: string): Promise<void> {
    await fetch(`${sandbox.baseUrl}/session/${sessionId}/abort`, {
      method: 'POST',
      headers: this.authHeaders(sandbox),
    });
  }
}
```

### 5.3 Session Manager

Maps channel conversations to OpenCode sessions based on the configured strategy.
Uses deterministic session keys inspired by OpenClaw's `agent:<agentId>:<channel>:<chatType>:<peerId>` pattern.

```typescript
// core/session-manager.ts

export class SessionManager {
  // In-memory cache: strategy key → sessionId
  // Evicts after 24h of inactivity
  private cache = new Map<string, { sessionId: string; lastUsed: number }>();

  async resolve(
    sandbox: SandboxTarget,
    config: ChannelConfig,
    msg: NormalizedMessage,
  ): Promise<string> {
    const cacheKey = this.buildCacheKey(config, msg);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      cached.lastUsed = Date.now();
      return cached.sessionId;
    }

    // Check DB for persisted session mapping
    const persisted = await this.db.query.channelSessions.findFirst({
      where: and(
        eq(channelSessions.channelConfigId, config.id),
        eq(channelSessions.strategyKey, cacheKey),
      ),
    });

    if (persisted) {
      this.cache.set(cacheKey, {
        sessionId: persisted.sessionId,
        lastUsed: Date.now(),
      });
      return persisted.sessionId;
    }

    // Create new session on the sandbox
    const sessionId = await this.createSession(sandbox, config);
    this.cache.set(cacheKey, { sessionId, lastUsed: Date.now() });
    await this.persistMapping(config.id, cacheKey, sessionId);
    return sessionId;
  }

  /**
   * Deterministic session key from (config, strategy, discriminator).
   * Inspired by OpenClaw's session key algebra.
   */
  private buildCacheKey(config: ChannelConfig, msg: NormalizedMessage): string {
    const base = `${config.id}:${config.channelType}`;
    switch (config.sessionStrategy) {
      case 'single':
        return `${base}:single`;
      case 'per-thread':
        // Thread → use threadId. Group without thread → use group ID.
        // DM without thread → use user ID. Matches OpenClaw's per-channel-peer.
        if (msg.threadId) return `${base}:thread:${msg.threadId}`;
        if (msg.chatType === 'group') return `${base}:group:${msg.groupId || msg.threadId}`;
        return `${base}:dm:${msg.platformUser.id}`;
      case 'per-user':
        return `${base}:user:${msg.platformUser.id}`;
      case 'per-message':
        return `${base}:msg:${msg.externalId}`;
      default:
        return `${base}:dm:${msg.platformUser.id}`;
    }
  }
}
```

### 5.4 Message Queue (In-Memory)

For messages that arrive while a sandbox is booting.

```typescript
// core/queue.ts

interface QueuedMessage {
  message: NormalizedMessage;
  adapter: ChannelAdapter;
  channelConfig: ChannelConfig;
  enqueuedAt: number;
}

export class MessageQueue {
  private queues = new Map<string, QueuedMessage[]>(); // sandboxId → messages
  private waking = new Set<string>(); // sandboxes currently starting

  async enqueue(
    sandboxId: string,
    message: NormalizedMessage,
    adapter: ChannelAdapter,
    channelConfig: ChannelConfig,
  ): void {
    const queue = this.queues.get(sandboxId) || [];
    queue.push({ message, adapter, channelConfig, enqueuedAt: Date.now() });
    this.queues.set(sandboxId, queue);

    // Send "I'm waking up" message to the user immediately
    await adapter.sendResponse(
      message,
      { text: 'Waking up... one moment.', attachments: [], isTransient: true },
      channelConfig,
    );

    if (!this.waking.has(sandboxId)) {
      this.waking.add(sandboxId);
      this.startWakeAndDrain(sandboxId);
    }
  }

  private async startWakeAndDrain(sandboxId: string): Promise<void> {
    try {
      await this.sandboxConnector.wakeUp(sandboxId);
      await this.pollUntilReady(sandboxId, 90_000); // 90s timeout

      const queue = this.queues.get(sandboxId) || [];
      for (const item of queue) {
        const response = await this.engine.processMessage(item.message, item.adapter);
        await item.adapter.sendResponse(item.message, response, item.channelConfig);
      }
      this.queues.delete(sandboxId);
    } catch (err) {
      // Send error response to all queued messages
      const queue = this.queues.get(sandboxId) || [];
      for (const item of queue) {
        await item.adapter.sendResponse(item.message, {
          text: "I'm having trouble waking up right now. Please try again in a moment.",
          attachments: [],
        }, item.channelConfig);
      }
      this.queues.delete(sandboxId);
    } finally {
      this.waking.delete(sandboxId);
    }
  }
}
```

---

## 6. Adapter Interface

Designed as a clean, self-contained contract. Someone should be able to read this interface, look at the Telegram adapter as a reference, and write a new adapter without understanding the core engine.

### ChannelAdapter (the main interface)

```typescript
// adapters/base.ts

export interface ChannelAdapter {
  /** Adapter identifier: "telegram" | "slack" | "discord" | ... */
  readonly type: ChannelType;

  /** Human-readable name */
  readonly name: string;

  /** What this channel can do — drives engine behavior and frontend display. */
  readonly capabilities: ChannelCapabilities;

  /**
   * Register HTTP routes for this adapter (webhooks, OAuth, etc).
   * Called once at startup.
   */
  registerRoutes(app: Hono, engine: ChannelEngine): void;

  /**
   * Start any background processes (Discord gateway WS, IMAP polling, etc).
   * Receives an AbortSignal for clean shutdown.
   * Called once at startup after registerRoutes.
   */
  start?(signal: AbortSignal): Promise<void>;

  /**
   * Graceful shutdown (close WS connections, stop polling, etc).
   * The AbortSignal from start() will also be triggered.
   */
  shutdown?(): Promise<void>;

  /**
   * Parse raw platform payload into a NormalizedMessage.
   * Return null to skip (e.g. bot's own messages, system events).
   */
  parseInbound(
    raw: unknown,
    channelConfig: ChannelConfig,
  ): Promise<NormalizedMessage | null>;

  /**
   * Format and send the agent's response back to the platform.
   * Must handle chunking if response.textChunks is present.
   */
  sendResponse(
    inbound: NormalizedMessage,
    response: AgentResponse,
    channelConfig: ChannelConfig,
  ): Promise<void>;

  /**
   * Send a typing/activity indicator while the agent is processing.
   * Optional — not all platforms support this.
   */
  sendTypingIndicator?(
    inbound: NormalizedMessage,
    channelConfig: ChannelConfig,
  ): Promise<void>;

  /**
   * Called when a new channelConfig is created for this adapter type.
   * Use for platform setup (e.g. Telegram setWebhook, Slack event subscription).
   */
  onChannelCreated?(channelConfig: ChannelConfig): Promise<void>;

  /**
   * Called when a channelConfig is deleted or disabled.
   * Use for platform teardown (e.g. Telegram deleteWebhook).
   */
  onChannelRemoved?(channelConfig: ChannelConfig): Promise<void>;

  /**
   * Validate platform credentials before saving.
   * Return an error message if invalid, null if OK.
   */
  validateCredentials?(credentials: Record<string, string>): Promise<string | null>;
}
```

### NormalizedMessage (the universal envelope)

Enriched with fields learned from OpenClaw's `MsgContext`:

```typescript
export interface NormalizedMessage {
  externalId: string;           // Platform message ID
  channelType: ChannelType;     // "telegram", "slack", etc.
  channelConfigId: string;      // UUID of the channel_configs row
  sandboxId: string;            // Target sandbox (from channelConfig)

  // ─── Content ──────────────────────────────────────────────
  text: string;                 // Plain text (always present, stripped of mentions)
  bodyForAgent?: string;        // Agent-facing version with additional context
  richText?: string;            // Markdown/HTML if the platform supports it
  attachments?: Attachment[];   // Files, images, audio, etc.

  // ─── Chat Context ─────────────────────────────────────────
  chatType: 'direct' | 'group' | 'channel' | 'thread';
  wasMentioned: boolean;        // Was the bot @mentioned? (relevant for groups)
  groupId?: string;             // Group/channel ID (for group messages)
  groupName?: string;           // Human-readable group name

  // ─── Threading ────────────────────────────────────────────
  threadId?: string;            // Slack thread_ts, Telegram topic, Discord thread ID
  replyToId?: string;           // Specific message being replied to

  // ─── Sender ───────────────────────────────────────────────
  platformUser: {
    id: string;
    name: string;
    avatar?: string;
  };

  // ─── Metadata ─────────────────────────────────────────────
  timestamp: Date;
  raw: unknown;                 // Original platform payload (for debugging)
}
```

### ChannelCapabilities

Expanded with fields from OpenClaw's capability model:

```typescript
export interface ChannelCapabilities {
  // What kinds of conversations this channel supports
  chatTypes: Array<'direct' | 'group' | 'channel' | 'thread'>;

  // Content capabilities
  supportsRichText: boolean;      // Markdown/formatting
  supportsAttachments: boolean;
  supportedMediaTypes: string[];  // MIME types
  textChunkLimit: number;         // Max message length (e.g. Telegram=4096, Discord=2000)

  // Interaction capabilities
  supportsThreading: boolean;
  supportsReactions: boolean;
  supportsEditing: boolean;       // Can we edit already-sent messages?
  supportsButtons: boolean;       // Interactive elements / inline keyboards

  // Streaming capabilities
  supportsBlockStreaming: boolean; // Can we edit a message in real-time? (pseudo-streaming)
  blockStreamingConfig?: {
    minChars: number;             // Min chars before first edit
    idleMs: number;               // Ms of no new chars before editing
  };

  // Connection type (for engine to know what to expect)
  connectionType: 'webhook' | 'websocket' | 'polling' | 'http-api';
}
```

### Supporting Types

```typescript
export interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url?: string;                 // Direct download URL
  data?: Buffer;                // Inline binary data
  mimeType: string;
  filename?: string;
  size?: number;
}

export interface AgentResponse {
  text: string;
  textChunks?: string[];        // Pre-split for channels with short limits
  attachments?: Attachment[];
  isTransient?: boolean;        // "waking up" messages that may be deleted/edited later
}

export type ChannelType =
  | 'telegram' | 'slack' | 'discord' | 'whatsapp'
  | 'teams' | 'voice' | 'email' | 'sms';
```

### Adapter Registry

Simple, explicit, no magic:

```typescript
// adapters/registry.ts

import { TelegramAdapter } from './telegram/adapter';
import { SlackAdapter } from './slack/adapter';
import { DiscordAdapter } from './discord/adapter';
// ...

/**
 * All available channel adapters.
 * Adding a new channel = implementing ChannelAdapter + adding one line here.
 */
export function createAdapters(): Map<ChannelType, ChannelAdapter> {
  return new Map([
    ['telegram', new TelegramAdapter()],
    ['slack', new SlackAdapter()],
    ['discord', new DiscordAdapter()],
    ['whatsapp', new WhatsAppAdapter()],
    ['teams', new TeamsAdapter()],
    ['voice', new VoiceAdapter()],
    ['email', new EmailAdapter()],
    ['sms', new SmsAdapter()],
  ]);
}
```

---

## 7. Database Schema

Channel tables live in the **shared `kortix` Postgres schema** inside `packages/db/src/schema/kortix.ts` — the same file that defines `sandboxes`, `triggers`, and `executions`. The `kortix-channels` service imports everything from `@kortix/db` (via `"@kortix/db": "workspace:*"`) and calls `createDb()` — no local Drizzle config, no local schema file, no service-level migrations.

### Design principles (matching existing conventions)

| Convention | Example from existing schema | Applied to channels |
|-----------|------------------------------|---------------------|
| Schema object | `kortixSchema = pgSchema('kortix')` | Reuse same `kortixSchema` — all tables in one schema |
| PK naming | `sandboxId`, `triggerId`, `executionId` | `channelConfigId`, `channelSessionId`, `channelMessageId`, `channelIdentityId` |
| FK to sandboxes | `triggers.sandboxId → sandboxes.sandboxId` | `channelConfigs.sandboxId → sandboxes.sandboxId` (real FK, cascade delete) |
| `accountId` | `uuid('account_id').notNull()` (no FK — application-level) | Same pattern |
| JSONB typing | `.$type<Record<string, unknown>>()` | Typed interfaces for `credentials`, `platformConfig`, `platformUser` |
| `metadata` JSONB | Every table has `metadata` for extensibility | Added to all 4 channel tables |
| Timestamps | `createdAt`, `updatedAt` with `withTimezone: true` | Same |
| Index naming | `idx_{table}_{column}` | Same |
| Enums | `kortixSchema.enum(...)` | `channelTypeEnum`, `sessionStrategyEnum` |
| Relations | Explicit `relations()` calls | Added for all channel tables |

### Sandbox connection — JOIN, don't duplicate

The old plan stored `sandbox_base_url` and `sandbox_auth_token` directly on `channel_configs`. This is wrong — that data already lives on `kortix.sandboxes`. Instead:

- `channel_configs.sandboxId` is a **real FK** to `sandboxes.sandboxId`
- At message time, the service JOINs to get `baseUrl` + `authToken`:

```typescript
const config = await db.query.channelConfigs.findFirst({
  where: eq(channelConfigs.channelConfigId, configId),
  with: { sandbox: true },  // Drizzle relational query → JOIN
});
// config.sandbox.baseUrl, config.sandbox.authToken — always fresh
```

This eliminates stale URLs, removes data duplication, and means sandbox URL rotations (e.g. after Daytona restart) propagate automatically.

### JSONB type interfaces

```typescript
// Typed interfaces for JSONB columns (in packages/db/src/schema/kortix.ts)

/** Platform-specific credentials (encrypted at rest by Supabase) */
export interface ChannelCredentials {
  // Telegram
  botToken?: string;
  // Slack
  botToken?: string;           // xoxb-...
  signingSecret?: string;
  // Discord
  botToken?: string;
  applicationId?: string;
  // WhatsApp
  accessToken?: string;
  phoneNumberId?: string;
  verifyToken?: string;
  // Teams
  microsoftAppId?: string;
  microsoftAppPassword?: string;
  // Voice
  vapiApiKey?: string;
  // Email
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  emailUser?: string;
  emailPass?: string;
  // SMS
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  // Generic
  [key: string]: unknown;
}

/** Platform-specific configuration (groups, DM policy, etc.) */
export interface ChannelPlatformConfig {
  groups?: {
    requireMention?: boolean;
    allowedGroupIds?: string[];
    groupOverrides?: Record<string, { requireMention?: boolean }>;
  };
  dm?: {
    policy?: 'open' | 'allowlist';
    allowFrom?: string[];
  };
  [key: string]: unknown;
}

/** Platform user info stored in message log */
export interface ChannelPlatformUser {
  id: string;
  name: string;
  avatar?: string;
}
```

### Table definitions

These are added to `packages/db/src/schema/kortix.ts` alongside the existing tables:

```typescript
// ─── Channel Enums ────────────────────────────────────────────────────────────

export const channelTypeEnum = kortixSchema.enum('channel_type', [
  'telegram',
  'slack',
  'discord',
  'whatsapp',
  'teams',
  'voice',
  'email',
  'sms',
]);

export const sessionStrategyEnum = kortixSchema.enum('session_strategy', [
  'single',
  'per-thread',
  'per-user',
  'per-message',
]);

// ─── Channel Configurations ──────────────────────────────────────────────────
// One row per connected channel instance (e.g. "My Telegram Bot", "Acme Slack Workspace").
// A user can have MULTIPLE configs for the same channel type (e.g. 2 Telegram bots).

export const channelConfigs = kortixSchema.table(
  'channel_configs',
  {
    channelConfigId: uuid('channel_config_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    channelType: channelTypeEnum('channel_type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),

    // Platform credentials (bot token, webhook secret, etc.)
    // Encrypted at rest by Supabase; v2: application-level encryption via KMS
    credentials: jsonb('credentials').notNull().$type<ChannelCredentials>(),

    // Platform-specific config (group settings, DM policy, etc.)
    platformConfig: jsonb('platform_config').default({}).$type<ChannelPlatformConfig>(),

    // Session routing
    sessionStrategy: sessionStrategyEnum('session_strategy').default('per-thread').notNull(),
    systemPrompt: text('system_prompt'),
    agentName: varchar('agent_name', { length: 255 }),

    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_configs_account').on(table.accountId),
    index('idx_channel_configs_sandbox').on(table.sandboxId),
    index('idx_channel_configs_type').on(table.channelType),
  ],
);

// ─── Channel Sessions ────────────────────────────────────────────────────────
// Persists the mapping from (channel + strategy key) → OpenCode session ID.
// In-memory cache in SessionManager, DB is the durable backing store.

export const channelSessions = kortixSchema.table(
  'channel_sessions',
  {
    channelSessionId: uuid('channel_session_id').defaultRandom().primaryKey(),
    channelConfigId: uuid('channel_config_id')
      .notNull()
      .references(() => channelConfigs.channelConfigId, { onDelete: 'cascade' }),
    strategyKey: text('strategy_key').notNull(),        // e.g. "telegram:thread:12345"
    sessionId: text('session_id').notNull(),             // OpenCode session ID on the sandbox
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_sessions_config').on(table.channelConfigId),
    index('idx_channel_sessions_key').on(table.channelConfigId, table.strategyKey),
  ],
);

// ─── Channel Messages ────────────────────────────────────────────────────────
// Audit trail for debugging, analytics, and billing.

export const channelMessages = kortixSchema.table(
  'channel_messages',
  {
    channelMessageId: uuid('channel_message_id').defaultRandom().primaryKey(),
    channelConfigId: uuid('channel_config_id')
      .notNull()
      .references(() => channelConfigs.channelConfigId, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),              // 'inbound' | 'outbound'
    externalId: text('external_id'),                     // Platform message ID
    sessionId: text('session_id'),                       // OpenCode session ID used
    chatType: text('chat_type'),                         // 'direct' | 'group' | 'channel' | 'thread'
    content: text('content'),
    attachments: jsonb('attachments').default([]).$type<unknown[]>(),
    platformUser: jsonb('platform_user').$type<ChannelPlatformUser>(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_messages_config').on(table.channelConfigId),
    index('idx_channel_messages_created').on(table.createdAt),
  ],
);

// ─── Channel Identity Map ────────────────────────────────────────────────────
// Maps platform users to Kortix accounts + access control.

export const channelIdentityMap = kortixSchema.table(
  'channel_identity_map',
  {
    channelIdentityId: uuid('channel_identity_id').defaultRandom().primaryKey(),
    channelConfigId: uuid('channel_config_id')
      .notNull()
      .references(() => channelConfigs.channelConfigId, { onDelete: 'cascade' }),
    platformUserId: text('platform_user_id').notNull(),
    platformUserName: text('platform_user_name'),
    kortixUserId: uuid('kortix_user_id'),               // Nullable — not all platform users have Kortix accounts
    allowed: boolean('allowed').default(true).notNull(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_identity_config_user').on(table.channelConfigId, table.platformUserId),
  ],
);
```

### Relations (added to existing relations block)

```typescript
// ─── Channel Relations ────────────────────────────────────────────────────────

// Extend existing sandboxesRelations to include channelConfigs
export const sandboxesRelations = relations(sandboxes, ({ many }) => ({
  triggers: many(triggers),
  executions: many(executions),
  channelConfigs: many(channelConfigs),
}));

export const channelConfigsRelations = relations(channelConfigs, ({ one, many }) => ({
  sandbox: one(sandboxes, {
    fields: [channelConfigs.sandboxId],
    references: [sandboxes.sandboxId],
  }),
  sessions: many(channelSessions),
  messages: many(channelMessages),
  identities: many(channelIdentityMap),
}));

export const channelSessionsRelations = relations(channelSessions, ({ one }) => ({
  channelConfig: one(channelConfigs, {
    fields: [channelSessions.channelConfigId],
    references: [channelConfigs.channelConfigId],
  }),
}));

export const channelMessagesRelations = relations(channelMessages, ({ one }) => ({
  channelConfig: one(channelConfigs, {
    fields: [channelMessages.channelConfigId],
    references: [channelConfigs.channelConfigId],
  }),
}));

export const channelIdentityMapRelations = relations(channelIdentityMap, ({ one }) => ({
  channelConfig: one(channelConfigs, {
    fields: [channelIdentityMap.channelConfigId],
    references: [channelConfigs.channelConfigId],
  }),
}));
```

### Types export (added to `packages/db/src/types.ts`)

```typescript
import {
  channelConfigs, channelSessions, channelMessages, channelIdentityMap,
} from './schema/kortix';

// Channel select types
export type ChannelConfig = typeof channelConfigs.$inferSelect;
export type ChannelSession = typeof channelSessions.$inferSelect;
export type ChannelMessage = typeof channelMessages.$inferSelect;
export type ChannelIdentity = typeof channelIdentityMap.$inferSelect;

// Channel insert types
export type NewChannelConfig = typeof channelConfigs.$inferInsert;
export type NewChannelSession = typeof channelSessions.$inferInsert;
export type NewChannelMessage = typeof channelMessages.$inferInsert;
export type NewChannelIdentity = typeof channelIdentityMap.$inferInsert;
```

### Service DB setup (2 lines, same as `kortix-cron`)

```typescript
// services/kortix-channels/src/db/index.ts
import { createDb } from '@kortix/db';
export const db = createDb();
```

No `drizzle.config.ts`, no `db/schema.ts`, no `migrations/` directory in the service. Schema sync happens from `packages/db` via `pnpm db:push`.

---

## 8. Session Strategy

How platform conversations map to OpenCode sessions:

| Strategy | Session Key | Behavior | Best For |
|----------|-------------|----------|----------|
| `single` | `{configId}:{type}:single` | One session per channel config, forever | Personal assistant (1:1 with your bot) |
| `per-thread` | `{configId}:{type}:thread:{threadId}` or `{configId}:{type}:group:{groupId}` or `{configId}:{type}:dm:{userId}` | Each thread/reply chain = one session. Groups without threads get one session per group. DMs fall back to per-user. | **Default.** Slack threads, Telegram reply chains, team channels. |
| `per-user` | `{configId}:{type}:user:{platformUserId}` | Each platform user gets their own session | Multi-user workspace bots |
| `per-message` | `{configId}:{type}:msg:{externalId}` | Every message = fresh session, no context carryover | Stateless Q&A, triage bots |

Sessions are cached in-memory (evict after 24h idle) and persisted in `channel_sessions` table.

### Comparison with OpenClaw's session model

OpenClaw uses `dmScope` with values `main` (all DMs → one session), `per-peer`, `per-channel-peer`, `per-account-channel-peer`. Our `single`/`per-thread`/`per-user` maps roughly to their `main`/`per-channel-peer`/`per-peer`. We keep our naming simpler since we don't have the multi-agent routing layer.

---

## 9. Sandbox Connectivity & Wake-Up

### Flow when a message arrives

```
Message arrives at webhook
  │
  ├─ Adapter parses → NormalizedMessage
  │
  ├─ Engine resolves channelConfig → sandbox target
  │
  ├─ Adapter sends typing indicator (immediate, <100ms)
  │
  ├─ GET {baseUrl}/kortix/health (5s timeout)
  │     │
  │     ├─ 200 OK → proceed immediately
  │     │
  │     └─ timeout/error → sandbox offline
  │           │
  │           ├─ Send "Waking up..." message to user (immediate)
  │           ├─ Enqueue message in MessageQueue
  │           ├─ POST kortix-daytona-proxy /v1/sandboxes/{id}/start (wake-up)
  │           ├─ Poll health every 3s for up to 90s
  │           │     │
  │           │     ├─ 200 OK → drain queue, process all messages
  │           │     └─ timeout → send error response to user
  │           │
  │           └─ (if already waking, just enqueue — don't start again)
  │
  └─ Process message through engine pipeline
```

### Why this is better than in-sandbox channels

If channels ran inside the sandbox (like OpenClaw), the entire flow above would be blocked by the 30-60s boot time. With channels outside:
- **Typing indicator sent in <100ms** (before sandbox check)
- **"Waking up..." message sent immediately** (user knows something is happening)
- **Webhook acked instantly** (platforms like Slack require <3s response)
- **Multiple messages queued** during boot (not lost)

### Sandbox target resolution

`channel_configs.sandboxId` is a real FK to `kortix.sandboxes.sandboxId`. At message time the engine resolves sandbox connection details via a Drizzle relational JOIN — no duplicated columns, no stale URLs:

```typescript
const config = await db.query.channelConfigs.findFirst({
  where: eq(channelConfigs.channelConfigId, configId),
  with: { sandbox: true },
});
// config.sandbox.baseUrl  — always current
// config.sandbox.authToken — always current
```

If the sandbox's `baseUrl` rotates (e.g. after a Daytona restart), channel configs pick up the new value automatically on the next message. No sync job needed.

---

## 10. Groups, DMs & Access Control

Learned from OpenClaw: groups and DMs need different handling from day 1.

### Chat Types

```typescript
type ChatType = 'direct' | 'group' | 'channel' | 'thread';
```

| Chat Type | Behavior | Session Mapping |
|-----------|----------|-----------------|
| `direct` | 1:1 DM with the bot | Per-user or single session |
| `group` | Group chat where bot is a member | Per-group or per-thread session |
| `channel` | Broadcast channel (Slack channels, Discord channels) | Per-channel session |
| `thread` | Thread within a group/channel | Per-thread session |

### Group Activation (Mention Gating)

In groups, the bot should only respond when mentioned (prevents noise). This is configurable per channel config in `platformConfig`:

```typescript
// platformConfig.groups
{
  "requireMention": true,          // Default: only respond when @mentioned
  "allowedGroupIds": ["*"],        // Which groups to respond in ("*" = all)
  "groupOverrides": {
    "12345": { "requireMention": false }  // Always respond in this group
  }
}
```

The engine checks:
1. If `chatType === 'group'` and `requireMention` is true → only process if `wasMentioned` is true
2. If group is not in allowedGroupIds → silently drop

### DM Access Control

Who can DM the bot? Configurable per channel config:

```typescript
// platformConfig.dm
{
  "policy": "open" | "allowlist",     // Default: "open" for owner, "allowlist" for shared bots
  "allowFrom": ["platform_user_id_1", "platform_user_id_2"],  // If "allowlist"
}
```

For v1, default to `"open"` — the bot owner is the only one who knows the bot. Future: add OpenClaw-style pairing (unknown senders get a code, owner approves via UI).

---

## 11. Per-Adapter Details

### 11.1 Telegram

**Inbound:** Bot API webhook (`POST /webhooks/telegram/:configId`)
**Outbound:** Bot API `sendMessage`, `sendPhoto`, `sendDocument`, etc.

```
Setup: User creates bot via @BotFather → gets token → enters in UI → 
       we call setWebhook to point to our endpoint
```

| Detail | Value |
|--------|-------|
| Auth | Bot token in `credentials.botToken` |
| Webhook verification | Optional `secret_token` header (set via `setWebhook`) |
| Chat types | `direct`, `group`, `channel` (supergroups), `thread` (topics) |
| Threading | Reply-to message chain + forum topics (`message_thread_id`) |
| Rich text | MarkdownV2 or HTML |
| Text chunk limit | 4096 chars |
| Files | Bot API supports photos, documents, audio, video, voice |
| Block streaming | Edit message in real-time (Telegram supports `editMessageText`) |
| Typing indicator | `sendChatAction("typing")` |
| Mention detection | Check if bot username appears in message text or entities |

**Key implementation notes:**
- Call `setWebhook` in `onChannelCreated`, `deleteWebhook` in `onChannelRemoved`
- Handle message edits (`edited_message`) — optionally forward as a new prompt
- Handle `/start` command for onboarding
- Use markdown-aware chunker for long responses (don't split mid-code-block)
- OpenClaw uses [grammY](https://grammy.dev/) — good lightweight library choice

### 11.2 Slack

**Inbound:** Events API webhook (`POST /webhooks/slack/:configId`) or Socket Mode
**Outbound:** `chat.postMessage` via Web API

```
Setup: User installs Slack app via OAuth → we receive bot token + team info →
       Events API subscription sends messages to our webhook
```

| Detail | Value |
|--------|-------|
| Auth | OAuth2: `credentials.botToken`, `credentials.signingSecret` |
| Setup flow | OAuth install flow → redirect → store token |
| Webhook verification | Signing secret HMAC-SHA256 verification |
| Chat types | `direct` (DMs), `channel` (channels), `thread` |
| Threading | `thread_ts` — natural session boundary |
| Rich text | Slack mrkdwn + Block Kit |
| Text chunk limit | 4000 chars (Block Kit allows 40k but chunking at 4k is safer) |
| Files | `files.upload` API |
| Block streaming | Edit message in-place via `chat.update` (pseudo-streaming) |
| Typing indicator | Not available via API |
| Mention detection | `event.type === "app_mention"` or check for `<@BOT_ID>` in text |

**Key implementation notes:**
- URL verification challenge (`url_verification` event) — respond immediately with `challenge`
- Respond to Slack within 3 seconds (ack immediately, process async)
- Filter bot's own messages (`bot_id` check)
- Handle `app_mention` for channel messages, `message.im` for DMs
- Existing OAuth callback route in frontend already exists — wire to channels service
- OpenClaw uses [Bolt](https://slack.dev/bolt-js/) — consider for Socket Mode support

### 11.3 Discord

**Inbound:** Gateway WebSocket (via `discord.js`) or Interactions endpoint
**Outbound:** REST API `channels/:id/messages`

```
Setup: User creates Discord application + bot → enters token →
       bot connects to gateway
```

| Detail | Value |
|--------|-------|
| Auth | Bot token in `credentials.botToken` |
| Connection | Persistent WebSocket via Discord Gateway |
| Chat types | `direct` (DMs), `channel`, `thread` |
| Threading | Discord threads map naturally to sessions |
| Rich text | Discord markdown (subset of CommonMark) |
| Text chunk limit | 2000 chars |
| Files | Attachment uploads via REST API |
| Block streaming | Edit message via PATCH, coalesce at 1500 chars / 1s idle (OpenClaw pattern) |
| Typing indicator | `POST /channels/:id/typing` |
| Mention detection | Check for `<@BOT_ID>` in message content |

**Key implementation notes:**
- Gateway WS runs as a background task with `AbortSignal` for shutdown
- One WS connection per bot token — manages multiple guilds
- Need gateway intents: `GUILD_MESSAGES`, `DIRECT_MESSAGES`, `MESSAGE_CONTENT`
- Could use `discord.js` (heavyweight) or `@discordjs/rest` + `@discordjs/ws` (lighter)
- OpenClaw uses full `discord.js`
- Slash commands optional but nice (`/ask`, `/status`, `/reset`)

### 11.4 WhatsApp

**Inbound:** Meta Cloud API webhooks (`POST /webhooks/whatsapp/:configId`)
**Outbound:** Cloud API `POST /{phone-number-id}/messages`

```
Setup: User has Meta Business account → creates WhatsApp Business app →
       enters access token + phone number ID → we verify webhook
```

| Detail | Value |
|--------|-------|
| Auth | `credentials.accessToken`, `credentials.phoneNumberId`, `credentials.verifyToken` |
| Webhook verification | GET with `hub.verify_token` challenge |
| Chat types | `direct`, `group` |
| Threading | No native threads; use per-user strategy |
| Rich text | Limited (bold, italic, strikethrough, monospace) |
| Text chunk limit | 4096 chars |
| Files | Media endpoints for images, documents, audio, video |
| Block streaming | Not supported |
| Typing indicator | Limited (mark as read only) |
| Mention detection | N/A for DMs; in groups check for phone number mention |

**Key implementation notes:**
- 24-hour messaging window — can only respond within 24h of user's last message
- Outside window: need pre-approved message templates
- Webhook payload includes `statuses` (read receipts) — filter to `messages` only
- Media URLs require auth header to download
- OpenClaw uses [Baileys](https://github.com/WhiskeySockets/Baileys) (reverse-engineered WhatsApp Web) — we use official Cloud API for reliability

### 11.5 MS Teams

**Inbound:** Bot Framework webhook (`POST /webhooks/teams/:configId`)
**Outbound:** Bot Framework REST API

```
Setup: User registers Azure Bot → enters app ID + password →
       configures messaging endpoint to our webhook
```

| Detail | Value |
|--------|-------|
| Auth | `credentials.microsoftAppId`, `credentials.microsoftAppPassword` |
| Webhook verification | Bot Framework JWT validation |
| Chat types | `direct`, `group` (team channels), `thread` |
| Threading | `conversation.id` + reply chain |
| Rich text | Adaptive Cards (JSON-based rich content) |
| Text chunk limit | 28 KB (Adaptive Card) / unlimited plain text |
| Files | Attachment upload via Bot Framework |
| Block streaming | Supported via Bot Framework streaming |
| Typing indicator | `sendTypingIndicator()` |

**Key implementation notes:**
- Most complex auth flow (Azure AD token exchange)
- Consider using `botbuilder` npm package for auth/verification
- Adaptive Cards can render buttons, forms, etc.
- Teams has proactive messaging restrictions

### 11.6 Voice (VAPI Migration)

**Inbound:** OpenAI-compatible `POST /chat/completions` from VAPI
**Outbound:** SSE streaming response in OpenAI format

This is a direct port of `services/voice/server.py` into a TypeScript adapter.

| Detail | Value |
|--------|-------|
| Auth | VAPI sends its API key in headers |
| Protocol | OpenAI-compatible chat completions API |
| Connection type | `http-api` (synchronous request-response with SSE) |
| Streaming | SSE (OpenAI format) — required by VAPI |
| Special handling | Deduplication, abort/interrupt, generation tracking |

See [Section 13](#13-voice-migration) for migration details.

### 11.7 Email

**Inbound:** IMAP polling (background task) or webhook from email provider (SendGrid/Mailgun)
**Outbound:** SMTP or email API

| Detail | Value |
|--------|-------|
| Auth | IMAP/SMTP credentials or API key |
| Inbound | Poll IMAP every N seconds, or receive webhook for new mail |
| Chat types | `direct` (email thread) |
| Threading | Email `In-Reply-To` / `References` headers |
| Rich text | HTML email |
| Text chunk limit | Unlimited (email has no length limit) |
| Attachments | Full support |

**Key implementation notes:**
- The agent already has an email *skill* (IMAP/SMTP via curl inside the sandbox). This channel adapter is different — it runs outside the sandbox and triggers the agent on incoming email.
- Could start with a webhook-based email provider (SendGrid Inbound Parse) for simplicity

### 11.8 SMS (Twilio)

**Inbound:** Twilio webhook (`POST /webhooks/sms/:configId`)
**Outbound:** Twilio REST API

| Detail | Value |
|--------|-------|
| Auth | `credentials.accountSid`, `credentials.authToken` |
| Webhook verification | Twilio request signature validation |
| Chat types | `direct` only |
| Threading | None — use per-user (phone number) strategy |
| Rich text | None — plain text only |
| Text chunk limit | 1600 chars (concatenated SMS) |
| Files | MMS for images (Twilio supports media URLs) |

---

## 12. Frontend Integration

### 12.1 New UI: Channels Page

Add a "Channels" section in the dashboard (alongside existing Triggers).

**Channel Catalog View:**
- Grid of available channel types with logos (Telegram, Slack, Discord, WhatsApp, Teams, Voice, Email, SMS)
- Each card shows: icon, name, brief description, "Connect" button
- Connected channels show status badge (active/inactive), message count, last activity

**Connect Flow (per channel type):**
- **Token-based** (Telegram, WhatsApp): Paste token → validate → save
- **OAuth-based** (Slack, Discord, Teams): Click "Connect" → OAuth redirect → callback → save
- **Credentials-based** (Email, SMS): Form with server/credentials → validate → save
- **Special** (Voice): VAPI config with assistant settings

**Channel Detail Panel:**
- Enable/disable toggle
- Session strategy selector (single / per-thread / per-user / per-message)
- System prompt override (optional text that prefixes every message)
- Agent override (which OpenCode agent to use)
- Group settings (require mention, allowed groups)
- DM access control (open / allowlist)
- Message log (recent messages, searchable)
- Identity map (which platform users are allowed, linking to Kortix accounts)

### 12.2 Frontend API Changes

The existing frontend hooks pattern (TanStack Query + Supabase auth) is reused:

```typescript
// hooks/channels/use-channels.ts
export const useChannels = () => useQuery({
  queryKey: ['channels'],
  queryFn: () => fetchWithAuth(`${CHANNELS_API_URL}/v1/channels`),
});

export const useCreateChannel = () => useMutation({
  mutationFn: (data: CreateChannelRequest) =>
    fetchWithAuth(`${CHANNELS_API_URL}/v1/channels`, { method: 'POST', body: data }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
});

// etc.
```

### 12.3 Wire Existing OAuth Callback

The existing route at `apps/frontend/src/app/api/integrations/[provider]/callback/route.ts` currently proxies to `BACKEND_URL/integrations/:provider/callback` — which doesn't exist. Update it to proxy to `CHANNELS_API_URL/v1/oauth/:provider/callback`.

---

## 13. Voice Migration

### What changes

| Aspect | Current (Python) | New (TypeScript adapter) |
|--------|------------------|--------------------------|
| Language | Python 3 / FastAPI | TypeScript / Hono handler |
| Location | `services/voice/server.py` | `services/kortix-channels/src/adapters/voice/adapter.ts` |
| Sandbox connection | Direct to OpenCode inside sandbox | Via `SandboxConnector` (same thing, just abstracted) |
| Session | Single global session, persistent SSE | Per-channelConfig session via `SessionManager` |
| Deduplication | In-memory `_last_sent_message` | Same pattern, in adapter state |
| Abort/interrupt | Direct `POST /session/:id/abort` | Via `SandboxConnector.abort()` |

### What stays the same

- OpenAI-compatible `/chat/completions` endpoint
- SSE streaming response format
- Generation tracking for interrupt handling
- Persistent SSE connection to OpenCode `/event` stream
- Deduplication logic

### Migration approach

1. Port `server.py` line-by-line into TypeScript adapter
2. Keep the Python service running in parallel during transition
3. Validate with VAPI test calls
4. Switch VAPI's custom LLM URL to the channels service endpoint
5. Deprecate the Python service

---

## 14. Service Structure

```
services/kortix-channels/
├── package.json                          # depends on "@kortix/db": "workspace:*"
├── tsconfig.json
├── src/
│   ├── index.ts                          # Hono app, startup, adapter registration
│   ├── config.ts                         # Environment variables
│   │
│   ├── core/
│   │   ├── engine.ts                     # ChannelEngine — universal message pipeline
│   │   ├── sandbox-connector.ts          # HTTP+SSE communication with sandboxes
│   │   ├── session-manager.ts            # Session strategy resolution + caching
│   │   ├── queue.ts                      # In-memory message queue for offline sandboxes
│   │   ├── rate-limiter.ts               # Per-config and per-user rate limiting
│   │   └── types.ts                      # NormalizedMessage, AgentResponse, etc.
│   │
│   ├── adapters/
│   │   ├── base.ts                       # ChannelAdapter interface + ChannelCapabilities
│   │   ├── registry.ts                   # createAdapters() — explicit adapter map
│   │   │
│   │   ├── telegram/
│   │   │   ├── adapter.ts                # TelegramAdapter implements ChannelAdapter
│   │   │   ├── webhook.ts                # Webhook handler + verification
│   │   │   └── api.ts                    # Telegram Bot API client (sendMessage, etc.)
│   │   │
│   │   ├── slack/
│   │   │   ├── adapter.ts
│   │   │   ├── webhook.ts                # Events API handler + signature verification
│   │   │   ├── oauth.ts                  # OAuth install + callback flow
│   │   │   └── api.ts                    # Slack Web API client
│   │   │
│   │   ├── discord/
│   │   │   ├── adapter.ts
│   │   │   ├── gateway.ts                # Discord Gateway WebSocket manager
│   │   │   └── api.ts                    # Discord REST API client
│   │   │
│   │   ├── whatsapp/
│   │   │   ├── adapter.ts
│   │   │   ├── webhook.ts                # Meta Cloud API webhook + verification
│   │   │   └── api.ts                    # WhatsApp Cloud API client
│   │   │
│   │   ├── teams/
│   │   │   ├── adapter.ts
│   │   │   ├── webhook.ts                # Bot Framework webhook + auth
│   │   │   └── api.ts                    # Bot Framework REST client
│   │   │
│   │   ├── voice/
│   │   │   ├── adapter.ts                # Voice adapter (OpenAI-compatible, migrated from Python)
│   │   │   └── sse-consumer.ts           # Persistent SSE connection manager
│   │   │
│   │   ├── email/
│   │   │   ├── adapter.ts
│   │   │   ├── imap-poller.ts            # Background IMAP polling
│   │   │   └── smtp.ts                   # SMTP/API sending
│   │   │
│   │   └── sms/
│   │       ├── adapter.ts
│   │       ├── webhook.ts                # Twilio webhook + signature verification
│   │       └── api.ts                    # Twilio REST API client
│   │
│   ├── routes/
│   │   ├── channels.ts                   # CRUD for channel configs (authed, /v1/channels/*)
│   │   ├── webhooks.ts                   # Mounts all adapter webhooks under /webhooks/*
│   │   ├── oauth.ts                      # OAuth flows (install URL, callback)
│   │   └── health.ts                     # Health check
│   │
│   ├── middleware/
│   │   ├── auth.ts                       # Supabase JWT auth (copy from kortix-cron)
│   │   └── webhook-verify.ts             # Per-platform webhook signature verification
│   │
│   ├── db/
│   │   └── index.ts                      # 2 lines: import { createDb } from '@kortix/db'; export const db = createDb();
│   │
│   └── lib/
│       ├── supabase.ts                   # Supabase client (copy from kortix-cron)
│       ├── message-splitter.ts           # Markdown-aware message splitting per platform limits
│       ├── markdown-converter.ts         # Convert between markdown dialects
│       └── errors.ts                     # ChannelError, WebhookVerificationError, etc.
│
└── .env.example
```

---

## 15. Deployment

### Docker Compose addition

```yaml
# Add to computer/docker-compose.yml

  kortix-channels:
    build:
      context: .
      dockerfile: services/Dockerfile
      args:
        SERVICE: kortix-channels
    ports:
      - "8012:8012"
    env_file:
      - path: services/kortix-channels/.env
        required: false
    profiles: [backend, all]
    restart: unless-stopped
```

Uses the existing shared `services/Dockerfile` — no new Dockerfile needed.

### pnpm workspace

Add to `pnpm-workspace.yaml` (already includes `services/*`).

### Nx project

Add `services/kortix-channels/project.json` with:
```json
{
  "name": "kortix-channels",
  "targets": {
    "dev": { "command": "bun run --hot src/index.ts" },
    "start": { "command": "bun run src/index.ts" },
    "typecheck": { "command": "tsc --noEmit" }
  }
}
```

### Environment variables

```env
PORT=8012
ENV_MODE=local

# Database (same Supabase instance)
DATABASE_URL=postgresql://...

# Supabase (for auth)
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...

# Channels service public URL (for webhook registrations)
CHANNELS_PUBLIC_URL=https://channels.kortix.ai

# kortix-daytona-proxy URL (for sandbox wake-up)
CLOUD_SERVICE_URL=http://localhost:8010

# Per-adapter defaults (optional — most are per-channelConfig in DB)
# DISCORD_DEFAULT_INTENTS=... (if needed)
```

### Webhook URL format

```
{CHANNELS_PUBLIC_URL}/webhooks/{channelType}/{configId}
```

For local development, use ngrok or similar to expose the webhook endpoint.

---

## 16. Security

### Webhook verification

Every adapter MUST verify inbound webhooks:

| Platform | Method |
|----------|--------|
| Telegram | Optional `secret_token` header (set via `setWebhook`) |
| Slack | HMAC-SHA256 with signing secret |
| Discord | Ed25519 signature verification |
| WhatsApp | `hub.verify_token` for setup; no per-message verification |
| Teams | Bot Framework JWT validation |
| Twilio | Request signature validation |

### Credential storage

- Platform credentials stored in `channel_configs.credentials` (JSONB)
- **v1:** Rely on Supabase's database encryption at rest
- **v2:** Application-level encryption with a KMS key before storing

### Access control

- All management routes (`/v1/channels/*`) require Supabase JWT (same as kortix-cron)
- Webhook routes (`/webhooks/*`) are unauthenticated but verified by platform signatures
- The `channel_identity_map` table controls which platform users can interact with the bot
- Group access controlled by `platformConfig.groups.allowedGroupIds`
- DM access controlled by `platformConfig.dm.policy` + `platformConfig.dm.allowFrom`
- Default: allow all platform users for owner's DMs (configurable per channel)

### Rate limiting

- Per-channelConfig rate limit to prevent abuse (e.g. 60 messages/minute)
- Per-platform-user rate limit (e.g. 20 messages/minute per user)
- Per-sandbox rate limit to prevent overloading the agent
- Implement at the engine level, before proxying to sandbox

---

## 17. Implementation Order

### Phase 1: Foundation (1-2 days)
1. Scaffold `services/kortix-channels` (package.json, tsconfig, config, index.ts)
2. Define types: `NormalizedMessage`, `AgentResponse`, `ChannelCapabilities`, `ChannelAdapter`
3. Implement core engine, sandbox connector (port `OpenCodeClient` from cron + SSE from voice)
4. Implement session manager with deterministic keys
5. Implement in-memory message queue with wake-up logic
6. Add channel tables + relations to `packages/db/src/schema/kortix.ts`, export types from `packages/db/src/types.ts`, run `pnpm db:push`
7. Implement management routes (`/v1/channels` CRUD)
8. Add to docker-compose + nx config
9. Rate limiter (simple in-memory token bucket)

### Phase 2: Telegram Adapter (1 day)
1. Implement Telegram adapter (webhook handler, Bot API client)
2. Typing indicator, message chunking (markdown-aware)
3. Auto-register/deregister webhook on channel create/delete
4. Group support (mention gating, chatType detection)
5. Test end-to-end: send message on Telegram → agent responds

### Phase 3: Slack Adapter (1-2 days)
1. Implement Slack adapter (Events API, Web API)
2. Implement OAuth install flow
3. Wire existing frontend OAuth callback
4. Thread support (thread_ts → session mapping)
5. Test end-to-end

### Phase 4: Voice Migration (1 day)
1. Port `services/voice/server.py` to TypeScript voice adapter
2. Keep OpenAI-compatible endpoint at `/voice/chat/completions`
3. SSE streaming with deduplication and interrupt handling
4. Test with VAPI
5. Deprecate Python service

### Phase 5: Discord Adapter (1 day)
1. Implement Discord adapter with Gateway WebSocket
2. AbortSignal-based lifecycle
3. Block streaming (edit message in real-time, coalesce at 1500 chars)
4. Test DMs and channel messages

### Phase 6: Frontend (1-2 days)
1. Channels management page in frontend
2. Connect/disconnect flows per platform
3. Channel detail panel with settings (strategy, system prompt, group config)

### Phase 7: Remaining Adapters (as needed)
- WhatsApp, MS Teams, Email, SMS — follow established pattern
- Each adapter is self-contained; ordering is based on user demand

---

## 18. Open Questions

### Resolved

1. **Where do channels live?** → Outside the sandbox (`kortix-channels` service). Sandboxes sleep (Daytona), webhooks need always-on endpoints. See Section 2.

2. **Plugin discovery?** → No. Adapters are hardcoded in the registry. Extensibility comes from interface quality. If we open-source the service later, contributors add adapters via PRs (same as OpenClaw in practice). See Section 4.

3. **Queue durability?** → In-memory for v1. Messages queue during sandbox boot (~30-60s). If the channels service restarts, queued messages are lost. Fine for v1.

4. **Shared sandbox registry?** → Use the `@kortix/db` shared package. `channel_configs.sandboxId` is a real FK to `kortix.sandboxes.sandboxId`. At query time, Drizzle's relational query (`with: { sandbox: true }`) JOINs to get `baseUrl` + `authToken` — always fresh, no duplication. Both `kortix-cron` and `kortix-channels` import from the same `@kortix/db` package and share the same `kortix.sandboxes` table. See Section 7 and Section 9 for details.

### Still Open

5. **Billing:** Should channel messages count toward credits/usage? If so, the engine needs to call the billing endpoint (like `kortix-router` does for LLM requests).

6. **File handling:** When a user sends a file via Telegram/Slack, should the adapter:
   - (a) Download it and upload to the sandbox filesystem, then reference it in the prompt
   - (b) Pass a URL that the agent can access
   - (c) Describe it in text ("User sent an image: [url]")

7. **Multi-sandbox routing:** If a user has multiple sandboxes, how does a single Telegram bot decide which sandbox to message? Current plan: each `channelConfig` is bound to exactly one sandbox. User creates separate bots per sandbox, or the UI lets them pick.

8. **Proactive messaging:** Can the agent initiate messages to channels (e.g. "Your build finished")? This requires the sandbox to call back to `kortix-channels` — adds a new API direction. Out of scope for v1 but worth designing for.

9. **Agent context enrichment:** The `buildPrompt()` function adds channel metadata to the prompt. Should this be a configurable template? Or should the adapter provide the context format? OpenClaw has `ChannelAgentPromptAdapter` for this.
