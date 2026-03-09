import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..")
export const RUNTIME_ROOT = path.join(PACKAGE_ROOT, "runtime")

export interface MaterializeOptions {
  clean?: boolean
}

const FILTERED_RUNTIME_DIRS = new Set(["commands", "patches", "plugin"])
const FILTERED_RUNTIME_NAMES = new Set([".DS_Store", ".kortix", ".local", "bun.lock", "node_modules", "ocx.lock"])

function rewriteOpencodeConfig(targetDir: string): void {
  const opencodeConfigPath = path.join(targetDir, "opencode.jsonc")
  const relativeRuntimeRoot = path.relative(targetDir, RUNTIME_ROOT).split(path.sep).join("/")
  const pluginPath = `${relativeRuntimeRoot}/plugin/kortix-oc.ts`

  let config = readFileSync(opencodeConfigPath, "utf8")
  config = config.replaceAll("./plugin/kortix-oc.ts", pluginPath)
  writeFileSync(opencodeConfigPath, config)
}

export function materializeRuntime(targetDir: string, options: MaterializeOptions = {}): string {
  const absoluteTarget = path.resolve(targetDir)

  if (!existsSync(RUNTIME_ROOT)) {
    throw new Error(`Runtime root does not exist: ${RUNTIME_ROOT}`)
  }

  if (options.clean && existsSync(absoluteTarget)) {
    rmSync(absoluteTarget, { recursive: true, force: true })
  }

  mkdirSync(path.dirname(absoluteTarget), { recursive: true })
  cpSync(RUNTIME_ROOT, absoluteTarget, {
    recursive: true,
    filter(source) {
      if (source === RUNTIME_ROOT) return true
      const relativePath = path.relative(RUNTIME_ROOT, source)
      if (!relativePath) return true
      const currentName = path.basename(source)
      if (FILTERED_RUNTIME_NAMES.has(currentName)) return false
      const [topLevelName] = relativePath.split(path.sep)
      return !FILTERED_RUNTIME_DIRS.has(topLevelName)
    },
  })
  rewriteOpencodeConfig(absoluteTarget)
  return absoluteTarget
}
