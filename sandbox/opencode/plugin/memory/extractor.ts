/**
 * Observation Extractor for Memory Plugin
 *
 * Lightweight extraction that parses tool inputs/outputs to generate
 * structured observations WITHOUT AI calls. Runs on every tool execution.
 *
 * Extracts:
 * - File paths (read vs modified)
 * - Observation type classification
 * - Title generation
 * - Narrative from tool context
 * - Concepts/tags
 *
 * This is claude-mem's "SDK Agent" equivalent, but deterministic and free.
 * AI-powered compression happens once at session end (in the summary step).
 */

import * as path from "node:path"
import type { ObservationType, CreateObservationInput } from "./db"
import { stripPrivateTags } from "./privacy"

// =============================================================================
// TYPES
// =============================================================================

export interface RawToolData {
	tool: string
	args: Record<string, unknown>
	output: string
	title?: string
	metadata?: Record<string, unknown>
}

// =============================================================================
// TOOL SKIP LIST
// =============================================================================

/** Tools whose observations provide no useful memory signal */
export const SKIP_TOOLS = new Set([
	// Memory plugin's own tools (prevent recursion)
	"mem_search",
	"mem_timeline",
	"mem_get",
	"mem_save",
	// Delegation tools (handled separately)
	"delegate",
	"delegation_read",
	"delegation_list",
	// UI/meta tools
	"TodoWrite",
	"AskUserQuestion",
	"Skill",
	"ListMcpResourcesTool",
	// PTY session management (too noisy)
	"pty_list",
])

// =============================================================================
// MAIN EXTRACTOR
// =============================================================================

/**
 * Extract a structured observation from raw tool execution data.
 *
 * @param raw - Tool name, args, and output from tool.execute.after
 * @param sessionId - Current session ID
 * @param projectId - Current project ID (nullable)
 * @param promptNumber - Current prompt number in session
 * @returns Observation input ready for database insertion, or null if skipped
 */
export function extractObservation(
	raw: RawToolData,
	sessionId: string,
	projectId: string | null,
	promptNumber: number | null,
): CreateObservationInput | null {
	if (SKIP_TOOLS.has(raw.tool)) return null

	// Strip privacy tags from both input and output
	const sanitizedArgs = sanitizeArgs(raw.args)
	const sanitizedOutput = stripPrivateTags(raw.output || "")

	// Truncate output for preview (first 500 chars)
	const inputPreview = truncate(JSON.stringify(sanitizedArgs), 500)

	// Route to specialized extractors by tool type
	const extractor = EXTRACTORS[raw.tool] ?? extractGeneric
	const extracted = extractor(raw.tool, sanitizedArgs, sanitizedOutput, raw.title)

	if (!extracted) return null

	return {
		sessionId,
		projectId,
		type: extracted.type,
		title: extracted.title,
		subtitle: extracted.subtitle ?? null,
		narrative: extracted.narrative ?? null,
		facts: extracted.facts ?? [],
		concepts: extracted.concepts ?? [],
		filesRead: extracted.filesRead ?? [],
		filesModified: extracted.filesModified ?? [],
		toolName: raw.tool,
		toolInputPreview: inputPreview,
		promptNumber,
	}
}

// =============================================================================
// SPECIALIZED EXTRACTORS
// =============================================================================

interface ExtractedData {
	type: ObservationType
	title: string
	subtitle?: string
	narrative?: string
	facts?: string[]
	concepts?: string[]
	filesRead?: string[]
	filesModified?: string[]
}

type ExtractorFn = (
	tool: string,
	args: Record<string, unknown>,
	output: string,
	resultTitle?: string,
) => ExtractedData | null

/** Map of tool names to specialized extractors */
const EXTRACTORS: Record<string, ExtractorFn> = {
	read: extractRead,
	write: extractWrite,
	edit: extractEdit,
	bash: extractBash,
	grep: extractGrep,
	glob: extractGlob,
	web_search: extractWebSearch,
	scrape_webpage: extractScrape,
	pty_spawn: extractPtySpawn,
	pty_write: extractPtyWrite,
	worktree_create: extractWorktree,
}

function extractRead(
	_tool: string,
	args: Record<string, unknown>,
	_output: string,
): ExtractedData | null {
	const filePath = (args.filePath || args.file_path || args.path || "") as string
	if (!filePath) return null

	return {
		type: "discovery",
		title: `Read ${basename(filePath)}`,
		subtitle: filePath,
		concepts: ["how-it-works"],
		filesRead: [filePath],
	}
}

function extractWrite(
	_tool: string,
	args: Record<string, unknown>,
	_output: string,
): ExtractedData {
	const filePath = (args.filePath || args.file_path || args.path || "") as string
	return {
		type: "change",
		title: `Created ${basename(filePath)}`,
		subtitle: filePath,
		narrative: `Created or overwrote file: ${filePath}`,
		concepts: ["what-changed"],
		filesModified: [filePath],
	}
}

function extractEdit(
	_tool: string,
	args: Record<string, unknown>,
	_output: string,
): ExtractedData {
	const filePath = (args.filePath || args.file_path || args.path || "") as string
	const oldStr = truncate(String(args.old_string || args.oldString || ""), 100)
	const newStr = truncate(String(args.new_string || args.newString || ""), 100)

	const facts: string[] = []
	if (oldStr && newStr) {
		facts.push(`Changed: "${oldStr}" → "${newStr}"`)
	}

	return {
		type: "change",
		title: `Edited ${basename(filePath)}`,
		subtitle: filePath,
		facts,
		concepts: ["what-changed"],
		filesModified: [filePath],
	}
}

function extractBash(
	_tool: string,
	args: Record<string, unknown>,
	output: string,
	resultTitle?: string,
): ExtractedData {
	const command = String(args.command || args.cmd || "")
	const trimmedCmd = truncate(command, 200)

	// Classify based on command patterns
	const classification = classifyBashCommand(command)

	const facts: string[] = [`Command: ${trimmedCmd}`]

	// Extract exit code or error from output
	if (output.includes("exit code") || output.includes("Error") || output.includes("error")) {
		const errorLine = output
			.split("\n")
			.find((l) => l.includes("Error") || l.includes("error"))
		if (errorLine) facts.push(`Error: ${truncate(errorLine.trim(), 150)}`)
	}

	return {
		type: classification.type,
		title: resultTitle || classification.title || `Ran: ${trimmedCmd}`,
		subtitle: classification.subtitle,
		narrative: classification.narrative,
		facts,
		concepts: classification.concepts,
		filesRead: classification.filesRead ?? [],
		filesModified: classification.filesModified ?? [],
	}
}

function extractGrep(
	_tool: string,
	args: Record<string, unknown>,
	output: string,
): ExtractedData {
	const pattern = String(args.pattern || args.query || "")
	const searchPath = String(args.path || args.directory || ".")
	const matchCount = (output.match(/\n/g) || []).length

	return {
		type: "discovery",
		title: `Searched for "${truncate(pattern, 50)}"`,
		subtitle: `in ${searchPath}`,
		facts: [`Pattern: ${pattern}`, `~${matchCount} matches found`],
		concepts: ["how-it-works"],
		filesRead: [searchPath],
	}
}

function extractGlob(
	_tool: string,
	args: Record<string, unknown>,
	output: string,
): ExtractedData {
	const pattern = String(args.pattern || "")
	const matchCount = output.trim().split("\n").filter(Boolean).length

	return {
		type: "discovery",
		title: `Found files matching "${truncate(pattern, 50)}"`,
		facts: [`Pattern: ${pattern}`, `${matchCount} files found`],
		concepts: ["how-it-works"],
	}
}

function extractWebSearch(
	_tool: string,
	args: Record<string, unknown>,
	output: string,
): ExtractedData {
	const query = String(args.query || args.search || "")

	// Try to extract top results from output
	const facts: string[] = [`Query: "${query}"`]
	const urls = output.match(/https?:\/\/[^\s)]+/g)
	if (urls && urls.length > 0) {
		facts.push(`Top results: ${urls.slice(0, 3).join(", ")}`)
	}

	return {
		type: "discovery",
		title: `Web search: "${truncate(query, 60)}"`,
		facts,
		concepts: ["how-it-works"],
	}
}

function extractScrape(
	_tool: string,
	args: Record<string, unknown>,
	_output: string,
): ExtractedData {
	const url = String(args.url || "")
	return {
		type: "discovery",
		title: `Scraped ${truncate(url, 80)}`,
		subtitle: url,
		concepts: ["how-it-works"],
	}
}

function extractPtySpawn(
	_tool: string,
	args: Record<string, unknown>,
	_output: string,
): ExtractedData {
	const command = String(args.command || args.cmd || "")
	return {
		type: "change",
		title: `Started process: ${truncate(command, 80)}`,
		facts: [`Command: ${command}`],
		concepts: ["what-changed"],
	}
}

function extractPtyWrite(
	_tool: string,
	args: Record<string, unknown>,
	_output: string,
): ExtractedData | null {
	const input = String(args.input || args.data || "")
	if (!input || input.length < 3) return null // Skip trivial inputs (Enter, Ctrl+C)

	return {
		type: "change",
		title: `PTY input: ${truncate(input.trim(), 80)}`,
		concepts: ["what-changed"],
	}
}

function extractWorktree(
	_tool: string,
	args: Record<string, unknown>,
	_output: string,
): ExtractedData {
	const branch = String(args.branch || "")
	return {
		type: "feature",
		title: `Created worktree: ${branch}`,
		facts: [`Branch: ${branch}`],
		concepts: ["what-changed"],
	}
}

function extractGeneric(
	tool: string,
	args: Record<string, unknown>,
	_output: string,
	resultTitle?: string,
): ExtractedData {
	return {
		type: "discovery",
		title: resultTitle || `Used tool: ${tool}`,
		subtitle: truncate(JSON.stringify(args), 100),
		concepts: ["how-it-works"],
	}
}

// =============================================================================
// BASH COMMAND CLASSIFIER
// =============================================================================

interface BashClassification {
	type: ObservationType
	title?: string
	subtitle?: string
	narrative?: string
	concepts?: string[]
	filesRead?: string[]
	filesModified?: string[]
}

function classifyBashCommand(command: string): BashClassification {
	const cmd = command.trim().toLowerCase()

	// Git operations
	if (cmd.startsWith("git commit")) {
		const msgMatch = command.match(/-m\s+["']([^"']+)["']/)
		const msg = msgMatch?.[1] || "commit"
		const isFix = /fix|bug|patch|hotfix/i.test(msg)
		return {
			type: isFix ? "bugfix" : "feature",
			title: `Git commit: ${truncate(msg, 80)}`,
			concepts: ["what-changed"],
		}
	}
	if (cmd.startsWith("git checkout") || cmd.startsWith("git switch")) {
		return { type: "change", title: `Switched branch`, concepts: ["what-changed"] }
	}
	if (cmd.startsWith("git merge") || cmd.startsWith("git rebase")) {
		return { type: "change", title: `Git merge/rebase`, concepts: ["what-changed"] }
	}
	if (cmd.startsWith("git diff") || cmd.startsWith("git log") || cmd.startsWith("git status")) {
		return { type: "discovery", title: `Git inspection`, concepts: ["how-it-works"] }
	}

	// Package management
	if (cmd.includes("npm install") || cmd.includes("pnpm install") || cmd.includes("bun install") || cmd.includes("yarn add")) {
		return { type: "change", title: `Installed dependencies`, concepts: ["what-changed"] }
	}
	if (cmd.includes("pip install") || cmd.includes("uv sync") || cmd.includes("uv add")) {
		return { type: "change", title: `Installed Python dependencies`, concepts: ["what-changed"] }
	}

	// Testing
	if (cmd.includes("test") || cmd.includes("jest") || cmd.includes("vitest") || cmd.includes("pytest")) {
		return { type: "discovery", title: `Ran tests`, concepts: ["how-it-works"] }
	}

	// Build commands
	if (cmd.includes("build") || cmd.includes("compile") || cmd.includes("tsc")) {
		return { type: "change", title: `Build step`, concepts: ["what-changed"] }
	}

	// Docker
	if (cmd.startsWith("docker")) {
		return { type: "change", title: `Docker operation`, concepts: ["what-changed"] }
	}

	// Process inspection
	if (cmd.startsWith("ps ") || cmd.startsWith("top") || cmd.startsWith("htop")) {
		return { type: "discovery", concepts: ["how-it-works"] }
	}

	// File operations
	if (cmd.startsWith("mkdir")) {
		return { type: "change", title: `Created directory`, concepts: ["what-changed"] }
	}
	if (cmd.startsWith("rm ") || cmd.startsWith("rm -")) {
		return { type: "change", title: `Deleted files`, concepts: ["what-changed"] }
	}
	if (cmd.startsWith("cp ") || cmd.startsWith("mv ")) {
		return { type: "change", title: `Moved/copied files`, concepts: ["what-changed"] }
	}

	// Default: generic command
	return { type: "discovery" }
}

// =============================================================================
// UTILITIES
// =============================================================================

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === "string") {
			sanitized[key] = stripPrivateTags(value)
		} else {
			sanitized[key] = value
		}
	}
	return sanitized
}

function basename(filePath: string): string {
	return path.basename(filePath)
}

function truncate(text: string, maxLen: number): string {
	if (!text) return ""
	if (text.length <= maxLen) return text
	return text.slice(0, maxLen) + "..."
}
