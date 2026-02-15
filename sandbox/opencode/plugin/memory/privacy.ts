/**
 * Privacy Utility for Memory Plugin
 *
 * Strips <private>...</private> tags from strings before storage.
 * Follows claude-mem's edge-processing pattern: privacy filtering
 * happens at the hook layer before data reaches the database.
 *
 * Users wrap sensitive content with <private> tags to prevent storage
 * while keeping it visible in the current session.
 */

const PRIVATE_TAG_REGEX = /<private>[\s\S]*?<\/private>/gi

/**
 * Strip <private>...</private> tags from text, replacing with [REDACTED].
 *
 * Handles:
 * - Multiple tags in one string
 * - Nested content (greedy inner match)
 * - Case-insensitive tags (<Private>, <PRIVATE>, etc.)
 * - Multiline content within tags
 *
 * @param text - Input text potentially containing private tags
 * @returns Text with private sections replaced by [REDACTED]
 */
export function stripPrivateTags(text: string): string {
	if (!text) return text
	return text.replace(PRIVATE_TAG_REGEX, "[REDACTED]")
}

/**
 * Check if text contains any <private> tags.
 */
export function hasPrivateTags(text: string): boolean {
	if (!text) return false
	return PRIVATE_TAG_REGEX.test(text)
}
