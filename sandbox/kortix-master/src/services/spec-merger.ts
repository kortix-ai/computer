/**
 * OpenAPI Spec Merger — combines kortix-master and OpenCode specs into one.
 *
 * Strategy:
 * - kortix-master spec is generated via hono-openapi generateSpecs()
 * - OpenCode spec is fetched live from localhost:{OPENCODE_PORT}/doc
 * - Paths are merged (kortix-master wins conflicts like /file, /file/content)
 * - OpenCode endpoints are auto-tagged based on path prefix
 * - Component schemas are merged with "OC_" prefix for OpenCode schemas
 * - Result is cached with a TTL to avoid re-fetching on every request
 * - Tags are grouped into "Sandbox Gateway" and "OpenCode" sections via x-tagGroups
 *
 * This is fully programmatic — zero manual endpoint definitions needed.
 * When OpenCode adds endpoints, they appear automatically.
 */

import { config } from '../config'

// ─── Types ──────────────────────────────────────────────────────────────────

interface OpenAPISpec {
  openapi: string
  info: Record<string, any>
  servers?: any[]
  tags?: Array<{ name: string; description?: string }>
  paths: Record<string, any>
  components?: Record<string, any>
  'x-tagGroups'?: Array<{ name: string; tags: string[] }>
  [key: string]: any
}

// ─── Auto-tagging rules ─────────────────────────────────────────────────────
// Maps OpenCode path prefixes → tag names.
// Evaluated in order; first match wins.

const OPENCODE_TAG_RULES: Array<{ prefix: string; tag: string }> = [
  // Message sub-resources get their own tag for readability
  { prefix: '/session/{sessionID}/message', tag: 'OC: Messages' },
  // Everything else under /session is Sessions (abort, fork, revert, todo, etc.)
  { prefix: '/session',                    tag: 'OC: Sessions' },

  { prefix: '/pty',                         tag: 'OC: PTY' },
  { prefix: '/mcp',                         tag: 'OC: MCP Servers' },
  { prefix: '/provider',                    tag: 'OC: Providers' },
  { prefix: '/auth',                        tag: 'OC: Providers' },
  { prefix: '/config',                      tag: 'OC: Config' },
  { prefix: '/project',                     tag: 'OC: Config' },
  { prefix: '/global',                      tag: 'OC: System' },
  { prefix: '/instance',                    tag: 'OC: System' },
  { prefix: '/event',                       tag: 'OC: Events' },
  { prefix: '/file',                        tag: 'OC: Files' },
  { prefix: '/find',                        tag: 'OC: Files' },
  { prefix: '/permission',                  tag: 'OC: Permissions' },
  { prefix: '/question',                    tag: 'OC: Permissions' },
  { prefix: '/experimental/worktree',       tag: 'OC: Worktrees' },
  { prefix: '/experimental',                tag: 'OC: Experimental' },
  { prefix: '/skill',                       tag: 'OC: Skills' },
  { prefix: '/agent',                       tag: 'OC: Agents' },
  { prefix: '/command',                     tag: 'OC: Commands' },
  { prefix: '/vcs',                         tag: 'OC: Version Control' },
  { prefix: '/lsp',                         tag: 'OC: LSP' },
  { prefix: '/formatter',                   tag: 'OC: Formatters' },
  { prefix: '/log',                         tag: 'OC: System' },
  { prefix: '/path',                        tag: 'OC: Config' },

  // TUI endpoints are internal-only — hide from docs
  { prefix: '/tui',                         tag: '__hidden__' },
]

// ─── Tag metadata ───────────────────────────────────────────────────────────

// Sandbox Gateway tags (from kortix-master describeRoute)
const GATEWAY_TAGS: Array<{ name: string; description: string }> = [
  { name: 'GW: System',       description: 'Health checks, version info, and sandbox updates' },
  { name: 'GW: Secrets',      description: 'Environment variable / secret management (encrypted at rest via KORTIX_TOKEN)' },
  { name: 'GW: Files',        description: 'Sandbox filesystem — list, read, upload, download, delete, mkdir, rename' },
  { name: 'GW: Search',       description: 'Local Semantic Search (LSS) — BM25 + embeddings over workspace files' },
  { name: 'GW: Deployments',  description: 'Deploy, manage, and monitor apps running inside the sandbox' },
  { name: 'GW: Integrations', description: 'OAuth integration proxy — connect and use third-party APIs' },
  { name: 'GW: Proxy',        description: 'Dynamic port proxy — forward traffic to any localhost port' },
  { name: 'GW: Memory',       description: 'Long-term memory — episodic, semantic, procedural knowledge store' },
]

// OpenCode tags (auto-assigned from path prefixes)
const OPENCODE_TAGS: Array<{ name: string; description: string }> = [
  { name: 'OC: Sessions',        description: 'AI coding sessions — create, manage, prompt, abort, fork, revert, share, todos' },
  { name: 'OC: Messages',        description: 'Session messages — conversation history, edit message parts' },
  { name: 'OC: PTY',             description: 'Pseudo-terminal sessions — spawn, read, write, and manage interactive shells' },
  { name: 'OC: Config',          description: 'Project & instance configuration, paths, provider list' },
  { name: 'OC: Providers',       description: 'LLM provider management — list providers, OAuth flows, API key auth' },
  { name: 'OC: MCP Servers',     description: 'Model Context Protocol server management — connect, disconnect, auth' },
  { name: 'OC: Events',          description: 'Server-Sent Events (SSE) — real-time session and system event streams' },
  { name: 'OC: Permissions',     description: 'Tool permission requests — approve or deny pending prompts' },
  { name: 'OC: Files',           description: 'OpenCode file operations — status, find by name, find by symbol' },
  { name: 'OC: System',          description: 'Global config, health, lifecycle dispose, logging' },
  { name: 'OC: Agents',          description: 'Available agent configurations' },
  { name: 'OC: Commands',        description: 'Available slash commands' },
  { name: 'OC: Skills',          description: 'Loaded skill definitions for the current agent' },
  { name: 'OC: Formatters',      description: 'Code formatter configurations' },
  { name: 'OC: LSP',             description: 'Language Server Protocol integration status' },
  { name: 'OC: Version Control', description: 'Git repository status and operations' },
  { name: 'OC: Worktrees',       description: 'Git worktree management — isolated development branches' },
  { name: 'OC: Experimental',    description: 'Experimental endpoints — resources, tools (may change without notice)' },
]

// Map from old kortix-master tag names to new GW: prefixed names
const GATEWAY_TAG_REMAP: Record<string, string> = {
  'System':       'GW: System',
  'Secrets':      'GW: Secrets',
  'Files':        'GW: Files',
  'Search':       'GW: Search',
  'Deployments':  'GW: Deployments',
  'Integrations': 'GW: Integrations',
  'Proxy':        'GW: Proxy',
  'Memory':       'GW: Memory',
}

// ─── Cache ──────────────────────────────────────────────────────────────────

let cachedSpec: OpenAPISpec | null = null
let cacheTime = 0
const CACHE_TTL_MS = 30_000 // 30 seconds

// ─── Core merger ────────────────────────────────────────────────────────────

/**
 * Match a concrete OpenAPI path against a tag prefix pattern.
 *
 * Both paths may contain `{param}` segments. A `{param}` in the prefix
 * matches any single segment in the path (including other `{param}` names).
 */
function matchPrefix(prefix: string, path: string): boolean {
  const prefixSegs = prefix.split('/').filter(Boolean)
  const pathSegs = path.split('/').filter(Boolean)

  if (pathSegs.length < prefixSegs.length) return false

  for (let i = 0; i < prefixSegs.length; i++) {
    const ps = prefixSegs[i]
    const ts = pathSegs[i]
    if (ps.startsWith('{') && ps.endsWith('}')) continue
    if (ts.startsWith('{') && ts.endsWith('}')) continue
    if (ps !== ts) return false
  }

  return true
}

function tagForPath(path: string): string | null {
  for (const rule of OPENCODE_TAG_RULES) {
    if (path === rule.prefix || matchPrefix(rule.prefix, path)) {
      return rule.tag
    }
  }
  // Fallback: match by first path segment
  const firstSeg = '/' + path.split('/').filter(Boolean)[0]
  for (const rule of OPENCODE_TAG_RULES) {
    if (rule.prefix === firstSeg) return rule.tag
  }
  return 'OC: Uncategorized'
}

async function fetchOpenCodeSpec(): Promise<OpenAPISpec | null> {
  try {
    const res = await fetch(
      `http://${config.OPENCODE_HOST}:${config.OPENCODE_PORT}/doc`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return null
    return await res.json() as OpenAPISpec
  } catch (err) {
    console.warn('[Spec Merger] Failed to fetch OpenCode spec:', err)
    return null
  }
}

export async function buildMergedSpec(
  kortixSpec: OpenAPISpec,
): Promise<OpenAPISpec> {
  // Check cache
  const now = Date.now()
  if (cachedSpec && (now - cacheTime) < CACHE_TTL_MS) {
    return cachedSpec
  }

  const openCodeSpec = await fetchOpenCodeSpec()

   // Start with kortix-master as the base
  const merged: OpenAPISpec = {
    openapi: '3.1.0',
    info: {
      title: 'Kortix Sandbox API',
      version: '1.0.0',
      description:
        'Unified API reference for the Kortix sandbox.\n\n' +
        '**Sandbox Gateway** — the sandbox infrastructure layer (kortix-master). ' +
        'Manages secrets, files, deployments, semantic search, integrations, and proxies traffic to internal services.\n\n' +
        '**OpenCode** — the AI agent engine running inside the sandbox. ' +
        'Manages coding sessions, pseudo-terminals, messages, MCP servers, LLM providers, and configuration.\n\n' +
        'All endpoints are served from a single origin. Gateway endpoints are handled directly; ' +
        'OpenCode endpoints are transparently proxied.\n\n' +
        '---\n\n' +
        '## Authentication\n\n' +
        'In production, all requests go through the **platform proxy** (`/v1/preview/{sandboxId}/{port}/...`) ' +
        'which authenticates callers before forwarding to the sandbox. ' +
        'The sandbox itself has **no built-in auth** — it relies entirely on the proxy layer and (optionally) an `INTERNAL_SERVICE_KEY` for service-to-service trust.\n\n' +
        '### Kortix API Key (programmatic access)\n\n' +
        'Create keys from **Settings > API Keys**. Each key is a public/secret pair:\n\n' +
        '| Key | Format | Length |\n' +
        '|-----|--------|--------|\n' +
        '| **Secret key** | `kortix_` + 32 alphanumeric chars | 39 chars |\n' +
        '| **Public key** | `pk_` + 32 alphanumeric chars | 35 chars |\n\n' +
        'The secret key is shown **once** at creation. Only an HMAC-SHA256 hash is stored server-side.\n\n' +
        '```\nAuthorization: Bearer kortix_<your-secret-key>\n```\n\n' +
        '### Supabase JWT (frontend / dashboard)\n\n' +
        'The dashboard authenticates via Supabase Auth (ES256 JWT, ~900 chars). Handled automatically by the UI.\n\n' +
        '```\nAuthorization: Bearer eyJhbGciOiJFUzI1NiIs...\n```\n\n' +
        '### Sandbox Token (agents inside the sandbox)\n\n' +
        'Each sandbox gets an auto-generated token (`kortix_sb_` prefix, 42 chars) injected as the `KORTIX_TOKEN` environment variable. ' +
        'AI agents use this to authenticate back to the platform API.\n\n' +
        '### What does NOT work\n\n' +
        '- **Supabase service role key** — rejected by all endpoints (not a valid user token)\n' +
        '- **Supabase anon key** — rejected by all endpoints\n\n' +
        '### End-to-end flow\n\n' +
        '1. Client sends `Authorization: Bearer <token>` to the **platform proxy**\n' +
        '2. Proxy validates token (Kortix API key → HMAC-SHA256 hash lookup, or Supabase JWT → `getUser()` verification)\n' +
        '3. Proxy strips client auth, injects `INTERNAL_SERVICE_KEY` as Bearer token\n' +
        '4. Sandbox validates the internal service key (if configured)\n' +
        '5. Response streams back to client\n\n' +
        'The sandbox never sees user tokens — only the internal service key.\n\n' +
        '### Security note\n\n' +
        'The sandbox container exposes multiple ports (8000, 3111, 6080, etc.) which are **unprotected by default**. ' +
        'In production, these ports must be firewalled so only the platform proxy can reach them. ' +
        'The `INTERNAL_SERVICE_KEY` env var adds a second layer: when set, the sandbox gateway rejects requests without a matching Bearer token. ' +
        'In local development, both the firewall and service key are typically absent — all sandbox ports are open on localhost.',
    },
    servers: [{ url: '/', description: 'Current sandbox' }],
    tags: [],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        KortixApiKey: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Kortix API key (`kortix_` prefix, 39 characters total). ' +
            'Create one from Settings > API Keys in the dashboard. ' +
            'Pass as: `Authorization: Bearer kortix_<your-key>`',
        },
        SupabaseJWT: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Supabase-issued JWT (ES256, ~900 characters). ' +
            'Used by the frontend dashboard. Obtained via Supabase Auth sign-in flow. ' +
            'Pass as: `Authorization: Bearer <jwt-token>`',
        },
      },
    },
    security: [
      { KortixApiKey: [] },
      { SupabaseJWT: [] },
    ],
  }

  // ── Merge paths ─────────────────────────────────────────────────────────

  // 1) Add all kortix-master paths first (they take priority)
  //    Remap their tags from "System" → "GW: System" etc.
  for (const [path, methods] of Object.entries(kortixSpec.paths || {})) {
    const remapped: Record<string, any> = {}
    for (const [method, details] of Object.entries(methods as Record<string, any>)) {
      if (method === 'parameters') {
        remapped[method] = details
        continue
      }
      const d = { ...details }
      if (d.tags) {
        d.tags = d.tags.map((t: string) => GATEWAY_TAG_REMAP[t] || t)
      }
      remapped[method] = d
    }
    merged.paths[path] = remapped
  }

  // 2) Add OpenCode paths (skip conflicts where kortix-master already has them)
  if (openCodeSpec) {
    for (const [path, methods] of Object.entries(openCodeSpec.paths || {})) {
      if (merged.paths[path]) {
        // Conflict — kortix-master wins, but merge any missing methods
        for (const [method, details] of Object.entries(methods as Record<string, any>)) {
          if (method === 'parameters') continue
          if (!merged.paths[path][method]) {
            const tag = tagForPath(path)
            if (tag === '__hidden__') continue
            const tagged = { ...details }
            if (tag) tagged.tags = [tag]
            merged.paths[path][method] = tagged
          }
        }
        continue
      }

      // No conflict — auto-tag and add all methods
      const tag = tagForPath(path)
      if (tag === '__hidden__') continue

      const taggedMethods: Record<string, any> = {}
      for (const [method, details] of Object.entries(methods as Record<string, any>)) {
        if (method === 'parameters') {
          taggedMethods[method] = details
          continue
        }
        const tagged = { ...details }
        if (tag) tagged.tags = [tag]
        taggedMethods[method] = tagged
      }
      merged.paths[path] = taggedMethods
    }

    // ── Merge component schemas ─────────────────────────────────────────
    const ocSchemas = openCodeSpec.components?.schemas || {}
    const kmSchemas = kortixSpec.components?.schemas || {}

    for (const [name, schema] of Object.entries(kmSchemas)) {
      merged.components!.schemas![name] = schema
    }

    for (const [name, schema] of Object.entries(ocSchemas)) {
      if (merged.components!.schemas![name]) {
        merged.components!.schemas![`OC_${name}`] = schema
      } else {
        merged.components!.schemas![name] = schema
      }
    }
  }

  // ── Build tags list ───────────────────────────────────────────────────
  // Collect which tags are actually used
  const usedTags = new Set<string>()
  for (const methods of Object.values(merged.paths)) {
    for (const [method, details] of Object.entries(methods as Record<string, any>)) {
      if (method === 'parameters') continue
      for (const tag of (details.tags || [])) {
        usedTags.add(tag)
      }
    }
  }

  // Build ordered tag list: Gateway first, then OpenCode
  merged.tags = []

  for (const t of GATEWAY_TAGS) {
    if (usedTags.has(t.name)) {
      merged.tags.push(t)
      usedTags.delete(t.name)
    }
  }
  for (const t of OPENCODE_TAGS) {
    if (usedTags.has(t.name)) {
      merged.tags.push(t)
      usedTags.delete(t.name)
    }
  }
  // Any remaining (shouldn't happen, but safety net)
  for (const tagName of [...usedTags].sort()) {
    merged.tags.push({ name: tagName, description: tagName })
  }

  // ── x-tagGroups for Scalar sidebar grouping ───────────────────────────
  const gwTagNames = GATEWAY_TAGS.filter(t => merged.tags.some(mt => mt.name === t.name)).map(t => t.name)
  const ocTagNames = OPENCODE_TAGS.filter(t => merged.tags.some(mt => mt.name === t.name)).map(t => t.name)
  // Catch any extra tags not in either list
  const extraTagNames = merged.tags
    .filter(t => !gwTagNames.includes(t.name) && !ocTagNames.includes(t.name))
    .map(t => t.name)
  if (extraTagNames.length > 0) {
    ocTagNames.push(...extraTagNames)
  }

  merged['x-tagGroups'] = [
    { name: 'Sandbox Gateway', tags: gwTagNames },
    { name: 'OpenCode', tags: ocTagNames },
  ]

  // ── Cache and return ──────────────────────────────────────────────────
  cachedSpec = merged
  cacheTime = now
  return merged
}

/**
 * Invalidate the cached spec. Call when routes change.
 */
export function invalidateSpecCache() {
  cachedSpec = null
  cacheTime = 0
}
