/**
 * Planner — Structured plan file creation/update
 *
 * Creates and manages plan files that track the current work plan.
 * Plan files are simple markdown documents stored at a known path,
 * readable by both the agent and the user.
 *
 * The planner integrates with IntentGate: when a complex task is
 * detected, the continuation engine can trigger plan creation.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

const DEFAULT_PLAN_DIR = process.env.KORTIX_DIR || join(process.cwd(), ".kortix")
const PLAN_FILENAME = "PLAN.md"

export interface PlanSection {
	title: string
	items: PlanItem[]
}

export interface PlanItem {
	description: string
	status: "pending" | "in_progress" | "completed" | "blocked"
}

export function getPlanPath(baseDir?: string): string {
	return `${baseDir ?? DEFAULT_PLAN_DIR}/${PLAN_FILENAME}`
}

export function planExists(baseDir?: string): boolean {
	return existsSync(getPlanPath(baseDir))
}

export function readPlan(baseDir?: string): string | null {
	const path = getPlanPath(baseDir)
	if (!existsSync(path)) return null
	try {
		return readFileSync(path, "utf-8")
	} catch {
		return null
	}
}

export function writePlan(content: string, baseDir?: string): void {
	const path = getPlanPath(baseDir)
	const dir = dirname(path)
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
	writeFileSync(path, content, "utf-8")
}

/**
 * Generate a plan template from a task description.
 * Returns markdown content ready to write.
 */
export function generatePlanTemplate(
	taskDescription: string,
	steps: string[],
): string {
	const now = new Date().toISOString().slice(0, 16).replace("T", " ")
	const lines: string[] = [
		`# Plan`,
		``,
		`**Created:** ${now}`,
		`**Task:** ${taskDescription}`,
		``,
		`## Steps`,
		``,
	]

	for (let i = 0; i < steps.length; i++) {
		lines.push(`- [ ] ${steps[i]}`)
	}

	lines.push(``, `## Notes`, ``, `<!-- Updated by the Kortix continuation engine -->`)
	return lines.join("\n")
}

/**
 * Check if the current plan has uncompleted items.
 * Returns true if there are items marked with [ ] (pending).
 */
export function planHasUnfinishedWork(baseDir?: string): boolean {
	const content = readPlan(baseDir)
	if (!content) return false
	return /^- \[ \] /m.test(content)
}
