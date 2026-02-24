"use client";

import {
	ArrowDown,
	ArrowUp,
	ArrowUpLeft,
	Check,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	Copy,
	ExternalLink,
	FileText,
	GitFork,
	Image as ImageIcon,
	Layers,
	ListPlus,
	Loader2,
	MessageSquare,
	Pencil,
	Scissors,
	Send,
	Terminal,
	Trash2,
	Undo2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnifiedMarkdown } from "@/components/markdown/unified-markdown";
import { ImagePreview } from "@/components/session/image-preview";
import {
	ConfirmDialog,
	RevertBanner,
} from "@/components/session/message-actions";
import { ConnectProviderDialog } from "@/components/session/model-selector";
import {
	type AttachedFile,
	SessionChatInput,
	type TrackedMention,
} from "@/components/session/session-chat-input";
import { SessionContextModal } from "@/components/session/session-context-modal";
import { TurnErrorDisplay } from "@/components/session/session-error-banner";
import { SessionSiteHeader } from "@/components/session/session-site-header";
import { SessionWelcome } from "@/components/session/session-welcome";
import {
	OcPatchPartView,
	OcSnapshotPartView,
} from "@/components/session/snapshot-part-views";
import { ToolPartRenderer } from "@/components/session/tool-renderers";
import { SandboxUrlDetector } from "@/components/thread/content/sandbox-url-detector";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { KortixLoader } from "@/components/ui/kortix-loader";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { uploadFile } from "@/features/files/api/opencode-files";
import { useOpenCodeConfig } from "@/hooks/opencode/use-opencode-config";
import { useOpenCodeLocal } from "@/hooks/opencode/use-opencode-local";
import type { ProviderListResponse } from "@/hooks/opencode/use-opencode-sessions";
import {
	ascendingId,
	findOpenCodeFiles,
	rejectQuestion,
	replyToPermission,
	replyToQuestion,
	useAbortOpenCodeSession,
	useDeletePart,
	useExecuteOpenCodeCommand,
	useForkSession,
	useOpenCodeAgents,
	useOpenCodeCommands,
	useOpenCodeProviders,
	useOpenCodeSession,
	useRevertSession,
	useSendOpenCodeMessage,
	useUnrevertSession,
	useUpdatePart,
} from "@/hooks/opencode/use-opencode-sessions";
import { useSessionSync } from "@/hooks/opencode/use-session-sync";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useThrottledValue } from "@/hooks/use-throttled-value";
import { getClient } from "@/lib/opencode-sdk";
// billingApi / invalidateAccountState / useQueryClient removed — billing is handled server-side by the router
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { useKortixComputerStore } from "@/stores/kortix-computer-store";
import { useMessageQueueStore } from "@/stores/message-queue-store";
import { useOpenCodePendingStore } from "@/stores/opencode-pending-store";
import { useOpenCodeSessionStatusStore } from "@/stores/opencode-session-status-store";
import { useSyncStore } from "@/stores/opencode-sync-store";
import { useServerStore } from "@/stores/server-store";
import { openTabAndNavigate } from "@/stores/tab-store";
// Shared UI primitives (framework-agnostic, reusable on mobile)
import {
	type AgentPart,
	type Command,
	collectTurnParts,
	type FilePart,
	findLastTextPart,
	formatCost,
	formatDuration,
	formatTokens,
	getHiddenToolParts,
	getPermissionForTool,
	getRetryInfo,
	getShellModePart,
	getTurnCost,
	getTurnError,
	getTurnStatus,
	getWorkingState,
	groupMessagesIntoTurns,
	hasDiffs,
	isAgentPart,
	isAttachment,
	isCompactionPart,
	isFilePart,
	isLastUserMessage,
	isPatchPart,
	isReasoningPart,
	isShellMode,
	isSnapshotPart,
	isTextPart,
	isToolPart,
	isToolPartHidden,
	type MessageWithParts,
	type Part,
	type PartWithMessage,
	type PatchPart,
	type PermissionRequest,
	type QuestionRequest,
	type RetryInfo,
	type SnapshotPart,
	shouldShowToolPart,
	splitUserParts,
	type TextPart,
	type ToolPart,
	type Turn,
	type TurnCostInfo,
} from "@/ui";

// ============================================================================
// Sub-Session / Fork Breadcrumb
// ============================================================================

// SubSessionBar removed — subsessions now use SessionSiteHeader + chat input indicator

// ============================================================================
// Fork Context Divider — shown at the top of the message list in forked sessions
// ============================================================================

function ForkContextDivider({ parentID }: { parentID: string }) {
	const { data: parentSession } = useOpenCodeSession(parentID);
	const parentTitle = parentSession?.title || "Parent session";

	return (
		<div className="flex items-center gap-3 py-2 mb-2">
			<div className="flex-1 h-px bg-border/50" />
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						onClick={() =>
							parentSession &&
							openTabAndNavigate({
								id: parentSession.id,
								title: parentSession.title || "Parent session",
								type: "session",
								href: `/sessions/${parentSession.id}`,
								serverId: useServerStore.getState().activeServerId,
							})
						}
						className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/40 hover:bg-muted/80 transition-colors cursor-pointer"
					>
						<GitFork className="size-3 text-muted-foreground/60" />
						<span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
							Forked from
						</span>
						<span className="text-[10px] font-medium text-muted-foreground max-w-[150px] truncate">
							{parentTitle}
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="text-xs">
					Go to parent session: {parentTitle}
				</TooltipContent>
			</Tooltip>
			<div className="flex-1 h-px bg-border/50" />
		</div>
	);
}

// ============================================================================
// Optimistic answers cache
// ============================================================================
// When a user answers a question, we save the answers here immediately.
// This survives SSE `message.part.updated` events that may overwrite the
// tool part's state before the server has merged the answers.  The cache
// is keyed by the question tool part's `id` (stable across updates).
// Entries are cleaned up once the server's authoritative part arrives with
// real `metadata.answers`.

const optimisticAnswersCache = new Map<string, { answers: string[][]; input: Record<string, unknown> }>();

// ============================================================================
// Parse answers from the question tool's output string
// ============================================================================
// When metadata.answers is missing (e.g. after page reload, or the server
// never finalized the tool part), we can try to extract answers from the
// output string. The server formats it as:
//   "User has answered your questions: \"Q1\"=\"A1\". You can now continue..."
// This is a best-effort parser; if it can't match, returns null.

function parseAnswersFromOutput(
	output: string,
	input?: { questions?: Array<{ question: string }> },
): string[][] | null {
	if (!output) return null;

	const questions = input?.questions;
	if (!questions || questions.length === 0) return null;

	// Try to extract "question"="answer" pairs from the output
	const pairRegex = /"([^"]*)"="([^"]*)"/g;
	const pairs: { question: string; answer: string }[] = [];
	let match;
	while ((match = pairRegex.exec(output)) !== null) {
		pairs.push({ question: match[1], answer: match[2] });
	}

	if (pairs.length > 0) {
		// Match pairs to input questions by order (they correspond 1:1)
		return questions.map((_, i) => {
			const pair = pairs[i];
			return pair ? [pair.answer] : [];
		});
	}

	// Fallback: if we can't parse pairs but the output mentions "answered",
	// return a placeholder to indicate the question was answered
	if (output.toLowerCase().includes("answered")) {
		return questions.map(() => ["Answered"]);
	}

	return null;
}

// ============================================================================
// Answered question card — collapsible summary of completed Q&A
// ============================================================================

function AnsweredQuestionCard({ part, defaultExpanded = false }: { part: ToolPart; defaultExpanded?: boolean }) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const input = (part.state as any)?.input ?? {};
	const metadata = (part.state as any)?.metadata ?? {};
	const questions: Array<{ question: string; options?: { label: string }[] }> =
		Array.isArray(input.questions) ? input.questions : [];
	const answers: string[][] = Array.isArray(metadata.answers) ? metadata.answers : [];
	if (questions.length === 0 || answers.length === 0) return null;

	const answeredCount = answers.filter((a) => a.length > 0).length;

	return (
		<div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
			<button
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer hover:bg-muted/30 transition-colors"
			>
				<MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
				<span className="text-xs font-medium text-foreground">Questions</span>
				<span className="text-[11px] text-muted-foreground">{answeredCount} answered</span>
				<ChevronDown className={cn('size-3 text-muted-foreground ml-auto transition-transform', expanded && 'rotate-180')} />
			</button>
			{expanded && (
				<div className="border-t border-border/30 divide-y divide-border/30">
					{questions.map((q, i) => {
						const answer = answers[i] || [];
						const answerText = answer.join(', ') || 'No answer';
						return (
							<div key={i} className="px-3.5 py-2.5">
								<div className="text-xs text-muted-foreground">{q.question}</div>
								<div className="text-xs font-medium text-foreground mt-0.5">{answerText}</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Highlight @mentions in plain text (for optimistic & user messages)
// ============================================================================

function HighlightMentions({
	text,
	agentNames,
	onFileClick,
}: {
	text: string;
	agentNames?: string[];
	onFileClick?: (path: string) => void;
}) {
	// Strip session ref XML before processing mentions
	const { cleanText, sessions } = useMemo(
		() => parseSessionReferences(text),
		[text],
	);

	const segments = useMemo(() => {
		if (!cleanText)
			return [
				{
					text: cleanText,
					type: undefined as "file" | "agent" | "session" | undefined,
				},
			];

		// Detect session @mentions first (titles can contain spaces)
		type MentionType = "file" | "agent" | "session";
		const sessionDetected: { start: number; end: number; type: MentionType }[] =
			[];
		for (const s of sessions) {
			const needle = `@${s.title}`;
			const idx = cleanText.indexOf(needle);
			if (idx !== -1) {
				sessionDetected.push({
					start: idx,
					end: idx + needle.length,
					type: "session",
				});
			}
		}

		const agentSet = new Set(agentNames || []);
		const mentionRegex = /@(\S+)/g;
		const detected: { start: number; end: number; type: MentionType }[] = [
			...sessionDetected,
		];
		let match: RegExpExecArray | null;
		while ((match = mentionRegex.exec(cleanText)) !== null) {
			const mStart = match.index;
			// Skip if overlaps with a session mention
			if (sessionDetected.some((s) => mStart >= s.start && mStart < s.end))
				continue;
			const name = match[1];
			detected.push({
				start: mStart,
				end: match.index + match[0].length,
				type: agentSet.has(name) ? "agent" : "file",
			});
		}
		if (detected.length === 0) return [{ text, type: undefined }];

		detected.sort((a, b) => a.start - b.start || b.end - a.end);
		const result: { text: string; type?: MentionType }[] = [];
		let lastIndex = 0;
		for (const ref of detected) {
			if (ref.start < lastIndex) continue;
			if (ref.start > lastIndex)
				result.push({ text: cleanText.slice(lastIndex, ref.start) });
			result.push({
				text: cleanText.slice(ref.start, ref.end),
				type: ref.type,
			});
			lastIndex = ref.end;
		}
		if (lastIndex < cleanText.length)
			result.push({ text: cleanText.slice(lastIndex) });
		return result;
	}, [cleanText, agentNames, sessions]);

	return (
		<>
			{segments.map((seg, i) =>
				seg.type === "file" && onFileClick ? (
					<span
						key={i}
						className="text-blue-500 font-medium cursor-pointer hover:underline"
						onClick={(e) => {
							e.stopPropagation();
							onFileClick(seg.text.replace(/^@/, ""));
						}}
					>
						{seg.text}
					</span>
				) : seg.type === "session" ? (
					<span
						key={i}
						className="text-emerald-500 font-medium cursor-pointer hover:underline"
						onClick={(e) => {
							e.stopPropagation();
							const title = seg.text.replace(/^@/, "");
							const ref = sessions.find((s) => s.title === title);
							if (ref) {
								openTabAndNavigate({
									id: ref.id,
									title: ref.title || "Session",
									type: "session",
									href: `/sessions/${ref.id}`,
									serverId: useServerStore.getState().activeServerId,
								});
							}
						}}
					>
						{seg.text}
					</span>
				) : (
					<span
						key={i}
						className={cn(
							seg.type === "file" && "text-blue-500 font-medium",
							seg.type === "agent" && "text-purple-500 font-medium",
						)}
					>
						{seg.text}
					</span>
				),
			)}
		</>
	);
}

// ============================================================================
// Parse <file> XML references from uploaded file text parts
// ============================================================================

interface ParsedFileRef {
	path: string;
	mime: string;
	filename: string;
}

const FILE_TAG_REGEX =
	/<file\s+path="([^"]*?)"\s+mime="([^"]*?)"\s+filename="([^"]*?)">\s*[\s\S]*?<\/file>/g;

function parseFileReferences(text: string): {
	cleanText: string;
	files: ParsedFileRef[];
} {
	const files: ParsedFileRef[] = [];
	const cleanText = text
		.replace(FILE_TAG_REGEX, (_, path, mime, filename) => {
			files.push({ path, mime, filename });
			return "";
		})
		.trim();
	return { cleanText, files };
}

// ============================================================================
// Parse <session_ref> XML tags from session mention text parts
// ============================================================================

interface ParsedSessionRef {
	id: string;
	title: string;
}

function parseSessionReferences(text: string): {
	cleanText: string;
	sessions: ParsedSessionRef[];
} {
	const sessions: ParsedSessionRef[] = [];
	let cleaned = text.replace(
		/<session_ref\s+id="([^"]*?)"\s+title="([^"]*?)"\s*\/>/g,
		(_, id, title) => {
			sessions.push({ id, title });
			return "";
		},
	);
	// Strip the instruction header text
	cleaned = cleaned
		.replace(
			/\n*Referenced sessions \(use the session_context tool to fetch details when needed\):\n?/g,
			"",
		)
		.trim();
	return { cleanText: cleaned, sessions };
}

// ============================================================================
// Parse <dcp-notification> XML tags from DCP plugin messages
// ============================================================================

interface DCPPrunedItem {
	tool: string;
	description: string;
}

interface DCPNotification {
	type: "prune" | "compress";
	tokensSaved: number;
	batchSaved: number;
	prunedCount: number;
	extractedTokens: number;
	reason?: string;
	items: DCPPrunedItem[];
	distilled?: string;
	// compress-specific
	messagesCount?: number;
	toolsCount?: number;
	topic?: string;
	summary?: string;
}

const DCP_TAG_REGEX =
	/<dcp-notification\s+([^>]*)>([\s\S]*?)<\/dcp-notification>/g;
const DCP_ITEM_REGEX =
	/<dcp-item\s+tool="([^"]*?)"\s+description="([^"]*?)"\s*\/>/g;
const DCP_DISTILLED_REGEX = /<dcp-distilled>([\s\S]*?)<\/dcp-distilled>/;
const DCP_SUMMARY_REGEX = /<dcp-summary>([\s\S]*?)<\/dcp-summary>/;

function unescapeXml(str: string): string {
	return str
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function parseAttr(attrs: string, name: string): string | undefined {
	const re = new RegExp(`${name}="([^"]*?)"`);
	const m = attrs.match(re);
	return m ? unescapeXml(m[1]) : undefined;
}

// Legacy DCP format: "▣ DCP | ~12.5K tokens saved total" (pre-XML version)
const DCP_LEGACY_REGEX = /^▣ DCP \| ~([\d.]+K?) tokens saved total/;
const DCP_LEGACY_PRUNING_REGEX =
	/▣ Pruning \(~([\d.]+K?) tokens(?:, distilled ([\d.]+K?) tokens)?\)(?:\s*—\s*(.+))?/;
const DCP_LEGACY_ITEM_REGEX = /→\s+(\S+?):\s+(.+)/g;

function parseLegacyDCPNotification(text: string): DCPNotification | null {
	const headerMatch = text.match(DCP_LEGACY_REGEX);
	if (!headerMatch) return null;

	const tokenStr = headerMatch[1];
	const tokensSaved = tokenStr.endsWith("K")
		? Math.round(parseFloat(tokenStr.slice(0, -1)) * 1000)
		: parseInt(tokenStr, 10);

	const pruningMatch = text.match(DCP_LEGACY_PRUNING_REGEX);
	let batchSaved = 0;
	let extractedTokens = 0;
	let reason: string | undefined;
	if (pruningMatch) {
		const batchStr = pruningMatch[1];
		batchSaved = batchStr.endsWith("K")
			? Math.round(parseFloat(batchStr.slice(0, -1)) * 1000)
			: parseInt(batchStr, 10);
		if (pruningMatch[2]) {
			const extStr = pruningMatch[2];
			extractedTokens = extStr.endsWith("K")
				? Math.round(parseFloat(extStr.slice(0, -1)) * 1000)
				: parseInt(extStr, 10);
		}
		reason = pruningMatch[3]?.trim();
	}

	const items: DCPPrunedItem[] = [];
	let itemMatch;
	DCP_LEGACY_ITEM_REGEX.lastIndex = 0;
	while ((itemMatch = DCP_LEGACY_ITEM_REGEX.exec(text)) !== null) {
		items.push({ tool: itemMatch[1], description: itemMatch[2].trim() });
	}

	// Check for compress format
	const isCompress = text.includes("▣ Compressing");

	return {
		type: isCompress ? "compress" : "prune",
		tokensSaved,
		batchSaved,
		prunedCount: items.length,
		extractedTokens,
		reason,
		items,
	};
}

function parseDCPNotifications(text: string): {
	cleanText: string;
	notifications: DCPNotification[];
} {
	const notifications: DCPNotification[] = [];

	// First try XML format
	const cleanText = text
		.replace(DCP_TAG_REGEX, (_, attrs: string, body: string) => {
			const type = (parseAttr(attrs, "type") || "prune") as
				| "prune"
				| "compress";
			const tokensSaved = parseInt(parseAttr(attrs, "tokens-saved") || "0", 10);
			const batchSaved = parseInt(parseAttr(attrs, "batch-saved") || "0", 10);
			const prunedCount = parseInt(parseAttr(attrs, "pruned-count") || "0", 10);
			const extractedTokens = parseInt(
				parseAttr(attrs, "extracted-tokens") || "0",
				10,
			);
			const reason = parseAttr(attrs, "reason");

			// Parse items
			const items: DCPPrunedItem[] = [];
			let itemMatch;
			DCP_ITEM_REGEX.lastIndex = 0;
			while ((itemMatch = DCP_ITEM_REGEX.exec(body)) !== null) {
				items.push({
					tool: unescapeXml(itemMatch[1]),
					description: unescapeXml(itemMatch[2]),
				});
			}

			// Parse distilled
			const distilledMatch = body.match(DCP_DISTILLED_REGEX);
			const distilled = distilledMatch
				? unescapeXml(distilledMatch[1])
				: undefined;

			// Compress-specific
			const messagesCount =
				parseInt(parseAttr(attrs, "messages-count") || "0", 10) || undefined;
			const toolsCount =
				parseInt(parseAttr(attrs, "tools-count") || "0", 10) || undefined;
			const topic = parseAttr(attrs, "topic");
			const summaryMatch = body.match(DCP_SUMMARY_REGEX);
			const summary = summaryMatch ? unescapeXml(summaryMatch[1]) : undefined;

			notifications.push({
				type,
				tokensSaved,
				batchSaved,
				prunedCount,
				extractedTokens,
				reason,
				items,
				distilled,
				messagesCount,
				toolsCount,
				topic,
				summary,
			});
			return "";
		})
		.trim();

	// If no XML notifications found, try legacy format
	if (notifications.length === 0 && cleanText) {
		const legacy = parseLegacyDCPNotification(cleanText);
		if (legacy) {
			notifications.push(legacy);
			return { cleanText: "", notifications };
		}
	}

	return { cleanText, notifications };
}

// ============================================================================
// DCP Notification Card — styled component for pruning/compress events
// ============================================================================

const DCP_REASON_LABELS: Record<string, string> = {
	completion: "Task Complete",
	noise: "Noise Removal",
	extraction: "Extraction",
};

function formatDCPTokens(tokens: number): string {
	if (tokens >= 1000) {
		const k = (tokens / 1000).toFixed(1).replace(".0", "");
		return `${k}K`;
	}
	return tokens.toString();
}

function DCPNotificationCard({
	notification,
}: {
	notification: DCPNotification;
}) {
	const [expanded, setExpanded] = useState(false);
	const isPrune = notification.type === "prune";
	const hasItems = notification.items.length > 0;
	const hasDetails = hasItems || notification.distilled || notification.summary;

	return (
		<div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
			{/* Header */}
			<button
				onClick={() => hasDetails && setExpanded(!expanded)}
				className={cn(
					"flex items-center gap-2 w-full px-3 py-2 border-b border-border/40 bg-muted/30",
					hasDetails && "cursor-pointer hover:bg-muted/50 transition-colors",
				)}
			>
				<Scissors className="size-3.5 text-muted-foreground/70 flex-shrink-0" />
				<span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
					{isPrune ? "Context Pruned" : "Context Compressed"}
				</span>

				{/* Stats pills */}
				<div className="flex items-center gap-1.5 ml-auto">
					{notification.reason && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/70">
							{DCP_REASON_LABELS[notification.reason] || notification.reason}
						</span>
					)}
					{isPrune && notification.prunedCount > 0 && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">
							{notification.prunedCount} pruned
						</span>
					)}
					{!isPrune &&
						notification.messagesCount &&
						notification.messagesCount > 0 && (
							<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
								{notification.messagesCount} msgs
							</span>
						)}
					{notification.batchSaved > 0 && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
							-{formatDCPTokens(notification.batchSaved)} tokens
						</span>
					)}
					<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
						{formatDCPTokens(notification.tokensSaved)} saved
					</span>
					{hasDetails && (
						<ChevronDown
							className={cn(
								"size-3 text-muted-foreground/50 transition-transform",
								expanded && "rotate-180",
							)}
						/>
					)}
				</div>
			</button>

			{/* Expandable details */}
			{expanded && hasDetails && (
				<div className="px-3 py-2 space-y-2">
					{/* Pruned items list */}
					{hasItems && (
						<div className="space-y-0.5">
							{notification.items.map((item, i) => (
								<div
									key={i}
									className="flex items-center gap-2 text-[11px] text-muted-foreground/80"
								>
									<span className="text-muted-foreground/40">&rarr;</span>
									<span className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground/70">
										{item.tool}
									</span>
									{item.description && (
										<span className="truncate max-w-[300px]">
											{item.description}
										</span>
									)}
								</div>
							))}
						</div>
					)}

					{/* Compress topic */}
					{notification.topic && (
						<div className="text-[11px] text-muted-foreground/80">
							<span className="text-muted-foreground/50">Topic:</span>{" "}
							<span>{notification.topic}</span>
						</div>
					)}

					{/* Distilled content */}
					{notification.distilled && (
						<div className="mt-1.5 border-t border-border/30 pt-1.5">
							<div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">
								Distilled
							</div>
							<div className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
								{notification.distilled}
							</div>
						</div>
					)}

					{/* Compress summary */}
					{notification.summary && (
						<div className="mt-1.5 border-t border-border/30 pt-1.5">
							<div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">
								Summary
							</div>
							<div className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
								{notification.summary}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Edit Part Dialog — inline editing for text parts
// ============================================================================

function EditPartDialog({
	open,
	onOpenChange,
	initialText,
	onSave,
	loading,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialText: string;
	onSave: (text: string) => void;
	loading?: boolean;
}) {
	const [text, setText] = useState(initialText);

	// Reset text when dialog opens with new content
	useEffect(() => {
		if (open) setText(initialText);
	}, [open, initialText]);

	const handleSave = () => {
		const trimmed = text.trim();
		if (trimmed && trimmed !== initialText) {
			onSave(trimmed);
		} else {
			onOpenChange(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit message</DialogTitle>
					<DialogDescription>
						Modify the text content of this message part.
					</DialogDescription>
				</DialogHeader>
				<div className="py-2">
					<Textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						className="min-h-[120px] text-sm"
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								handleSave();
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={loading}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={loading || !text.trim() || text.trim() === initialText}
					>
						{loading ? (
							<Loader2 className="size-3.5 animate-spin mr-1.5" />
						) : null}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ============================================================================
// Part Actions — edit/delete actions for individual message parts
// ============================================================================

function PartActions({
	part,
	messageId,
	sessionId,
	isBusy,
	className,
}: {
	part: Part;
	messageId: string;
	sessionId: string;
	isBusy: boolean;
	className?: string;
}) {
	const [editOpen, setEditOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const updatePart = useUpdatePart();
	const deletePart = useDeletePart();

	// Only text parts are editable
	const isEditable = isTextPart(part) && !!(part as TextPart).text?.trim();
	const partText = isEditable ? (part as TextPart).text : "";

	const handleUpdate = useCallback(
		(newText: string) => {
			updatePart.mutate(
				{
					sessionId,
					messageId,
					partId: part.id,
					part: {
						...part,
						text: newText,
						metadata: { ...((part as any).metadata || {}), edited: true },
					} as any,
				},
				{
					onSuccess: () => setEditOpen(false),
				},
			);
		},
		[sessionId, messageId, part, updatePart],
	);

	const handleDelete = useCallback(() => {
		deletePart.mutate(
			{
				sessionId,
				messageId,
				partId: part.id,
			},
			{
				onSuccess: () => setDeleteDialogOpen(false),
			},
		);
	}, [sessionId, messageId, part.id, deletePart]);

	return (
		<>
			<div className={cn("flex items-center gap-0.5", className)}>
				{/* Edit button — only for text parts */}
				{isEditable && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								onClick={() => setEditOpen(true)}
								disabled={isBusy}
								className={cn(
									"p-1.5 rounded-md transition-colors cursor-pointer",
									"text-muted-foreground/50 hover:text-foreground hover:bg-muted/60",
									"disabled:opacity-30 disabled:cursor-not-allowed",
								)}
							>
								<Pencil className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							Edit
						</TooltipContent>
					</Tooltip>
				)}

				{/* Delete button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							onClick={() => setDeleteDialogOpen(true)}
							disabled={isBusy}
							className={cn(
								"p-1.5 rounded-md transition-colors cursor-pointer",
								"text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10",
								"disabled:opacity-30 disabled:cursor-not-allowed",
							)}
						>
							<Trash2 className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" className="text-xs">
						Delete
					</TooltipContent>
				</Tooltip>
			</div>

			{/* Edit dialog */}
			{isEditable && (
				<EditPartDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					initialText={partText}
					onSave={handleUpdate}
					loading={updatePart.isPending}
				/>
			)}

			{/* Delete confirmation */}
			<ConfirmDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				title="Delete message part"
				description="This will permanently remove this part from the message. This action cannot be undone."
				action={handleDelete}
				actionLabel="Delete"
				variant="destructive"
				loading={deletePart.isPending}
			/>
		</>
	);
}

// ============================================================================
// User Message Row
// ============================================================================

/**
 * Detect if user message text matches a known command template.
 * Returns the command name + extracted args, or undefined if no match.
 * Works by splitting each command template at its first placeholder ($1 or $ARGUMENTS)
 * and checking if the message text starts with that prefix.
 */
function detectCommandFromText(
	rawText: string,
	commands?: Command[],
): { name: string; args?: string } | undefined {
	if (!commands || !rawText || rawText.length < 50) return undefined;

	for (const cmd of commands) {
		if (!cmd.template) continue;
		const tpl = cmd.template;

		// Find the first placeholder position ($1, $2, ..., $ARGUMENTS)
		const placeholderMatch = tpl.match(/\$(\d+|\bARGUMENTS\b)/);
		// Use the text before the first placeholder as the prefix to match
		const prefix = placeholderMatch
			? tpl.slice(0, placeholderMatch.index).trimEnd()
			: tpl.trimEnd();

		// Require a meaningful prefix (at least 20 chars) to avoid false positives
		if (prefix.length < 20) continue;

		if (rawText.startsWith(prefix)) {
			// Extract the user's arguments: text after the template prefix (approximate)
			// For templates ending with the placeholder, the args are what comes after the prefix
			let args: string | undefined;
			if (placeholderMatch) {
				const afterPrefix = rawText.slice(prefix.length).trim();
				// The args are at the end; try to extract the last meaningful section
				const lastNewlineBlock = afterPrefix.split("\n\n").pop()?.trim();
				if (lastNewlineBlock && lastNewlineBlock.length < 200) {
					args = lastNewlineBlock;
				}
			}
			return { name: cmd.name, args };
		}
	}
	return undefined;
}

function UserMessageRow({
	message,
	agentNames,
	commandInfo,
	commands,
}: {
	message: MessageWithParts;
	agentNames?: string[];
	commandInfo?: { name: string; args?: string };
	commands?: Command[];
}) {
	const openFileInComputer = useKortixComputerStore(
		(s) => s.openFileInComputer,
	);
	const { attachments, stickyParts } = useMemo(
		() => splitUserParts(message.parts),
		[message.parts],
	);

	// Extract text from sticky parts, parse out <file> and <session_ref> XML references
	// Filter out both synthetic AND ignored parts from user-visible text
	const textParts = stickyParts
		.filter(isTextPart)
		.filter(
			(p) =>
				(p as TextPart).text?.trim() &&
				!(p as TextPart).synthetic &&
				!(p as any).ignored,
		);
	const rawText = textParts.map((p) => (p as TextPart).text).join("\n");
	const { cleanText: textAfterFiles, files: uploadedFiles } = useMemo(
		() => parseFileReferences(rawText),
		[rawText],
	);
	const { cleanText: text, sessions: sessionRefs } = useMemo(
		() => parseSessionReferences(textAfterFiles),
		[textAfterFiles],
	);

	// Resolve effective command info: use runtime-tracked info or fall back to template matching
	const effectiveCommandInfo = useMemo(
		() => commandInfo ?? detectCommandFromText(rawText, commands),
		[commandInfo, rawText, commands],
	);

	// Extract DCP notifications from ignored text parts (DCP plugin sends ignored user messages)
	const ignoredTextParts = stickyParts
		.filter(isTextPart)
		.filter((p) => (p as any).ignored && (p as TextPart).text?.trim());
	const ignoredRawText = ignoredTextParts
		.map((p) => (p as TextPart).text)
		.join("\n");
	const dcpNotifications = useMemo(() => {
		if (!ignoredRawText) return [];
		return parseDCPNotifications(ignoredRawText).notifications;
	}, [ignoredRawText]);

	// Check if any text part was edited
	const isEdited = textParts.some((p) => (p as any).metadata?.edited);

	// Inline file references
	const inlineFiles = stickyParts.filter(isFilePart) as FilePart[];
	const filesWithSource = inlineFiles.filter(
		(f) =>
			f.source?.text?.start !== undefined && f.source?.text?.end !== undefined,
	);

	// Agent mentions
	const agentParts = stickyParts.filter(isAgentPart) as AgentPart[];

	const [expanded, setExpanded] = useState(false);
	const [canExpand, setCanExpand] = useState(false);
	const [copied, setCopied] = useState(false);
	const textRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = textRef.current;
		if (!el || expanded) return;
		setCanExpand(el.scrollHeight > el.clientHeight + 2);
	}, [text, expanded]);

	const handleCopy = async () => {
		if (!text) return;
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// Build highlighted text segments
	const segments = useMemo(() => {
		if (!text) return [];
		type SegType = "file" | "agent" | "session";

		// Detect session @mentions first (titles can contain spaces, so indexOf is used)
		const sessionDetected: { start: number; end: number; type: SegType }[] = [];
		for (const s of sessionRefs) {
			const needle = `@${s.title}`;
			const idx = text.indexOf(needle);
			if (idx !== -1) {
				sessionDetected.push({
					start: idx,
					end: idx + needle.length,
					type: "session",
				});
			}
		}

		// Collect server-provided source refs (file/agent), filtering out any that
		// overlap with a session mention (the server sees @Title as a file mention
		// for the first word only — the session range is more accurate).
		const serverRefs = [
			...filesWithSource.map((f) => ({
				start: f.source!.text!.start,
				end: f.source!.text!.end,
				type: "file" as SegType,
			})),
			...agentParts
				.filter(
					(a) => a.source?.start !== undefined && a.source?.end !== undefined,
				)
				.map((a) => ({
					start: a.source!.start,
					end: a.source!.end,
					type: "agent" as SegType,
				})),
		].filter(
			(r) =>
				!sessionDetected.some((s) => r.start >= s.start && r.start < s.end),
		);

		// Merge session + server refs
		const allRefs = [...sessionDetected, ...serverRefs];

		if (allRefs.length > 0) {
			allRefs.sort((a, b) => a.start - b.start || b.end - a.end);
			const result: { text: string; type?: SegType }[] = [];
			let lastIndex = 0;
			for (const ref of allRefs) {
				if (ref.start < lastIndex) continue;
				if (ref.start > lastIndex)
					result.push({ text: text.slice(lastIndex, ref.start) });
				result.push({ text: text.slice(ref.start, ref.end), type: ref.type });
				lastIndex = ref.end;
			}
			if (lastIndex < text.length) result.push({ text: text.slice(lastIndex) });
			return result;
		}

		// Fallback: detect @mentions from text using regex
		const agentSet = new Set(agentNames || []);
		const mentionRegex = /@(\S+)/g;
		const detected: { start: number; end: number; type: SegType }[] = [];
		let match: RegExpExecArray | null;
		while ((match = mentionRegex.exec(text)) !== null) {
			const mStart = match.index;
			detected.push({
				start: mStart,
				end: match.index + match[0].length,
				type: agentSet.has(match[1]) ? "agent" : "file",
			});
		}

		if (detected.length === 0) return [{ text, type: undefined }];

		detected.sort((a, b) => a.start - b.start || b.end - a.end);
		const result: { text: string; type?: SegType }[] = [];
		let lastIndex = 0;
		for (const ref of detected) {
			if (ref.start < lastIndex) continue;
			if (ref.start > lastIndex)
				result.push({ text: text.slice(lastIndex, ref.start) });
			result.push({ text: text.slice(ref.start, ref.end), type: ref.type });
			lastIndex = ref.end;
		}
		if (lastIndex < text.length) result.push({ text: text.slice(lastIndex) });
		return result;
	}, [text, filesWithSource, agentParts, agentNames, sessionRefs]);

	// If the message is purely DCP notifications (no real user content), render only the cards
	const hasUserContent = !!(
		text ||
		uploadedFiles.length > 0 ||
		sessionRefs.length > 0 ||
		attachments.length > 0
	);

	if (!hasUserContent && dcpNotifications.length > 0) {
		return (
			<div className="flex flex-col gap-1.5 w-full">
				{dcpNotifications.map((n, i) => (
					<DCPNotificationCard key={i} notification={n} />
				))}
			</div>
		);
	}

	// Command messages: render as a right-aligned card instead of the raw template text
	if (effectiveCommandInfo) {
		return (
			<div className="flex flex-col items-end gap-1">
				<div className="inline-flex flex-col gap-1.5 px-4 py-2.5 rounded-2xl border border-border/60 bg-muted/40">
					<div className="flex items-center gap-2">
						<Terminal className="size-3.5 text-muted-foreground shrink-0" />
						<span className="font-mono text-sm text-foreground">
							/{effectiveCommandInfo.name}
						</span>
					</div>
					{effectiveCommandInfo.args && (
						<div
							className="text-xs text-muted-foreground pl-5.5 break-words max-w-[400px]"
							style={{ paddingLeft: "1.375rem" }}
						>
							{effectiveCommandInfo.args}
						</div>
					)}
				</div>
				{/* DCP notifications from ignored parts */}
				{dcpNotifications.length > 0 && (
					<div className="flex flex-col gap-1.5 w-full mt-1">
						{dcpNotifications.map((n, i) => (
							<DCPNotificationCard key={i} notification={n} />
						))}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col items-end gap-1">
			<div
				className={cn(
					"flex flex-col max-w-[90%] rounded-3xl rounded-br-lg bg-card border overflow-hidden",
					canExpand && "cursor-pointer hover:bg-card/80 transition-colors",
				)}
				onClick={() => canExpand && setExpanded(!expanded)}
			>
				{/* Attachment thumbnails (images/PDFs) */}
				{attachments.length > 0 && (
					<div className="flex gap-2 p-3 pb-0 flex-wrap">
						{attachments.map((file) => (
							<div
								key={file.id}
								className="rounded-lg overflow-hidden border border-border/50"
							>
								{file.mime?.startsWith("image/") && file.url ? (
									<ImagePreview
										src={file.url}
										alt={file.filename ?? "Attachment"}
									>
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img
											src={file.url}
											alt={file.filename ?? "Attachment"}
											className="max-h-32 max-w-48 object-cover"
										/>
									</ImagePreview>
								) : file.mime === "application/pdf" ? (
									<div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
										<FileText className="size-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground">
											{file.filename || "PDF"}
										</span>
									</div>
								) : (
									<div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
										<ImageIcon className="size-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground">
											{file.filename || "File"}
										</span>
									</div>
								)}
							</div>
						))}
					</div>
				)}

				{/* Uploaded file references (from <file> XML tags) */}
				{uploadedFiles.length > 0 && (
					<div className="flex gap-2 p-3 pb-0 flex-wrap">
						{uploadedFiles.map((f, i) => (
							<div
								key={i}
								className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30"
							>
								<FileText className="size-4 text-muted-foreground shrink-0" />
								<span className="text-xs text-muted-foreground truncate max-w-[200px]">
									{f.filename}
								</span>
							</div>
						))}
					</div>
				)}

				{/* Text content */}
				{text && (
					<div className="relative group px-4 py-3">
						<div
							ref={textRef}
							className={cn(
								"text-sm leading-relaxed whitespace-pre-wrap break-words min-w-0",
								!expanded && "max-h-[200px] overflow-hidden",
							)}
						>
							{segments.length > 0 ? (
								segments.map((seg, i) =>
									seg.type === "file" ? (
										<span
											key={i}
											className="text-blue-500 font-medium cursor-pointer hover:underline"
											onClick={(e) => {
												e.stopPropagation();
												openFileInComputer(seg.text.replace(/^@/, ""));
											}}
										>
											{seg.text}
										</span>
									) : seg.type === "session" ? (
										<span
											key={i}
											className="text-emerald-500 font-medium cursor-pointer hover:underline"
											onClick={(e) => {
												e.stopPropagation();
												const title = seg.text.replace(/^@/, "");
												const ref = sessionRefs.find((s) => s.title === title);
												if (ref) {
													openTabAndNavigate({
														id: ref.id,
														title: ref.title || "Session",
														type: "session",
														href: `/sessions/${ref.id}`,
														serverId: useServerStore.getState().activeServerId,
													});
												}
											}}
										>
											{seg.text}
										</span>
									) : (
										<span
											key={i}
											className={cn(
												seg.type === "agent" && "text-purple-500 font-medium",
											)}
										>
											{seg.text}
										</span>
									),
								)
							) : (
								<span>{text}</span>
							)}
						</div>

						{/* Gradient fade overlay for collapsed long messages */}
						{canExpand && !expanded && (
							<div className="absolute inset-x-0 bottom-3 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none" />
						)}

						{/* Expand/collapse indicator */}
						{canExpand && (
							<div className="absolute bottom-3 right-4 p-1 rounded-md bg-card/80 backdrop-blur-sm text-muted-foreground z-10">
								<ChevronDown
									className={cn(
										"size-3.5 transition-transform",
										expanded && "rotate-180",
									)}
								/>
							</div>
						)}
					</div>
				)}
			</div>
			{isEdited && (
				<span className="text-[10px] text-muted-foreground/50 pr-1">
					edited
				</span>
			)}

			{/* DCP notifications from ignored parts (rendered below user bubble if mixed) */}
			{dcpNotifications.length > 0 && (
				<div className="flex flex-col gap-1.5 w-full mt-1">
					{dcpNotifications.map((n, i) => (
						<DCPNotificationCard key={i} notification={n} />
					))}
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Throttled Markdown — limits re-renders during streaming (~30fps)
// ============================================================================

/**
 * Strip the incomplete trailing table row while streaming so the markdown
 * parser doesn't render broken borders / pipe characters.
 *
 * A markdown table row must start with `|` and end with `|` followed by a
 * newline. If the last line of the content looks like an incomplete row
 * (starts with `|` but doesn't end with `|`), we trim it. We also trim a
 * trailing separator row that is still being typed (e.g. `| --- | --`).
 */
function trimIncompleteTableRow(text: string): string {
	// Fast path: no pipe at all → nothing to trim
	if (!text.includes("|")) return text;

	const lines = text.split("\n");
	// Walk backwards and remove incomplete table lines from the end.
	// A table row must start AND end with `|` to be considered complete.
	while (lines.length > 0) {
		const last = lines[lines.length - 1];
		const trimmed = last.trim();
		// Empty trailing line — stop
		if (trimmed === "") break;
		// A complete table row/separator ends with `|`
		if (trimmed.startsWith("|") && !trimmed.endsWith("|")) {
			lines.pop();
		} else {
			break;
		}
	}
	return lines.join("\n");
}

function ThrottledMarkdown({
	content,
	isStreaming,
}: {
	content: string;
	isStreaming: boolean;
}) {
	const throttled = useThrottledValue(content, 33);
	const displayContent = isStreaming ? trimIncompleteTableRow(throttled) : content;
	return (
		<UnifiedMarkdown
			content={displayContent}
			isStreaming={isStreaming}
		/>
	);
}

// ============================================================================
// Session Turn — core turn component
// ============================================================================

interface SessionTurnProps {
	turn: Turn;
	allMessages: MessageWithParts[];
	sessionId: string;
	sessionStatus: import("@/ui").SessionStatus | undefined;
	permissions: PermissionRequest[];
	questions: QuestionRequest[];
	agentNames?: string[];
	/** Whether this is the first turn in the session */
	isFirstTurn: boolean;
	/** Whether the session is busy */
	isBusy: boolean;
	/** Whether the session is in a reverted state */
	isReverted: boolean;
	/** Whether this turn contains a compaction */
	isCompaction?: boolean;
	/** Fork the session at a specific message */
	onFork: (messageId: string) => Promise<void>;
	/** Revert the session to before a specific message */
	onRevert: (messageId: string) => Promise<void>;
	/** Providers data for the Connect Provider dialog */
	providers?: ProviderListResponse;
	/** Map of user message IDs to command info for rendering command pills */
	commandMessages?: Map<string, { name: string; args?: string }>;
	/** Available commands for template prefix matching (page refresh detection) */
	commands?: Command[];
	/** Permission reply handler */
	onPermissionReply: (
		requestId: string,
		reply: "once" | "always" | "reject",
	) => Promise<void>;
}

function SessionTurn({
	turn,
	allMessages,
	sessionId,
	sessionStatus,
	permissions,
	questions,
	agentNames,
	isFirstTurn,
	isBusy,
	isReverted,
	isCompaction,
	onFork,
	onRevert,
	providers,
	commandMessages,
	commands,
	onPermissionReply,
}: SessionTurnProps) {
	const [copied, setCopied] = useState(false);
	const [userCopied, setUserCopied] = useState(false);
	const [revertDialogOpen, setRevertDialogOpen] = useState(false);
	const [connectProviderOpen, setConnectProviderOpen] = useState(false);
	const [revertLoading, setRevertLoading] = useState(false);

	// Derived state from shared helpers
	const allParts = useMemo(() => collectTurnParts(turn), [turn]);
	// Check if there are visible steps that actually render inside the
	// collapsible steps section. Tool parts that are rendered elsewhere
	// (todowrite, task, question) don't count as "steps".
	const hasSteps = useMemo(() => {
		return allParts.some(({ part }) => {
			if (part.type === 'compaction' || part.type === 'snapshot' || part.type === 'patch') return true;
			if (isToolPart(part)) {
				if (part.tool === 'todowrite' || part.tool === 'task' || part.tool === 'question') return false;
				return shouldShowToolPart(part);
			}
			return false;
		});
	}, [allParts]);
	const isLast = useMemo(
		() => isLastUserMessage(turn.userMessage.info.id, allMessages),
		[turn.userMessage.info.id, allMessages],
	);
	// A turn is "working" when:
	// 1. The session status says busy/retry (via getWorkingState), OR
	// 2. This is the last turn AND the parent component says isBusy (e.g. we
	//    just sent a message but sessionStatus hasn't updated to busy yet).
	//    This covers the race between sending and the server acknowledging.
	const working = useMemo(
		() => getWorkingState(sessionStatus, isLast) || (isLast && isBusy),
		[sessionStatus, isLast, isBusy],
	);
	const lastTextPart = useMemo(() => findLastTextPart(allParts), [allParts]);
	const responseRaw = lastTextPart?.text ?? "";
	// Fallback: when aborted, collect ALL non-empty text parts if the
	// primary response is empty.  The last text part may have been lost
	// (timing between text-start and first text-delta) but earlier parts
	// might still have content.
	const abortedTextFallback = useMemo(() => {
		if (responseRaw) return ""; // primary response exists — no fallback needed
		// Only activate for aborted/errored turns
		const hasError = turn.assistantMessages.some(
			(m) => (m.info as any).error,
		);
		if (!hasError) return "";
		const texts: string[] = [];
		for (const { part } of allParts) {
			if (isTextPart(part) && part.text?.trim()) {
				texts.push(part.text);
			}
		}
		return texts.join("\n\n").trim();
	}, [responseRaw, allParts, turn.assistantMessages]);
	const response = working ? responseRaw : (responseRaw.trim() || abortedTextFallback);
	// Retry info (only on last turn)
	const retryInfo = useMemo(
		() => (isLast ? getRetryInfo(sessionStatus) : undefined),
		[sessionStatus, isLast],
	);

	// Cost info (only when not working)
	const costInfo = useMemo(
		() => (!working ? getTurnCost(allParts) : undefined),
		[allParts, working],
	);

	// Turn error — derived directly from message data (same approach as SolidJS reference).
	// Falls back to checking for dismissed question tool errors when no message-level error exists.
	const turnError = useMemo(() => {
		const msgError = getTurnError(turn);
		if (msgError) return msgError;
		// Check for dismissed question tool errors
		for (const msg of turn.assistantMessages) {
			for (const part of msg.parts) {
				if (part.type !== 'tool') continue;
				const tool = part as ToolPart;
				if (tool.tool === 'question' && tool.state.status === 'error' && 'error' in tool.state) {
					return (tool.state as { error: string }).error.replace(/^Error:\s*/, '');
				}
			}
		}
		return undefined;
	}, [turn]);

	// Shell mode detection
	const shellModePart = useMemo(() => getShellModePart(turn), [turn]);

	// Permission matching for this session (used for tool-level permission overlays)
	const nextPermission = useMemo(
		() => permissions.filter((p) => p.sessionID === sessionId)[0],
		[permissions, sessionId],
	);

	// Question matching for this turn (used to pass to ToolPartRenderer for forceOpen/locked state)
	const nextQuestion = useMemo(() => {
		const sessionQuestions = questions.filter((q) => q.sessionID === sessionId);
		if (sessionQuestions.length === 0) return undefined;
		const turnMessageIds = new Set(
			turn.assistantMessages.map((m) => m.info.id),
		);
		const matched = sessionQuestions.find(
			(q) => q.tool && turnMessageIds.has(q.tool.messageID),
		);
		if (matched) return matched;
		if (isLast) return sessionQuestions[0];
		return undefined;
	}, [questions, sessionId, turn.assistantMessages, isLast]);

	// Hidden tool parts (when permission/question is active)
	const hidden = useMemo(
		() => getHiddenToolParts(nextPermission, nextQuestion),
		[nextPermission, nextQuestion],
	);

	// Answered question parts — shown inline alongside streamed text.
	// Uses the optimisticAnswersCache as a fallback: when the user answers a
	// question we cache {answers, input} immediately. SSE message.part.updated
	// events can overwrite the tool part's state (wiping metadata.answers)
	// before the server has merged them. By checking the cache we guarantee
	// the answered card stays visible regardless of SSE timing.
	// Only skip tool parts whose callID matches a currently-pending question.
	const answeredQuestionParts = useMemo(() => {
		const pendingCallIds = new Set(
			questions
				.filter((q) => q.sessionID === sessionId)
				.map((q) => q.tool?.callID)
				.filter(Boolean),
		);

		// Collect ALL question tool parts first so we can determine which ones
		// were implicitly answered (i.e. the assistant continued past them).
		const questionInfos: {
			tool: ToolPart;
			msgId: string;
			msgIndex: number;
			partIndex: number;
		}[] = [];
		for (let mi = 0; mi < turn.assistantMessages.length; mi++) {
			const msg = turn.assistantMessages[mi];
			for (let pi = 0; pi < msg.parts.length; pi++) {
				const part = msg.parts[pi];
				if (part.type !== "tool") continue;
				const tool = part as ToolPart;
				if (tool.tool !== "question") continue;
				questionInfos.push({ tool, msgId: msg.info.id, msgIndex: mi, partIndex: pi });
			}
		}

		const result: { part: ToolPart; messageId: string }[] = [];
		for (const qInfo of questionInfos) {
			const { tool, msgId, msgIndex, partIndex } = qInfo;

			// Check if there are subsequent parts/messages AFTER this question
			// in the turn. If the assistant continued, this question was answered.
			const hasSubsequentContent = (() => {
				// Check for later parts in the same message
				const msg = turn.assistantMessages[msgIndex];
				for (let pi = partIndex + 1; pi < msg.parts.length; pi++) {
					const p = msg.parts[pi];
					if (p.type === "step-finish" || p.type === "step-start") continue;
					return true;
				}
				// Check for later messages in the turn
				return msgIndex < turn.assistantMessages.length - 1;
			})();

			const isPending = pendingCallIds.has(tool.callID);

			// Skip only if it IS the currently-pending question AND there's no
			// evidence it was already answered (no subsequent content).
			if (isPending && !hasSubsequentContent) continue;

			const serverAnswers = (tool.state as any)?.metadata?.answers;
			const cached = optimisticAnswersCache.get(tool.id);
			const toolOutput = (tool.state as any)?.output as string | undefined;

			if (serverAnswers && serverAnswers.length > 0) {
				// Server has real answers — clean up cache if present
				if (cached) optimisticAnswersCache.delete(tool.id);
				result.push({ part: tool, messageId: msgId });
			} else if (cached) {
				// Server hasn't confirmed yet — use cached answers.
				// Build a synthetic tool part with the cached data so
				// AnsweredQuestionCard can render.
				const syntheticPart = {
					...tool,
					state: {
						...(tool.state as any),
						status: "completed",
						input: cached.input,
						metadata: {
							...((tool.state as any)?.metadata ?? {}),
							answers: cached.answers,
						},
					},
				} as unknown as ToolPart;
				result.push({ part: syntheticPart, messageId: msgId });
			} else if (toolOutput && hasSubsequentContent) {
				// Question was answered (output exists and assistant continued)
				// but metadata.answers was never set (e.g. after page reload).
				// Parse answers from the output string as a fallback.
				const parsed = parseAnswersFromOutput(toolOutput, (tool.state as any)?.input);
				if (parsed) {
					const syntheticPart = {
						...tool,
						state: {
							...(tool.state as any),
							status: "completed",
							metadata: {
								...((tool.state as any)?.metadata ?? {}),
								answers: parsed,
							},
						},
					} as unknown as ToolPart;
					result.push({ part: syntheticPart, messageId: msgId });
				}
			} else if (!toolOutput && hasSubsequentContent) {
				// Question was implicitly answered (assistant continued past it)
				// but neither metadata.answers nor output is available.
				// Show a minimal answered card using the input questions
				// with placeholder answers extracted from context.
				const input = (tool.state as any)?.input;
				const questionsList: { question: string }[] = Array.isArray(input?.questions) ? input.questions : [];
				if (questionsList.length > 0) {
					const placeholderAnswers = questionsList.map(() => ["Answered"]);
					const syntheticPart = {
						...tool,
						state: {
							...(tool.state as any),
							status: "completed",
							metadata: {
								...((tool.state as any)?.metadata ?? {}),
								answers: placeholderAnswers,
							},
						},
					} as unknown as ToolPart;
					result.push({ part: syntheticPart, messageId: msgId });
				}
			}
		}
		return result;
	}, [questions, sessionId, turn.assistantMessages]);
	const answeredQuestionIds = useMemo(
		() => new Set(answeredQuestionParts.map(({ part }) => part.id)),
		[answeredQuestionParts],
	);

	// Inline content parts — interleaves text and answered question parts in natural order.
	// When a turn contains answered questions, we need to render text and questions
	// in their original order rather than extracting the last text as a separate "response".
	// This works both during streaming and after completion so that answered questions
	// stay in the correct position while the AI continues responding.
	// Important: for question parts we use the (possibly synthetic) part from
	// answeredQuestionParts — NOT the raw store part — so that optimistic
	// answers from the cache are included even if the server hasn't confirmed yet.
	const answeredQuestionPartsById = useMemo(
		() => new Map(answeredQuestionParts.map(({ part }) => [part.id, part])),
		[answeredQuestionParts],
	);
	const inlineContentParts = useMemo(() => {
		if (answeredQuestionParts.length === 0) return null;
		const items: Array<{ type: 'text'; part: TextPart; id: string } | { type: 'question'; part: ToolPart; id: string }> = [];
		for (const { part } of allParts) {
			if (isTextPart(part) && part.text?.trim()) {
				items.push({ type: 'text', part, id: part.id });
			} else if (isToolPart(part) && part.tool === 'question' && answeredQuestionPartsById.has(part.id)) {
				// Use the answered part (may be synthetic with cached answers)
				items.push({ type: 'question', part: answeredQuestionPartsById.get(part.id)!, id: part.id });
			}
		}
		// Only use inline rendering if there are both text and question items
		const hasText = items.some(i => i.type === 'text');
		const hasQuestion = items.some(i => i.type === 'question');
		if (!hasText || !hasQuestion) return null;
		return items;
	}, [allParts, answeredQuestionPartsById, answeredQuestionParts.length]);
	const shouldUseInlineContent = !hasSteps && !!inlineContentParts;

	const taskToolParts = useMemo(() => {
		return allParts.filter(({ part }) => isToolPart(part) && (part as ToolPart).tool === 'task');
	}, [allParts]);

	// Last assistant message ID — used for "fork from response" action
	const lastAssistantMessageId = useMemo(() => {
		const msgs = turn.assistantMessages;
		return msgs.length > 0 ? msgs[msgs.length - 1].info.id : undefined;
	}, [turn.assistantMessages]);

	// Whether the user message has any visible content (non-synthetic, non-ignored
	// text, or attachments). Background task notifications inject synthetic-only
	// user messages that should not render a user bubble.
	const hasVisibleUserContent = useMemo(() => {
		const parts = turn.userMessage.parts;
		// Parts not loaded yet (bridging / transient state) — assume visible
		// to prevent a flash where the bubble disappears momentarily.
		if (parts.length === 0) return true;
		// Has any non-synthetic, non-ignored text?
		const hasVisibleText = parts.some(
			(p) =>
				isTextPart(p) &&
				(p as TextPart).text?.trim() &&
				!(p as TextPart).synthetic &&
				!(p as any).ignored,
		);
		if (hasVisibleText) return true;
		// Has any attachment (image/PDF)?
		if (parts.some(isAttachment)) return true;
		// Has any agent part?
		if (parts.some(isAgentPart)) return true;
		return false;
	}, [turn.userMessage.parts]);

	// User message text — for copy action
	const userMessageText = useMemo(() => {
		const textParts = turn.userMessage.parts.filter(isTextPart) as TextPart[];
		return textParts
			.map((p) => p.text)
			.join("\n")
			.trim();
	}, [turn.userMessage.parts]);

	const handleCopyUser = async () => {
		if (!userMessageText) return;
		await navigator.clipboard.writeText(userMessageText);
		setUserCopied(true);
		setTimeout(() => setUserCopied(false), 2000);
	};

	// ---- Status throttling (2.5s) ----
	const lastStatusChangeRef = useRef(Date.now());
	const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const childMessages = undefined as MessageWithParts[] | undefined; // placeholder for child session delegation
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const rawStatus = useMemo(
		() => getTurnStatus(allParts, childMessages),
		[allParts],
	);
	const [throttledStatus, setThrottledStatus] = useState("");

	useEffect(() => {
		const newStatus = rawStatus;
		if (newStatus === throttledStatus || !newStatus) return;
		const elapsed = Date.now() - lastStatusChangeRef.current;
		if (elapsed >= 2500) {
			setThrottledStatus(newStatus);
			lastStatusChangeRef.current = Date.now();
		} else {
			clearTimeout(statusTimeoutRef.current);
			statusTimeoutRef.current = setTimeout(() => {
				setThrottledStatus(getTurnStatus(allParts, childMessages));
				lastStatusChangeRef.current = Date.now();
			}, 2500 - elapsed);
		}
		return () => clearTimeout(statusTimeoutRef.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [allParts, rawStatus, throttledStatus]);

	// ---- Retry countdown ----
	const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);
	useEffect(() => {
		if (!retryInfo) {
			setRetrySecondsLeft(0);
			return;
		}
		const update = () =>
			setRetrySecondsLeft(
				Math.max(0, Math.round((retryInfo.next - Date.now()) / 1000)),
			);
		update();
		const timer = setInterval(update, 1000);
		return () => clearInterval(timer);
	}, [retryInfo]);

	// ---- Duration ticking ----
	const [duration, setDuration] = useState("");
	useEffect(() => {
		const startTime = (turn.userMessage.info as any)?.time?.created;
		if (!startTime) return;

		if (!working) {
			const lastMsg = turn.assistantMessages[turn.assistantMessages.length - 1];
			const endTime =
				(lastMsg?.info as any)?.time?.completed ||
				(lastMsg?.info as any)?.time?.created ||
				startTime;
			setDuration(formatDuration(endTime - startTime));
			return;
		}
		const update = () => setDuration(formatDuration(Date.now() - startTime));
		update();
		const timer = setInterval(update, 1000);
		return () => clearInterval(timer);
	}, [working, turn]);

	// ---- Copy response ----
	const handleCopy = async () => {
		// When inline content is active, copy all text parts (not just the last one)
		const textToCopy = inlineContentParts
			? inlineContentParts
				.filter((item) => item.type === 'text')
				.map((item) => (item.part as TextPart).text?.trim())
				.filter(Boolean)
				.join('\n\n')
			: response;
		if (!textToCopy) return;
		await navigator.clipboard.writeText(textToCopy);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// ============================================================================
	// Shell mode — short-circuit rendering
	// ============================================================================

	if (shellModePart) {
		return (
			<div className="space-y-1">
				<ToolPartRenderer
					part={shellModePart}
					sessionId={sessionId}
					permission={nextPermission?.tool ? nextPermission : undefined}
					onPermissionReply={onPermissionReply}
					defaultOpen
				/>
				{turnError && (
					<TurnErrorDisplay errorText={turnError} className="mt-2" />
				)}
				<ConnectProviderDialog
					open={connectProviderOpen}
					onOpenChange={setConnectProviderOpen}
					providers={providers}
				/>
		</div>
	);
}

	// ============================================================================
	// Compaction mode — render as a distinct card, no user bubble / logo / steps
	// ============================================================================

	if (isCompaction && !working && response) {
		return (
			<div className="group/turn">
				<div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
					<div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/40">
						<Layers className="size-3.5 text-muted-foreground/70" />
						<span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
							Compaction
						</span>
					</div>
					<div className="px-4 py-3 text-sm text-muted-foreground/90 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground/90">
						<SandboxUrlDetector content={response} isStreaming={false} />
					</div>
				</div>
			</div>
		);
	}

	// ============================================================================
	// Normal mode rendering — 1:1 port of SolidJS session-turn.tsx
	//
	// Structure:
	//   1. User message + actions
	//   2. Kortix logo
	//   3. Steps trigger (spinner/chevron + status + duration) — if working || hasSteps
	//   4. Collapsible steps (if expanded): all parts EXCEPT response part + reasoning when done
	//   5. Answered question parts (if collapsed + has answered questions)
	//   6. Response section (ONLY when NOT working) — the extracted last text part
	//   7. Error (when steps collapsed)
	//   8. Question prompt
	//   9. Action bar (copy, fork, revert)
	//
	// The response (last text part) is NEVER rendered twice:
	//   - While working: it renders INSIDE steps as a regular text part (hideResponsePart=false)
	//   - When done: it's HIDDEN from steps (hideResponsePart=true) and shown below as Response
	// ============================================================================

	return (
		<div className="space-y-3 group/turn">
			{/* ── User message ── */}
			{/* Hide the user bubble when the user message has no visible content
			    (e.g. background task notification with only synthetic parts). */}
			{hasVisibleUserContent && (
			<div>
				<UserMessageRow
					message={turn.userMessage}
					agentNames={agentNames}
					commandInfo={commandMessages?.get(turn.userMessage.info.id)}
					commands={commands}
				/>
				{userMessageText && (
					<div className="flex justify-end mt-1 opacity-0 group-hover/turn:opacity-100 transition-opacity duration-150">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									onClick={handleCopyUser}
									className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
								>
									{userCopied ? (
										<Check className="size-3.5" />
									) : (
										<Copy className="size-3.5" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent>{userCopied ? "Copied!" : "Copy"}</TooltipContent>
						</Tooltip>
						{(() => {
							const userTextPart = turn.userMessage.parts.find(
								(p) =>
									isTextPart(p) &&
									(p as TextPart).text?.trim() &&
									!(p as TextPart).synthetic,
							);
							if (!userTextPart) return null;
							return (
								<PartActions
									part={userTextPart}
									messageId={turn.userMessage.info.id}
									sessionId={sessionId}
									isBusy={isBusy}
								/>
							);
						})()}
					</div>
				)}
			</div>
			)}

			{/* Kortix logo header */}
			{(working || hasSteps) && (
				<div className="flex items-center gap-2 mt-3">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src="/kortix-logomark-white.svg"
						alt="Kortix"
						className={cn("dark:invert-0 invert flex-shrink-0")}
						style={{ height: "14px", width: "auto" }}
					/>
				</div>
			)}

			{/* Status row (steps toggle temporarily disabled) */}
			{(working || hasSteps) && (
				<div
					className={cn(
						"flex items-center gap-2 text-xs transition-colors py-1",
						working
							? "text-muted-foreground"
							: "text-muted-foreground",
					)}
				>
					{working ? (
						<span className="relative flex size-3">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-muted-foreground/30" />
							<span className="relative inline-flex rounded-full size-3 bg-muted-foreground/50" />
						</span>
					) : (
						<Check className="size-3 text-muted-foreground/70" />
					)}
				{working ? (
					<TextShimmer duration={1} spread={2} className="text-xs">
						{throttledStatus || "Working..."}
					</TextShimmer>
				) : (
					<span>
						{retryInfo
							? retryInfo.message.length > 60
								? retryInfo.message.slice(0, 60) + "..."
								: retryInfo.message
							: "Completed"}
					</span>
				)}
					{retryInfo && (
						<>
							<span className="text-muted-foreground/50">·</span>
							<span className="text-amber-500">
								Retrying{retrySecondsLeft > 0 ? ` in ${retrySecondsLeft}s` : ""}
							</span>
							<span className="text-muted-foreground/50">
								(#{retryInfo.attempt})
							</span>
						</>
					)}
					<span className="text-muted-foreground/50">·</span>
					<span className="text-muted-foreground/70">{duration}</span>
					{costInfo && !working && (
						<>
							<span className="text-muted-foreground/50">·</span>
							<span className="text-muted-foreground/70">
								{formatCost(costInfo.cost)}
							</span>
							<span className="text-muted-foreground/50">·</span>
							<span className="text-muted-foreground/70">
								{formatTokens(costInfo.tokens.input + costInfo.tokens.output)}t
							</span>
						</>
					)}
				</div>
			)}

			{/* ── Assistant parts content ──
			  Renders ALL parts from all assistant messages,
			  EXCEPT: the response part (last text) is hidden when not working
			  (it renders separately below as the Response section).
			  Reasoning is hidden when not working (matches SolidJS hideReasoning). */}
			{(working || hasSteps) && turn.assistantMessages.length > 0 && (
				<div className="space-y-2">
					{allParts.map(({ part, message }) => {

						// When inline content rendering is active (text + answered questions in order),
						// hide ALL text parts from steps since they render in the inline section
						if (shouldUseInlineContent && isTextPart(part) && part.text?.trim()) return null;

						// Text parts (intermediate + streaming response while working)
						if (isTextPart(part)) {
							if (!part.text?.trim()) return null;
							return (
								<div key={part.id} className="text-sm">
									<ThrottledMarkdown
										content={part.text}
										isStreaming={working}
									/>
								</div>
							);
						}

						// Reasoning — only while working
						if (isReasoningPart(part)) {
							if (!working) return null;
							if (!part.text?.trim()) return null;
							return (
								<div
									key={part.id}
									className="text-sm text-muted-foreground italic"
								>
									<ThrottledMarkdown content={part.text} isStreaming={true} />
								</div>
							);
						}

						// Compaction indicator
						if (isCompactionPart(part)) {
							return (
								<div key={part.id} className="flex items-center gap-2 py-2.5">
									<div className="flex-1 h-px bg-border" />
									<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/80 border border-border/60">
										<Layers className="size-3 text-muted-foreground" />
										<span className="text-[10px] font-semibold text-muted-foreground tracking-wide">
											Compaction
										</span>
									</div>
									<div className="flex-1 h-px bg-border" />
								</div>
							);
						}

						// Tool parts
						if (isToolPart(part)) {
							if (!shouldShowToolPart(part)) return null;
							if (part.tool === "todowrite") return null;
							if (part.tool === "task") return null;
							if (part.tool === "question") {
								// When inline content rendering is active, answered questions
								// render in the inline content section — skip here to avoid duplicates.
								if (shouldUseInlineContent) return null;
								// Render answered questions inline at their natural position
								// so they appear exactly where the user answered them.
								const answeredPart = answeredQuestionPartsById.get(part.id);
								if (answeredPart) {
									return (
										<AnsweredQuestionCard key={part.id} part={answeredPart} defaultExpanded />
									);
								}
								// Unanswered/dismissed questions: don't render in steps;
								// dismissed ones show via the turnError banner.
								return null;
							}

							const perm = getPermissionForTool(permissions, part.callID);

							// Hide tool parts that have active permission
							if (isToolPartHidden(part, message.info.id, hidden)) return null;

							return (
								<div key={part.id}>
									<ToolPartRenderer
										part={part}
										sessionId={sessionId}
										permission={perm}
										onPermissionReply={onPermissionReply}
									/>
								</div>
							);
						}

						// Snapshot parts
						if (isSnapshotPart(part)) {
							return (
								<div key={part.id}>
									<OcSnapshotPartView part={part} />
								</div>
							);
						}

						// Patch parts
						if (isPatchPart(part)) {
							return (
								<div key={part.id}>
									<OcPatchPartView part={part} sessionId={sessionId} />
								</div>
							);
						}

						return null;
					})}

					</div>
			)}

			{/* Kortix logo — shown when there are no steps and not working (otherwise logo is already above the steps trigger) */}
			{!hasSteps && !working && (response || answeredQuestionParts.length > 0 || turnError) && (
				<div className="flex items-center gap-2 mt-3 mb-3">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src="/kortix-logomark-white.svg"
						alt="Kortix"
						className="dark:invert-0 invert flex-shrink-0"
						style={{ height: '14px', width: 'auto' }}
					/>
				</div>
			)}

			{/* ── Screen reader ── */}
			<div className="sr-only" aria-live="polite">
				{!working && response ? response : ""}
			</div>

			{/* Inline content: text and answered questions rendered in natural order.
			    Works both during streaming and after completion. */}
			{shouldUseInlineContent ? (
				<div className="space-y-3">
					{(() => {
						// Find the last text item index — it might still be streaming
						let lastTextIdx = -1;
						if (working) {
							for (let i = inlineContentParts!.length - 1; i >= 0; i--) {
								if (inlineContentParts![i].type === 'text') { lastTextIdx = i; break; }
							}
						}
						return inlineContentParts!.map((item, idx) => {
							if (item.type === 'text') {
								const isStreaming = idx === lastTextIdx;
								const text = isStreaming ? item.part.text! : item.part.text!.trim();
								return (
									<div key={item.id} className="text-sm">
										{isStreaming ? (
											<ThrottledMarkdown content={text} isStreaming />
										) : (
											<SandboxUrlDetector content={text} isStreaming={false} />
										)}
									</div>
								);
							}
							return (
								<AnsweredQuestionCard key={item.id} part={item.part} defaultExpanded />
							);
						});
					})()}
				</div>
			) : (
				<>
					{/* Response section for text-only turns (no tools/steps content) */}
					{!working && !hasSteps && response && (
						<div className="text-sm">
							<SandboxUrlDetector content={response} isStreaming={false} />
						</div>
					)}

				{/* Answered question parts — shown after the response text only when
				    there are no steps (no-steps turns). When hasSteps is true,
				    answered questions render inline within the steps section above. */}
				{!hasSteps && answeredQuestionParts.length > 0 && (
					<div className="space-y-2 mt-3">
						{answeredQuestionParts.map(({ part }) => (
							<AnsweredQuestionCard key={part.id} part={part as ToolPart} />
						))}
					</div>
				)}
				</>
			)}

			{/* Always-visible: Subsession/task cards — rendered after the response text */}
			{taskToolParts.length > 0 && (
				<div className="space-y-2">
					{taskToolParts.map(({ part, message }) => {
						const toolPart = part as ToolPart;
						if (!shouldShowToolPart(toolPart)) return null;
						const perm = getPermissionForTool(permissions, toolPart.callID);
						if (isToolPartHidden(toolPart, message.info.id, hidden)) return null;
						return (
							<ToolPartRenderer
								key={part.id}
								part={toolPart}
								sessionId={sessionId}
								permission={perm}
								onPermissionReply={onPermissionReply}
							/>
						);
					})}
				</div>
			)}

			{/* ── Error (abort / failure banner) ── */}
			{turnError && (
				<TurnErrorDisplay errorText={turnError} />
			)}

			{/* Question prompt — now rendered inside the chat input card (questionSlot) */}

			{/* ── Action bar (copy, fork, revert) ── */}
			{!working && response && (
				<>
					<div className="flex items-center gap-0.5 opacity-0 group-hover/turn:opacity-100 transition-opacity duration-150">
						{/* Duration & cost — always visible when no steps trigger shows them */}
						{!hasSteps && duration && (
							<span className="text-[11px] text-muted-foreground/50 mr-1">
								{duration}
								{costInfo && (
									<> · {formatCost(costInfo.cost)} · {formatTokens(costInfo.tokens.input + costInfo.tokens.output)}t</>
								)}
							</span>
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									onClick={handleCopy}
									className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
								>
									{copied ? (
										<Check className="size-3.5" />
									) : (
										<Copy className="size-3.5" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
						</Tooltip>
						{!isBusy && !isReverted && lastAssistantMessageId && (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										onClick={() => onFork(lastAssistantMessageId)}
										className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
									>
										<GitFork className="size-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent>Fork from here</TooltipContent>
							</Tooltip>
						)}
						{!isFirstTurn && !isBusy && !isReverted && (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										onClick={() => setRevertDialogOpen(true)}
										className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
									>
										<Undo2 className="size-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent>Revert to before this</TooltipContent>
							</Tooltip>
						)}
					</div>
					<ConfirmDialog
						open={revertDialogOpen}
						onOpenChange={setRevertDialogOpen}
						title="Revert to this point"
						description="This will undo all messages and file changes after this point. You can restore them later by clicking the undo button in the revert banner."
						action={async () => {
							setRevertLoading(true);
							try {
								await onRevert(turn.userMessage.info.id);
							} finally {
								setRevertLoading(false);
								setRevertDialogOpen(false);
							}
						}}
						actionLabel="Revert"
						variant="destructive"
						loading={revertLoading}
					/>
				</>
			)}

			<ConnectProviderDialog
				open={connectProviderOpen}
				onOpenChange={setConnectProviderOpen}
				providers={providers}
			/>
		</div>
	);
}

// ============================================================================
// Main SessionChat Component
// ============================================================================

interface SessionChatProps {
	sessionId: string;
	/** Optional element rendered at the leading (left) edge of the session header */
	headerLeadingAction?: React.ReactNode;
	/** Hide the session site header entirely */
	hideHeader?: boolean;
	/** Read-only mode — hides the chat input bar (used for sub-session modal viewer) */
	readOnly?: boolean;
}

export function SessionChat({
	sessionId,
	headerLeadingAction,
	hideHeader,
	readOnly,
}: SessionChatProps) {
	// ---- Context modal ----
	const [contextModalOpen, setContextModalOpen] = useState(false);

	// ---- KortixComputer side panel ----
	const { isSidePanelOpen, setIsSidePanelOpen, openFileInComputer } =
		useKortixComputerStore();
	const handleTogglePanel = useCallback(() => {
		setIsSidePanelOpen(!isSidePanelOpen);
	}, [isSidePanelOpen, setIsSidePanelOpen]);

	// ---- Hooks ----
	const { data: session, isLoading: sessionLoading } =
		useOpenCodeSession(sessionId);
	// useSessionSync is the SINGLE source of truth for messages (matches OpenCode SolidJS).
	// It fetches on first access, then SSE events keep it up to date.
	// No React Query fallback — prevents stale refetches from overwriting live data.
	const { messages: syncMessages, isLoading: syncMessagesLoading } =
		useSessionSync(sessionId);
	const messages = syncMessages.length > 0 ? syncMessages : undefined;
	const messagesLoading = syncMessagesLoading;
	const { data: agents } = useOpenCodeAgents();
	const { data: commands } = useOpenCodeCommands();
	const { data: providers } = useOpenCodeProviders();
	const { data: config } = useOpenCodeConfig();
	const sendMessage = useSendOpenCodeMessage();
	const abortSession = useAbortOpenCodeSession();
	const executeCommand = useExecuteOpenCodeCommand();
	const forkSession = useForkSession();
	const revertSession = useRevertSession();
	const unrevertSession = useUnrevertSession();

	// ---- Unified model/agent/variant state (1:1 port of SolidJS local.tsx) ----
	const local = useOpenCodeLocal({ agents, providers, config });

	const pendingPromptHandled = useRef(false);

	// ---- Polling fallback & optimistic send ----
	const [pollingActive, setPollingActive] = useState(false);
	const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
		null,
	);
	const [pendingUserMessageId, setPendingUserMessageId] = useState<
		string | null
	>(null);
	const [pendingCommand, setPendingCommand] = useState<{
		name: string;
		description?: string;
	} | null>(null);
	// Map of user message IDs → command info, so UserMessageRow can render
	// a compact command pill instead of the raw expanded template text.
	const commandMessagesRef = useRef<
		Map<string, { name: string; args?: string }>
	>(new Map());
	// Stash the pending command info so we can associate it with the user message
	// even if the busy signal arrives before the message list updates.
	const pendingCommandStashRef = useRef<{ name: string; args?: string } | null>(
		null,
	);
	// Track whether we're retrying a failed send (keeps loader visible)
	const [isRetrying, setIsRetrying] = useState(false);
	// Track whether a pending prompt send is in flight (dashboard→session flow).
	// Keeps isBusy true until the server acknowledges with a busy status.
	const [pendingSendInFlight, setPendingSendInFlight] = useState(false);
	const [pendingSendMessageId, setPendingSendMessageId] = useState<
		string | null
	>(null);
	// Grace period: don't stop polling immediately on idle after a recent send
	const lastSendTimeRef = useRef<number>(0);
	// ---- Optimistic prompt (from dashboard/project page) ----
	// Uses session-specific sessionStorage keys so pushState navigation works
	// (no dependency on ?new=true URL param which requires router.push).
	const [optimisticPrompt, setOptimisticPrompt] = useState<string | null>(
		() => {
			if (typeof window !== "undefined") {
				return sessionStorage.getItem(`opencode_pending_prompt:${sessionId}`);
			}
			return null;
		},
	);

	const addOptimisticUserMessage = useCallback(
		(messageId: string, text: string, partIds?: string[]) => {
			const parts = text.trim()
				? [
						{
							id: partIds?.[0] ?? ascendingId("prt"),
							sessionID: sessionId,
							messageID: messageId,
							type: "text",
							text,
						} as any,
					]
				: [];
			const info = {
				id: messageId,
				sessionID: sessionId,
				role: "user",
				time: { created: Date.now() },
			} as any;

			useSyncStore.getState().optimisticAdd(sessionId, info, parts as any);
		},
		[sessionId],
	);

	const removeOptimisticUserMessage = useCallback(
		(messageId: string) => {
			useSyncStore.getState().optimisticRemove(sessionId, messageId);
		},
		[sessionId],
	);

	// Hydrate options from sessionStorage and send the pending prompt for new sessions.
	// The dashboard/project page stores the prompt in sessionStorage and navigates here.
	// We send the message from here (not the dashboard) so that SSE listeners and polling
	// are already active when the response starts streaming back.
	// Retries up to 3 times on failure (e.g. "Unable to connect" errors).
	useEffect(() => {
		if (pendingPromptHandled.current) return;
		const pendingPrompt = sessionStorage.getItem(
			`opencode_pending_prompt:${sessionId}`,
		);
		if (pendingPrompt) {
			pendingPromptHandled.current = true;
			setPollingActive(true);
			setPendingSendInFlight(true);
			sessionStorage.removeItem(`opencode_pending_prompt:${sessionId}`);
			sessionStorage.removeItem(`opencode_pending_send_failed:${sessionId}`);

			// Restore agent/model/variant selections from the dashboard
			const options: Record<string, unknown> = {};
			try {
				const raw = sessionStorage.getItem(
					`opencode_pending_options:${sessionId}`,
				);
				if (raw) {
					const pendingOptions = JSON.parse(raw);
					sessionStorage.removeItem(`opencode_pending_options:${sessionId}`);
					if (pendingOptions?.agent) {
						options.agent = pendingOptions.agent;
						local.agent.set(pendingOptions.agent as string);
					}
					if (pendingOptions?.model) {
						options.model = pendingOptions.model;
						local.model.set(
							pendingOptions.model as { providerID: string; modelID: string },
						);
					}
					if (pendingOptions?.variant) {
						options.variant = pendingOptions.variant;
						local.model.variant.set(pendingOptions.variant as string);
					}
				}
			} catch {
				// ignore
			}

			// Send the message with retry. The useSendOpenCodeMessage hook already
			// retries 3 times internally for transient errors. We add one additional
			// outer retry (2 attempts total at this level) to cover cases where the
			// SDK client itself fails to initialize or the server takes longer to start.
			const sendOpts =
				Object.keys(options).length > 0 ? (options as any) : undefined;
			const messageID = ascendingId("msg");
			const textPartId = ascendingId("prt");
			setPendingSendMessageId(messageID);
			addOptimisticUserMessage(messageID, pendingPrompt, [textPartId]);
			lastSendTimeRef.current = Date.now();

			// Fire-and-forget via promptAsync. Don't send messageID — let the
			// server generate it with its own clock to avoid clock-skew issues.
			const client = getClient();
			void client.session
				.promptAsync({
					sessionID: sessionId,
					parts: [{ type: "text", text: pendingPrompt }],
					...(sendOpts?.agent && { agent: sendOpts.agent }),
					...(sendOpts?.model && { model: sendOpts.model }),
					...(sendOpts?.variant && { variant: sendOpts.variant }),
				} as any)
				.catch(() => {
					removeOptimisticUserMessage(messageID);
					useSyncStore.getState().setStatus(sessionId, { type: "idle" });
					setIsRetrying(false);
					setPendingSendInFlight(false);
					setPendingSendMessageId(null);
					setOptimisticPrompt(null);
					setPollingActive(false);
				});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId, addOptimisticUserMessage, removeOptimisticUserMessage]);

	// Clear optimistic prompt once real messages arrive
	useEffect(() => {
		if (optimisticPrompt && messages && messages.length > 0) {
			setOptimisticPrompt(null);
		}
	}, [optimisticPrompt, messages]);

	const agentNames = useMemo(
		() => local.agent.list.map((a) => a.name),
		[local.agent.list],
	);

	// ---- Check if any messages have tool calls ----
	const hasToolCalls = useMemo(() => {
		if (!messages) return false;
		return messages.some((msg) => msg.parts?.some((p) => p.type === "tool"));
	}, [messages]);

	// ---- Restore model/agent from last user message (matching SolidJS session.tsx:550-560) ----
	const lastUserMessage = useMemo(
		() =>
			messages
				? [...messages].reverse().find((m) => m.info.role === "user")
				: undefined,
		[messages],
	);
	const lastUserMsgIdRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!lastUserMessage) return;
		if (lastUserMsgIdRef.current === lastUserMessage.info.id) return;
		lastUserMsgIdRef.current = lastUserMessage.info.id;
		const msg = lastUserMessage.info as any;
		if (msg.agent) local.agent.set(msg.agent);
		if (msg.model) local.model.set(msg.model); // no { recent: true } — matches SolidJS
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lastUserMessage?.info.id]);

	// ---- Session status ----
	// Use sync store as primary (matches OpenCode), fall back to status store
	const syncStatus = useSyncStore((s) => s.sessionStatus[sessionId]);
	const legacyStatus = useOpenCodeSessionStatusStore(
		(s) => s.statuses[sessionId],
	);
	const sessionStatus = syncStatus ?? legacyStatus;
	const isServerBusy =
		sessionStatus?.type === "busy" || sessionStatus?.type === "retry";

	// Check if the latest assistant message is still incomplete (server hasn't
	// set time.completed). This is a reliable secondary signal that the AI is
	// still producing content, even if the session status briefly reports idle
	// (e.g. during SSE reconnection, stale watchdog poll, or between agentic
	// steps). Only considers the very last assistant message.
	const hasIncompleteAssistant = useMemo(() => {
		if (!messages || messages.length === 0) return false;
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].info.role === "assistant") {
				return !(messages[i].info as any).time?.completed;
			}
		}
		return false;
	}, [messages]);
	const hasPendingUserReply = useMemo(() => {
		if (!messages || messages.length === 0) return false;
		let lastUserIdx = -1;
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].info.role === "user") {
				lastUserIdx = i;
				break;
			}
		}
		if (lastUserIdx === -1) return false;
		for (let i = lastUserIdx + 1; i < messages.length; i++) {
			if (messages[i].info.role === "assistant") return false;
		}
		return true;
	}, [messages]);

	// Effective busy: server says busy, OR the assistant message is incomplete
	// AND the server hasn't explicitly reported idle. The server is authoritative —
	// if it says idle, the session is done even if the message's time.completed
	// hasn't arrived via SSE yet (can happen after abort).
	const serverExplicitlyIdle = sessionStatus?.type === "idle";
	const effectiveBusy = isServerBusy || (hasIncompleteAssistant && !serverExplicitlyIdle);

	// Debounced busy state: goes true immediately, but stays true for 2s
	// after BOTH signals say idle. This prevents flickering between agentic
	// steps where the status briefly goes idle then back to busy.
	const [isBusy, setIsBusy] = useState(effectiveBusy);
	const busyTimerRef = useRef<ReturnType<typeof setTimeout>>();
	useEffect(() => {
		if (effectiveBusy) {
			clearTimeout(busyTimerRef.current);
			setIsBusy(true);
		} else {
			busyTimerRef.current = setTimeout(() => setIsBusy(false), 2000);
		}
		return () => clearTimeout(busyTimerRef.current);
	}, [effectiveBusy]);

	// ---- Message Queue ----
	// Hydrate queue state on first mount (local client storage).
	const queueHydrated = useMessageQueueStore((s) => s.hydrated);
	useEffect(() => {
		if (!queueHydrated) {
			useMessageQueueStore.getState().hydrateFromBackend();
		}
	}, [queueHydrated]);

	// Select the full array (stable ref) and derive the filtered list via useMemo
	// to avoid the "getSnapshot should be cached" infinite-loop error that occurs
	// when .filter() creates a new array reference on every selector call.
	const allQueuedMessages = useMessageQueueStore((s) => s.messages);
	const queuedMessages = useMemo(
		() => allQueuedMessages.filter((m) => m.sessionId === sessionId),
		[allQueuedMessages, sessionId],
	);
	const queueDequeue = useMessageQueueStore((s) => s.dequeue);
	const queueRemove = useMessageQueueStore((s) => s.remove);
	const queueMoveUp = useMessageQueueStore((s) => s.moveUp);
	const queueMoveDown = useMessageQueueStore((s) => s.moveDown);
	const queueClearSession = useMessageQueueStore((s) => s.clearSession);
	const [queueExpanded, setQueueExpanded] = useState(true);

	// Guard against double-drain: tracks whether a drain is already in progress
	const drainScheduledRef = useRef(false);
	const queueInFlightRef = useRef<{ queueId: string; sentAt: number } | null>(null);
	const hasActiveQuestionForQueue = useOpenCodePendingStore((s) =>
		Object.values(s.questions).some((q) => q.sessionID === sessionId),
	);

	// Drain helper: dequeue the next message and send it.
	// Shared by primary + fallback drains to avoid duplication.
	const drainNextWhenSettled = useCallback(() => {
		if (drainScheduledRef.current) return;
		if (queueInFlightRef.current) return;
		if (isServerBusy || hasIncompleteAssistant) return;
		if (hasPendingUserReply) return;
		if (pendingSendInFlight) return;
		if (hasActiveQuestionForQueue) return;
		const sessionQueue = useMessageQueueStore
			.getState()
			.messages.filter((m) => m.sessionId === sessionId);
		if (sessionQueue.length === 0) return;
		drainScheduledRef.current = true;
		setTimeout(() => {
			drainScheduledRef.current = false;
			if (
				queueInFlightRef.current ||
				isServerBusy ||
				hasIncompleteAssistant ||
				hasPendingUserReply ||
				pendingSendInFlight ||
				hasActiveQuestionForQueue
			)
				return;
			queueInFlightRef.current = { queueId: "__scheduling__" };
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					const next = queueDequeue(sessionId);
					if (next) {
						queueInFlightRef.current = { queueId: next.id, sentAt: Date.now() };
						void handleSend(next.text, next.files)
							.catch(() => {
								queueInFlightRef.current = null;
							});
					} else {
						queueInFlightRef.current = null;
					}
				});
			});
		}, 350);
	}, [
		sessionId,
		queueDequeue,
		isServerBusy,
		hasIncompleteAssistant,
		hasPendingUserReply,
		pendingSendInFlight,
		hasActiveQuestionForQueue,
	]); // eslint-disable-line react-hooks/exhaustive-deps

	// Release queue lock only after the queued message lifecycle is fully settled.
	useEffect(() => {
		const inFlight = queueInFlightRef.current;
		if (!inFlight) return;
		if (
			isServerBusy ||
			hasIncompleteAssistant ||
			hasPendingUserReply ||
			pendingSendInFlight ||
			hasActiveQuestionForQueue
		)
			return;
		queueInFlightRef.current = null;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => drainNextWhenSettled());
		});
	}, [
		messages,
		isServerBusy,
		hasIncompleteAssistant,
		hasPendingUserReply,
		pendingSendInFlight,
		hasActiveQuestionForQueue,
		drainNextWhenSettled,
	]);

	// Fallback drain: when isBusy becomes false and there are queued messages,
	// drain the queue. This covers cases where the SSE missed the busy event
	// entirely (e.g. status went undefined → idle, so isServerBusy was never
	// true and the primary drain above never fires).
	useEffect(() => {
		if (isBusy || drainScheduledRef.current) return;
		const sessionQueue = useMessageQueueStore
			.getState()
			.messages.filter((m) => m.sessionId === sessionId);
		if (sessionQueue.length === 0) return;
		drainNextWhenSettled();
	}, [isBusy, queuedMessages.length, sessionId, drainNextWhenSettled]);

	// "Send now" handler: abort current session + send the queued message
	const handleQueueSendNow = useCallback(
		(messageId: string) => {
			const msg = useMessageQueueStore
				.getState()
				.messages.find((m) => m.id === messageId);
			if (!msg) return;
			queueInFlightRef.current = null;
			queueRemove(messageId);
			// Abort the current session first
			abortSession.mutate(sessionId);
			// Send after a brief delay to let abort take effect
			setTimeout(() => {
				handleSend(msg.text, msg.files);
			}, 150);
		},
		[sessionId, abortSession, queueRemove], // handleSend added via eslint-disable below
	); // eslint-disable-line react-hooks/exhaustive-deps

	// Stop polling when session goes idle (via SSE or polling fallback).
	// Grace period: if we sent a message recently (within 5s), don't stop polling
	// on the first idle status — the server may not have started processing yet.
	useEffect(() => {
		if (pollingActive && sessionStatus?.type === "idle") {
			const timeSinceSend = Date.now() - lastSendTimeRef.current;
			if (timeSinceSend < 5000) {
				// Still within grace period — check again shortly
				const remaining = 5000 - timeSinceSend;
				const timer = setTimeout(() => {
					// Re-check: if still idle after grace period, stop polling
					const currentStatus =
						useOpenCodeSessionStatusStore.getState().statuses[sessionId];
					if (currentStatus?.type === "idle") {
						setPollingActive(false);
					}
				}, remaining);
				return () => clearTimeout(timer);
			}
			setPollingActive(false);
		}
	}, [pollingActive, sessionStatus?.type, sessionId]);

	// Clear pendingSendInFlight once the server acknowledges it's working,
	// or when new messages arrive (fallback for command sends).
	// This bridges the gap between the optimistic prompt clearing and the
	// server status updating — keeps isBusy true so the turn shows a loader.
	useEffect(() => {
		if (!pendingSendInFlight) return;
		if (isServerBusy) {
			setPendingSendInFlight(false);
			setPendingSendMessageId(null);
			return;
		}
		// If we got an assistant reply for the pending user message, the server
		// already accepted and processed this send even if status events were missed.
		const hasAssistantReply = pendingSendMessageId
			? !!messages?.some(
					(m) =>
						m.info.role === "assistant" &&
						(m.info as any).parentID === pendingSendMessageId,
				)
			: false;
		if (hasAssistantReply) {
			setPendingSendInFlight(false);
			setPendingSendMessageId(null);
		}
	}, [pendingSendInFlight, isServerBusy, messages, pendingSendMessageId]);

	// Safety timeout: clear pendingSendInFlight after 30s even if the server
	// never acknowledged. Prevents the UI from being stuck forever in "busy"
	// when the send succeeded (HTTP 204) but the server never started processing.
	useEffect(() => {
		if (!pendingSendInFlight) return;
		const timer = setTimeout(() => {
			setPendingSendInFlight(false);
			setPendingSendMessageId(null);
		}, 30_000);
		return () => clearTimeout(timer);
	}, [pendingSendInFlight]);

	// Stale session watchdog: when the session has been busy for a while, do a
	// direct status check. If the server reports idle (or doesn't include the
	// session at all — meaning it's idle), force the session to idle — recovering
	// from a silently dropped SSE stream or missed event.
	// First check after 5s, then every 15s.
	useEffect(() => {
		if (!isServerBusy) return;

		const check = async () => {
			try {
				const client = getClient();
				const result = await client.session.status();
				if (result.data) {
					const statuses = result.data as Record<string, any>;
					const serverStatus = statuses[sessionId];
					const resolvedStatus = serverStatus ?? { type: 'idle' as const };
					// Update BOTH stores — sync store is the primary source of truth,
					// but legacy store is also used as fallback.
					useSyncStore.getState().setStatus(sessionId, resolvedStatus);
					useOpenCodeSessionStatusStore.getState().setStatus(sessionId, resolvedStatus);
				}
			} catch {
				// ignore — next interval will retry
			}
		};

		// First check after 5s, then every 15s
		const initialTimer = setTimeout(() => {
			check();
		}, 5_000);
		const interval = setInterval(check, 15_000);
		return () => {
			clearTimeout(initialTimer);
			clearInterval(interval);
		};
	}, [isServerBusy, sessionId]);

	// Message-based idle detection: if the last assistant message has
	// time.completed set, the server marked the message as completed but we never got the
	// idle event — force the session to idle after a grace period.
	// We use a longer delay (5s) to avoid prematurely killing agentic flows
	// where the server creates a new assistant message shortly after completing one.
	// The timer also re-checks message count to ensure no new messages arrived.
	const messageCountForIdle = messages?.length ?? 0;
	useEffect(() => {
		if (!isServerBusy || !messages || messages.length === 0) return;

		// If the last message is a user message, the AI hasn't started
		// responding yet. Don't force idle based on a PREVIOUS assistant
		// message's completion — the model may still be thinking.
		const lastMsg = messages[messages.length - 1];
		if (lastMsg?.info.role === "user") return;

		// Find the last assistant message
		let lastAssistantIdx = -1;
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].info.role === "assistant") {
				lastAssistantIdx = i;
				break;
			}
		}
		if (lastAssistantIdx === -1) return;

		const assistantInfo = messages[lastAssistantIdx].info as any;
		if (!assistantInfo.time?.completed) return;

		// Check if there's a user message AFTER this completed assistant.
		// If so, the AI is still processing the new user message — don't
		// force idle based on the previous turn's completion.
		for (let i = lastAssistantIdx + 1; i < messages.length; i++) {
			if (messages[i].info.role === "user") return;
		}

		const msgCountAtStart = messages.length;
		const timer = setTimeout(() => {
			// Only force idle if no new messages arrived during the grace period
			const currentMsgs = useSyncStore.getState().getMessages(sessionId);
			if (currentMsgs.length > msgCountAtStart) {
				return; // New messages arrived — agent is still working
			}
			const syncStoreStatus = useSyncStore.getState().sessionStatus[sessionId];
			const legacyStoreStatus = useOpenCodeSessionStatusStore.getState().statuses[sessionId];
			const currentType = syncStoreStatus?.type ?? legacyStoreStatus?.type;
			if (currentType === 'busy' || currentType === 'retry') {
				const idle = { type: 'idle' as const };
				useSyncStore.getState().setStatus(sessionId, idle);
				useOpenCodeSessionStatusStore.getState().setStatus(sessionId, idle);
			}
		}, 5_000);
		return () => clearTimeout(timer);
	}, [isServerBusy, messages, sessionId, messageCountForIdle]);

	// Clear pending user message when we can confirm the message is in cache
	// (by ID), or when new messages arrive (fallback for command sends).
	// When a command was pending, associate the newest user message with the
	// command info so UserMessageRow can render a nice pill instead of raw template text.
	const prevMsgLenRef = useRef(messages?.length || 0);
	useEffect(() => {
		if (!pendingUserMessage) return;
		const hasPendingMessage = pendingUserMessageId
			? !!messages?.some((m) => m.info.id === pendingUserMessageId)
			: false;
		if (hasPendingMessage) {
			setPendingUserMessage(null);
			setPendingUserMessageId(null);
			setPendingCommand(null);
			return;
		}
		const len = messages?.length || 0;
		if (len > prevMsgLenRef.current) {
			setPendingUserMessage(null);
			setPendingUserMessageId(null);
			setPendingCommand(null);
		}
	}, [messages, messages?.length, pendingUserMessage, pendingUserMessageId]);

	// Associate stashed command info with the newest user message when messages arrive.
	// Runs separately so it captures the mapping even if busy fires before messages update.
	useEffect(() => {
		const stash = pendingCommandStashRef.current;
		if (!stash || !messages) return;
		const len = messages.length;
		if (len <= prevMsgLenRef.current) return;
		// Find the last user message — the one just created by the command
		for (let i = len - 1; i >= 0; i--) {
			if (messages[i].info.role === "user") {
				commandMessagesRef.current.set(messages[i].info.id, stash);
				pendingCommandStashRef.current = null;
				break;
			}
		}
	}, [messages]);

	useEffect(() => {
		prevMsgLenRef.current = messages?.length || 0;
	}, [messages?.length]);

	// ---- Auto-scroll (replaces inline scroll logic) ----
	const hasActiveQuestion = useOpenCodePendingStore((s) =>
		Object.values(s.questions).some((q) => q.sessionID === sessionId),
	);
	const messageCount = messages?.length ?? 0;
	const { scrollRef, contentRef, spacerElRef, showScrollButton, scrollToBottom, scrollToLastTurn, scrollToEnd, scrollToAbsoluteBottom, smoothScrollToAbsoluteBottom } =
		useAutoScroll({
			working: isBusy && !hasActiveQuestion,
			hasContent: messageCount > 0,
		});

	// Scroll to the bottom on initial load / session change.
	// Uses a callback ref on the scroll container to guarantee it's mounted.
	// Strategy: start scrolled to ~90% instantly (no flash at top), then
	// smooth-scroll the last bit once content has rendered for a nice effect.
	const initialScrollDoneRef = useRef<string | null>(null);
	const scrollContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
		// Always keep scrollRef updated
		(scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
		if (!node) return;
		if (initialScrollDoneRef.current === sessionId) return;
		initialScrollDoneRef.current = sessionId;

		// Instant scroll to near-bottom so user doesn't see top-of-page flash.
		// Position slightly above the bottom so the smooth scroll has room to animate.
		const scrollNearBottom = () => {
			const max = node.scrollHeight - node.clientHeight;
			node.scrollTop = Math.max(0, max - 300);
		};
		scrollNearBottom();

		// After content settles, smooth scroll the final stretch to the bottom.
		setTimeout(() => {
			node.scrollTo({
				top: node.scrollHeight - node.clientHeight,
				behavior: 'smooth',
			});
		}, 150);
		// Follow-up in case async content changed scrollHeight
		setTimeout(() => {
			node.scrollTo({
				top: node.scrollHeight - node.clientHeight,
				behavior: 'smooth',
			});
		}, 600);
	}, [sessionId, scrollRef]);

	// Tab switch: the DOM stays mounted (hidden class), so the browser
	// preserves scroll position automatically. No action needed here.

	// ---- Pending permissions & questions ----
	const allPermissions = useOpenCodePendingStore((s) => s.permissions);
	const allQuestions = useOpenCodePendingStore((s) => s.questions);
	const pendingPermissions = useMemo(
		() =>
			Object.values(allPermissions).filter((p) => p.sessionID === sessionId),
		[allPermissions, sessionId],
	);
	const pendingQuestions = useMemo(
		() => Object.values(allQuestions).filter((q) => q.sessionID === sessionId),
		[allQuestions, sessionId],
	);

	// ---- Permission/question reply handlers ----
	const removePermission = useOpenCodePendingStore((s) => s.removePermission);
	const removeQuestion = useOpenCodePendingStore((s) => s.removeQuestion);

	const handlePermissionReply = useCallback(
		async (requestId: string, reply: "once" | "always" | "reject") => {
			try {
				await replyToPermission(requestId, reply);
				removePermission(requestId);
			} catch {
				// ignore
			}
		},
		[removePermission],
	);

	const handleQuestionReply = useCallback(
		async (requestId: string, answers: string[][]) => {
			// Snapshot the question BEFORE removing it so we can cache the
			// answer against the tool part's ID.
			const questionReq = useOpenCodePendingStore.getState().questions[requestId];

			// Optimistically remove the question so the textarea shows immediately
			removeQuestion(requestId);

			// Save the answers in the optimistic cache keyed by the tool part ID.
			// This cache survives SSE message.part.updated events that may
			// overwrite the tool part before the server includes metadata.answers.
			// answeredQuestionParts reads from this cache as a fallback.
			if (questionReq?.tool?.messageID) {
				const { messageID } = questionReq.tool;
				const parts = useSyncStore.getState().parts[messageID];
				if (parts) {
					const match = parts.find(
						(p) =>
							p.type === "tool" &&
							(p as ToolPart).tool === "question" &&
							(p as ToolPart).callID === questionReq.tool!.callID,
					);
					if (match) {
						optimisticAnswersCache.set(match.id, {
							answers,
							input: (match as ToolPart).state?.input as Record<string, unknown> ?? {},
						});
					}
				}
			}

			try {
				await replyToQuestion(requestId, answers);
			} catch {
				// ignore — SSE "question.replied" event will also remove it
			}
		},
		[removeQuestion],
	);

	const handleQuestionReject = useCallback(
		async (requestId: string) => {
			// Optimistically remove the question so the textarea shows immediately
			removeQuestion(requestId);
			try {
				await rejectQuestion(requestId);
			} catch {
				// ignore — SSE "question.rejected" event will also remove it
			}
			// Also abort the session so the "The operation was aborted." banner appears
			if (!abortSession.isPending) {
				abortSession.mutate(sessionId);
			}
		},
		[removeQuestion, abortSession, sessionId],
	);

	// ---- Group messages into turns ----
	const turns = useMemo(
		() => (messages ? groupMessagesIntoTurns(messages) : []),
		[messages],
	);

	// Reset on session change
	useEffect(() => {
		setPollingActive(false);
		setPendingUserMessage(null);
		setPendingUserMessageId(null);
		setPendingCommand(null);
		setPendingSendInFlight(false);
		setPendingSendMessageId(null);
		setIsRetrying(false);
		lastSendTimeRef.current = 0;
	}, [sessionId]);

	// ============================================================================
	// Billing: DISABLED — billing is handled server-side by the router
	// (POST /v1/router/chat/completions deducts credits per LLM call).
	// This frontend useEffect was causing double-billing once opencode.jsonc
	// got cost config and step-finish.cost became non-zero.
	// ============================================================================

	// ============================================================================
	// Fork / Revert / Unrevert handlers
	// ============================================================================

	const isReverted = !!session?.revert;

	const handleFork = useCallback(
		async (messageId: string) => {
			// The server's fork copies all messages BEFORE the given messageID
			// (exclusive: msg.id >= messageID → break). Since the user clicks
			// "Fork from here" on an assistant response and expects that response
			// to be included, we pass the ID of the first message AFTER the
			// assistant message as the cut-off. If the assistant message is the
			// last one in the session, we omit messageID entirely to copy everything.
			let forkAtMessageId: string | undefined;
			if (messages) {
				const idx = messages.findIndex((m) => m.info.id === messageId);
				if (idx >= 0 && idx < messages.length - 1) {
					forkAtMessageId = messages[idx + 1].info.id;
				}
				// else: last message — omit messageID to copy all
			}

			const forkedSession = await forkSession.mutateAsync({
				sessionId,
				messageId: forkAtMessageId,
			});

			// Open the forked session in a new tab and navigate
			const title = forkedSession.title || "Forked session";
			openTabAndNavigate({
				id: forkedSession.id,
				title,
				type: "session",
				href: `/sessions/${forkedSession.id}`,
				parentSessionId: sessionId,
				serverId: useServerStore.getState().activeServerId,
			});
			// Store fork origin in localStorage (survives refresh) so the forked
			// session can show the "Forked from" indicator.
			localStorage.setItem(`fork_origin_${forkedSession.id}`, sessionId);
		},
		[sessionId, forkSession, messages],
	);

	const handleRevert = useCallback(
		async (messageId: string) => {
			await revertSession.mutateAsync({
				sessionId,
				messageId,
			});
		},
		[sessionId, revertSession],
	);

	const handleUnrevert = useCallback(async () => {
		await unrevertSession.mutateAsync(sessionId);
	}, [sessionId, unrevertSession]);

	// ============================================================================
	// Send / Stop / Command handlers
	// ============================================================================

	const handleSend = useCallback(
		async (
			text: string,
			files?: AttachedFile[],
			mentions?: TrackedMention[],
		) => {
			// Play send sound
			playSound("send");
			const messageID = ascendingId("msg");

			// Generate part IDs upfront so the optimistic message and the server
			// request use the SAME IDs. When the server echoes parts via
			// message.part.updated, the sync store's upsertPart will UPDATE
			// (not duplicate) the optimistic parts. This matches OpenCode's
			// SolidJS approach where part IDs are sent with the prompt request.
			const textPartId = ascendingId("prt");

			// Build optimistic text that includes session ref XML so that
			// HighlightMentions / UserMessageRow can detect multi-word session
			// mentions (e.g. "@Intro message") before the server echoes back.
			const sessionMentionsForOptimistic = mentions?.filter(
				(m) => m.kind === "session" && m.value,
			);
			let optimisticText = text;
			if (
				sessionMentionsForOptimistic &&
				sessionMentionsForOptimistic.length > 0
			) {
				const refs = sessionMentionsForOptimistic
					.map((m) => `<session_ref id="${m.value}" title="${m.label}" />`)
					.join("\n");
				optimisticText = `${text}\n\nReferenced sessions (use the session_context tool to fetch details when needed):\n${refs}`;
			}

			// Optimistic: show message immediately in sync store + set busy
			// Matches OpenCode: sync.set("session_status", session.id, { type: "busy" })
			addOptimisticUserMessage(messageID, optimisticText, [textPartId]);
			useSyncStore.getState().setStatus(sessionId, { type: "busy" });

		// Scroll so the new user message appears at the top of the viewport.
		// MutationObserver recalcs spacer automatically when the new turn renders.
		// Fire twice: early (before DOM update) to reset scroll state so the RAF
		// auto-scroll loop is unblocked, and again after the turn likely rendered.
		scrollToBottom();
		setTimeout(() => scrollToBottom(), 100);

			const options: Record<string, unknown> = {};
			if (local.agent.current) options.agent = local.agent.current.name;
			if (local.model.currentKey) options.model = local.model.currentKey;
			if (local.model.variant.current)
				options.variant = local.model.variant.current;

			// Build parts: text first, then upload attached files to /workspace/uploads/
			// and send as XML text references (agent reads from disk on demand, not loaded into context)
			const parts: Array<
				| { id: string; type: "text"; text: string }
				| {
						id: string;
						type: "file";
						mime: string;
						url: string;
						filename?: string;
				  }
			> = [{ id: textPartId, type: "text", text }];

			if (files && files.length > 0) {
				const uploadResults = await Promise.all(
					files.map(async (af) => {
						const timestamp = Date.now();
						const safeName = af.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
						const uniqueName = `${timestamp}-${safeName}`;
						const uploadBlob = new File([af.file], uniqueName, {
							type: af.file.type,
						});
						const results = await uploadFile(uploadBlob, "/workspace/uploads");
						if (!results || results.length === 0) {
							throw new Error(`Failed to upload file: ${af.file.name}`);
						}
						return {
							path: results[0].path,
							mime: af.file.type || "application/octet-stream",
							filename: af.file.name,
						};
					}),
				);
				for (const f of uploadResults) {
					parts.push({
						id: ascendingId("prt"),
						type: "text",
						text: `<file path="${f.path}" mime="${f.mime}" filename="${f.filename}">\nThis file has been uploaded and is available at the path above.\n</file>`,
					});
				}
			}

			// Append session reference hints for @session mentions
			const sessionMentions = mentions?.filter(
				(m) => m.kind === "session" && m.value,
			);
			if (sessionMentions && sessionMentions.length > 0) {
				const refs = sessionMentions
					.map((m) => `<session_ref id="${m.value}" title="${m.label}" />`)
					.join("\n");
				parts.push({
					id: ascendingId("prt"),
					type: "text",
					text: `\n\nReferenced sessions (use the session_context tool to fetch details when needed):\n${refs}`,
				});
			}

			// Fire-and-forget via session.prompt (matching OpenCode app's approach).
			// SSE events drive all incremental UI updates via sync store.
			// prompt() blocks until the full response is ready, but since we don't
			// await the result, it effectively runs in the background. This is exactly
			// how OpenCode's web app sends messages.
			// Don't send part IDs or messageID — let the server generate them with
			// its own clock. Client-generated IDs can sort before server IDs due to
			// clock skew (browser vs Docker container), causing the server's loop to
			// exit immediately thinking the prompt was already answered.
			const mappedParts = parts.map((p: any) => {
				if (p.type === "file")
					return {
						type: "file" as const,
						mime: p.mime,
						url: p.url,
						filename: p.filename,
					};
				return { type: "text" as const, text: p.text };
			});
			const sendOpts = Object.keys(options).length > 0 ? options : undefined;
			const client = getClient();
			void client.session
				.promptAsync({
					sessionID: sessionId,
					parts: mappedParts,
					...(sendOpts?.agent && { agent: sendOpts.agent }),
					...(sendOpts?.model && { model: sendOpts.model }),
					...(sendOpts?.variant && { variant: sendOpts.variant }),
				} as any)
				.catch(() => {
					// On failure, set status to idle and remove optimistic message
					useSyncStore.getState().setStatus(sessionId, { type: "idle" });
					removeOptimisticUserMessage(messageID);
				});

			return messageID;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			sessionId,
			sendMessage,
			local.agent.current,
			local.model.currentKey,
			local.model.variant.current,
			addOptimisticUserMessage,
			removeOptimisticUserMessage,
			scrollToBottom,
		],
	);

	const handleStop = useCallback(() => {
		// Guard against rapid clicks — ignore if an abort is already in flight
		if (abortSession.isPending) return;
		abortSession.mutate(sessionId);
	}, [sessionId, abortSession]);

	const handleCommand = useCallback(
		(cmd: Command, args?: string) => {
			playSound("send");
			const label = args ? `/${cmd.name} ${args}` : `/${cmd.name}`;
			const messageID = ascendingId("msg");
			const textPartId = ascendingId("prt");

			setPendingCommand({
				name: cmd.name,
				description: args || cmd.description,
			});
			pendingCommandStashRef.current = {
				name: cmd.name,
				args: args || cmd.description,
			};
			setPendingUserMessage(label);
			setPendingUserMessageId(null);
			setPollingActive(true);
			lastSendTimeRef.current = Date.now();

			// Optimistic: show command message immediately + set busy
			// (mirrors handleSend behavior)
			addOptimisticUserMessage(messageID, label, [textPartId]);
			useSyncStore.getState().setStatus(sessionId, { type: "busy" });

			executeCommand.mutate(
				{ sessionId, command: cmd.name, args },
				{
					onError: () => {
						setPendingCommand(null);
						setPendingUserMessage(null);
						setPendingUserMessageId(null);
						setPollingActive(false);
						useSyncStore.getState().setStatus(sessionId, { type: "idle" });
						removeOptimisticUserMessage(messageID);
					},
				},
			);
			setTimeout(() => scrollToBottom(), 50);
		},
		[sessionId, executeCommand, scrollToBottom, addOptimisticUserMessage, removeOptimisticUserMessage],
	);

	const handleFileSearch = useCallback(
		async (query: string): Promise<string[]> => {
			try {
				return await findOpenCodeFiles(query);
			} catch {
				return [];
			}
		},
		[],
	);

	// Detect if this session was forked and resolve its parent.
	// Must be above early returns to preserve hook order.
	// localStorage is the source of truth (set by handleFork). The server may
	// or may not populate parentID on the forked session.
	const forkParentId = useMemo(() => {
		if (typeof window === "undefined") return null;
		return localStorage.getItem(`fork_origin_${sessionId}`);
	}, [sessionId]);
	const isSubSession = !!session?.parentID || !!forkParentId;
	const isFork = !!forkParentId;
	// The effective parent ID: prefer server parentID, fall back to localStorage
	const effectiveParentId = session?.parentID || forkParentId;

	// Parent session data — used for SubSessionBar and threadContext on chat input
	const { data: parentSessionData } = useOpenCodeSession(
		effectiveParentId || "",
	);
	const threadContext = useMemo(() => {
		if (!effectiveParentId || !parentSessionData) return undefined;
		return {
			variant: isFork ? ("fork" as const) : ("thread" as const),
			parentTitle: parentSessionData.title || "Parent session",
			onBackToParent: () => {
				openTabAndNavigate({
					id: parentSessionData.id,
					title: parentSessionData.title || "Parent session",
					type: "session",
					href: `/sessions/${parentSessionData.id}`,
					serverId: useServerStore.getState().activeServerId,
				});
			},
		};
	}, [effectiveParentId, parentSessionData, isFork]);

	// ============================================================================
	// Loading / Not-found states
	// ============================================================================
	//
	// IMPORTANT: Do NOT use early returns here. Returning a different component
	// tree unmounts the textarea, losing user input, focus, and all local state.
	// Instead, the loading/not-found states are rendered inline in the content
	// area while the header and input remain mounted.

	const isDataLoading =
		(sessionLoading || messagesLoading) && !optimisticPrompt;
	const isNotFound = !session && !sessionLoading && !optimisticPrompt;

	const hasMessages = messages && messages.length > 0;
	const showOptimistic = !!optimisticPrompt && !hasMessages;

	return (
		<div className="relative flex flex-col h-full bg-background">
			{/* Session header — always mounted */}
			{!hideHeader && (
				<SessionSiteHeader
					sessionId={sessionId}
					sessionTitle={session?.title || "Untitled"}
					onToggleSidePanel={handleTogglePanel}
					isSidePanelOpen={isSidePanelOpen}
					canOpenSidePanel={hasToolCalls}
					leadingAction={headerLeadingAction}
				/>
			)}

			{/* Revert banner — shown when session is in reverted state */}
			{isReverted && session?.revert?.messageID && (
				<RevertBanner
					sessionId={sessionId}
					revertMessageId={session.revert.messageID}
					loading={unrevertSession.isPending}
					onUnrevert={handleUnrevert}
				/>
			)}

			{/* Context modal — triple-click the session title area to open */}
			<SessionContextModal
				open={contextModalOpen}
				onOpenChange={setContextModalOpen}
				messages={messages}
				session={session}
				providers={providers}
			/>

			{/* Content area — loading, not-found, or actual messages */}
			{isDataLoading ? (
				<div className="flex-1 flex items-center justify-center min-h-0">
					<KortixLoader size="small" />
				</div>
			) : isNotFound ? (
				<div className="flex-1 flex items-center justify-center min-h-0 text-sm text-muted-foreground">
					Session not found
				</div>
			) : hasMessages || showOptimistic ? (
				<div className="relative flex-1 min-h-0">
					<div
						ref={scrollContainerCallbackRef}
						className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 bg-background h-full [scroll-behavior:auto]"
					>
						<div
							ref={contentRef}
							role="log"
							className="mx-auto max-w-4xl min-w-0 w-full px-3 sm:px-6"
						>
							<div className="flex flex-col gap-12 min-w-0">
								{/* Fork context divider — shown at the top of forked sessions */}
								{isFork && effectiveParentId && (
									<ForkContextDivider parentID={effectiveParentId} />
								)}

							{/* Optimistic user message */}
							{showOptimistic && (
								<div data-turn-id="optimistic">
									<div className="flex justify-end">
											<div className="flex flex-col max-w-[90%] rounded-3xl rounded-br-lg bg-card border overflow-hidden">
												{(() => {
													const { cleanText, files } = parseFileReferences(
														optimisticPrompt || "",
													);
													return (
														<>
															{files.length > 0 && (
																<div className="flex gap-2 p-3 pb-0 flex-wrap">
																	{files.map((f, i) => (
																		<div
																			key={i}
																			className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30"
																		>
																			<FileText className="size-4 text-muted-foreground shrink-0" />
																			<span className="text-xs text-muted-foreground truncate max-w-[200px]">
																				{f.filename}
																			</span>
																		</div>
																	))}
																</div>
															)}
															{cleanText && (
																<p className="text-sm leading-relaxed whitespace-pre-wrap px-4 py-3">
																	<HighlightMentions
																		text={cleanText}
																		agentNames={agentNames}
																		onFileClick={openFileInComputer}
																	/>
																</p>
															)}
														</>
													);
												})()}
											</div>
										</div>
										<div className="flex items-center gap-3">
											{/* eslint-disable-next-line @next/next/no-img-element */}
											<img
												src="/kortix-logomark-white.svg"
												alt="Kortix"
												className="dark:invert-0 invert flex-shrink-0"
												style={{ height: "14px", width: "auto" }}
											/>
											{isRetrying && (
												<span className="text-xs text-amber-500">
													Retrying connection...
												</span>
											)}
										</div>
								</div>
								)}

								{/* Turn-based message rendering */}
								{turns.map((turn, turnIndex) => {
									// Check if this turn is a compaction summary
									// The server sets `summary: true` on assistant messages that are compaction summaries
									const hasCompaction =
										turn.assistantMessages.some(
											(msg) => (msg.info as any).summary === true,
										) ||
										turn.assistantMessages.some((msg) =>
											msg.parts.some((p) => p.type === "compaction"),
										);

								return (
									<div key={turn.userMessage.info.id} data-turn-id={turn.userMessage.info.id}>
										{/* Compaction divider — shown before the first turn after compaction */}
											{hasCompaction && (
												<div className="flex items-center gap-3 py-4 my-3">
													<div className="flex-1 h-px bg-border" />
													<div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/80 border border-border/60">
														<Layers className="size-3.5 text-muted-foreground" />
														<span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
															Compaction
														</span>
													</div>
													<div className="flex-1 h-px bg-border" />
												</div>
											)}
											<SessionTurn
												turn={turn}
												allMessages={messages!}
												sessionId={sessionId}
												sessionStatus={sessionStatus}
												permissions={pendingPermissions}
												questions={pendingQuestions}
												agentNames={agentNames}
												isFirstTurn={turnIndex === 0}
												isBusy={isBusy}
												isReverted={isReverted}
												isCompaction={hasCompaction}
												onFork={handleFork}
												onRevert={handleRevert}
												providers={providers}
												commandMessages={commandMessagesRef.current}
												commands={commands}
												onPermissionReply={handlePermissionReply}
											/>
										</div>
									);
								})}

								{/* Busy indicator when no turns yet but session is busy */}
								{!showOptimistic && isBusy && turns.length === 0 && (
									<div className="flex items-center gap-3">
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img
											src="/kortix-logomark-white.svg"
											alt="Kortix"
											className="dark:invert-0 invert flex-shrink-0"
											style={{ height: "14px", width: "auto" }}
										/>
									</div>
								)}
							</div>
						{/* Spacer — ensures the last message can scroll to the top of
						    the viewport (ChatGPT-style). Without this, scrollToBottom
						    only brings the last message to the bottom of the screen.
						    Height is dynamically measured from the scroll container so
						    the newest message appears flush at the top. */}
						<div ref={spacerElRef} />
						</div>
					</div>

					{/* Scroll to bottom FAB */}
					<div
						className={cn(
							"absolute bottom-4 left-1/2 -translate-x-1/2 transition-all",
							showScrollButton
								? "opacity-100 translate-y-0"
								: "opacity-0 translate-y-2 pointer-events-none",
						)}
					>
						<Button
							variant="outline"
							size="sm"
							className="rounded-full h-7 text-xs bg-background/90 backdrop-blur-sm border-border/60"
							onClick={smoothScrollToAbsoluteBottom}
						>
							<ArrowDown className="size-3 mr-1" />
							Scroll to bottom
						</Button>
					</div>
				</div>
			) : (
				<SessionWelcome />
			)}

			{/* Input — hidden in read-only mode (sub-session modal) */}
			{!readOnly && (
				<SessionChatInput
				onSend={async (text, files, mentions) => {
					await handleSend(text, files, mentions);
				}}
				isBusy={isBusy}
				onStop={handleStop}
				agents={local.agent.list}
				selectedAgent={local.agent.current?.name ?? null}
				onAgentChange={(name) => local.agent.set(name ?? undefined)}
				commands={commands || []}
				onCommand={handleCommand}
				models={local.model.list}
				selectedModel={local.model.currentKey ?? null}
				onModelChange={(m) => local.model.set(m ?? undefined, { recent: true })}
				variants={local.model.variant.list}
				selectedVariant={local.model.variant.current ?? null}
				onVariantChange={(v) => local.model.variant.set(v ?? undefined)}
				messages={messages}
				sessionId={sessionId}
				onFileSearch={handleFileSearch}
				providers={providers}
				threadContext={threadContext}
				onContextClick={() => setContextModalOpen(true)}
				inputSlot={
					queuedMessages.length > 0 ? (
						<div className="rounded-xl bg-muted/50 overflow-hidden">
							{/* Compact header row */}
							<button
								type="button"
								onClick={() => setQueueExpanded((v) => !v)}
								className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted/80 transition-colors cursor-pointer"
							>
								<ListPlus className="size-3.5 text-muted-foreground flex-shrink-0" />
							<span className="text-xs text-muted-foreground flex-1 text-left truncate">
								{queuedMessages.length} message
								{queuedMessages.length !== 1 ? "s" : ""} queued
								{!queueExpanded && queuedMessages.length > 0 && (
									<span className="text-foreground/80 font-medium">
										{" "}
										· {queuedMessages[0].text.slice(0, 50)}
										{queuedMessages[0].text.length > 50 ? "…" : ""}
									</span>
								)}
							</span>
								<div className="flex items-center gap-1 shrink-0">
									<span
										role="button"
										tabIndex={0}
										onClick={(e) => {
											e.stopPropagation();
											queueClearSession(sessionId);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.stopPropagation();
												queueClearSession(sessionId);
											}
										}}
										className="inline-flex items-center justify-center size-5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
									>
										<X className="size-3" />
									</span>
									<ChevronUp
										className={cn(
											"size-3 text-muted-foreground/40 transition-transform",
											!queueExpanded && "rotate-180",
										)}
									/>
								</div>
							</button>

						{/* Expanded list — show for any number of queued messages */}
						{queueExpanded && queuedMessages.length > 0 && (
							<div className="border-t border-border/30 max-h-[160px] overflow-y-auto scrollbar-hide">
								<div className="flex flex-col px-1.5 py-1">
									{queuedMessages.map((qm, idx) => (
										<div
											key={qm.id}
											className="group/q flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/60 transition-colors"
										>
											<span className="text-[10px] tabular-nums text-muted-foreground/40 shrink-0 w-3 text-center">
												{idx + 1}
											</span>
											<p className="flex-1 text-xs text-muted-foreground truncate min-w-0">
												{qm.text}
											</p>
											<div className="flex items-center gap-0.5 opacity-0 group-hover/q:opacity-100 transition-opacity shrink-0">
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															onClick={() => handleQueueSendNow(qm.id)}
															className="inline-flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
														>
															<Send className="size-2.5" />
														</button>
													</TooltipTrigger>
													<TooltipContent side="top">
														<p className="text-xs">Send now</p>
													</TooltipContent>
												</Tooltip>
												{idx > 0 && (
													<button
														type="button"
														onClick={() => queueMoveUp(qm.id)}
														className="inline-flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
													>
														<ArrowUp className="size-2.5" />
													</button>
												)}
												{idx < queuedMessages.length - 1 && (
													<button
														type="button"
														onClick={() => queueMoveDown(qm.id)}
														className="inline-flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
													>
														<ArrowDown className="size-2.5" />
													</button>
												)}
												<button
													type="button"
													onClick={() => queueRemove(qm.id)}
													className="inline-flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
												>
													<X className="size-2.5" />
												</button>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
						</div>
					) : undefined
				}
				activeQuestion={pendingQuestions.length > 0 ? pendingQuestions[0] : undefined}
				onQuestionReply={handleQuestionReply}
				onQuestionReject={handleQuestionReject}
			/>
			)}
		</div>
	);
}
