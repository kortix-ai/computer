/**
 * Deterministic Observation Extractor
 *
 * Converts raw tool execution data into structured observations.
 * No AI calls — pure heuristic classification.
 * Runs on every tool.execute.after hook.
 */

import type { CreateObservationInput, ObservationType } from "./types"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RawToolData {
	tool: string
	args: Record<string, unknown>
	output: string
	title?: string
}

// ─── Skip list ───────────────────────────────────────────────────────────────

/** Tools that should NOT generate observations (our own tools, noisy tools) */
export const SKIP_TOOLS = new Set([
	"mem_search",
	"mem_save",
	"TodoWrite",
	"TodoRead",
	"todowrite",
	"todoread",
	"pty_list",
	"pty_read",
	"pty_kill",
	"question",
])

// ─── Privacy ─────────────────────────────────────────────────────────────────

/** Strip <private>...</private> tags, replacing content with [REDACTED] */
function stripPrivate(text: string): string {
	return text.replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]")
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function extractObservation(
	raw: RawToolData,
	sessionId: string,
	promptNumber: number | null,
): CreateObservationInput | null {
	if (SKIP_TOOLS.has(raw.tool)) return null

	// Sanitize
	const args = sanitizeArgs(raw.args)
	const output = stripPrivate(truncate(raw.output, 3000))
	const clean = { ...raw, args, output }

	switch (raw.tool) {
		case "read":
		case "Read":
			return extractRead(clean, sessionId, promptNumber)
		case "write":
		case "Write":
			return extractWrite(clean, sessionId, promptNumber)
		case "edit":
		case "Edit":
			return extractEdit(clean, sessionId, promptNumber)
		case "bash":
		case "Bash":
			return extractBash(clean, sessionId, promptNumber)
		case "grep":
		case "Grep":
			return extractGrep(clean, sessionId, promptNumber)
		case "glob":
		case "Glob":
			return extractGlob(clean, sessionId, promptNumber)
		case "web_search":
		case "web-search":
			return extractWebSearch(clean, sessionId, promptNumber)
		default:
			return extractGeneric(clean, sessionId, promptNumber)
	}
}

// ─── Per-tool extractors ─────────────────────────────────────────────────────

function extractRead(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const path = str(raw.args.filePath || raw.args.path || raw.args.file)
	const filename = basename(path)
	return {
		sessionId,
		type: "discovery",
		title: `Read ${filename || "file"}`,
		narrative: path ? `Read ${path}` : "Read a file",
		facts: [],
		concepts: conceptsFromPath(path),
		filesRead: path ? [path] : [],
		filesModified: [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

function extractWrite(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const path = str(raw.args.filePath || raw.args.path || raw.args.file)
	const filename = basename(path)
	return {
		sessionId,
		type: "feature",
		title: `Wrote ${filename || "file"}`,
		narrative: path ? `Created/wrote ${path}` : "Wrote a file",
		facts: [],
		concepts: conceptsFromPath(path),
		filesRead: [],
		filesModified: path ? [path] : [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

function extractEdit(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const path = str(raw.args.filePath || raw.args.path || raw.args.file)
	const filename = basename(path)
	const oldStr = str(raw.args.oldString || raw.args.old_string).slice(0, 100)
	const newStr = str(raw.args.newString || raw.args.new_string).slice(0, 100)

	// Classify: bugfix if "fix" in context, refactor if structural, else change
	const combined = `${oldStr} ${newStr} ${raw.output}`.toLowerCase()
	let type: ObservationType = "change"
	if (combined.includes("fix") || combined.includes("bug") || combined.includes("error")) type = "bugfix"
	else if (combined.includes("refactor") || combined.includes("rename") || combined.includes("move")) type = "refactor"

	const facts: string[] = []
	if (oldStr && newStr) facts.push(`${oldStr.trim()} → ${newStr.trim()}`)

	return {
		sessionId,
		type,
		title: `Edited ${filename || "file"}`,
		narrative: path ? `Edited ${path}` : "Edited a file",
		facts,
		concepts: conceptsFromPath(path),
		filesRead: [],
		filesModified: path ? [path] : [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

function extractBash(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const cmd = str(raw.args.command || raw.args.cmd).slice(0, 200)
	const output = raw.output.slice(0, 500)
	const { type, title, concepts } = classifyBash(cmd, output)

	return {
		sessionId,
		type,
		title,
		narrative: `$ ${cmd}`,
		facts: output ? [output.slice(0, 300)] : [],
		concepts,
		filesRead: [],
		filesModified: [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

function extractGrep(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const pattern = str(raw.args.pattern || raw.args.query)
	const matchCount = (raw.output.match(/\n/g) || []).length
	return {
		sessionId,
		type: "discovery",
		title: `Searched: ${pattern.slice(0, 60)}`,
		narrative: `grep for "${pattern}" — ${matchCount} matches`,
		facts: [],
		concepts: ["search"],
		filesRead: [],
		filesModified: [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

function extractGlob(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const pattern = str(raw.args.pattern)
	const matchCount = (raw.output.match(/\n/g) || []).length
	return {
		sessionId,
		type: "discovery",
		title: `Glob: ${pattern.slice(0, 60)}`,
		narrative: `Found ${matchCount} files matching "${pattern}"`,
		facts: [],
		concepts: ["file-search"],
		filesRead: [],
		filesModified: [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

function extractWebSearch(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const query = str(raw.args.query)
	return {
		sessionId,
		type: "discovery",
		title: `Web search: ${query.slice(0, 60)}`,
		narrative: `Searched the web for "${query}"`,
		facts: [],
		concepts: ["web-search", ...query.toLowerCase().split(/\s+/).slice(0, 3)],
		filesRead: [],
		filesModified: [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

function extractGeneric(raw: RawToolData, sessionId: string, pn: number | null): CreateObservationInput {
	const title = raw.title || `Used ${raw.tool}`
	return {
		sessionId,
		type: "discovery",
		title: title.slice(0, 120),
		narrative: `Tool: ${raw.tool}`,
		facts: [],
		concepts: [raw.tool.toLowerCase()],
		filesRead: [],
		filesModified: [],
		toolName: raw.tool,
		promptNumber: pn,
	}
}

// ─── Bash classifier ─────────────────────────────────────────────────────────

function classifyBash(
	cmd: string,
	output: string,
): { type: ObservationType; title: string; concepts: string[] } {
	const lc = cmd.toLowerCase()

	if (lc.startsWith("git ")) {
		const sub = lc.split(/\s+/)[1] || ""
		return { type: "change", title: `git ${sub}`, concepts: ["git", sub] }
	}
	if (lc.match(/^(npm|pnpm|yarn|bun)\s+(install|add|remove)/)) {
		return { type: "change", title: `Package: ${cmd.slice(0, 80)}`, concepts: ["packages", "dependencies"] }
	}
	if (lc.match(/^(npm|pnpm|yarn|bun)\s+(test|run\s+test)/)) {
		const passed = !output.includes("FAIL") && !output.includes("error")
		return { type: passed ? "discovery" : "bugfix", title: `Tests: ${passed ? "passed" : "failed"}`, concepts: ["tests"] }
	}
	if (lc.match(/^(npm|pnpm|yarn|bun)\s+(run\s+)?(build|lint)/)) {
		const sub = lc.includes("lint") ? "lint" : "build"
		return { type: "change", title: `${sub}: ${cmd.slice(0, 80)}`, concepts: [sub] }
	}
	if (lc.startsWith("docker") || lc.startsWith("docker-compose")) {
		return { type: "change", title: `Docker: ${cmd.slice(0, 80)}`, concepts: ["docker"] }
	}
	if (lc.match(/^(curl|wget|fetch)\s/)) {
		return { type: "discovery", title: `HTTP: ${cmd.slice(0, 80)}`, concepts: ["http", "api"] }
	}
	if (lc.match(/^(mkdir|cp|mv|rm|ln|chmod)\s/)) {
		return { type: "change", title: `FS: ${cmd.slice(0, 80)}`, concepts: ["filesystem"] }
	}

	return { type: "discovery", title: `$ ${cmd.slice(0, 80)}`, concepts: ["bash"] }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function str(val: unknown): string {
	if (typeof val === "string") return stripPrivate(val)
	if (val == null) return ""
	return stripPrivate(String(val))
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max)}...`
}

function basename(p: string): string {
	if (!p) return ""
	const parts = p.replace(/\\/g, "/").split("/")
	return parts[parts.length - 1] || ""
}

function conceptsFromPath(p: string): string[] {
	if (!p) return []
	const parts = p.replace(/\\/g, "/").split("/").filter(Boolean)
	const skip = new Set(["src", "lib", "dist", "build", "node_modules", ".", ".."])
	const concepts: string[] = []
	for (const part of parts.slice(0, -1)) {
		if (!skip.has(part) && part.length > 1) concepts.push(part.toLowerCase())
	}
	const ext = basename(p).split(".").pop()
	if (ext && ext.length <= 5) concepts.push(ext)
	return concepts.slice(0, 5)
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(args)) {
		if (typeof v === "string") {
			result[k] = stripPrivate(v.slice(0, 2000))
		} else {
			result[k] = v
		}
	}
	return result
}
