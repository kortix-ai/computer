import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { TunnelClient, createTunnelTools } from "agent-tunnel/client"
import { getEnv } from "../../tools/lib/get-env"

function getApiBase(): string {
	return (getEnv("KORTIX_API_URL") || "http://localhost:8008").replace(/\/+$/, "")
}

function createClient(): TunnelClient {
	return new TunnelClient({
		apiUrl: `${getApiBase()}/v1/tunnel`,
		token: getEnv("KORTIX_TOKEN") || "",
		tunnelId: getEnv("KORTIX_TUNNEL_ID"),
	})
}

const TunnelPlugin: Plugin = async () => {
	const client = createClient()
	const tunnelTools = createTunnelTools(client)

	const tools: Record<string, ReturnType<typeof tool>> = {}

	for (const def of tunnelTools) {
		const args: Record<string, ReturnType<typeof tool.schema.string>> = {}

		for (const [key, param] of Object.entries(def.parameters)) {
			if (param.type === "number") {
				const s = tool.schema.number().describe(param.description)
				args[key] = param.required ? s : s.optional() as any
			} else if (param.type === "boolean") {
				const s = tool.schema.boolean().describe(param.description)
				args[key] = param.required ? s : s.optional() as any
			} else if (param.type === "array") {
				const s = tool.schema.array(tool.schema.string()).describe(param.description)
				args[key] = param.required ? s : s.optional() as any
			} else if (param.enum) {
				const s = tool.schema.enum(param.enum as [string, ...string[]]).describe(param.description)
				args[key] = param.required ? s : s.optional() as any
			} else {
				const s = tool.schema.string().describe(param.description)
				args[key] = param.required ? s : s.optional() as any
			}
		}

		tools[def.name] = tool({
			description: def.description,
			args,
			execute: (a: Record<string, unknown>) => def.execute(a),
		})
	}

	return { tool: tools }
}

export default TunnelPlugin
