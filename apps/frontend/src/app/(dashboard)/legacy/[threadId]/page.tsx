'use client';

import { use, useMemo } from 'react';
import { Loader2, AlertCircle, ChevronRight, History, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnifiedMarkdown } from '@/components/markdown';
import { useLegacyMessages } from '@/hooks/legacy/use-legacy-threads';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface LegacyMsg {
	message_id: string;
	type: string;
	content: unknown;
	created_at: string;
}

interface ParsedTurn {
	id: string;
	userText: string;
	assistantText: string;
	toolCalls: ParsedToolCall[];
}

interface ParsedToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
	result: string;
}

const SKIPPED_TYPES = new Set(['status', 'llm_response_start', 'llm_response_end']);

function parseToolArgs(raw: string): Record<string, unknown> {
	try {
		return JSON.parse(raw);
	} catch {
		return { raw };
	}
}

function parseTurns(messages: LegacyMsg[]): ParsedTurn[] {
	const visible = messages.filter((m) => !SKIPPED_TYPES.has(m.type));
	const turns: ParsedTurn[] = [];
	const toolResults = new Map<string, string>();

	for (const msg of visible) {
		if (msg.type === 'tool') {
			const c = msg.content as any;
			if (c?.tool_call_id) {
				toolResults.set(c.tool_call_id, c.content || '');
			}
		}
	}

	let currentTurn: ParsedTurn | null = null;

	for (const msg of visible) {
		if (msg.type === 'user' || msg.type === 'image_context') {
			if (currentTurn) turns.push(currentTurn);
			currentTurn = {
				id: msg.message_id,
				userText: extractUserText(msg),
				assistantText: '',
				toolCalls: [],
			};
		}

		if (msg.type === 'assistant' && currentTurn) {
			const c = msg.content as any;
			if (c?.content) {
				currentTurn.assistantText += (currentTurn.assistantText ? '\n\n' : '') + c.content;
			}
			if (c?.tool_calls) {
				for (const tc of c.tool_calls) {
					currentTurn.toolCalls.push({
						id: tc.id,
						name: tc.function?.name || 'unknown',
						args: parseToolArgs(tc.function?.arguments || '{}'),
						result: toolResults.get(tc.id) || '',
					});
				}
			}
		}

		if (msg.type === 'reasoning' && currentTurn) {
			const c = msg.content as any;
			const reasoning = c?.reasoning_content;
			if (reasoning) {
				currentTurn.assistantText += (currentTurn.assistantText ? '\n\n' : '') + reasoning;
			}
		}
	}

	if (currentTurn) turns.push(currentTurn);
	return turns;
}

function extractUserText(msg: LegacyMsg): string {
	const content = msg.content as any;
	if (typeof content === 'string') return content;

	if (msg.type === 'image_context' && Array.isArray(content?.content)) {
		return content.content
			.filter((b: any) => b.type === 'text' && b.text)
			.map((b: any) => b.text)
			.join('\n') || '[Image]';
	}

	if (typeof content?.content === 'string') return content.content;
	return '';
}

function toolIcon(name: string) {
	const iconMap: Record<string, string> = {
		computer: '🖥️',
		bash: '⌨️',
		browser: '🌐',
		edit_file: '✏️',
		create_file: '📄',
		read_file: '📖',
		list_directory: '📁',
		search: '🔍',
		grep_search: '🔍',
		find_files: '🔍',
		ask_human: '💬',
	};
	return iconMap[name] || '🔧';
}

function formatToolSubtitle(name: string, args: Record<string, unknown>): string {
	if (args.command && typeof args.command === 'string') {
		return args.command.length > 80 ? args.command.slice(0, 80) + '…' : args.command;
	}
	if (args.path && typeof args.path === 'string') {
		return args.path;
	}
	if (args.query && typeof args.query === 'string') {
		return args.query;
	}
	if (args.url && typeof args.url === 'string') {
		return args.url;
	}
	return '';
}

function LegacyToolCard({ tool }: { tool: ParsedToolCall }) {
	const subtitle = formatToolSubtitle(tool.name, tool.args);

	return (
		<Collapsible>
			<CollapsibleTrigger asChild>
				<div
					className={cn(
						'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
						'bg-muted/20 border border-border/40',
						'text-xs transition-colors select-none',
						'cursor-pointer hover:bg-muted/40',
						'max-w-full group',
					)}
				>
					<span className="flex-shrink-0 text-xs">{toolIcon(tool.name)}</span>
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						{tool.name}
					</span>
					{subtitle && (
						<span className="text-muted-foreground text-xs truncate font-mono">
							{subtitle}
						</span>
					)}
					<ChevronRight className="size-3 text-muted-foreground ml-auto flex-shrink-0 transition-transform group-data-[state=open]:rotate-90" />
				</div>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1 rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
					{tool.result && (
						<div className="p-3 text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground max-h-[300px] overflow-y-auto">
							{tool.result.length > 2000
								? tool.result.slice(0, 2000) + '\n… (truncated)'
								: tool.result}
						</div>
					)}
					{!tool.result && (
						<div className="p-3 text-xs text-muted-foreground/50 italic">
							No output
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function LegacyTurn({ turn }: { turn: ParsedTurn }) {
	return (
		<div className="space-y-3 group/turn">
			{turn.userText && (
				<div className="flex flex-col items-end">
					<div className="flex flex-col max-w-[90%] rounded-3xl rounded-br-lg bg-card border overflow-hidden">
						<div className="px-4 py-3">
							<div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
								{turn.userText}
							</div>
						</div>
					</div>
				</div>
			)}

			{(turn.assistantText || turn.toolCalls.length > 0) && (
				<>
					<div className="flex items-center gap-2 mt-3">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/kortix-logomark-white.svg"
							alt="Kortix"
							className="dark:invert-0 invert flex-shrink-0"
							style={{ height: '14px', width: 'auto' }}
						/>
					</div>

					{turn.toolCalls.length > 0 && (
						<div className="space-y-1.5">
							{turn.toolCalls.map((tc) => (
								<LegacyToolCard key={tc.id} tool={tc} />
							))}
						</div>
					)}

					{turn.assistantText && (
						<div className="text-sm">
							<UnifiedMarkdown content={turn.assistantText} />
						</div>
					)}
				</>
			)}
		</div>
	);
}

export default function LegacyThreadPage({
	params,
}: {
	params: Promise<{ threadId: string }>;
}) {
	const { threadId } = use(params);
	const { data, isLoading, error } = useLegacyMessages(threadId);

	const turns = useMemo(
		() => parseTurns(data?.messages || []),
		[data?.messages],
	);

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
				<AlertCircle className="h-8 w-8 text-destructive" />
				<p className="text-sm text-muted-foreground">Failed to load messages</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-2 px-5 py-3 border-b border-border/50">
				<History className="h-3.5 w-3.5 text-muted-foreground" />
				<span className="text-xs font-medium text-muted-foreground">Previous Chat</span>
				<span className="text-[10px] text-muted-foreground/60">·</span>
				<span className="text-[10px] text-muted-foreground/60">{turns.length} turns</span>
			</div>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-3xl mx-auto px-5 py-6 space-y-8">
					{turns.map((turn) => (
						<LegacyTurn key={turn.id} turn={turn} />
					))}
				</div>
			</div>

			<div className="flex-shrink-0 border-border/50 px-5 py-8">
				<div className="max-w-3xl mx-auto">
					<div className="flex items-center justify-center rounded-3xl border border-border/40 bg-muted/20 px-4 py-6 text-sm text-muted-foreground/60">
						<Lock className="size-3.5 mr-2 flex-shrink-0" />
						This is a read-only archive
					</div>
				</div>
			</div>
		</div>
	);
}
