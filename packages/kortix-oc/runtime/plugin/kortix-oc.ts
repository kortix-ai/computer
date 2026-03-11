import type { Plugin } from "@opencode-ai/plugin"
import type { Config } from "@opencode-ai/sdk"
import { readdirSync } from "node:fs"
import path from "node:path"
import { PTYPlugin as PtyPlugin } from "opencode-pty/plugin"
import EnvsitterGuardPlugin from "envsitter-guard"
import WorktreePlugin from "./worktree"
import TunnelPlugin from "./agent-tunnel/index"
import MorphPlugin from "./morph"
import KortixMemoryPlugin from "./kortix-sys/src/index"
import { loadRuntimeAgents, loadRuntimeCommands, listRuntimeSkillPaths } from "../../src/runtime-assets"

type PluginOutput = Record<string, any>
type PluginValue = any

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function chainHandlers(first: PluginValue, second: PluginValue): PluginValue {
  if (typeof first === "function" && typeof second === "function") {
    return async (...args: unknown[]) => {
      await first(...(args as any[]))
      await second(...(args as any[]))
    }
  }

  if (isObject(first) && isObject(second)) {
    return mergeOutputs(first, second)
  }

  return second
}

function mergeOutputs(...outputs: Array<PluginOutput | undefined>): PluginOutput {
  const merged: PluginOutput = {}

  for (const output of outputs) {
    if (!output) continue

    for (const [key, value] of Object.entries(output)) {
      const existing = merged[key]
      if (existing === undefined) {
        merged[key] = value
        continue
      }
      merged[key] = chainHandlers(existing, value)
    }
  }

  return merged
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMergeDefaults<T extends Record<string, unknown>>(defaults: T, existing: Record<string, unknown> | undefined): T {
  if (!existing) return defaults

  const merged: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(existing)) {
    const defaultValue = merged[key]
    if (isRecord(defaultValue) && isRecord(value)) {
      merged[key] = deepMergeDefaults(defaultValue, value)
    } else {
      merged[key] = value
    }
  }
  return merged as T
}

function applyKortixConfig(output: Config): void {
  const config = output as Config & {
    default_agent?: string
    skills?: { paths?: string[] }
    mcp?: Record<string, Record<string, unknown>>
    provider?: Record<string, Record<string, unknown>>
  }

  config.default_agent ??= "kortix"

  const runtimeAgents = Object.fromEntries(loadRuntimeAgents().map((agent) => [agent.name, agent.config]))
  config.agent = deepMergeDefaults(runtimeAgents, config.agent as Record<string, unknown> | undefined)

  const runtimeCommands = Object.fromEntries(loadRuntimeCommands().map((command) => [command.name, {
    description: command.description,
    agent: command.agent,
    model: command.model,
    subtask: command.subtask,
    template: command.template,
  }]))
  config.command = deepMergeDefaults(runtimeCommands, config.command as Record<string, unknown> | undefined)

  const skillPaths = new Set([...(config.skills?.paths ?? []), ...listRuntimeSkillPaths()])
  
  // Add user-installed skills from .opencode/skills
  skillPaths.add(".opencode/skills")
  
  config.skills = {
    ...(config.skills ?? {}),
    paths: [...skillPaths],
  }

  const existingContext7 = isRecord(config.mcp?.context7) ? config.mcp?.context7 : {}
  config.mcp = {
    ...(config.mcp ?? {}),
    context7: {
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      headers: {
        CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}",
      },
      enabled: true,
      ...existingContext7,
    },
  }

  // Set explicit baseURLs for providers to avoid "fetch() URL is invalid" error
  // Opencode doesn't resolve {env:...} templates in baseURL, so we set defaults
  const providerDefaults: Record<string, string> = {
    anthropic: "https://api.anthropic.com/v1",
    openai: "https://api.openai.com/v1",
    xai: "https://api.x.ai/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    groq: "https://api.groq.com/openai/v1",
  }
  config.provider ??= {}
  for (const [providerId, defaultUrl] of Object.entries(providerDefaults)) {
    const existing = isRecord(config.provider[providerId]) ? config.provider[providerId] as Record<string, unknown> : {}
    const existingOptions = isRecord(existing.options) ? existing.options : {}
    const existingHeaders = isRecord(existingOptions.headers) ? existingOptions.headers : {}
    config.provider[providerId] = {
      ...existing,
      options: {
        ...existingOptions,
        baseURL: defaultUrl,
        headers: {
          "X-Kortix-Token": "{env:KORTIX_TOKEN}",
          ...existingHeaders,
        },
      },
    }
  }
}

async function loadBundledTools(): Promise<Record<string, unknown>> {
  const toolsDir = new URL("../tools/", import.meta.url)
  const toolFiles = readdirSync(toolsDir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => name !== "lib")
    .sort()

  const entries = await Promise.all(toolFiles.map(async (file) => {
    const moduleUrl = new URL(`../tools/${file}`, import.meta.url)
    const mod = await import(moduleUrl.href)
    return [path.basename(file, ".ts"), mod.default] as const
  }))

  return Object.fromEntries(entries.filter(([, value]) => value))
}

const KortixOcPlugin: Plugin = async (ctx) => {
  const [bundledTools, ...outputs] = await Promise.all([
    loadBundledTools(),
    PtyPlugin(ctx),
    EnvsitterGuardPlugin(ctx),
    WorktreePlugin(ctx),
    KortixMemoryPlugin(ctx),
    TunnelPlugin(ctx),
    MorphPlugin(ctx),
  ])

  const merged = mergeOutputs(...outputs)
  merged.tool = {
    ...(bundledTools ?? {}),
    ...(merged.tool ?? {}),
  }
  const upstreamConfig = merged.config

  merged.config = async (input: Config) => {
    if (typeof upstreamConfig === "function") {
      await upstreamConfig(input)
    }
    applyKortixConfig(input)
  }

  return merged
}

export default KortixOcPlugin
