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

		if (res.status === 404) {
			cachedTunnelId = null
		}

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
						if (res.status === 404) {
							cachedTunnelId = null
							return "Tunnel connection not found. Cache cleared — will re-discover on next call."
						}
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

			tunnel_screenshot: tool({
				description: `Take a screenshot of the user's LOCAL MACHINE screen via Kortix Tunnel. Returns a base64-encoded PNG image. Can capture full screen, a region, or a specific window. Use this to SEE what's on the user's screen for computer-use automation.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					x: tool.schema.number().optional().describe("Region X coordinate"),
					y: tool.schema.number().optional().describe("Region Y coordinate"),
					width: tool.schema.number().optional().describe("Region width"),
					height: tool.schema.number().optional().describe("Region height"),
					windowId: tool.schema.number().optional().describe("Capture specific window by ID"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const params: Record<string, unknown> = {}
					if (args.x !== undefined && args.y !== undefined && args.width !== undefined && args.height !== undefined) {
						params.region = { x: args.x, y: args.y, width: args.width, height: args.height }
					}
					if (args.windowId !== undefined) params.windowId = args.windowId
					const result = await tunnelRpc(tunnelId, "desktop.screenshot", params)
					if (typeof result === "string") return result
					const data = result as { image: string; width: number; height: number }
					return `Screenshot captured: ${data.width}x${data.height} PNG (${Math.round(data.image.length * 0.75 / 1024)}KB)\n\n[base64:${data.image.slice(0, 100)}...]`
				},
			}),

			tunnel_click: tool({
				description: `Click at specific screen coordinates on the user's LOCAL MACHINE via Kortix Tunnel. Supports left/right/middle click, double-click, and modifier keys (cmd, shift, alt, ctrl).`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					x: tool.schema.number().describe("X coordinate to click"),
					y: tool.schema.number().describe("Y coordinate to click"),
					button: tool.schema.enum(["left", "right", "middle"]).optional().describe("Mouse button (default: left)"),
					clicks: tool.schema.number().optional().describe("Number of clicks (default: 1, use 2 for double-click)"),
					modifiers: tool.schema.array(tool.schema.string()).optional().describe("Modifier keys held during click: cmd, shift, alt, ctrl"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.mouse.click", {
						x: args.x, y: args.y, button: args.button, clicks: args.clicks, modifiers: args.modifiers,
					})
					if (typeof result === "string") return result
					return `Clicked at (${args.x}, ${args.y}) [${args.button || "left"}]${args.clicks && args.clicks > 1 ? ` x${args.clicks}` : ""}`
				},
			}),

			tunnel_type: tool({
				description: `Type text into the currently focused application on the user's LOCAL MACHINE via Kortix Tunnel. Characters are typed as if from a keyboard.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					text: tool.schema.string().describe("Text to type"),
					delay: tool.schema.number().optional().describe("Delay between characters in ms"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.keyboard.type", { text: args.text, delay: args.delay })
					if (typeof result === "string") return result
					return `Typed ${args.text.length} characters`
				},
			}),

			tunnel_key: tool({
				description: `Press a key combination on the user's LOCAL MACHINE via Kortix Tunnel. Use for shortcuts like cmd+s, ctrl+c, enter, tab, escape, etc.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					keys: tool.schema.array(tool.schema.string()).describe("Keys to press. Examples: ['cmd', 's'], ['enter'], ['ctrl', 'shift', 'p']"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.keyboard.key", { keys: args.keys })
					if (typeof result === "string") return result
					return `Pressed: ${args.keys.join("+")}`
				},
			}),

			tunnel_window_list: tool({
				description: `List all visible windows on the user's LOCAL MACHINE via Kortix Tunnel. Returns window IDs, app names, titles, positions, sizes. Use window IDs with tunnel_window_focus.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.window.list", {})
					if (typeof result === "string") return result
					const data = result as { windows: Array<{ id: number; app: string; title: string; bounds: { x: number; y: number; width: number; height: number }; minimized: boolean }> }
					if (data.windows.length === 0) return "No windows found"
					const lines = [`=== Windows (${data.windows.length}) ===`]
					for (const w of data.windows) {
						const min = w.minimized ? " [minimized]" : ""
						lines.push(`  #${w.id} | ${w.app} - "${w.title}" | ${w.bounds.x},${w.bounds.y} ${w.bounds.width}x${w.bounds.height}${min}`)
					}
					return lines.join("\n")
				},
			}),

			tunnel_window_focus: tool({
				description: `Bring a window to the front on the user's LOCAL MACHINE via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					windowId: tool.schema.number().describe("Window ID from tunnel_window_list"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.window.focus", { windowId: args.windowId })
					if (typeof result === "string") return result
					return `Window #${args.windowId} focused`
				},
			}),

			tunnel_app_launch: tool({
				description: `Launch an application on the user's LOCAL MACHINE via Kortix Tunnel. On macOS use app name like "Calculator", "Safari". On Linux use executable name.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					app: tool.schema.string().describe("Application name to launch"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.app.launch", { app: args.app })
					if (typeof result === "string") return result
					return `Launched: ${args.app}`
				},
			}),

			tunnel_app_quit: tool({
				description: `Quit an application on the user's LOCAL MACHINE via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					app: tool.schema.string().describe("Application name to quit"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.app.quit", { app: args.app })
					if (typeof result === "string") return result
					return `Quit: ${args.app}`
				},
			}),

			tunnel_clipboard_read: tool({
				description: `Read clipboard contents from the user's LOCAL MACHINE via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.clipboard.read", {})
					if (typeof result === "string") return result
					const data = result as { text: string }
					if (!data.text) return "(clipboard is empty)"
					return `=== Clipboard ===\n${data.text}`
				},
			}),

			tunnel_clipboard_write: tool({
				description: `Write text to clipboard on the user's LOCAL MACHINE via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					text: tool.schema.string().describe("Text to write to clipboard"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.clipboard.write", { text: args.text })
					if (typeof result === "string") return result
					return `Clipboard updated (${args.text.length} chars)`
				},
			}),

			tunnel_cursor_image: tool({
				description: `Take a small screenshot around the current cursor position on the user's LOCAL MACHINE via Kortix Tunnel. Useful for seeing what's near the cursor.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					radius: tool.schema.number().optional().describe("Radius in pixels around cursor (default: 50)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.cursor.image", { radius: args.radius })
					if (typeof result === "string") return result
					const data = result as { image: string; width: number; height: number }
					return `Cursor area: ${data.width}x${data.height} PNG (${Math.round(data.image.length * 0.75 / 1024)}KB)\n\n[base64:${data.image.slice(0, 100)}...]`
				},
			}),

			tunnel_mouse_move: tool({
				description: `Move the mouse cursor to a specific position on the user's LOCAL MACHINE screen via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					x: tool.schema.number().describe("Target X coordinate"),
					y: tool.schema.number().describe("Target Y coordinate"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.mouse.move", { x: args.x, y: args.y })
					if (typeof result === "string") return result
					return `Mouse moved to (${args.x}, ${args.y})`
				},
			}),

			tunnel_mouse_drag: tool({
				description: `Drag from one point to another on the user's LOCAL MACHINE screen via Kortix Tunnel. For drag-and-drop, resizing, drawing.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					fromX: tool.schema.number().describe("Start X"),
					fromY: tool.schema.number().describe("Start Y"),
					toX: tool.schema.number().describe("End X"),
					toY: tool.schema.number().describe("End Y"),
					button: tool.schema.enum(["left", "right"]).optional().describe("Mouse button (default: left)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.mouse.drag", {
						fromX: args.fromX, fromY: args.fromY, toX: args.toX, toY: args.toY, button: args.button,
					})
					if (typeof result === "string") return result
					return `Dragged from (${args.fromX}, ${args.fromY}) to (${args.toX}, ${args.toY})`
				},
			}),

			tunnel_mouse_scroll: tool({
				description: `Scroll the mouse wheel at a position on the user's LOCAL MACHINE screen via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
					x: tool.schema.number().describe("X coordinate"),
					y: tool.schema.number().describe("Y coordinate"),
					deltaX: tool.schema.number().optional().describe("Horizontal scroll (positive=right)"),
					deltaY: tool.schema.number().optional().describe("Vertical scroll (positive=down)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.mouse.scroll", {
						x: args.x, y: args.y, deltaX: args.deltaX, deltaY: args.deltaY,
					})
					if (typeof result === "string") return result
					return `Scrolled at (${args.x}, ${args.y}) [dx=${args.deltaX || 0}, dy=${args.deltaY || 0}]`
				},
			}),

			tunnel_screen_info: tool({
				description: `Get screen resolution and scale factor from the user's LOCAL MACHINE via Kortix Tunnel.`,
				args: {
					tunnel_id: tool.schema.string().optional().describe("Tunnel connection ID (auto-discovered if not provided)"),
				},
				async execute(args) {
					const tunnelId = await resolveTunnelId(args)
					const result = await tunnelRpc(tunnelId, "desktop.screen.info", {})
					if (typeof result === "string") return result
					const data = result as { width: number; height: number; scaleFactor: number }
					return `Screen: ${data.width}x${data.height} @ ${data.scaleFactor}x scale`
				},
			}),
		},
	}
}

export default TunnelPlugin
