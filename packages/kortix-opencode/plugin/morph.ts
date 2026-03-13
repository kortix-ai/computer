import type { Plugin } from "@opencode-ai/plugin"
import type { Message, Part, TextPart } from "@opencode-ai/sdk"

const MORPH_API_KEY = process.env.MORPH_API_KEY?.trim()
const INSTRUCTION_PREFIX = "[Morph Tool Selection Policy]"

type HookMap = Record<string, any>

function buildInstructionMessage(
	template: { info: Message; parts: Part[] },
	instructions: string,
): { info: Message; parts: Part[] } {
	return {
		info: {
			...template.info,
			id: `morph-instructions-${template.info.id}`,
			role: "user",
		} as Message,
		parts: [
			{
				id: `morph-instructions-part-${template.info.id}`,
				sessionID: template.info.sessionID,
				messageID: template.info.id,
				type: "text",
				text: `${INSTRUCTION_PREFIX}\n\n${instructions}`,
			} as TextPart,
		],
	}
}

function hasInjectedInstructions(messages: { parts: Part[] }[]): boolean {
	const firstPart = messages[0]?.parts[0]
	return firstPart?.type === "text" && (firstPart as TextPart).text.startsWith(INSTRUCTION_PREFIX)
}

const MorphWrapperPlugin: Plugin = async (ctx) => {
	if (!MORPH_API_KEY) {
		return {}
	}

	const [{ default: upstreamPlugin }, instructionFile] = await Promise.all([
		import("./opencode-morph-plugin/index"),
		Bun.file(new URL("./opencode-morph-plugin/instructions/morph-tools.md", import.meta.url)).text(),
	])

	const upstreamHooks = (await upstreamPlugin(ctx)) as HookMap
	const upstreamTransform = upstreamHooks["experimental.chat.messages.transform"]

	return {
		...upstreamHooks,
		"experimental.chat.messages.transform": async (input: any, output: any) => {
			if (typeof upstreamTransform === "function") {
				await upstreamTransform(input, output)
			}

			const messages = output.messages as { info: Message; parts: Part[] }[]
			if (!messages?.length || hasInjectedInstructions(messages)) {
				return
			}

			output.messages = [buildInstructionMessage(messages[0]!, instructionFile), ...messages]
		},
	}
}

export default MorphWrapperPlugin
