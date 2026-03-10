import { createAgentTriggersPlugin } from "./plugin.js"

export { discoverAgentsWithTriggers, resolveAgentPaths } from "./parser.js"
export { isValidCronExpression, getNextRun, describeCron, CronStore } from "./cron-store.js"
export { CronManager } from "./cron-manager.js"
export { CronClient } from "./cron-client.js"
export { buildCronTriggerEventText, dispatchCronTriggerViaHttp } from "./opencode-http-dispatch.js"
export { WebhookTriggerServer } from "./webhook-server.js"
export { TriggerManager } from "./trigger-manager.js"
export { createAgentTriggersPlugin } from "./plugin.js"
export type {
  AgentTriggerConfig,
  AgentTriggersPluginOptions,
  CronTriggerConfig,
  CronTriggerRecord,
  DiscoveredAgent,
  MinimalOpenCodeClient,
  PluginContextShape,
  TriggerKind,
  TriggerSyncResult,
  WebhookTriggerConfig,
} from "./types.js"

export default createAgentTriggersPlugin()
