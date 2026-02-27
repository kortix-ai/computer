/**
 * Shared Zod schemas for OpenAPI documentation.
 * Used across all route files with describeRoute() + resolver().
 */
import { z } from 'zod'

// ─── Common response schemas ────────────────────────────────────────────────

export const ErrorResponse = z.object({
  error: z.string().describe('Error message'),
  details: z.string().optional().describe('Additional error details'),
})

export const SuccessResponse = z.object({
  ok: z.literal(true),
})

export const UnauthorizedResponse = z.object({
  error: z.literal('Unauthorized'),
})

// ─── ENV schemas ────────────────────────────────────────────────────────────

export const SecretEntry = z.object({
  key: z.string(),
  value: z.string(),
})

export const SecretsListResponse = z.object({
  secrets: z.record(z.string(), z.string()).describe('Key-value map of all secrets'),
})

export const SetBulkEnvBody = z.object({
  keys: z.record(z.string(), z.string()).describe('Key-value map of env vars to set'),
  restart: z.boolean().optional().describe('Restart OpenCode after setting (default: false)'),
})

export const SetBulkEnvResponse = z.object({
  ok: z.literal(true),
  updated: z.number().int().describe('Number of keys updated'),
  restarted: z.boolean().describe('Whether services were restarted'),
})

export const SetSingleEnvBody = z.object({
  value: z.string().describe('Value to set for the key'),
  restart: z.boolean().optional().describe('Restart OpenCode after setting (default: false)'),
})

export const SetSingleEnvResponse = z.object({
  ok: z.literal(true),
  key: z.string(),
  restarted: z.boolean(),
})

export const DeleteEnvResponse = z.object({
  ok: z.literal(true),
  key: z.string(),
})

export const RotateTokenBody = z.object({
  token: z.string().describe('New KORTIX_TOKEN value'),
})

export const RotateTokenResponse = z.object({
  ok: z.literal(true),
  rotated: z.number().int().describe('Number of secrets re-encrypted'),
})

// ─── File schemas ───────────────────────────────────────────────────────────

export const FileNode = z.object({
  name: z.string(),
  path: z.string(),
  absolute: z.string(),
  type: z.enum(['file', 'directory']),
  ignored: z.boolean(),
})

export const FileContentTextResponse = z.object({
  type: z.literal('text'),
  content: z.string(),
})

export const FileContentBinaryResponse = z.object({
  type: z.literal('binary'),
  content: z.string().describe('Base64-encoded file content'),
  mimeType: z.string(),
  encoding: z.literal('base64'),
})

export const UploadResult = z.object({
  path: z.string(),
  size: z.number().int(),
})

export const DeleteFileBody = z.object({
  path: z.string().describe('Absolute or workspace-relative path'),
})

export const MkdirBody = z.object({
  path: z.string().describe('Directory path to create'),
})

export const RenameBody = z.object({
  from: z.string().describe('Source path'),
  to: z.string().describe('Target path'),
})

// ─── LSS schemas ────────────────────────────────────────────────────────────

export const LssHit = z.object({
  file_path: z.string(),
  score: z.number(),
  snippet: z.string(),
  rank_stage: z.string(),
  indexed_at: z.string().optional(),
})

export const LssSearchResult = z.object({
  query: z.string(),
  hits: z.array(LssHit),
})

export const LssStatusResponse = z.object({
  available: z.boolean(),
  output: z.string(),
})

// ─── Deploy schemas ─────────────────────────────────────────────────────────

export const DeployBody = z.object({
  deploymentId: z.string().describe('Unique deployment identifier'),
  sourceType: z.enum(['files', 'git']).optional().describe('Source type (default: files)'),
  sourceRef: z.string().optional().describe('Git ref or branch'),
  sourcePath: z.string().optional().describe('Source path (default: /workspace)'),
  framework: z.string().optional().describe('Framework hint (auto-detected if omitted)'),
  envVarKeys: z.array(z.string()).optional().describe('Env var keys to inject'),
  buildConfig: z.object({
    buildCommand: z.string().optional(),
    outputDir: z.string().optional(),
  }).optional().describe('Custom build configuration'),
  entrypoint: z.string().optional().describe('Custom entrypoint file'),
})

export const DeployResponse = z.object({
  success: z.boolean(),
  port: z.number().int().optional(),
  pid: z.number().int().optional(),
  framework: z.string().optional(),
  error: z.string().optional(),
  logs: z.array(z.string()).optional(),
  buildDuration: z.number().optional(),
  startDuration: z.number().optional(),
})

export const DeploymentStatus = z.object({
  status: z.enum(['running', 'stopped', 'not_found']),
  port: z.number().int().optional(),
  pid: z.number().int().optional(),
  framework: z.string().optional(),
  startedAt: z.string().optional(),
  error: z.string().optional(),
})

export const DeploymentListItem = z.object({
  id: z.string(),
  status: z.string(),
  port: z.number().int().optional(),
  pid: z.number().int().optional(),
  framework: z.string().optional(),
  startedAt: z.string().optional(),
})

export const DeploymentListResponse = z.object({
  deployments: z.array(DeploymentListItem),
})

export const DeploymentLogsResponse = z.object({
  logs: z.array(z.string()),
  error: z.string().optional(),
})

// ─── Update schemas ─────────────────────────────────────────────────────────

export const UpdateBody = z.object({
  version: z.string().describe('Target version to install (e.g. "0.4.3")'),
})

export const UpdateResponse = z.object({
  success: z.boolean().optional(),
  upToDate: z.boolean().optional(),
  previousVersion: z.string().optional(),
  currentVersion: z.string(),
  changelog: z.any().optional(),
  output: z.string().optional(),
})

// ─── Integration schemas ────────────────────────────────────────────────────

export const IntegrationTokenBody = z.object({
  app: z.string().describe('Integration app slug'),
  scopes: z.array(z.string()).optional(),
})

export const IntegrationProxyBody = z.object({
  app: z.string().describe('Integration app slug'),
  url: z.string().describe('Target API URL'),
  method: z.string().optional().describe('HTTP method (default: GET)'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.any().optional(),
})

export const IntegrationConnectBody = z.object({
  app: z.string().describe('Integration app slug'),
})

export const IntegrationRunActionBody = z.object({
  app: z.string().describe('Integration app slug'),
  action_key: z.string().describe('Action key from actions list'),
  props: z.record(z.string(), z.any()).optional().describe('Action parameters'),
})

// ─── Health schemas ─────────────────────────────────────────────────────────

export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string().describe('Current sandbox version'),
  changelog: z.any().nullable().describe('Changelog entry for current version'),
  activeWs: z.number().int().describe('Active WebSocket connections'),
  opencode: z.boolean().describe('Whether OpenCode is ready'),
})

export const PortsResponse = z.object({
  ports: z.record(z.string(), z.string()).describe('Container→host port mappings'),
})

// ─── Proxy schemas ──────────────────────────────────────────────────────────

export const ProxyErrorResponse = z.object({
  error: z.string(),
  port: z.number().int(),
  details: z.string().optional(),
})

// ─── Memory schemas ─────────────────────────────────────────────────────────

export const MemoryEntryResponse = z.object({
  id: z.number().int(),
  source: z.enum(['ltm', 'observation']),
  type: z.string(),
  content: z.string(),
  title: z.string().optional(),
  narrative: z.string().optional(),
  context: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  tags: z.array(z.string()),
  files: z.array(z.string()),
  facts: z.array(z.string()).optional(),
  toolName: z.string().optional(),
  promptNumber: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
  rank: z.number().optional(),
})

export const MemoryListResponse = z.object({
  entries: z.array(MemoryEntryResponse),
  total: z.object({
    ltm: z.number().int(),
    observations: z.number().int(),
  }),
})

export const MemorySearchResponse = z.object({
  entries: z.array(MemoryEntryResponse),
  query: z.string(),
})

export const MemoryStatsResponse = z.object({
  ltm: z.object({
    total: z.number().int(),
    byType: z.record(z.string(), z.number().int()),
  }),
  observations: z.object({
    total: z.number().int(),
    byType: z.record(z.string(), z.number().int()),
  }),
  sessions: z.number().int(),
})
