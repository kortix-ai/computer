import path from "node:path"
import type { MinimalOpenCodeClient, AgentTriggersPluginOptions, CronTriggerConfig, DiscoveredAgent, TriggerSyncResult, WebhookDispatchResult, WebhookTriggerConfig, CronTriggerRecord } from "./types.js"
import { CronClient } from "./cron-client.js"
import { CronManager } from "./cron-manager.js"
import { CronStore } from "./cron-store.js"
import { discoverAgentsWithTriggers } from "./parser.js"
import { WebhookTriggerServer, type WebhookRoute } from "./webhook-server.js"

function parseModel(modelId?: string): { providerID: string; modelID: string } | undefined {
  if (!modelId) return undefined
  const [providerID, ...rest] = modelId.split("/")
  if (!providerID || rest.length === 0) return { providerID: "kortix", modelID: modelId }
  return { providerID, modelID: rest.join("/") }
}

function getPathValue(input: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (current === null || current === undefined || typeof current !== "object") return undefined
    return (current as Record<string, unknown>)[part]
  }, input)
}

function renderPrompt(template: string, values: Record<string, unknown>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = values[key]
    if (value === null || value === undefined) return ""
    if (typeof value === "string") return value
    return JSON.stringify(value)
  })
}

export class TriggerManager {
  private readonly cronClient: CronClient
  private readonly cronManager: CronManager
  private readonly webhookServer: WebhookTriggerServer
  private discovered: DiscoveredAgent[] = []
  private readonly reusedSessions = new Map<string, string>()
  private started = false

  constructor(
    private readonly client: MinimalOpenCodeClient,
    private readonly options: AgentTriggersPluginOptions = {},
  ) {
    const host = options.webhookHost ?? "0.0.0.0"
    const port = options.webhookPort ?? 8099
    const statePath = options.cronStatePath
      ?? path.join(options.directory ?? process.cwd(), ".opencode", "agent-triggers", "cron-state.json")
    const cronStore = new CronStore(statePath)
    this.cronManager = new CronManager(cronStore, (trigger, event) => this.dispatchCron(trigger, event))
    this.cronClient = new CronClient(this.cronManager)
    this.webhookServer = new WebhookTriggerServer(host, port, (route, payload) => this.dispatchWebhook(route, payload))
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    this.options.logger?.(level, message)
  }

  public getPublicBaseUrl(): string {
    return this.options.publicBaseUrl ?? `http://localhost:${this.options.webhookPort ?? 8099}`
  }

  public async start(): Promise<TriggerSyncResult> {
    if (!this.started) {
      this.cronManager.start()
      await this.webhookServer.start()
      this.started = true
    }
    return this.sync()
  }

  public async stop(): Promise<void> {
    this.cronManager.stop()
    await this.webhookServer.stop()
    this.started = false
  }

  public discover(): DiscoveredAgent[] {
    this.discovered = discoverAgentsWithTriggers(this.options)
    return this.discovered
  }

  private buildExecutionText(route: WebhookRoute, payload: { body: string; headers: Record<string, string>; method: string; path: string }): string {
    const parsedBody = (() => {
      try {
        return JSON.parse(payload.body)
      } catch {
        return payload.body
      }
    })()
    const event = {
      type: "webhook.request",
      trigger: route.trigger.name,
      agent: route.agentName,
      data: {
        method: payload.method,
        path: payload.path,
        headers: payload.headers,
        body: parsedBody,
      },
    }

    const extracted: Record<string, unknown> = {}
    for (const [key, path] of Object.entries(route.trigger.context?.extract ?? {})) {
      extracted[key] = getPathValue(event, path)
    }

    const sections = [renderPrompt(route.trigger.execution.prompt, extracted)]
    if (Object.keys(extracted).length > 0) {
      sections.push("", "<trigger_context_values>", JSON.stringify(extracted, null, 2), "</trigger_context_values>")
    }
    if (route.trigger.context?.includeRaw !== false) {
      sections.push("", "<trigger_event>", JSON.stringify(event, null, 2), "</trigger_event>")
    }
    return sections.join("\n")
  }

  private buildCronExecutionText(trigger: CronTriggerRecord, event: { type: "cron.tick"; manual: boolean; timestamp: string }): string {
    const normalizedEvent = {
      type: event.type,
      trigger: trigger.name,
      data: {
        timestamp: event.timestamp,
        manual: event.manual,
      },
    }
    return [
      trigger.prompt,
      "",
      "<trigger_event>",
      JSON.stringify(normalizedEvent, null, 2),
      "</trigger_event>",
    ].join("\n")
  }

  private async dispatchCron(trigger: CronTriggerRecord, event: { type: "cron.tick"; manual: boolean; timestamp: string }): Promise<{ sessionId: string; response: { accepted: true } }> {
    const reuseKey = `${trigger.name}`
    let sessionId = trigger.session_mode === "reuse" ? this.reusedSessions.get(reuseKey) ?? trigger.session_id ?? undefined : undefined

    if (!sessionId) {
      const created = await this.client.session.create({
        directory: this.options.directory,
        title: trigger.name,
      }) as { data?: { id: string }; id?: string }
      sessionId = created.data?.id ?? created.id
      if (!sessionId) throw new Error("session.create did not return an id")
      if (trigger.session_mode === "reuse") this.reusedSessions.set(reuseKey, sessionId)
    }

    await this.client.session.promptAsync({
      sessionID: sessionId,
      agent: trigger.agent_name ?? undefined,
      model: parseModel(trigger.model_id),
      parts: [{ type: "text", text: this.buildCronExecutionText(trigger, event) }],
    })

    return { sessionId, response: { accepted: true } }
  }

  private async dispatchWebhook(route: WebhookRoute, payload: { body: string; headers: Record<string, string>; method: string; path: string }): Promise<WebhookDispatchResult> {
    const reuseKey = `${route.agentName}:${route.trigger.name}`
    let sessionId = route.trigger.execution.sessionMode === "reuse" ? this.reusedSessions.get(reuseKey) : undefined

    if (!sessionId) {
      const created = await this.client.session.create({
        directory: this.options.directory,
        title: `${route.agentName}:${route.trigger.name}`,
      }) as { data?: { id: string }; id?: string }
      sessionId = created.data?.id ?? created.id
      if (!sessionId) throw new Error("session.create did not return an id")
      if (route.trigger.execution.sessionMode === "reuse") this.reusedSessions.set(reuseKey, sessionId)
    }

    const bodyText = this.buildExecutionText(route, payload)

    await this.client.session.promptAsync({
      sessionID: sessionId,
      agent: route.trigger.execution.agentName ?? route.agentName,
      model: parseModel(route.trigger.execution.modelId),
      parts: [{ type: "text", text: bodyText }],
    })

    return { sessionId }
  }

  private async syncCronTriggers(agents: DiscoveredAgent[], details: string[]): Promise<{ registered: number; updated: number; removed: number }> {
    const existing = await this.cronClient.list()
    const desired = new Map<string, { agentName: string; trigger: CronTriggerConfig }>()

    for (const agent of agents) {
      for (const trigger of agent.triggers) {
        if (trigger.source.type !== "cron" || trigger.enabled === false) continue
        desired.set(`${agent.name}:${trigger.name}`, { agentName: agent.name, trigger: trigger as CronTriggerConfig })
      }
    }

    let registered = 0
    let updated = 0
    let removed = 0
    const existingByName = new Map(existing.map((item) => [item.name, item]))

    for (const [name, config] of desired.entries()) {
      const source = `agent:${config.agentName}`
      const current = existingByName.get(name)
      if (!current) {
        await this.cronClient.create(name, config.trigger, source)
        registered++
        details.push(`registered cron ${name}`)
        continue
      }
      if (
        current.cron_expr !== config.trigger.source.expr ||
        current.prompt !== config.trigger.execution.prompt ||
        (current.timezone ?? "") !== (config.trigger.source.timezone ?? "") ||
        (current.session_mode ?? "") !== (config.trigger.execution.sessionMode ?? "") ||
        (current.model_id ?? "") !== (config.trigger.execution.modelId ?? "")
      ) {
        const id = current.id ?? name
        await this.cronClient.update(id, { ...config.trigger, name }, source)
        updated++
        details.push(`updated cron ${name}`)
      }
    }

    for (const item of existing) {
      if (!item.name.includes(":")) continue
      if (item.source && !String(item.source).startsWith("agent:")) continue
      if (!desired.has(item.name)) {
        const id = item.id ?? item.name
        await this.cronClient.remove(id)
        removed++
        details.push(`removed stale cron ${item.name}`)
      }
    }

    return { registered, updated, removed }
  }

  private syncWebhookRoutes(agents: DiscoveredAgent[]): number {
    const routes: WebhookRoute[] = []
    for (const agent of agents) {
      for (const trigger of agent.triggers) {
        if (trigger.source.type !== "webhook" || trigger.enabled === false) continue
        routes.push({ agentName: agent.name, trigger: trigger as WebhookTriggerConfig })
      }
    }
    this.webhookServer.setRoutes(routes)
    return routes.length
  }

  public async sync(): Promise<TriggerSyncResult> {
    const agents = this.discover()
    const details: string[] = []
    const cron = await this.syncCronTriggers(agents, details)
    const webhookRegistered = this.syncWebhookRoutes(agents)
    details.push(`registered ${webhookRegistered} webhook route(s)`)
    this.log("info", `[agent-triggers] sync complete: ${cron.registered} cron created, ${cron.updated} cron updated, ${cron.removed} cron removed, ${webhookRegistered} webhooks`)
    return {
      discoveredAgents: agents.length,
      cronRegistered: cron.registered,
      cronUpdated: cron.updated,
      cronRemoved: cron.removed,
      webhookRegistered,
      details,
    }
  }

  public async listState(): Promise<{ agents: DiscoveredAgent[]; cron: Awaited<ReturnType<CronClient["list"]>>; publicBaseUrl: string }> {
    return {
      agents: this.discover(),
      cron: await this.cronClient.list(),
      publicBaseUrl: this.getPublicBaseUrl(),
    }
  }

  public getCronClient(): CronClient {
    return this.cronClient
  }
}
