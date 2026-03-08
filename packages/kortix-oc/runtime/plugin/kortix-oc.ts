import type { Plugin } from "@opencode-ai/plugin"
import WorktreePlugin from "./worktree"
import TunnelPlugin from "./agent-tunnel/index"
import MorphPlugin from "./morph"
import KortixMemoryPlugin from "./kortix-sys/src/index"

type PluginOutput = Awaited<ReturnType<Plugin>>
type PluginValue = PluginOutput[string]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function chainHandlers(first: PluginValue, second: PluginValue): PluginValue {
  if (typeof first === "function" && typeof second === "function") {
    return async (...args: unknown[]) => {
      await first(...args)
      await second(...args)
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

const KortixOcPlugin: Plugin = async (ctx) => {
  const outputs = await Promise.all([
    WorktreePlugin(ctx),
    KortixMemoryPlugin(ctx),
    TunnelPlugin(ctx),
    MorphPlugin(ctx),
  ])

  return mergeOutputs(...outputs)
}

export default KortixOcPlugin
