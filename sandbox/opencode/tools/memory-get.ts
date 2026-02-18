/**
 * memory-get — Read a specific memory file by path.
 *
 * Mirrors OpenClaw's `memory_get` tool:
 * - Path validation (restricted to .kortix/ directory)
 * - Symlink rejection (prevents path traversal)
 * - Line range slicing support
 * - Non-Markdown rejection
 *
 * Provides safe, structured access to memory files without
 * needing bash or the generic read tool.
 */

import { tool } from "@opencode-ai/plugin"
import { readFile, lstat, realpath } from "node:fs/promises"
import * as path from "node:path"

const BASE_PATH = "/workspace/.kortix"

const ALLOWED_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
])

function isSubPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return !relative.startsWith("..") && !path.isAbsolute(relative)
}

export default tool({
  description:
    "Read a specific memory file by path. " +
    "Restricted to files under workspace/.kortix/ for security. " +
    "Supports reading full files or specific line ranges. " +
    "Use memory_search to find relevant files first, then memory_get to read the full content.",
  args: {
    path: tool.schema.string().describe(
      "Path to the memory file. Can be absolute (e.g., '/workspace/.kortix/MEMORY.md') " +
        "or relative to .kortix/ (e.g., 'MEMORY.md', 'memory/decisions.md', 'journal/2025-01-15.md'). " +
        "Must be under workspace/.kortix/.",
    ),
    start_line: tool.schema
      .number()
      .optional()
      .describe("Start reading from this line number (1-indexed). Default: 1"),
    lines: tool.schema
      .number()
      .optional()
      .describe(
        "Number of lines to read. Default: all. Useful for large files.",
      ),
  },
  async execute(args, _ctx) {
    // Resolve path — support both absolute and relative
    let filePath = args.path
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(BASE_PATH, filePath)
    }
    filePath = path.resolve(filePath)

    // Security: must be under BASE_PATH
    if (!isSubPath(BASE_PATH, filePath)) {
      return JSON.stringify(
        {
          error: "Access denied",
          message: `Path must be under ${BASE_PATH}. Got: ${args.path}`,
          allowed_paths: [
            "MEMORY.md",
            "memory/*.md",
            "journal/*.md",
            "knowledge/*.md",
            "sessions/*.md",
          ],
        },
        null,
        2,
      )
    }

    // Security: reject symlinks that point outside BASE_PATH
    try {
      const stats = await lstat(filePath)
      if (stats.isSymbolicLink()) {
        const resolved = await realpath(filePath)
        if (!isSubPath(BASE_PATH, resolved)) {
          return JSON.stringify(
            {
              error: "Access denied",
              message: "Symlinks pointing outside memory directory are not allowed.",
            },
            null,
            2,
          )
        }
      }
    } catch {
      return JSON.stringify(
        {
          error: "File not found",
          message: `No file at: ${args.path}`,
          suggestion: "Use memory_search to find available memory files.",
        },
        null,
        2,
      )
    }

    // Validate extension
    const ext = path.extname(filePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return JSON.stringify(
        {
          error: "Invalid file type",
          message: `Only Markdown and text files are allowed. Got: ${ext}`,
          allowed: Array.from(ALLOWED_EXTENSIONS),
        },
        null,
        2,
      )
    }

    // Read the file
    try {
      const content = await readFile(filePath, "utf-8")
      const allLines = content.split("\n")
      const totalLines = allLines.length

      // Apply line range if specified
      const startLine = Math.max(1, args.start_line ?? 1)
      const endLine = args.lines
        ? Math.min(startLine + args.lines - 1, totalLines)
        : totalLines
      const sliced = allLines.slice(startLine - 1, endLine)

      // Calculate relative path for display
      const relativePath = path.relative(BASE_PATH, filePath)

      return JSON.stringify(
        {
          path: relativePath,
          absolute_path: filePath,
          total_lines: totalLines,
          showing: {
            start: startLine,
            end: endLine,
            count: sliced.length,
          },
          content: sliced.join("\n"),
        },
        null,
        2,
      )
    } catch (e) {
      return JSON.stringify(
        {
          error: "Read failed",
          message: `Failed to read ${args.path}: ${e instanceof Error ? e.message : String(e)}`,
        },
        null,
        2,
      )
    }
  },
})
