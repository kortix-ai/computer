/**
 * Kortix Orchestrator Plugin — Simplified
 *
 * Projects + async session spawning. That's it.
 *
 * Storage: .kortix/kortix.db (SQLite)
 *   - projects: registry + auto-discovery via .kortix/project.json
 *   - delegations: which sessions were spawned, in which project, by whom
 *
 * Tools (8):
 *   project_create, project_list, project_get, project_update
 *   worker_spawn, worker_list, worker_read, worker_message
 *
 * Flow:
 *   1. Orchestrator calls worker_spawn(project, prompt) → fire & forget
 *   2. KortixWorker session runs autonomously (autowork loop)
 *   3. On completion/failure → <session-report> lands in orchestrator's thread
 *   4. Orchestrator processes, spawns next work
 */

import { Database } from "bun:sqlite"
import * as fs from "node:fs/promises"
import { mkdirSync, readdirSync, statSync, readFileSync, existsSync, unlinkSync } from "node:fs"
import * as path from "node:path"
import { type Plugin, type ToolContext, tool } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectRow { id: string; name: string; path: string; description: string; created_at: string; opencode_id: string | null }
interface DelegationRow {
	session_id: string; project_id: string; prompt: string; agent: string
	parent_session_id: string; parent_agent: string
	status: string; result: string | null; created_at: string; completed_at: string | null
}
interface ProjectMarker { name: string; description: string; created: string }

// ── Database ─────────────────────────────────────────────────────────────────

function initDb(dbPath: string): Database {
	mkdirSync(path.dirname(dbPath), { recursive: true })

	// Clean orphaned/corrupt DB files — prevents "disk I/O error"
	// This handles: empty DB with stale WAL/SHM, missing DB with orphaned WAL/SHM
	try {
		const dbExists = existsSync(dbPath)
		const dbEmpty = dbExists && statSync(dbPath).size === 0
		if (!dbExists || dbEmpty) {
			// Remove ALL associated files and start fresh
			for (const suffix of ["", "-wal", "-shm", "-journal"]) {
				try { unlinkSync(dbPath + suffix) } catch {}
			}
		}
	} catch {}

	let db: Database
	try {
		db = new Database(dbPath)
	} catch (e) {
		// Nuke and retry on any open failure
		for (const suffix of ["", "-wal", "-shm", "-journal"]) {
			try { unlinkSync(dbPath + suffix) } catch {}
		}
		db = new Database(dbPath)
	}
	// DELETE journal mode — no sidecar files that corrupt on crash/reload
	// WAL creates -wal/-shm files that get orphaned when process doesn't close cleanly
	db.exec("PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000")
	db.exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
			description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
			opencode_id TEXT
		);
		CREATE TABLE IF NOT EXISTS delegations (
			session_id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL REFERENCES projects(id),
			prompt TEXT NOT NULL,
			agent TEXT NOT NULL DEFAULT 'KortixWorker',
			parent_session_id TEXT NOT NULL,
			parent_agent TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'running',
			result TEXT,
			created_at TEXT NOT NULL,
			completed_at TEXT
		);
	`)
	// Migration: add opencode_id column if missing (existing DBs)
	try { db.exec("ALTER TABLE projects ADD COLUMN opencode_id TEXT") } catch {}
	return db
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function projectId(name: string): string {
	return `proj-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`
}

function scanProjects(baseDir: string, maxDepth = 2, depth = 0): Array<{ dirPath: string; marker: ProjectMarker }> {
	const out: Array<{ dirPath: string; marker: ProjectMarker }> = []
	if (depth > maxDepth) return out
	let entries: string[]
	try { entries = readdirSync(baseDir) } catch { return out }
	for (const e of entries) {
		if (e === "node_modules" || e === ".git" || e === ".opencode") continue
		const fp = path.join(baseDir, e)
		try { if (!statSync(fp).isDirectory()) continue } catch { continue }
		try {
			const m = JSON.parse(readFileSync(path.join(fp, ".kortix", "project.json"), "utf8")) as ProjectMarker
			if (m.name) out.push({ dirPath: fp, marker: m })
		} catch {
			if (depth < maxDepth) out.push(...scanProjects(fp, maxDepth, depth + 1))
		}
	}
	return out
}

// ── Manager ──────────────────────────────────────────────────────────────────

class Manager {
	/** Debounce timers for session.idle — if session stays idle for 10s, it's truly done */
	private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

	constructor(private client: any, private dir: string, private db: Database) {}

	// ── Projects ──

	async createProject(name: string, desc: string, customPath: string): Promise<ProjectRow> {
		const pp = customPath || path.join(this.dir, "projects", name)
		const existing = this.db.prepare("SELECT * FROM projects WHERE path=$p").get({ $p: pp }) as ProjectRow | null
		if (existing) {
			if (desc) { this.db.prepare("UPDATE projects SET description=$d WHERE id=$id").run({ $d: desc, $id: existing.id }); existing.description = desc }
			// Sync name to OpenCode if we have an opencode_id
			if (existing.opencode_id) {
				try { await this.client.project.update({ projectID: existing.opencode_id, name: existing.name }) } catch {}
			}
			return existing
		}
		const wm = async (f: string, c: string) => { if (!existsSync(f)) await fs.writeFile(f, c, "utf8") }
		for (const d of [".opencode/agents", ".opencode/skills", ".opencode/commands", ".kortix/plans", ".kortix/docs", ".kortix/sessions"])
			await fs.mkdir(path.join(pp, d), { recursive: true })
		const marker: ProjectMarker = { name, description: desc || "", created: new Date().toISOString() }
		await wm(path.join(pp, ".kortix", "project.json"), JSON.stringify(marker, null, 2))
		await wm(path.join(pp, ".kortix", "context.md"), `# ${name}\n\n${desc || "No description."}\n\nCreated: ${marker.created}\n`)
		await wm(path.join(pp, ".gitignore"), "node_modules/\n.env\n.env.*\n!.env.example\n*.log\ndist/\n.DS_Store\n")
		await wm(path.join(pp, ".opencode", "opencode.jsonc"), JSON.stringify({ $schema: "https://opencode.ai/config.json" }, null, 2))
		if (!existsSync(path.join(pp, ".git"))) {
			try {
				await Bun.spawn(["git", "init"], { cwd: pp, stdout: "pipe", stderr: "pipe" }).exited
				await Bun.spawn(["git", "add", "-A"], { cwd: pp, stdout: "pipe", stderr: "pipe" }).exited
				await Bun.spawn(["git", "commit", "-m", "Init", "--allow-empty"], { cwd: pp, stdout: "pipe", stderr: "pipe" }).exited
			} catch {}
		}
		const id = projectId(name), now = new Date().toISOString()

		// Resolve OpenCode project ID by matching worktree path
		let opencodeId: string | null = null
		try {
			const ocProjects = await this.client.project.list()
			const match = (ocProjects.data ?? []).find((p: any) => p.worktree === pp)
			if (match) {
				opencodeId = match.id
				// Push name to OpenCode
				await this.client.project.update({ projectID: match.id, name })
			}
		} catch {}

		this.db.prepare("INSERT INTO projects (id,name,path,description,created_at,opencode_id) VALUES ($id,$n,$p,$d,$c,$oid)")
			.run({ $id: id, $n: name, $p: pp, $d: desc || "", $c: now, $oid: opencodeId })
		return { id, name, path: pp, description: desc || "", created_at: now, opencode_id: opencodeId }
	}

	async listProjects(): Promise<ProjectRow[]> {
		// 1. Filesystem scan for .kortix/project.json markers (offline fallback)
		for (const { dirPath, marker } of scanProjects(this.dir)) {
			if (!this.db.prepare("SELECT 1 FROM projects WHERE path=$p").get({ $p: dirPath }))
				this.db.prepare("INSERT INTO projects (id,name,path,description,created_at,opencode_id) VALUES ($id,$n,$p,$d,$c,NULL)")
					.run({ $id: projectId(marker.name), $n: marker.name, $p: dirPath, $d: marker.description || "", $c: marker.created || new Date().toISOString() })
		}

		// 2. Sync with OpenCode — register any OC projects missing from Kortix, update opencode_id links
		try {
			const ocProjects = await this.client.project.list()
			for (const ocp of (ocProjects.data ?? []) as any[]) {
				const worktree = ocp.worktree as string
				const existing = this.db.prepare("SELECT * FROM projects WHERE path=$p").get({ $p: worktree }) as ProjectRow | null
				if (existing) {
					// Link opencode_id if missing
					if (!existing.opencode_id) {
						this.db.prepare("UPDATE projects SET opencode_id=$oid WHERE id=$id").run({ $oid: ocp.id, $id: existing.id })
					}
					// Sync name from OpenCode if Kortix has no name or they diverged (OpenCode wins for name)
					if (ocp.name && ocp.name !== existing.name) {
						this.db.prepare("UPDATE projects SET name=$n WHERE id=$id").run({ $n: ocp.name, $id: existing.id })
					}
				} else {
					// Auto-register OpenCode project in Kortix SQLite
					const name = ocp.name || worktree.split("/").pop() || worktree
					const now = ocp.time?.created ? new Date(ocp.time.created).toISOString() : new Date().toISOString()
					this.db.prepare("INSERT OR IGNORE INTO projects (id,name,path,description,created_at,opencode_id) VALUES ($id,$n,$p,'',$c,$oid)")
						.run({ $id: projectId(name), $n: name, $p: worktree, $c: now, $oid: ocp.id })
				}
			}
		} catch {}

		return this.db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as ProjectRow[]
	}

	getProject(q: string): ProjectRow | null {
		return (this.db.prepare("SELECT * FROM projects WHERE path=$v").get({ $v: q })
			|| this.db.prepare("SELECT * FROM projects WHERE LOWER(name)=LOWER($v)").get({ $v: q })
			|| this.db.prepare("SELECT * FROM projects WHERE LOWER(name) LIKE LOWER($v)").get({ $v: `%${q}%` })
		) as ProjectRow | null
	}

	// ── Worker Sessions ──

	async spawn(project: ProjectRow, prompt: string, agent: string, parentSid: string, parentAgent: string, command: string = "/autowork", model?: string): Promise<DelegationRow> {
		// Read project context
		let ctx = ""
		try { ctx = await fs.readFile(path.join(project.path, ".kortix", "context.md"), "utf8") } catch { ctx = "(none)" }

		// List other active sessions in this project — workers need to know what others are doing
		const siblings = this.db.prepare("SELECT session_id, prompt, status FROM delegations WHERE project_id=$pid ORDER BY created_at DESC LIMIT 10")
			.all({ $pid: project.id }) as Array<{ session_id: string; prompt: string; status: string }>
		const siblingCtx = siblings.length > 0
			? siblings.map(s => `- [${s.status}] ${s.session_id.slice(-8)}: ${s.prompt.slice(0, 120)}`).join("\n")
			: "(none)"

		// Create child session
		const sess = await this.client.session.create({ body: { title: prompt.slice(0, 80), parentID: parentSid } })
		if (!sess.data?.id) throw new Error("Failed to create session")
		const sessionId = sess.data.id
		// Normalize agent name — "default", "", or invalid → KortixWorker
		const agentName = (agent && agent !== "default" && agent !== "KortixWorker") ? agent : "KortixWorker"
		const now = new Date().toISOString()

		// Record delegation
		this.db.prepare(`INSERT INTO delegations (session_id,project_id,prompt,agent,parent_session_id,parent_agent,status,created_at)
			VALUES ($sid,$pid,$prompt,$agent,$psid,$pa,'running',$c)`)
			.run({ $sid: sessionId, $pid: project.id, $prompt: prompt, $agent: agentName, $psid: parentSid, $pa: parentAgent, $c: now })

		// Command prefix triggers the continuation plugin's autowork loop
		// /autowork is matched by regex /\/autowork\b/ in the continuation plugin
		// Empty string = one-shot execution (no loop)
		const cmdPrefix = command ? `${command}\n\n` : ""

		const fullPrompt = `${cmdPrefix}## Assignment

**Project:** ${project.name} — \`${project.path}\`
**Session:** ${sessionId}

## Task

${prompt}

## Project Context

${ctx}

## Other Active Sessions in This Project

${siblingCtx}

Other workers may be running in parallel on this project. **Do NOT touch files outside your assigned scope.** Check \`.kortix/sessions/\` for completed session results if you need shared context.

## Rules

1. **Working directory:** \`${project.path}\` — use \`workdir\` on bash commands.
2. **Stay in your lane.** Only modify files within your task scope. Other workers may be active — respect their file ownership.
3. **TDD:** Write tests FIRST. Implement to pass. Verify after every change.
4. Update \`.kortix/context.md\` with discoveries and decisions.
5. Write docs to \`.kortix/docs/\` for shared context.
6. Include test results in your final message.
7. When fully done and all tests pass, emit \`<promise>DONE</promise>\` then \`<promise>VERIFIED</promise>\`.
`

		// Parse model string "provider/model" into SDK format { providerID, modelID }
		let modelConfig: { providerID: string; modelID: string } | undefined
		if (model && model.includes("/")) {
			const [providerID, ...rest] = model.split("/")
			modelConfig = { providerID, modelID: rest.join("/") }
		}

		// Fire and forget — prompt() without await, same pattern as background-agents plugin
		const promptBody: Record<string, any> = {
			agent: agentName,
			parts: [{ type: "text" as const, text: fullPrompt }],
			// Prevent recursive spawning from child sessions
			tools: { session_spawn: false, session_list_spawned: false, session_message: false },
		}
		if (modelConfig) promptBody.model = modelConfig

		this.client.session
			.prompt({ path: { id: sessionId }, body: promptBody })
			.catch(async (err: Error) => {
				// Retry once on transient errors (JSON parse, connection issues)
				try {
					await this.client.session.prompt({ path: { id: sessionId }, body: promptBody })
				} catch (retryErr: any) {
					this.db.prepare("UPDATE delegations SET status='failed',result=$r,completed_at=$t WHERE session_id=$sid")
						.run({ $r: `Spawn error (after retry): ${retryErr.message}`, $t: new Date().toISOString(), $sid: sessionId })
					this.notifyParent(sessionId)
				}
			})

		return this.db.prepare("SELECT * FROM delegations WHERE session_id=$sid").get({ $sid: sessionId }) as DelegationRow
	}

	// ── Event Handlers ──

	/**
	 * Debounced idle handler — like PTY exit notification.
	 * On session.idle, starts a 10s timer. If session stays idle (continuation
	 * plugin doesn't continue it), we report back with whatever output exists.
	 * During active autowork loop, idle events reset the timer so it never fires.
	 */
	handleIdleDebounced(sessionId: string): void {
		const del = this.db.prepare("SELECT * FROM delegations WHERE session_id=$sid AND status='running'")
			.get({ $sid: sessionId }) as DelegationRow | null
		if (!del) return

		// Clear any existing timer for this session
		const existing = this.idleTimers.get(sessionId)
		if (existing) clearTimeout(existing)

		// Set new timer — if session stays idle for 10s, it's truly done
		const timer = setTimeout(() => {
			this.idleTimers.delete(sessionId)
			this.handleIdleFinal(sessionId).catch(() => {})
		}, 10_000)

		this.idleTimers.set(sessionId, timer)
	}

	/**
	 * Called after 10s of continuous idle — session is truly done.
	 * Reports back regardless of DONE/VERIFIED status.
	 */
	private async handleIdleFinal(sessionId: string): Promise<void> {
		const del = this.db.prepare("SELECT * FROM delegations WHERE session_id=$sid AND status='running'")
			.get({ $sid: sessionId }) as DelegationRow | null
		if (!del) return

		try {
			const msgs = await this.client.session.messages({ path: { id: sessionId } })
			const data = (msgs.data ?? []) as any[]
			const now = new Date().toISOString()
			const result = data.length > 0 ? this.extractResult(data) : "(session produced no output)"

			// Scan for promises
			let hasVerified = false, hasDone = false
			for (const m of data) {
				if (m?.info?.role !== "assistant") continue
				for (const p of m.parts ?? [])
					if (p.type === "text" && typeof p.text === "string") {
						if (p.text.includes("<promise>VERIFIED</promise>")) hasVerified = true
						if (p.text.includes("<promise>DONE</promise>")) hasDone = true
					}
			}

			if (hasVerified) {
				// Clean completion
				this.db.prepare("UPDATE delegations SET status='complete',result=$r,completed_at=$t WHERE session_id=$sid")
					.run({ $r: result, $t: now, $sid: sessionId })
				this.persistResult(del, result)
			} else if (hasDone) {
				// DONE but verification failed
				this.db.prepare("UPDATE delegations SET status='failed',result=$r,completed_at=$t WHERE session_id=$sid")
					.run({ $r: `DONE but verification failed.\n${result}`, $t: now, $sid: sessionId })
				this.persistResult(del, result)
			} else {
				// Session stopped without DONE/VERIFIED — stalled or autowork loop ended
				this.db.prepare("UPDATE delegations SET status='failed',result=$r,completed_at=$t WHERE session_id=$sid")
					.run({ $r: `Session went idle without completing (no DONE/VERIFIED). Last output:\n${result}`, $t: now, $sid: sessionId })
				this.persistResult(del, result)
			}

			// ALWAYS notify — this is the key difference. Every session reports back.
			this.notifyParent(sessionId)
		} catch {}
	}

	handleError(sessionId: string, error: string): void {
		const del = this.db.prepare("SELECT * FROM delegations WHERE session_id=$sid AND status='running'")
			.get({ $sid: sessionId }) as DelegationRow | null
		if (!del) return
		// Clear any pending idle timer
		const timer = this.idleTimers.get(sessionId)
		if (timer) { clearTimeout(timer); this.idleTimers.delete(sessionId) }
		this.db.prepare("UPDATE delegations SET status='failed',result=$r,completed_at=$t WHERE session_id=$sid")
			.run({ $r: `Session error: ${error}`, $t: new Date().toISOString(), $sid: sessionId })
		this.notifyParent(sessionId)
	}

	async sendMessage(sessionId: string, message: string): Promise<string> {
		const del = this.db.prepare("SELECT * FROM delegations WHERE session_id=$sid").get({ $sid: sessionId }) as DelegationRow | null
		if (!del) return `Session "${sessionId}" not found in delegations.`
		if (del.status !== "running") return `Session is ${del.status}, not running.`
		try {
			await this.client.session.prompt({
				path: { id: sessionId },
				body: { noReply: true, parts: [{ type: "text", text: `[Orchestrator]: ${message}` }] },
			})
			return `Message sent to ${sessionId}.`
		} catch (e) { return `Failed: ${e instanceof Error ? e.message : "unknown"}` }
	}

	listDelegations(projectId?: string): Array<DelegationRow & { project_name: string }> {
		let q = "SELECT d.*, p.name as project_name FROM delegations d LEFT JOIN projects p ON d.project_id=p.id WHERE 1=1"
		const params: Record<string, string> = {}
		if (projectId) { q += " AND d.project_id=$pid"; params.$pid = projectId }
		q += " ORDER BY d.created_at DESC LIMIT 30"
		return this.db.prepare(q).all(params) as Array<DelegationRow & { project_name: string }>
	}

	/**
	 * Read session output efficiently — returns a compact summary, not the full dump.
	 * Like pty_read with smart defaults: status + recent activity + last output.
	 * Supports tail (last N messages) and pattern filtering.
	 */
	async readSession(sessionId: string, tail: number = 3, pattern?: string): Promise<string> {
		const del = this.db.prepare("SELECT * FROM delegations WHERE session_id=$sid").get({ $sid: sessionId }) as DelegationRow | null
		if (!del) return `Session "${sessionId}" not found.`

		// Completed sessions — return stored result (already extracted)
		if (del.status !== "running" && del.result) {
			return `**Status:** ${del.status}\n**Agent:** ${del.agent}\n\n${del.result}`
		}

		// Running or no stored result — read live messages (compact summary)
		try {
			const msgs = await this.client.session.messages({ path: { id: sessionId } })
			const data = (msgs.data ?? []) as any[]

			if (data.length === 0) return `**Status:** ${del.status} | No messages yet.`

			// Count totals for summary header
			let totalTools = 0
			let totalMsgs = 0
			const toolNames: string[] = []

			for (const m of data) {
				if (m?.info?.role !== "assistant") continue
				totalMsgs++
				for (const p of m.parts ?? []) {
					if (p.type === "tool") {
						totalTools++
						const name = p.tool || "unknown"
						if (!toolNames.includes(name)) toolNames.push(name)
					}
				}
			}

			const lines: string[] = []
			lines.push(`**Status:** ${del.status} | **Messages:** ${totalMsgs} | **Tool calls:** ${totalTools}`)
			if (toolNames.length) lines.push(`**Tools used:** ${toolNames.join(", ")}`)
			lines.push("")

			// Extract only the LAST N assistant text outputs (tail)
			const assistantTexts: string[] = []
			for (const m of data) {
				if (m?.info?.role !== "assistant") continue
				for (const p of m.parts ?? []) {
					if (p.type === "text" && typeof p.text === "string" && !p.synthetic && !p.ignored && p.text.trim()) {
						if (pattern) {
							try { if (!new RegExp(pattern, "i").test(p.text)) continue } catch {}
						}
						assistantTexts.push(p.text.slice(0, 500))
					}
				}
			}

			// Only show last N text chunks
			const recent = assistantTexts.slice(-tail)
			if (assistantTexts.length > tail) {
				lines.push(`_(showing last ${tail} of ${assistantTexts.length} text outputs)_\n`)
			}
			for (const t of recent) lines.push(t)

			return lines.join("\n")
		} catch {
			return del.result || `Session ${del.status}, messages could not be read.`
		}
	}

	// ── Internal ──

	private extractResult(msgs: any[]): string {
		for (let i = msgs.length - 1; i >= 0; i--) {
			const m = msgs[i]; if (m?.info?.role !== "assistant") continue
			let t = ""; for (const p of m.parts ?? []) if (p.type === "text" && !p.synthetic && !p.ignored && typeof p.text === "string") t += p.text + "\n"
			if (t.trim()) return t.trim()
		}
		return "(no output)"
	}

	private persistResult(del: DelegationRow, result: string): void {
		try {
			const proj = this.db.prepare("SELECT path FROM projects WHERE id=$id").get({ $id: del.project_id }) as { path: string } | null
			if (!proj) return
			const dir = path.join(proj.path, ".kortix", "sessions")
			mkdirSync(dir, { recursive: true })
			Bun.write(path.join(dir, `${del.session_id.slice(-12)}.md`),
				`# Session Result\n\n**Session:** ${del.session_id}\n**Agent:** ${del.agent}\n**Status:** ${del.status}\n**Prompt:** ${del.prompt.slice(0, 200)}\n**Created:** ${del.created_at}\n**Completed:** ${del.completed_at || "-"}\n\n---\n\n${result}\n`)
		} catch {}
	}

	notifyParent(sessionId: string): void {
		try {
			const del = this.db.prepare("SELECT * FROM delegations WHERE session_id=$sid").get({ $sid: sessionId }) as DelegationRow | null
			if (!del) return
			const proj = this.db.prepare("SELECT name FROM projects WHERE id=$id").get({ $id: del.project_id }) as { name: string } | null
			const label = del.status === "complete" ? "COMPLETE" : "FAILED"
			const body = (del.result || "(no output)").slice(0, 3000)

			this.client.session.prompt({
				path: { id: del.parent_session_id },
				body: { noReply: false, agent: del.parent_agent, parts: [{ type: "text", text:
					`<session-report>\n<session-id>${del.session_id}</session-id>\n<status>${label}</status>\n<project>${proj?.name || "?"}</project>\n<prompt>${del.prompt.slice(0, 200)}</prompt>\n<result>\n${body}\n</result>\n</session-report>\n\nSession **${label}** in project **${proj?.name || "?"}**. Use \`session_read("${del.session_id}")\` for full output, or \`session_get\` to inspect.` }] },
			}).catch(() => {})
		} catch {}
	}
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const KortixOrchestratorPlugin: Plugin = async (ctx) => {
	const { client, directory } = ctx
	const db = initDb(path.join(directory, ".kortix", "kortix.db"))
	const mgr = new Manager(client, directory, db)

	return {
		tool: {
			project_create: tool({
				description: "Register a directory as a project (new or existing). Never overwrites existing files.",
				args: {
					name: tool.schema.string().describe("Project name"),
					description: tool.schema.string().describe('Description. "" if none.'),
					path: tool.schema.string().describe('Absolute path. "" for default (projects/{name}).'),
				},
				async execute(args: { name: string; description: string; path: string }): Promise<string> {
					try {
						const p = await mgr.createProject(args.name, args.description, args.path)
						return `Project **${p.name}** at \`${p.path}\` (${p.id})`
					} catch (e) { return `Failed: ${e instanceof Error ? e.message : "unknown"}` }
				},
			}),

			project_list: tool({
				description: "List all projects. Auto-discovers .kortix/project.json markers.",
				args: {},
				async execute(): Promise<string> {
					const ps = await mgr.listProjects()
					if (!ps.length) return "No projects. Use project_create."
					const lines = ps.map(p => {
						const cnt = (db.prepare("SELECT COUNT(*) as c FROM delegations WHERE project_id=$pid").get({ $pid: p.id }) as { c: number })?.c || 0
						const ocLabel = p.opencode_id ? `oc:${p.opencode_id.slice(0, 8)}` : "-"
						return `| ${p.name} | \`${p.path}\` | ${cnt} | ${p.description || "-"} | ${ocLabel} |`
					})
					return `| Name | Path | Sessions | Desc | OC ID |\n|---|---|---|---|---|\n${lines.join("\n")}`
				},
			}),

			project_get: tool({
				description: "Get project details.",
				args: { name: tool.schema.string().describe("Name or path") },
				async execute(args: { name: string }): Promise<string> {
					const p = mgr.getProject(args.name)
					if (!p) return `Not found: "${args.name}"`
					const stats = db.prepare("SELECT status, COUNT(*) as c FROM delegations WHERE project_id=$pid GROUP BY status").all({ $pid: p.id }) as Array<{ status: string; c: number }>
					const ocId = p.opencode_id ? `\nOpenCode ID: ${p.opencode_id}` : ""
					return `**${p.name}** (${p.id})${ocId}\nPath: \`${p.path}\`\nDesc: ${p.description || "-"}\nSessions: ${stats.map(s => `${s.status}:${s.c}`).join(" ") || "none"}`
				},
			}),

			project_update: tool({
				description: "Update project name/description.",
				args: {
					project: tool.schema.string().describe("Name or path"),
					name: tool.schema.string().describe('"" to keep current'),
					description: tool.schema.string().describe('"" to keep current'),
				},
				async execute(args: { project: string; name: string; description: string }): Promise<string> {
					const p = mgr.getProject(args.project)
					if (!p) return "Not found."
					const n = args.name || p.name, d = args.description || p.description
					db.prepare("UPDATE projects SET name=$n,description=$d WHERE id=$id").run({ $n: n, $d: d, $id: p.id })
					// Update .kortix/project.json marker
					try {
						const mp = path.join(p.path, ".kortix", "project.json")
						let marker: ProjectMarker = { name: n, description: d, created: p.created_at }
						if (existsSync(mp)) try { marker = { ...JSON.parse(readFileSync(mp, "utf8")), name: n, description: d } } catch {}
						await fs.writeFile(mp, JSON.stringify(marker, null, 2), "utf8")
					} catch {}
					// Push name to OpenCode
					if (p.opencode_id) {
						try { await client.project.update({ projectID: p.opencode_id, name: n }) } catch {}
					}
					return `Updated: **${n}**`
				},
			}),

			session_spawn: tool({
				description: `Spawn an async session in a project. Fire & forget — returns the session ID. You'll receive a <session-report> when it completes or fails. Runs /autowork by default.`,
				args: {
					project: tool.schema.string().describe("Project name or path"),
					prompt: tool.schema.string().describe("Detailed task description. Be thorough — the session starts with zero context beyond this + project's .kortix/context.md."),
					agent: tool.schema.string().describe('"" for default (KortixWorker). Or any agent name like "kortix", "KortixWorker".'),
					model: tool.schema.string().describe('"" for agent default. Or "provider/model" like "anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4".'),
					command: tool.schema.string().describe('"" for default (/autowork). Or any command. "none" for one-shot (no loop).'),
				},
				async execute(args: { project: string; prompt: string; agent: string; model: string; command: string }, toolCtx: ToolContext): Promise<string> {
					if (!toolCtx?.sessionID) return "Error: no session context."
					const p = mgr.getProject(args.project)
					if (!p) return `Project "${args.project}" not found.`
					try {
						const cmd = args.command === "none" ? "" : (args.command || "/autowork")
						const del = await mgr.spawn(
							p, args.prompt, args.agent || "KortixWorker",
							toolCtx.sessionID, toolCtx.agent, cmd, args.model || undefined,
						)
						const active = (db.prepare("SELECT COUNT(*) as c FROM delegations WHERE status='running'").get() as { c: number })?.c || 0
						return `Session spawned:\n- **Session:** ${del.session_id}\n- **Project:** ${p.name}\n- **Agent:** ${del.agent}${args.model ? `\n- **Model:** ${args.model}` : ""}\n- **Command:** ${cmd || "(one-shot)"}\n- **Active:** ${active}\n\n<session-report> will arrive on completion/failure.`
					} catch (e) { return `Failed: ${e instanceof Error ? e.message : "unknown"}` }
				},
			}),

			session_list_spawned: tool({
				description: "List spawned sessions, optionally filtered by project.",
				args: {
					project: tool.schema.string().describe('"" for all projects.'),
				},
				async execute(args: { project: string }): Promise<string> {
					let pid: string | undefined
					if (args.project) { const p = mgr.getProject(args.project); if (!p) return "Project not found."; pid = p.id }
					const dels = mgr.listDelegations(pid)
					if (!dels.length) return "No worker sessions."
					const lines = dels.map(d => {
						const elapsed = d.status === "running" ? ` ${Math.round((Date.now() - new Date(d.created_at).getTime()) / 1000)}s` : ""
						return `| ${d.session_id.slice(-8)} | ${d.status}${elapsed} | ${d.project_name || "-"} | ${d.prompt.slice(0, 50)} |`
					})
					return `| Session | Status | Project | Prompt |\n|---|---|---|---|\n${lines.join("\n")}`
				},
			}),

			session_read: tool({
				description: "Read a session's output efficiently. Returns compact summary: status + recent text output. Does NOT dump entire session.",
				args: {
					session_id: tool.schema.string().describe("Session ID"),
					tail: tool.schema.string().describe('Number of recent text outputs to show. Default "3". Use "10" for more context.'),
					pattern: tool.schema.string().describe('Regex to filter output. "" for no filter. E.g. "error|fail" to find problems.'),
				},
				async execute(args: { session_id: string; tail: string; pattern: string }): Promise<string> {
					const t = args.tail ? parseInt(args.tail, 10) : 3
					return mgr.readSession(args.session_id, isNaN(t) ? 3 : t, args.pattern || undefined)
				},
			}),

			session_message: tool({
				description: "Send a message into a running session. The agent sees it on its next iteration.",
				args: {
					session_id: tool.schema.string().describe("Session ID"),
					message: tool.schema.string().describe("Message content"),
				},
				async execute(args: { session_id: string; message: string }): Promise<string> { return mgr.sendMessage(args.session_id, args.message) },
			}),
		},

		event: async ({ event }: { event: Event }) => {
			const sid = (event as any).properties?.sessionID
			if (!sid) return
			if (event.type === "session.idle") mgr.handleIdleDebounced(sid)
			if (event.type === "session.error" || (event.type as string) === "session.aborted") {
				const error = (event as any).properties?.error || (event as any).properties?.reason || "Session error"
				mgr.handleError(sid, String(error))
			}
		},

		"experimental.session.compacting": async (_input: any, output: { context: string[] }) => {
			const active = db.prepare("SELECT d.*,p.name as pn FROM delegations d LEFT JOIN projects p ON d.project_id=p.id WHERE d.status='running'").all() as Array<DelegationRow & { pn: string }>
			if (!active.length) return
			const s = ["<orchestrator-state>", "Active workers:"]
			for (const d of active) s.push(`- ${d.session_id.slice(-8)} [${d.agent}] in ${d.pn}: ${d.prompt.slice(0, 100)}`)
			s.push("</orchestrator-state>")
			output.context.push(s.join("\n"))
		},
	}
}

export default KortixOrchestratorPlugin
