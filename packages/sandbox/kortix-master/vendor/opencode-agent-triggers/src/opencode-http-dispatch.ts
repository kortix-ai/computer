import type { CronTriggerRecord } from "./types.js"

export interface OpenCodeHttpDispatchOptions {
  baseUrl: string
  timeoutMs?: number
}

function parseModel(modelId?: string | null): { providerID: string; modelID: string } | undefined {
  if (!modelId) return undefined
  const [providerID, ...rest] = modelId.split("/")
  if (!providerID || rest.length === 0) return { providerID: "kortix", modelID: modelId }
  return { providerID, modelID: rest.join("/") }
}

export function buildCronTriggerEventText(trigger: CronTriggerRecord, event: { type: "cron.tick"; manual: boolean; timestamp: string }): string {
  return [
    trigger.prompt,
    "",
    "<trigger_event>",
    JSON.stringify({ type: event.type, trigger: trigger.name, data: { timestamp: event.timestamp, manual: event.manual } }, null, 2),
    "</trigger_event>",
  ].join("\n")
}

export async function dispatchCronTriggerViaHttp(
  trigger: CronTriggerRecord,
  event: { type: "cron.tick"; manual: boolean; timestamp: string },
  options: OpenCodeHttpDispatchOptions,
): Promise<{ sessionId: string; response: { accepted: true } }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 300000)

  try {
    const bodyText = buildCronTriggerEventText(trigger, event)

    if (trigger.session_mode === "reuse" && trigger.session_id) {
      const res = await fetch(`${options.baseUrl}/session/${trigger.session_id}/prompt_async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: bodyText }],
          agent: trigger.agent_name ?? undefined,
          model: parseModel(trigger.model_id),
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Failed to send prompt to session ${trigger.session_id}: ${res.status} ${await res.text()}`)
      await res.text()
      return { sessionId: trigger.session_id, response: { accepted: true } }
    }

    const sessionRes = await fetch(`${options.baseUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trigger.agent_name ? { agent: trigger.agent_name } : {}),
      signal: controller.signal,
    })
    if (!sessionRes.ok) throw new Error(`Failed to create session: ${sessionRes.status} ${await sessionRes.text()}`)
    const session = await sessionRes.json() as { id: string }

    const promptRes = await fetch(`${options.baseUrl}/session/${session.id}/prompt_async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: bodyText }],
        agent: trigger.agent_name ?? undefined,
        model: parseModel(trigger.model_id),
      }),
      signal: controller.signal,
    })
    if (!promptRes.ok) throw new Error(`Failed to send prompt: ${promptRes.status} ${await promptRes.text()}`)
    await promptRes.text()
    return { sessionId: session.id, response: { accepted: true } }
  } finally {
    clearTimeout(timeout)
  }
}
