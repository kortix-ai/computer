import { describe, expect, test } from "bun:test"
import {
	MEMORY_CONTEXT_MARKER,
	SYNTHETIC_MEMORY_MESSAGE_ID,
	upsertMemoryContextAtPromptEnd,
	type ChatMessage,
} from "../../../runtime/plugin/kortix-sys/src/message-transform"

function makeUser(text: string, id?: string): ChatMessage {
	return {
		info: { role: "user", id: id ?? `user-${text}` },
		parts: [{ type: "text", text }],
	}
}

function makeAssistant(text: string): ChatMessage {
	return {
		info: { role: "assistant", id: `assistant-${text}` },
		parts: [{ type: "text", text }],
	}
}

function makeSystem(text: string): ChatMessage {
	return {
		info: { role: "system", id: `system-${text}` },
		parts: [{ type: "text", text }],
	}
}

describe("upsertMemoryContextAtPromptEnd", () => {
	test("appends memory context to the latest user message", () => {
		const messages = [
			makeSystem("system"),
			makeUser("older user"),
			makeAssistant("assistant"),
			makeUser("latest user"),
		]

		upsertMemoryContextAtPromptEnd(messages, `${MEMORY_CONTEXT_MARKER}\ncontext`)

		expect(messages).toHaveLength(4)
		expect(messages[3]?.info?.role).toBe("user")
		const latestParts = messages[3]?.parts ?? []
		expect(latestParts[latestParts.length - 1]?.text).toBe(`${MEMORY_CONTEXT_MARKER}\ncontext`)
	})

	test("removes legacy synthetic message and reattaches context to latest user", () => {
		const messages = [
			makeSystem("system"),
			{
				info: { role: "user", id: SYNTHETIC_MEMORY_MESSAGE_ID },
				parts: [{ type: "text", text: `${MEMORY_CONTEXT_MARKER}\nold` }],
			},
			makeUser("real user"),
		]

		upsertMemoryContextAtPromptEnd(messages, `${MEMORY_CONTEXT_MARKER}\nnew`)

		expect(messages).toHaveLength(2)
		expect(messages.some((message) => message.info?.id === SYNTHETIC_MEMORY_MESSAGE_ID)).toBe(false)
		expect(messages[1]?.parts).toHaveLength(2)
		const latestParts = messages[1]?.parts ?? []
		expect(latestParts[latestParts.length - 1]?.text).toBe(`${MEMORY_CONTEXT_MARKER}\nnew`)
	})

	test("replaces existing memory context instead of duplicating it", () => {
		const messages = [
			makeSystem("system"),
			{
				info: { role: "user", id: "user-1" },
				parts: [
					{ type: "text", text: "latest user" },
					{ type: "text", text: `${MEMORY_CONTEXT_MARKER}\nold` },
				],
			},
		]

		upsertMemoryContextAtPromptEnd(messages, `${MEMORY_CONTEXT_MARKER}\nnew`)

		const contextParts = messages[1]?.parts?.filter((part) => part.text?.includes(MEMORY_CONTEXT_MARKER)) ?? []
		expect(contextParts).toHaveLength(1)
		expect(contextParts[0]?.text).toBe(`${MEMORY_CONTEXT_MARKER}\nnew`)
		const latestParts = messages[1]?.parts ?? []
		expect(latestParts[latestParts.length - 1]?.text).toBe(`${MEMORY_CONTEXT_MARKER}\nnew`)
	})

	test("falls back to a synthetic user message only when no user message exists", () => {
		const messages = [makeSystem("system"), makeAssistant("assistant")]

		upsertMemoryContextAtPromptEnd(messages, `${MEMORY_CONTEXT_MARKER}\ncontext`, "ses_123")

		expect(messages).toHaveLength(3)
		expect(messages[2]?.info?.role).toBe("user")
		expect(messages[2]?.info?.id).toBe(SYNTHETIC_MEMORY_MESSAGE_ID)
		expect(messages[2]?.info?.sessionID).toBe("ses_123")
		expect(messages[2]?.parts?.[0]?.text).toBe(`${MEMORY_CONTEXT_MARKER}\ncontext`)
	})
})
