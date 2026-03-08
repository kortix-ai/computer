export const MEMORY_CONTEXT_MARKER = "<!-- kortix-mem-context -->"
export const SYNTHETIC_MEMORY_MESSAGE_ID = "__kortix_mem_context__"

export interface ChatMessagePart {
	type?: string
	text?: string
	[key: string]: unknown
}

export interface ChatMessage {
	info?: {
		role?: string
		id?: string
		sessionID?: string
		[key: string]: unknown
	}
	parts?: ChatMessagePart[]
	[key: string]: unknown
}

function isMemoryContextPart(part: ChatMessagePart | undefined): boolean {
	return part?.type === "text" && typeof part.text === "string" && part.text.includes(MEMORY_CONTEXT_MARKER)
}

function stripExistingMemoryContext(messages: ChatMessage[]): void {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]
		if (!message) continue

		if (message.info?.id === SYNTHETIC_MEMORY_MESSAGE_ID) {
			messages.splice(i, 1)
			continue
		}

		if (!Array.isArray(message.parts) || message.parts.length === 0) continue

		const filtered = message.parts.filter((part) => !isMemoryContextPart(part))
		if (filtered.length !== message.parts.length) {
			message.parts = filtered
		}
	}
}

export function upsertMemoryContextAtPromptEnd(
	messages: ChatMessage[],
	syntheticText: string,
	sessionID?: string,
): void {
	stripExistingMemoryContext(messages)

	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]
		if (message?.info?.role !== "user") continue

		if (!Array.isArray(message.parts)) {
			message.parts = []
		}

		message.parts.push({
			type: "text",
			text: syntheticText,
		})
		return
	}

	messages.push({
		info: {
			role: "user",
			id: SYNTHETIC_MEMORY_MESSAGE_ID,
			sessionID: sessionID ?? "",
			parts: [],
			createdAt: new Date().toISOString(),
		} as ChatMessage["info"],
		parts: [{
			type: "text",
			text: syntheticText,
		}],
	})
}
