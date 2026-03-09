import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { unlinkSync } from "node:fs"
import { initDb, insertLTM } from "../../../runtime/plugin/kortix-sys/src/db"
import { generateContextBlock } from "../../../runtime/plugin/kortix-sys/src/context"
import type { CreateLTMInput } from "../../../runtime/plugin/kortix-sys/src/types"
import type { Database } from "bun:sqlite"

const TEST_DB_PATH = "/tmp/kortix-memory-context-test.db"
let db: Database

function makeLTM(overrides: Partial<CreateLTMInput> = {}): CreateLTMInput {
	return {
		type: "semantic",
		content: "Test memory",
		tags: [],
		files: [],
		...overrides,
	}
}

beforeEach(() => {
	try { unlinkSync(TEST_DB_PATH) } catch {}
	db = initDb(TEST_DB_PATH)
})

afterEach(() => {
	db.close()
	try { unlinkSync(TEST_DB_PATH) } catch {}
})

describe("generateContextBlock", () => {
	it("returns empty string when no data exists", () => {
		expect(generateContextBlock(db)).toBe("")
	})

	it("wraps output in memory-context tags", () => {
		insertLTM(db, makeLTM({ content: "SolidJS is the frontend framework" }))
		const block = generateContextBlock(db)
		expect(block).toContain("<memory-context>")
		expect(block).toContain("</memory-context>")
	})

	it("includes grouped long-term memories", () => {
		insertLTM(db, makeLTM({ type: "episodic", content: "Built auth system on Feb 24" }))
		insertLTM(db, makeLTM({ type: "semantic", content: "API uses JWT at /api/auth" }))
		insertLTM(db, makeLTM({ type: "procedural", content: "Deploy: bun build then docker compose up" }))

		const block = generateContextBlock(db)
		expect(block).toContain("Long-term memories")
		expect(block).toContain("**Semantic:**")
		expect(block).toContain("**Procedural:**")
		expect(block).toContain("**Episodic:**")
		expect(block).toContain("Built auth system")
		expect(block).toContain("JWT")
		expect(block).toContain("Deploy")
	})

	it("omits absent type headings", () => {
		insertLTM(db, makeLTM({ type: "semantic", content: "Only semantic here" }))
		const block = generateContextBlock(db)
		expect(block).toContain("**Semantic:**")
		expect(block).not.toContain("**Episodic:**")
		expect(block).not.toContain("**Procedural:**")
	})
})
