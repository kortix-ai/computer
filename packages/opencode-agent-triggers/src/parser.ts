import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import yaml from "js-yaml"
import type {
  AgentTriggerConfig,
  AgentTriggersPluginOptions,
  CronTriggerConfig,
  DiscoveredAgent,
  WebhookTriggerConfig,
} from "./types.js"

function parseMarkdownFrontmatter(filePath: string): Record<string, unknown> | null {
  const raw = readFileSync(filePath, "utf8")
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?[\s\S]*$/)
  if (!match) return null
  const parsed = yaml.load(match[1])
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}

function walkAgentFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const entries = readdirSync(root)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(root, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...walkAgentFiles(fullPath))
      continue
    }
    if (entry.endsWith(".md")) files.push(fullPath)
  }
  return files
}

function normalizeTrigger(raw: unknown): AgentTriggerConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const name = typeof value.name === "string" ? value.name.trim() : ""
  if (!name) return null
  const enabled = value.enabled !== false
  const execution = value.execution && typeof value.execution === "object" && !Array.isArray(value.execution)
    ? value.execution as Record<string, unknown>
    : null
  const prompt = typeof execution?.prompt === "string" ? execution.prompt.trim() : ""
  if (!prompt) return null

  const context = value.context && typeof value.context === "object" && !Array.isArray(value.context)
    ? value.context as Record<string, unknown>
    : null

  const normalizedBase = {
    name,
    enabled,
    execution: {
      prompt,
      agentName: typeof execution?.agent_name === "string" ? execution.agent_name : undefined,
      modelId: typeof execution?.model_id === "string" ? execution.model_id : undefined,
      sessionMode: execution?.session_mode === "reuse" ? "reuse" : execution?.session_mode === "new" ? "new" : undefined,
    },
    context: context
      ? {
          extract: context.extract && typeof context.extract === "object" && !Array.isArray(context.extract)
            ? Object.fromEntries(
                Object.entries(context.extract as Record<string, unknown>)
                  .filter(([, pathValue]) => typeof pathValue === "string" && pathValue.trim().length > 0)
                  .map(([key, pathValue]) => [key, String(pathValue)]),
              )
            : undefined,
          includeRaw: context.include_raw !== false,
        }
      : undefined,
  } satisfies Omit<CronTriggerConfig, "source"> & Omit<WebhookTriggerConfig, "source">

  const source = value.source && typeof value.source === "object" && !Array.isArray(value.source)
    ? value.source as Record<string, unknown>
    : null
  if (!source || typeof source.type !== "string") return null

  if (source.type === "webhook") {
    const webhookPath = typeof source.path === "string" ? source.path.trim() : ""
    if (!webhookPath) return null
    const normalized: WebhookTriggerConfig = {
      ...normalizedBase,
      source: {
        type: "webhook",
        path: webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`,
        method: typeof source.method === "string" ? source.method.toUpperCase() : "POST",
        secret: typeof source.secret === "string" ? source.secret : undefined,
      },
    }
    return normalized
  }

  if (source.type !== "cron") return null
  const expr = typeof source.expr === "string" ? source.expr.trim() : ""
  if (!expr) return null
  const normalized: CronTriggerConfig = {
    ...normalizedBase,
    source: {
      type: "cron",
      expr,
      timezone: typeof source.timezone === "string" ? source.timezone : undefined,
    },
  }
  return normalized
}

export function resolveAgentPaths(options: AgentTriggersPluginOptions = {}): string[] {
  const explicit = options.agentPaths?.filter(Boolean)
  if (explicit && explicit.length > 0) return [...new Set(explicit.map((value) => path.resolve(value)))]

  const opencodeConfigDir = process.env.OPENCODE_CONFIG_DIR || "/opt/opencode"
  const roots = [
    options.directory ? path.join(options.directory, ".opencode", "agents") : null,
    path.join(options.homeDir ?? homedir(), ".config", "opencode", "agents"),
    path.join(opencodeConfigDir, "agents"),
  ].filter(Boolean) as string[]

  return [...new Set(roots.map((value) => path.resolve(value)))]
}

export function discoverAgentsWithTriggers(options: AgentTriggersPluginOptions = {}): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = []
  for (const agentPath of resolveAgentPaths(options)) {
    for (const filePath of walkAgentFiles(agentPath)) {
      const frontmatter = parseMarkdownFrontmatter(filePath)
      if (!frontmatter) continue
      const rawTriggers = frontmatter.triggers
      if (!Array.isArray(rawTriggers)) continue
      const triggers = rawTriggers.map(normalizeTrigger).filter(Boolean) as AgentTriggerConfig[]
      if (triggers.length === 0) continue
      agents.push({
        name: path.basename(filePath, ".md"),
        filePath,
        triggers,
      })
    }
  }
  return agents
}
