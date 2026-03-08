import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..")
export const RUNTIME_ROOT = path.join(PACKAGE_ROOT, "runtime")

export interface MaterializeOptions {
  clean?: boolean
}

const FILTERED_RUNTIME_DIRS = new Set(["commands", "patches", "plugin"])
const FILTERED_RUNTIME_NAMES = new Set([".DS_Store", ".kortix", ".local", "bun.lock", "node_modules", "ocx.lock"])

interface CommandDefinition {
  name: string
  description: string
  agent?: string
  template: string
}

function parseFrontmatter(frontmatter: string): Record<string, string> {
  const fields: Record<string, string> = {}

  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":")
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "")
    if (key) fields[key] = value
  }

  return fields
}

function parseCommandMarkdown(filePath: string): CommandDefinition {
  const raw = readFileSync(filePath, "utf8")
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    throw new Error(`Invalid command markdown (missing frontmatter): ${filePath}`)
  }

  const [, frontmatter, body] = match
  const fields = parseFrontmatter(frontmatter)
  const name = path.basename(filePath, path.extname(filePath))

  if (!fields.description) {
    throw new Error(`Command markdown missing description: ${filePath}`)
  }

  return {
    name,
    description: fields.description,
    agent: fields.agent,
    template: body.trim(),
  }
}

function buildCommandBlock(): string {
  const commandsDir = path.join(RUNTIME_ROOT, "commands")
  const commandFiles = [
    "onboarding.md",
    "work-loop.md",
    "ulw-loop.md",
    "stop-continuation.md",
  ]

  const definitions = commandFiles.map((file) => parseCommandMarkdown(path.join(commandsDir, file)))
  const lines = definitions.flatMap((definition, index) => {
    const suffix = index === definitions.length - 1 ? "" : ","
    const entry = [
      `    ${JSON.stringify(definition.name)}: {`,
      `      "description": ${JSON.stringify(definition.description)},`,
      definition.agent ? `      "agent": ${JSON.stringify(definition.agent)},` : null,
      `      "template": ${JSON.stringify(definition.template)}`,
      `    }${suffix}`,
    ].filter(Boolean) as string[]

    return entry
  })

  return ['  "command": {', ...lines, "  },"].join("\n")
}

function rewriteOpencodeConfig(targetDir: string): void {
  const opencodeConfigPath = path.join(targetDir, "opencode.jsonc")
  const relativeRuntimeRoot = path.relative(targetDir, RUNTIME_ROOT).split(path.sep).join("/")
  const pluginPath = `${relativeRuntimeRoot}/plugin/kortix-oc.ts`
  const pluginSkillsPath = `${relativeRuntimeRoot}/plugin/kortix-sys/skills`

  let config = readFileSync(opencodeConfigPath, "utf8")
  config = config.replaceAll("./plugin/kortix-oc.ts", pluginPath)
  config = config.replaceAll("./plugin/kortix-sys/skills", pluginSkillsPath)
  config = config.replace('  "command": {},', buildCommandBlock())
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
