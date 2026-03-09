import { readFileSync } from "node:fs"
import path from "node:path"
import yaml from "js-yaml"
import { RUNTIME_ROOT } from "./materialize"

export interface RuntimeCommandDefinition {
  name: string
  description: string
  agent?: string
  model?: string
  subtask?: boolean
  template: string
}

export interface RuntimeAgentDefinition {
  name: string
  config: Record<string, unknown>
}

function parseMarkdownWithFrontmatter(filePath: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const raw = readFileSync(filePath, "utf8")
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    throw new Error(`Invalid markdown (missing frontmatter): ${filePath}`)
  }

  const [, frontmatterRaw, body] = match
  const parsed = yaml.load(frontmatterRaw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid frontmatter object in: ${filePath}`)
  }

  return {
    frontmatter: parsed as Record<string, unknown>,
    body: body.trim(),
  }
}

export function listRuntimeSkillPaths(): string[] {
  return [
    path.join(RUNTIME_ROOT, "skills"),
    path.join(RUNTIME_ROOT, "plugin", "kortix-sys", "skills"),
  ]
}

export function loadRuntimeCommands(): RuntimeCommandDefinition[] {
  const commandsDir = path.join(RUNTIME_ROOT, "commands")
  const commandFiles = [
    "onboarding.md",
    "work-loop.md",
    "ulw-loop.md",
    "stop-continuation.md",
  ]

  return commandFiles.map((file) => {
    const fullPath = path.join(commandsDir, file)
    const { frontmatter, body } = parseMarkdownWithFrontmatter(fullPath)
    const name = path.basename(file, ".md")
    const description = typeof frontmatter.description === "string" ? frontmatter.description : ""
    if (!description) {
      throw new Error(`Command markdown missing description: ${fullPath}`)
    }

    return {
      name,
      description,
      agent: typeof frontmatter.agent === "string" ? frontmatter.agent : undefined,
      model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
      subtask: typeof frontmatter.subtask === "boolean" ? frontmatter.subtask : undefined,
      template: body,
    }
  })
}

export function loadRuntimeAgents(): RuntimeAgentDefinition[] {
  const agentsDir = path.join(RUNTIME_ROOT, "agents")
  const agentFiles = ["kortix.md"]

  return agentFiles.map((file) => {
    const fullPath = path.join(agentsDir, file)
    const { frontmatter, body } = parseMarkdownWithFrontmatter(fullPath)
    const name = path.basename(file, ".md")

    return {
      name,
      config: {
        ...frontmatter,
        prompt: body,
      },
    }
  })
}
