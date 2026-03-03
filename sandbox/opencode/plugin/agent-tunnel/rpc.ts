/**
 * Shared RPC infrastructure for tunnel tools.
 *
 * Auth: KORTIX_API_URL + KORTIX_TOKEN env vars via the shared getEnv() helper.
 * Resolution order: process.env → s6 env dir → .env file fallback.
 */

import { getEnv } from "../../tools/lib/get-env"

export function getApiBase(): string {
	return (getEnv("KORTIX_API_URL") || "http://localhost:8008").replace(/\/+$/, "")
}

export function getTunnelBase(): string {
	return `${getApiBase()}/v1/tunnel`
}

export function getToken(): string {
	return getEnv("KORTIX_TOKEN") || ""
}

// ─── Tunnel RPC ─────────────────────────────────────────────────────────────

export async function tunnelRpc(
	tunnelId: string,
	method: string,
	params: Record<string, unknown>,
): Promise<unknown> {
	const token = getToken()

	const res = await fetch(`${getTunnelBase()}/rpc/${tunnelId}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ method, params }),
	})

	const data = (await res.json()) as Record<string, unknown>

	if (!res.ok) {
		if (res.status === 404) cachedTunnelId = null

		if (res.status === 403 && data.requestId) {
			return `Permission required. A permission request (${data.requestId}) has been sent to the user for approval. The user needs to approve this request before you can access their local machine. Please inform the user and try again after they approve.`
		}

		throw new Error(`Tunnel RPC failed: ${data.error || `HTTP ${res.status}`} (code: ${data.code || -1})`)
	}

	return data.result
}

// ─── Tunnel ID resolution ───────────────────────────────────────────────────

let cachedTunnelId: string | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 10_000 // re-discover every 10s to avoid stale IDs

export async function resolveTunnelId(args: { tunnel_id?: string }): Promise<string> {
	if (getEnv("KORTIX_TUNNEL_ID")) return getEnv("KORTIX_TUNNEL_ID")!

	// Use cache if fresh
	if (cachedTunnelId && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
		return cachedTunnelId
	}

	// Always auto-discover from API (ignores args.tunnel_id to prevent stale IDs)
	const token = getToken()

	try {
		const res = await fetch(`${getTunnelBase()}/connections`, {
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
		})
		if (res.ok) {
			const connections = (await res.json()) as Array<{ tunnelId: string; isLive: boolean }>
			// Prefer a live connection, fall back to most recent
			const online = connections.find((c) => c.isLive)
			if (online) { cachedTunnelId = online.tunnelId; cacheTimestamp = Date.now(); return online.tunnelId }
			if (connections.length > 0) { cachedTunnelId = connections[0].tunnelId; cacheTimestamp = Date.now(); return connections[0].tunnelId }
		}
	} catch {}

	cachedTunnelId = null
	throw new Error(
		"No tunnel connection found. The user needs to set up Agent Tunnel first:\n" +
		"1. Create a tunnel connection\n" +
		"2. Run `npx agent-tunnel connect` on their local machine"
	)
}
