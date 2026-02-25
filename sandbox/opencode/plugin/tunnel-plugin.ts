/**
 * Tunnel Plugin — standalone wrapper that registers tunnel tools with OpenCode.
 * This is a thin plugin entry point that imports and exposes the tunnel tools.
 */

import { type Plugin, tool } from "@opencode-ai/plugin"


function getApiBase(): string {
	const raw = process.env.KORTIX_API_URL || "http://localhost:8008"
	try {
		const u = new URL(raw)
		if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
			u.hostname = "host.docker.internal"
		}
		return `${u.protocol}//${u.host}`
	} catch {
		return raw.replace(/\/v1\/.*$/, "")
	}
}

async function tunnelRpc(
	tunnelId: string,
	method: string,
	params: Record<string, unknown>,
): Promise<unknown> {
	const apiBase = getApiBase()
	const token = process.env.KORTIX_TOKEN || ""

	const res = await fetch(`${apiBase}/v1/tunnel/rpc/${tunnelId}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ method, params }),
	})

	const data = (await res.json()) as Record<string, unknown>

	if (!res.ok) {
		const error = data.error || `HTTP ${res.status}`
		const code = data.code || -1

		if (res.status === 403 && data.requestId) {
			return `Permission required. A permission request (${data.requestId}) has been sent to the user for approval. The user needs to approve this request in the Kortix dashboard before you can access their local machine. Please inform the user and try again after they approve.`
		}

		throw new Error(`Tunnel RPC failed: ${error} (code: ${code})`)
	}

	return data.result
}

let cachedTunnelId: string | null = null

async function resolveTunnelId(args: { tunnel_id?: string }): Promise<string> {
	if (args.tunnel_id) return args.tunnel_id
	if (process.env.KORTIX_TUNNEL_ID) return process.env.KORTIX_TUNNEL_ID
	if (cachedTunnelId) return cachedTunnelId

	const apiBase = getApiBase()
	const token = process.env.KORTIX_TOKEN || ""

	try {
		const res = await fetch(`${apiBase}/v1/tunnel/connections`, {
			headers: { Authorization: `Bearer ${token}` },
		})
		if (res.ok) {
			const connections = (await res.json()) as Array<{ tunnelId: string; isLive: boolean }>
			const online = connections.find((c) => c.isLive)
			if (online) {
				cachedTunnelId = online.tunnelId
				return online.tunnelId
			}
			if (connections.length > 0) {
				cachedTunnelId = connections[0]?.tunnelId || ""
				return connections[0]?.tunnelId || ""
			}
		}
	} catch {}

	throw new Error(
		"No tunnel connection found. The user needs to set up Kortix Tunnel:\n" +
		"1. Go to the Tunnel page in Kortix dashboard\n" +
		"2. Create a new connection\n" +
		"3. Run the connect command on their local machine"
	)
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

const TunnelPlugin: Plugin = async () => {
	return {
		tool: {
			tunnel_status: tool({
				description: `Check the status of a Kortix Tunnel connection to the user's local machine. Returns connection status, available capabilities, and machine info. Use this FIRST to verify the tunnel is connected before attempting local operations. This tool accesses the user's REAL local machine (not the sandbox).`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const apiBase = getApiBase()
					const token = process.env.KORTIX_TOKEN || ""

					const res = await fetch(`${apiBase}/v1/tunnel/connections/${tunnelId}`, {
						headers: { Authorization: `Bearer ${token}` },
					})

					if (!res.ok) {
						if (res.status === 404) return "Tunnel connection not found."
						return `Failed to check tunnel status: HTTP ${res.status}`
					}

					const data = (await res.json()) as Record<string, unknown>
					const status = data.isLive ? "ONLINE" : "OFFLINE"
					const capabilities = (data.capabilities as string[]) || []
					const machineInfo = data.machineInfo as Record<string, unknown> || {}

					return [
						`Tunnel Status: ${status}`,
						`Name: ${data.name}`,
						`Capabilities: ${capabilities.join(", ") || "none"}`,
						machineInfo.hostname ? `Machine: ${machineInfo.hostname} (${machineInfo.platform} ${machineInfo.arch})` : "",
						!data.isLive ? "\nThe tunnel agent is offline. Ask the user to run the connect command." : "",
					].filter(Boolean).join("\n")
				},
			}),

			tunnel_fs_read: tool({
				description: `Read a file from the user's LOCAL MACHINE (not the sandbox) via Kortix Tunnel. Use this when the user asks to read files on their local/host machine.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					path: tool.schema.string().describe("Absolute path to the file on the user's local machine"),
					encoding: tool.schema.string().optional().describe("File encoding (default: utf-8)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "fs.read", {
						path: args.path,
						encoding: args.encoding || "utf-8",
					})
					if (typeof result === "string") return result
					const data = result as Record<string, unknown>
					return `=== File: ${args.path} (${data.size} bytes) ===\n${data.content}`
				},
			}),

			tunnel_fs_write: tool({
				description: `Write a file to the user's LOCAL MACHINE (not the sandbox) via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					path: tool.schema.string().describe("Absolute path for the file on the user's local machine"),
					content: tool.schema.string().describe("File content to write"),
					encoding: tool.schema.string().optional().describe("File encoding (default: utf-8)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "fs.write", {
						path: args.path,
						content: args.content,
						encoding: args.encoding || "utf-8",
					})
					if (typeof result === "string") return result
					const data = result as Record<string, unknown>
					return `File written: ${data.path} (${data.size} bytes)`
				},
			}),

			tunnel_fs_list: tool({
				description: `List directory contents on the user's LOCAL MACHINE (not the sandbox) via Kortix Tunnel. Use this when the user asks about files on their local/host machine.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					path: tool.schema.string().describe("Absolute path to the directory on the user's local machine"),
					recursive: tool.schema.boolean().optional().describe("Include subdirectory contents (default: false)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "fs.list", {
						path: args.path,
						recursive: args.recursive || false,
					})
					if (typeof result === "string") return result
					const data = result as { entries: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>; count: number }
					if (data.entries.length === 0) return `Directory is empty: ${args.path}`
					const lines = [`=== Local Machine Directory: ${args.path} (${data.count} entries) ===`]
					for (const entry of data.entries) {
						const type = entry.isDirectory ? "[DIR]" : "[FILE]"
						lines.push(`  ${type} ${entry.name}`)
					}
					return lines.join("\n")
				},
			}),

			tunnel_shell_exec: tool({
				description: `Execute a command on the user's LOCAL MACHINE (not the sandbox) via Kortix Tunnel. Use this when the user asks to run commands on their local/host machine.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					command: tool.schema.string().describe("Command executable name (e.g., 'ls', 'git', 'python')"),
					args: tool.schema.array(tool.schema.string()).optional().describe("Command arguments as separate strings"),
					cwd: tool.schema.string().optional().describe("Working directory for the command"),
					timeout: tool.schema.number().optional().describe("Timeout in milliseconds (default: 30000)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "shell.exec", {
						command: args.command,
						args: args.args || [],
						cwd: args.cwd,
						timeout: args.timeout,
					})
					if (typeof result === "string") return result
					const data = result as {
						exitCode: number | null; signal: string | null
						stdout: string; stderr: string
						stdoutTruncated: boolean; stderrTruncated: boolean
					}
					const lines = [`Command: ${args.command} ${(args.args || []).join(" ")}`, `Exit code: ${data.exitCode ?? "N/A"}`]
					if (data.stdout) lines.push(`\n--- stdout ---\n${data.stdout}`)
					if (data.stderr) lines.push(`\n--- stderr ---\n${data.stderr}`)
					return lines.join("\n")
				},
			}),
		},
	}
}

export default TunnelPlugin
