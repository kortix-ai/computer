/**
 * memory-search — Hybrid semantic + keyword search over agent memory.
 *
 * Mirrors OpenClaw's `memory_search` tool:
 * - Runs LSS (BM25 + embeddings) and grep in parallel
 * - Merges and deduplicates results
 * - Returns structured JSON with snippets, file paths, scores, and source type
 *
 * This replaces the pattern of running `lss` and `grep` via bash,
 * providing a first-class tool with structured input/output.
 */

import { tool } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"

interface SearchResult {
  snippet: string
  filePath: string
  lineRange?: string
  score: number
  source: "semantic" | "keyword"
}

interface LssHit {
  file_path: string
  score: number
  snippet: string
  rank_stage?: string
  indexed_at?: number
}

interface LssResponse {
  query: string
  hits: LssHit[]
}

function runLss(
  query: string,
  searchPath: string,
  maxResults: number,
): LssHit[] {
  try {
    const escaped = query.replace(/'/g, "'\\''")
    const result = execSync(
      `lss '${escaped}' -p '${searchPath}' --json -k ${maxResults} --no-index 2>/dev/null || lss '${escaped}' -p '${searchPath}' --json -k ${maxResults} 2>/dev/null`,
      { timeout: 15000, encoding: "utf-8", maxBuffer: 1024 * 1024 },
    )
    if (!result.trim()) return []
    const parsed = JSON.parse(result.trim())
    // LSS returns array of response objects (one per query)
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] as LssResponse
      return first.hits || []
    }
    // Fallback: might be direct hits array
    if (parsed.hits) return parsed.hits
    return []
  } catch {
    return []
  }
}

function runGrep(
  query: string,
  searchPath: string,
  maxResults: number,
): SearchResult[] {
  try {
    const escaped = query.replace(/'/g, "'\\''").replace(/[[\]{}()*+?.\\^$|]/g, "\\$&")
    const result = execSync(
      `grep -rnI --include='*.md' -l '${escaped}' '${searchPath}' 2>/dev/null | head -${maxResults}`,
      { timeout: 10000, encoding: "utf-8", maxBuffer: 512 * 1024 },
    )
    if (!result.trim()) return []

    const files = result.trim().split("\n").filter(Boolean)
    const results: SearchResult[] = []

    for (const file of files) {
      try {
        const context = execSync(
          `grep -n -B1 -A2 -i '${escaped}' '${file}' 2>/dev/null | head -20`,
          { timeout: 5000, encoding: "utf-8", maxBuffer: 256 * 1024 },
        )
        if (context.trim()) {
          const lines = context.trim().split("\n")
          const lineNums = lines
            .map((l) => {
              const m = l.match(/^(\d+)[:-]/)
              return m ? parseInt(m[1], 10) : null
            })
            .filter((n): n is number => n !== null)

          const lineRange =
            lineNums.length > 0
              ? `${Math.min(...lineNums)}-${Math.max(...lineNums)}`
              : undefined

          results.push({
            snippet: context.trim().slice(0, 700),
            filePath: file,
            lineRange,
            score: 0.5, // Keyword matches get a fixed relevance score
            source: "keyword",
          })
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return results
  } catch {
    return []
  }
}

export default tool({
  description:
    "Search agent memory using hybrid semantic + keyword search. " +
    "Searches MEMORY.md, memory/*.md, journal/*.md, knowledge/*.md, and optionally session transcripts. " +
    "Returns ranked results with snippets, file paths, line ranges, and relevance scores. " +
    "Use this for conceptual queries, recalling past decisions, finding user preferences, or any memory retrieval.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Natural language search query. Be specific for better results. " +
          "Examples: 'user deployment preferences', 'database migration decisions', 'what did we discuss about auth'",
      ),
    scope: tool.schema
      .string()
      .optional()
      .describe(
        "Search scope: 'all' (default, searches everything), 'core' (MEMORY.md only), " +
          "'memory' (memory/*.md), 'journal' (journal/*.md), 'knowledge' (knowledge/*.md), " +
          "'sessions' (past session transcripts)",
      ),
    max_results: tool.schema
      .number()
      .optional()
      .describe("Maximum results to return (1-20). Default: 6"),
  },
  async execute(args, _ctx) {
    const basePath = "/workspace/.kortix"
    const maxResults = Math.max(1, Math.min(args.max_results ?? 6, 20))
    const scope = args.scope ?? "all"
    const minScore = 0.35

    // Determine search paths based on scope
    const searchPaths: string[] = []
    switch (scope) {
      case "core":
        searchPaths.push(`${basePath}/MEMORY.md`)
        break
      case "memory":
        searchPaths.push(`${basePath}/memory`)
        break
      case "journal":
        searchPaths.push(`${basePath}/journal`)
        break
      case "knowledge":
        searchPaths.push(`${basePath}/knowledge`)
        break
      case "sessions":
        searchPaths.push(`${basePath}/sessions`)
        break
      case "all":
      default:
        searchPaths.push(basePath)
        break
    }

    // Run semantic and keyword search in parallel (via sync calls, but logically parallel)
    const allResults: SearchResult[] = []
    const seenPaths = new Set<string>()

    // Semantic search via LSS
    for (const sp of searchPaths) {
      const lssHits = runLss(args.query, sp, maxResults * 2)
      for (const hit of lssHits) {
        if (!seenPaths.has(hit.file_path)) {
          seenPaths.add(hit.file_path)
          allResults.push({
            snippet: (hit.snippet || "").slice(0, 700),
            filePath: hit.file_path,
            score: hit.score || 0,
            source: "semantic",
          })
        }
      }
    }

    // Keyword search via grep
    for (const sp of searchPaths) {
      const grepHits = runGrep(args.query, sp, maxResults)
      for (const hit of grepHits) {
        if (!seenPaths.has(hit.filePath)) {
          seenPaths.add(hit.filePath)
          allResults.push(hit)
        }
      }
    }

    // Sort by score descending, filter by minimum score
    const filtered = allResults
      .filter((r) => r.score >= minScore || r.source === "keyword")
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)

    if (filtered.length === 0) {
      return JSON.stringify(
        {
          query: args.query,
          scope,
          results: [],
          message:
            "No matching memories found. Try broader terms or check if memory has been initialized (run /memory-init).",
          suggestions: [
            "Try different keywords or phrasing",
            `Search all memory: memory_search with scope='all'`,
            "Check if MEMORY.md exists at workspace/.kortix/MEMORY.md",
          ],
        },
        null,
        2,
      )
    }

    return JSON.stringify(
      {
        query: args.query,
        scope,
        total: filtered.length,
        results: filtered.map((r) => ({
          snippet: r.snippet,
          file_path: r.filePath,
          line_range: r.lineRange ?? null,
          score: Math.round(r.score * 1000) / 1000,
          source: r.source,
        })),
      },
      null,
      2,
    )
  },
})
