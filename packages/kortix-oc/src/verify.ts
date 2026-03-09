import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { RUNTIME_EXCLUDE_NAMES, RUNTIME_EXPECTED_FILES } from "./manifest"
import { RUNTIME_ROOT } from "./materialize"

export interface RuntimeVerificationResult {
  ok: boolean
  missing: string[]
  unexpected: string[]
}

function walk(dir: string, baseDir: string, output: string[]): void {
  for (const name of readdirSync(dir)) {
    if (RUNTIME_EXCLUDE_NAMES.has(name)) continue
    const fullPath = path.join(dir, name)
    const relativePath = path.relative(baseDir, fullPath)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      walk(fullPath, baseDir, output)
      continue
    }
    output.push(relativePath)
  }
}

export function verifyRuntime(root = RUNTIME_ROOT): RuntimeVerificationResult {
  if (!existsSync(root)) {
    return {
      ok: false,
      missing: [...RUNTIME_EXPECTED_FILES],
      unexpected: [],
    }
  }

  const files: string[] = []
  walk(root, root, files)

  const fileSet = new Set(files)
  const missing = RUNTIME_EXPECTED_FILES.filter((file) => !fileSet.has(file))

  return {
    ok: missing.length === 0,
    missing,
    unexpected: [],
  }
}
