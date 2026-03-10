import { tool, type Plugin } from "@opencode-ai/plugin"
import { TriggerManager } from "./trigger-manager.js"
import type { AgentTriggersPluginOptions, PluginContextShape } from "./types.js"

function createLogger(client: PluginContextShape["client"], fallback?: AgentTriggersPluginOptions["logger"]) {
  return (level: "info" | "warn" | "error", message: string) => {
    fallback?.(level, message)
    try {
      client.app?.log?.({ body: { service: "opencode-agent-triggers", level, message } }).catch(() => undefined)
    } catch {
      // ignore log errors
    }
  }
}

export function createAgentTriggersPlugin(options: AgentTriggersPluginOptions = {}): Plugin {
  const plugin: Plugin = async (ctx) => {
    const shaped = ctx as unknown as PluginContextShape
    const logger = createLogger(shaped.client, options.logger)
    const manager = new TriggerManager(shaped.client, {
      ...options,
      directory: options.directory ?? shaped.directory,
      logger,
    })

    const autoSync = options.autoSync !== false
    if (autoSync) await manager.start()

    return {
      tool: {
        agent_triggers: tool({
          description: "List cron and webhook triggers defined directly in agent markdown files.",
          args: {},
          async execute() {
            const state = await manager.listState()
            const lines: string[] = [
              `=== AGENT TRIGGERS (${state.agents.length} agents) ===`,
              `Webhook base URL: ${state.publicBaseUrl}`,
              "",
            ]
            if (state.agents.length === 0) lines.push("No triggers discovered.")
            for (const agent of state.agents) {
              lines.push(`## ${agent.name} (${agent.filePath})`)
              for (const trigger of agent.triggers) {
                if (trigger.source.type === "cron") {
                  lines.push(`- [cron] ${trigger.name} | ${trigger.source.expr} | enabled=${trigger.enabled !== false}`)
                } else {
                  lines.push(`- [webhook] ${trigger.name} | ${(trigger.source.method ?? "POST").toUpperCase()} ${state.publicBaseUrl}${trigger.source.path} | enabled=${trigger.enabled !== false}`)
                }
              }
              lines.push("")
            }
            lines.push(`=== CRON BACKEND (${state.cron.length} registered) ===`)
            for (const item of state.cron) {
              lines.push(`- ${item.name} | ${item.cron_expr} | source=${item.source ?? "unknown"}`)
            }
            return lines.join("\n")
          },
        }),
        sync_agent_triggers: tool({
          description: "Re-read agent markdown files and sync cron/webhook triggers.",
          args: {},
          async execute() {
            const result = await manager.sync()
            return [
              `Discovered agents: ${result.discoveredAgents}`,
              `Cron registered: ${result.cronRegistered}`,
              `Cron updated: ${result.cronUpdated}`,
              `Cron removed: ${result.cronRemoved}`,
              `Webhook routes: ${result.webhookRegistered}`,
              "",
              ...result.details,
            ].join("\n")
          },
        }),
        cron_triggers: tool({
          description: "Manage scheduled cron triggers through the embedded opencode-agent-triggers scheduler. Actions: create, list, get, update, delete, pause, resume, run, executions.",
          args: {
            action: tool.schema.string(),
            trigger_id: tool.schema.string().optional(),
            name: tool.schema.string().optional(),
            cron_expr: tool.schema.string().optional(),
            prompt: tool.schema.string().optional(),
            timezone: tool.schema.string().optional(),
            agent_name: tool.schema.string().optional(),
            model_id: tool.schema.string().optional(),
            session_mode: tool.schema.string().optional(),
          },
          async execute(args) {
            const client = manager.getCronClient()
            switch (args.action) {
              case "list":
                return JSON.stringify(await client.list(), null, 2)
              case "create":
                if (!args.name || !args.cron_expr || !args.prompt) return "Error: name, cron_expr, and prompt are required."
                return JSON.stringify(await client.create(args.name, {
                  name: args.name,
                  source: {
                    type: "cron",
                    expr: args.cron_expr,
                    timezone: args.timezone,
                  },
                  execution: {
                    prompt: args.prompt,
                    agentName: args.agent_name,
                    modelId: args.model_id,
                    sessionMode: args.session_mode === "reuse" ? "reuse" : args.session_mode === "new" ? "new" : undefined,
                  },
                }, "manual"), null, 2)
              case "update":
                if (!args.trigger_id || !args.name || !args.cron_expr || !args.prompt) return "Error: trigger_id, name, cron_expr, and prompt are required."
                return JSON.stringify(await client.update(args.trigger_id, {
                  name: args.name,
                  source: {
                    type: "cron",
                    expr: args.cron_expr,
                    timezone: args.timezone,
                  },
                  execution: {
                    prompt: args.prompt,
                    agentName: args.agent_name,
                    modelId: args.model_id,
                    sessionMode: args.session_mode === "reuse" ? "reuse" : args.session_mode === "new" ? "new" : undefined,
                  },
                }, "manual"), null, 2)
              case "delete":
                if (!args.trigger_id) return "Error: trigger_id is required."
                return JSON.stringify(await client.remove(args.trigger_id), null, 2)
              case "pause":
                if (!args.trigger_id) return "Error: trigger_id is required."
                return JSON.stringify(await client.pause(args.trigger_id), null, 2)
              case "resume":
                if (!args.trigger_id) return "Error: trigger_id is required."
                return JSON.stringify(await client.resume(args.trigger_id), null, 2)
              case "run":
                if (!args.trigger_id) return "Error: trigger_id is required."
                return JSON.stringify(await client.run(args.trigger_id), null, 2)
              case "executions":
                if (!args.trigger_id) return "Error: trigger_id is required."
                return JSON.stringify(await client.executions(args.trigger_id), null, 2)
              case "get": {
                if (!args.trigger_id) return "Error: trigger_id is required."
                const items = await client.list()
                return JSON.stringify(items.find((item) => item.id === args.trigger_id || item.name === args.trigger_id) ?? null, null, 2)
              }
              default:
                return "Error: Unknown action. Use create, list, get, update, delete, pause, resume, run, executions."
            }
          },
        }),
      },
    }
  }
  return plugin
}

export default createAgentTriggersPlugin
