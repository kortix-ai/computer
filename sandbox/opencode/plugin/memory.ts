/**
 * Kortix Memory Plugin
 *
 * Implements OpenClaw-style memory system integration for OpenCode:
 *
 * 1. System Prompt Injection — Automatically loads MEMORY.md + daily logs
 *    into the system prompt at session start (no tool call needed).
 *
 * 2. Pre-Compaction Memory Flush — Before context compaction, triggers a
 *    silent agentic turn that nudges the model to write durable memories
 *    to disk, preventing memory loss.
 *
 * 3. Session Event Tracking — Listens to session events for memory lifecycle.
 *
 * Mirrors OpenClaw's memory architecture:
 * - src/agents/system-prompt.ts (MEMORY.md injection)
 * - compaction.memoryFlush (pre-compaction flush)
 */

import { readFile, access, mkdir } from "node:fs/promises"
import * as path from "node:path"
import type { Plugin } from "@opencode-ai/plugin"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface MemoryConfig {
  enabled: boolean
  basePath: string
  corePath: string
  memoryDir: string
  flush: {
    enabled: boolean
    softThresholdTokens: number
    systemPrompt: string
    prompt: string
  }
  inject: {
    coreMemory: boolean
    dailyLogs: boolean
    dailyLogDays: number
  }
}

const DEFAULT_CONFIG: MemoryConfig = {
  enabled: true,
  basePath: "/workspace/.kortix",
  corePath: "MEMORY.md",
  memoryDir: "memory",
  flush: {
    enabled: true,
    softThresholdTokens: 4000,
    systemPrompt:
      "Session is nearing context compaction. Before context is lost, write any durable memories that should persist across sessions.",
    prompt: [
      "Review what you have learned in this session.",
      `Write any lasting notes, decisions, lessons, or user preferences to workspace/.kortix/memory/${formatDate(new Date())}.md.`,
      "Update workspace/.kortix/MEMORY.md Scratchpad with current state and pending items.",
      "Reply with NO_REPLY if there is nothing worth remembering.",
    ].join(" "),
  },
  inject: {
    coreMemory: true,
    dailyLogs: true,
    dailyLogDays: 2,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getDayOffset(offset: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    await access(filePath)
    return await readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

async function loadConfig(directory: string): Promise<MemoryConfig> {
  const configPath = path.join(directory, ".opencode", "memory.json")
  try {
    const raw = await readFile(configPath, "utf-8")
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      flush: { ...DEFAULT_CONFIG.flush, ...parsed.flush },
      inject: { ...DEFAULT_CONFIG.inject, ...parsed.inject },
    }
  } catch {
    // Also try sandbox-local config
    const sandboxConfigPath = path.resolve(directory, "memory.json")
    try {
      const raw = await readFile(sandboxConfigPath, "utf-8")
      const parsed = JSON.parse(raw)
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        flush: { ...DEFAULT_CONFIG.flush, ...parsed.flush },
        inject: { ...DEFAULT_CONFIG.inject, ...parsed.inject },
      }
    } catch {
      return DEFAULT_CONFIG
    }
  }
}

// ---------------------------------------------------------------------------
// Memory Content Loading
// ---------------------------------------------------------------------------

async function loadCoreMemory(basePath: string): Promise<string | null> {
  const memoryPath = path.join(basePath, "MEMORY.md")
  return readFileSafe(memoryPath)
}

async function loadDailyLogs(
  basePath: string,
  days: number,
): Promise<{ date: string; content: string }[]> {
  const logs: { date: string; content: string }[] = []
  for (let i = 0; i < days; i++) {
    const date = formatDate(getDayOffset(-i))
    const logPath = path.join(basePath, "memory", `${date}.md`)
    const content = await readFileSafe(logPath)
    if (content && content.trim().length > 0) {
      logs.push({ date, content })
    }
  }
  return logs
}

function buildMemorySystemPrompt(
  coreMemory: string | null,
  dailyLogs: { date: string; content: string }[],
): string {
  const sections: string[] = []

  sections.push("# Agent Memory (auto-loaded)")
  sections.push("")

  if (coreMemory && coreMemory.trim()) {
    sections.push("## Core Memory (MEMORY.md)")
    sections.push("")
    sections.push(coreMemory.trim())
    sections.push("")
  }

  if (dailyLogs.length > 0) {
    sections.push("## Recent Daily Logs")
    sections.push("")
    for (const log of dailyLogs) {
      sections.push(`### ${log.date}`)
      sections.push("")
      sections.push(log.content.trim())
      sections.push("")
    }
  }

  if (!coreMemory && dailyLogs.length === 0) {
    sections.push(
      "No memory found. Memory system is active but MEMORY.md has not been created yet.",
    )
    sections.push(
      "Create it at workspace/.kortix/MEMORY.md or run /memory-init.",
    )
    sections.push("")
  }

  sections.push("---")
  sections.push(
    "Memory is auto-loaded. Update MEMORY.md and memory/*.md files to persist knowledge across sessions.",
  )
  sections.push(
    "Use delta-only updates (never rewrite the whole file). Write daily entries to memory/YYYY-MM-DD.md.",
  )

  return sections.join("\n")
}

// ---------------------------------------------------------------------------
// Track flush state per session to prevent multiple flushes
// ---------------------------------------------------------------------------

const flushedSessions = new Set<string>()

// ---------------------------------------------------------------------------
// Plugin Export
// ---------------------------------------------------------------------------

export const MemoryPlugin: Plugin = async (ctx) => {
  const config = await loadConfig(ctx.directory)

  if (!config.enabled) {
    return {}
  }

  // Ensure base directories exist
  const basePath = config.basePath
  try {
    await mkdir(path.join(basePath, "memory"), { recursive: true })
    await mkdir(path.join(basePath, "journal"), { recursive: true })
    await mkdir(path.join(basePath, "knowledge"), { recursive: true })
    await mkdir(path.join(basePath, "sessions"), { recursive: true })
  } catch {
    // Directories may not be writable in all environments
  }

  return {
    // -----------------------------------------------------------------
    // Hook 1: System Prompt Injection
    //
    // Automatically load MEMORY.md + daily logs into the system prompt
    // so the agent starts every turn with full memory context.
    // Mirrors OpenClaw's src/agents/system-prompt.ts behavior.
    // -----------------------------------------------------------------
    "experimental.chat.system.transform": async (_input, output) => {
      if (!config.inject.coreMemory && !config.inject.dailyLogs) return

      const coreMemory = config.inject.coreMemory
        ? await loadCoreMemory(basePath)
        : null

      const dailyLogs = config.inject.dailyLogs
        ? await loadDailyLogs(basePath, config.inject.dailyLogDays)
        : []

      // Only inject if there's something to inject
      if (coreMemory || dailyLogs.length > 0) {
        const memoryPrompt = buildMemorySystemPrompt(coreMemory, dailyLogs)
        output.system.push(memoryPrompt)
      }
    },

    // -----------------------------------------------------------------
    // Hook 2: Pre-Compaction Memory Flush
    //
    // Before context is compacted, inject instructions for the agent to
    // write durable memories to disk. This prevents memory loss when the
    // context window fills up.
    // Mirrors OpenClaw's compaction.memoryFlush behavior.
    // -----------------------------------------------------------------
    "experimental.session.compacting": async (input, output) => {
      if (!config.flush.enabled) return

      const sessionID = input.sessionID

      // One flush per compaction cycle per session
      if (flushedSessions.has(sessionID)) return
      flushedSessions.add(sessionID)

      // Inject memory flush context into the compaction
      const today = formatDate(new Date())
      const flushContext = [
        "--- MEMORY FLUSH ---",
        config.flush.systemPrompt,
        "",
        `Write durable memories to: workspace/.kortix/memory/${today}.md`,
        "Update MEMORY.md Scratchpad with: current state, pending items, handoff notes.",
        "Format daily log entries with timestamps: ## HH:MM — [Topic]",
        "Only write what's worth remembering. Skip if nothing notable happened.",
        "--- END MEMORY FLUSH ---",
      ].join("\n")

      output.context.push(flushContext)
    },

    // -----------------------------------------------------------------
    // Hook 3: Session Event Tracking
    //
    // Clean up flush tracking when sessions end.
    // Listen for session events to manage memory lifecycle.
    // -----------------------------------------------------------------
    event: async ({ event }) => {
      // Clean up flush tracking for completed sessions
      if (event.type === "session.deleted") {
        const data = event.properties as { id?: string }
        if (data.id) flushedSessions.delete(data.id)
      }

      // Reset flush flag when a new compaction cycle might start
      // (session becomes idle, meaning the previous turn finished)
      if (event.type === "session.idle") {
        // Allow future compaction cycles to flush again
        // This is intentionally NOT clearing the flag here —
        // it should only be cleared on session delete or new session
      }
    },
  }
}

export default MemoryPlugin
