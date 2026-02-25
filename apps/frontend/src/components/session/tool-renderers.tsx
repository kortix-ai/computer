"use client";

import { createTwoFilesPatch } from "diff";
import { QuestionPrompt } from "@/components/session/question-prompt";
import { SubSessionModal } from "@/components/session/sub-session-modal";
import {
	AlertTriangle,
	Ban,
	BookOpen,

	Check,
	CheckCircle,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	CircleAlert,

	Code2,
	Cpu,
	ExternalLink,
	FileCode2,
	FileIcon,
	FileText,
	Glasses,
	Globe,
	Hash,
	Image as ImageIcon,
	Layers,
	ListTree,
	Loader2,
	Maximize2,
	MessageCircle,
	Minimize2,
	MonitorPlay,
	Music,
	Presentation,
	RefreshCw,
	Scissors,
	Search,
	SquareKanban,
	Terminal,
	Type,
	Video,
} from "lucide-react";
import React, {
	type ComponentType,
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	HighlightedCode,
	UnifiedMarkdown,
} from "@/components/markdown/unified-markdown";
import { useOcFileOpen } from "@/components/thread/tool-views/opencode/useOcFileOpen";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOpenCodeMessages } from "@/hooks/opencode/use-opencode-sessions";
import {
	renderHighlightedLine,
	useDiffHighlight,
} from "@/hooks/use-diff-highlight";
import { cn } from "@/lib/utils";
import {
	hasStructuredContent,
	normalizeToolOutput,
	type OutputSection,
	parseStructuredOutput,
} from "@/lib/utils/structured-output";
import { useAuthenticatedPreviewUrl } from "@/hooks/use-authenticated-preview-url";
import { useFileContent } from "@/features/files/hooks/use-file-content";
import {
	isProxiableLocalhostUrl,
	parseLocalhostUrl,
	proxyLocalhostUrl,
} from "@/lib/utils/sandbox-url";
import { useOpenCodePendingStore } from "@/stores/opencode-pending-store";
import { useServerStore, getActiveOpenCodeUrl, deriveSubdomainOpts } from "@/stores/server-store";
import { openTabAndNavigate } from "@/stores/tab-store";
import { enrichPreviewMetadata } from "@/lib/utils/session-context";

import {
	type ApplyPatchFile,
	computeStatusFromPart,
	type Diagnostic,
	getChildSessionId,
	getChildSessionToolParts,
	getDiagnostics,
	getDirectory,
	getFilename,
	getPermissionForTool,
	getToolInfo,
	isToolPart,
	type MessageWithParts,
	PERMISSION_LABELS,
	type PermissionRequest,
	type QuestionRequest,
	shouldShowToolPart,
	stripAnsi,
	type ToolInfo,
	type ToolPart,
	type TriggerTitle,
} from "@/ui";

// ============================================================================
// Shared CSS overrides — strip CodeBlock's nested border/bg/padding inside
// the BasicTool body wrapper to avoid the double-border look.
// ============================================================================
const MD_FLUSH_CLASSES =
	"[&_.relative.group]:my-0 [&_pre]:my-0 [&_pre]:border-0 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:rounded-none [&_pre]:text-[12px] [&_code]:text-[12px]";

// ============================================================================
// InlineServicePreview — reusable embedded iframe preview for localhost URLs
// ============================================================================

function useProxyUrl(localhostUrl: string): { proxyUrl: string; port: number } | null {
	const activeServer = useServerStore((s) => {
		return s.servers.find((srv) => srv.id === s.activeServerId) ?? null;
	});
	const serverUrl = activeServer?.url || getActiveOpenCodeUrl();
	const mappedPorts = activeServer?.mappedPorts;
	const subdomainOpts = useMemo(() => deriveSubdomainOpts(activeServer), [activeServer]);

	return useMemo(() => {
		if (!localhostUrl) return null;
		if (!isProxiableLocalhostUrl(localhostUrl)) return null;
		const parsed = parseLocalhostUrl(localhostUrl);
		if (!parsed) return null;
		const proxyUrl = proxyLocalhostUrl(localhostUrl, serverUrl, mappedPorts, subdomainOpts);
		if (!proxyUrl) return null;
		return {
			proxyUrl,
			port: parsed.port,
		};
	}, [localhostUrl, serverUrl, mappedPorts, subdomainOpts]);
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

function normalizeWorkspacePath(path: string): string {
	const trimmed = path.trim();
	if (trimmed.startsWith('/workspace/')) return trimmed;
	if (trimmed === 'workspace') return '/workspace';
	if (trimmed.startsWith('workspace/')) return `/${trimmed}`;
	return trimmed;
}

function isLocalSandboxFilePath(value: string): boolean {
	if (!value) return false;
	if (/^(https?:|data:|blob:)/i.test(value)) return false;
	return value.startsWith('/');
}

function InlineServicePreview({
	url,
	label,
}: {
	url: string;
	label?: string;
}) {
	const proxy = useProxyUrl(url);
	const authenticatedUrl = useAuthenticatedPreviewUrl(proxy?.proxyUrl || url);
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	// ── Scaled 1920×1080 viewport ──
	const viewportRef = useRef<HTMLDivElement>(null);
	const [viewportScale, setViewportScale] = useState(0);
	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const update = () => {
			const w = el.clientWidth;
			if (w > 0) setViewportScale(w / 1920);
		};
		const ro = new ResizeObserver(update);
		ro.observe(el);
		update();
		return () => ro.disconnect();
	}, []);

	const handleRefresh = useCallback(() => {
		setIsLoading(true);
		setHasError(false);
		setRefreshKey((k) => k + 1);
	}, []);

	useEffect(() => {
		if (!isLoading) return;
		const t = setTimeout(() => setIsLoading(false), 5000);
		return () => clearTimeout(t);
	}, [isLoading, refreshKey]);

	const displayLabel = label || (proxy ? `localhost:${proxy.port}` : url);

	const navigateToPreviewTab = useCallback(() => {
		if (!proxy) return;
		openTabAndNavigate({
			id: `preview:${proxy.port}`,
			title: `localhost:${proxy.port}`,
			type: "preview",
			href: `/preview/${proxy.port}`,
			metadata: {
				url: proxy.proxyUrl,
				port: proxy.port,
				originalUrl: url,
			},
		});
	}, [proxy, url]);

	const scaledHeight = viewportScale > 0 ? Math.round(1080 * viewportScale) : 0;

	return (
		<div className="rounded-lg border border-border/50 overflow-hidden">
			{/* Mini browser toolbar */}
			<div className="flex items-center gap-1.5 h-8 px-2.5 bg-muted/40 border-b border-border/30 shrink-0">
				<div className="flex-1 flex items-center gap-1.5 min-w-0">
					<Globe className="h-3 w-3 text-muted-foreground/50 shrink-0" />
					<span className="text-[11px] text-muted-foreground font-mono truncate">
						{displayLabel}
					</span>
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleRefresh}
							className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
						>
							<RefreshCw
								className={cn("h-3 w-3", isLoading && "animate-spin")}
							/>
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">Refresh</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => window.open(authenticatedUrl, "_blank", "noopener,noreferrer")}
							className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
						>
							<ExternalLink className="h-3 w-3" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">Open in browser</TooltipContent>
				</Tooltip>
				{proxy && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={navigateToPreviewTab}
								className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors"
							>
								<MonitorPlay className="h-3 w-3" />
								Preview
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">Open as tab</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Scaled 1920×1080 viewport — iframe renders at full desktop res, CSS-scaled to fit */}
			<div
				ref={viewportRef}
				className="relative overflow-hidden bg-white"
				style={{ height: scaledHeight > 0 ? `${scaledHeight}px` : "400px" }}
			>
				{isLoading && (
					<div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
						<div className="flex items-center gap-2 text-muted-foreground">
							<RefreshCw className="h-4 w-4 animate-spin" />
							<span className="text-xs">Loading preview...</span>
						</div>
					</div>
				)}
				{hasError && (
					<div className="absolute inset-0 flex items-center justify-center bg-background z-10">
						<div className="text-center text-muted-foreground">
							<p className="text-xs">Failed to load</p>
							<button
								type="button"
								onClick={handleRefresh}
								className="text-xs text-primary hover:underline mt-1"
							>
								Retry
							</button>
						</div>
					</div>
				)}
				{viewportScale > 0 && (
					<iframe
						key={refreshKey}
						src={authenticatedUrl}
						title={displayLabel}
						className="border-0 bg-white"
						style={{
							width: "1920px",
							height: "1080px",
							transform: `scale(${viewportScale})`,
							transformOrigin: "0 0",
							position: "absolute",
							top: 0,
							left: 0,
						}}
						sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
						onLoad={() => setIsLoading(false)}
						onError={() => {
							setIsLoading(false);
							setHasError(true);
						}}
					/>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// Tool Registry
// ============================================================================

interface ToolProps {
	part: ToolPart;
	sessionId?: string;
	defaultOpen?: boolean;
	forceOpen?: boolean;
	locked?: boolean;
	hasActiveQuestion?: boolean;
	onPermissionReply?: (
		requestId: string,
		reply: "once" | "always" | "reject",
	) => void;
}

type ToolComponent = ComponentType<ToolProps>;

const registry = new Map<string, ToolComponent>();

export const ToolRegistry = {
	register(name: string, component: ToolComponent) {
		registry.set(name, component);
	},
	get(name: string): ToolComponent | undefined {
		return registry.get(name);
	},
};

// ============================================================================
// Helper: parse partial/incomplete JSON from streaming tool input
// ============================================================================

/**
 * Attempts to extract key-value pairs from a partial/incomplete JSON string.
 * This is used during fine-grained tool streaming when the tool arguments
 * are still being streamed and may not yet form valid JSON.
 *
 * Strategy:
 * 1. Try JSON.parse first (works if the JSON happens to be complete)
 * 2. Fall back to regex extraction of "key": "value" pairs
 */
function parsePartialJSON(raw: string): Record<string, unknown> {
	if (!raw) return {};
	// Try full parse first
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null) return parsed;
	} catch {
		// expected — JSON is incomplete
	}
	// Try closing braces/brackets to make it valid
	try {
		let attempt = raw.trim();
		// Count unclosed braces/brackets
		let braces = 0;
		let brackets = 0;
		let inString = false;
		let escape = false;
		for (const ch of attempt) {
			if (escape) { escape = false; continue; }
			if (ch === "\\") { escape = true; continue; }
			if (ch === '"') { inString = !inString; continue; }
			if (inString) continue;
			if (ch === "{") braces++;
			if (ch === "}") braces--;
			if (ch === "[") brackets++;
			if (ch === "]") brackets--;
		}
		// If we're inside a string, close it
		if (inString) attempt += '"';
		// Close any open brackets/braces
		for (let i = 0; i < brackets; i++) attempt += "]";
		for (let i = 0; i < braces; i++) attempt += "}";
		const parsed = JSON.parse(attempt);
		if (typeof parsed === "object" && parsed !== null) return parsed;
	} catch {
		// still can't parse
	}
	// Last resort: regex extract complete "key": "value" pairs
	const result: Record<string, unknown> = {};
	const re = /"(\w+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
	let m;
	while ((m = re.exec(raw)) !== null) {
		result[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	}
	return result;
}

/**
 * Returns tool input, falling back to partial JSON from the streaming `raw`
 * field during the pending state. This allows tool renderers to show early
 * data (filenames, commands, etc.) before the full tool call is parsed.
 */
function partStreamingInput(part: ToolPart): Record<string, unknown> {
	const input = part.state.input ?? {};
	if (Object.keys(input).length > 0) return input;
	// During pending state, try to parse the streaming raw field
	if (part.state.status === "pending" && "raw" in part.state) {
		const raw = (part.state as any).raw as string;
		if (raw) return parsePartialJSON(raw);
	}
	return input;
}

// ============================================================================
// Helper: extract input/metadata/output/status from part
// ============================================================================

function partInput(part: ToolPart): Record<string, unknown> {
	return part.state.input ?? {};
}

function partMetadata(part: ToolPart): Record<string, unknown> {
	if (
		part.state.status === "completed" ||
		part.state.status === "running" ||
		part.state.status === "error"
	) {
		return (part.state.metadata as Record<string, unknown>) ?? {};
	}
	return {};
}

function partOutput(part: ToolPart): string {
	if (part.state.status === "completed") {
		const raw = part.state.output ?? "";
		// Strip <bash_metadata> and similar internal XML tags from tool output
		return raw
			.replace(/<bash_metadata>[\s\S]*?<\/bash_metadata>/g, "")
			.replace(
				/<\/?(?:system_info|exit_code|stderr_note)>[\s\S]*?(?:<\/\w+>)?$/g,
				"",
			)
			.trim();
	}
	return "";
}

function partStatus(part: ToolPart): string {
	return part.state.status;
}

// ============================================================================
// StatusIcon
// ============================================================================

function StatusIcon({ status }: { status: string }) {
	switch (status) {
		case "completed":
			return <Check className="size-3 text-emerald-500 flex-shrink-0" />;
		case "error":
			return (
				<CircleAlert className="size-3 text-muted-foreground flex-shrink-0" />
			);
		case "running":
		case "pending":
			return (
				<Loader2 className="size-3 animate-spin text-muted-foreground flex-shrink-0" />
			);
		default:
			return null;
	}
}

// ============================================================================
// TriggerTitle type guard
// ============================================================================

function isTriggerTitle(val: unknown): val is TriggerTitle {
	return (
		typeof val === "object" &&
		val !== null &&
		"title" in val &&
		typeof (val as TriggerTitle).title === "string"
	);
}

// ============================================================================
// ToolEmptyState — subtle empty-state body for tools with no results.
// Ensures BasicTool still sees non-null children so the chevron renders.
// ============================================================================

function ToolEmptyState({ message }: { message: string }) {
	return (
		<div className="flex items-center justify-center gap-1.5 px-3 py-3 text-muted-foreground/40">
			<Search className="size-3" />
			<span className="text-[11px]">{message}</span>
		</div>
	);
}

// ============================================================================
// ToolOutputFallback — smart fallback for raw tool output.
// Detects error-like text and renders it via ToolError; otherwise renders
// as UnifiedMarkdown (or plain pre for mono output).
// ============================================================================

/** Heuristic: does this output look like an error message? */
function looksLikeError(text: string): boolean {
	const t = text.trim();
	if (t.length > 500) return false; // long output is probably real content
	if (/^Error:\s/i.test(t)) return true;
	if (/^([\w._-]+Error|[\w._-]+Exception):\s/i.test(t)) return true;
	if (/Traceback \(most recent call last\)/i.test(t)) return true;
	if (/^\s*\[\s*\{[\s\S]*"message"\s*:/.test(t)) return true; // JSON validation
	return false;
}

function ToolOutputFallback({
	output,
	isStreaming = false,
	toolName,
}: {
	output: string;
	isStreaming?: boolean;
	toolName?: string;
}) {
	if (!isStreaming && looksLikeError(output)) {
		return (
			<div className="p-0">
				<ToolError error={output} toolName={toolName} />
			</div>
		);
	}

	return (
		<div
			data-scrollable
			className={`p-2 max-h-72 overflow-auto ${MD_FLUSH_CLASSES}`}
		>
			<UnifiedMarkdown content={output} isStreaming={isStreaming} />
		</div>
	);
}

// ============================================================================
// BasicTool — collapsible wrapper
// ============================================================================

interface BasicToolProps {
	icon: ReactNode;
	trigger: TriggerTitle | ReactNode;
	children?: ReactNode;
	defaultOpen?: boolean;
	forceOpen?: boolean;
	locked?: boolean;
	onSubtitleClick?: () => void;
}

/** Context to pass running state from ToolPartRenderer into BasicTool without prop drilling */
const ToolRunningContext = createContext(false);
/** Context to pass stale-pending state from ToolPartRenderer into BasicTool */
const StalePendingContext = createContext(false);

export function BasicTool({
	icon,
	trigger,
	children,
	defaultOpen = false,
	forceOpen,
	locked,
	onSubtitleClick,
}: BasicToolProps) {
	const running = useContext(ToolRunningContext);
	const [open, setOpen] = useState(defaultOpen);

	// Track if this tool just finished (running → not running) so we can
	// play a single completion shimmer. If it was already completed on mount
	// (e.g. reopening a session), don't shimmer.
	const wasRunningRef = useRef(running);
	const [justCompleted, setJustCompleted] = useState(false);
	useEffect(() => {
		if (wasRunningRef.current && !running) {
			setJustCompleted(true);
		}
		wasRunningRef.current = running;
	}, [running]);

	useEffect(() => {
		if (forceOpen) setOpen(true);
	}, [forceOpen]);

	const handleOpenChange = useCallback(
		(value: boolean) => {
			if (locked && !value) return;
			setOpen(value);
		},
		[locked],
	);

	// Determine if trigger content is effectively empty so we can show skeleton
	const triggerIsEmpty = isTriggerTitle(trigger)
		? !trigger.title && !trigger.subtitle
		: false;

	return (
		<Collapsible open={open} onOpenChange={handleOpenChange}>
			<CollapsibleTrigger asChild>
				<div
					data-component="tool-trigger"
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
						"bg-muted/20 border border-border/40",
						"text-xs transition-colors select-none",
						"cursor-pointer hover:bg-muted/40",
						"max-w-full group",
					)}
				>
					{/* Icon */}
					<span className="flex-shrink-0">{icon}</span>

					{/* Trigger content */}
					<div className="flex items-center gap-1.5 min-w-0 flex-1">
						{isTriggerTitle(trigger) ? (
							<>
								<span className="font-medium text-xs text-foreground whitespace-nowrap">
									{trigger.title}
								</span>
							{trigger.subtitle && (
								running ? (
									<TextShimmer duration={1} spread={2} className="text-xs truncate font-mono">
										{trigger.subtitle}
									</TextShimmer>
								) : (
									<span
										className={cn(
											"text-muted-foreground text-xs truncate font-mono",
											onSubtitleClick &&
												"cursor-pointer hover:text-foreground underline-offset-2 hover:underline",
										)}
										onClick={
											onSubtitleClick
												? (e) => {
														e.stopPropagation();
														onSubtitleClick();
													}
												: undefined
										}
									>
										{justCompleted ? (
											<TextShimmer duration={1} spread={2} repeat={1} className="text-xs font-mono">
												{trigger.subtitle}
											</TextShimmer>
										) : trigger.subtitle}
									</span>
								)
							)}
								{trigger.args &&
									trigger.args.length > 0 &&
									trigger.args.map((arg, i) => (
										<span
											key={i}
											className="text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono whitespace-nowrap"
										>
											{arg}
										</span>
									))}
							</>
						) : (
							trigger
						)}
						{/* Skeleton placeholders when running but trigger has no content yet */}
						{running && triggerIsEmpty && (
							<>
								<span className="h-3 w-16 rounded bg-muted-foreground/10 animate-pulse" />
								<span className="h-3 w-28 rounded bg-muted-foreground/10 animate-pulse" />
							</>
						)}
					</div>

					{/* Right side: spinner when running (+ chevron if expandable), chevron when done */}
					{running && (
						<Loader2 className="size-3 animate-spin text-muted-foreground/40 flex-shrink-0" />
					)}
					{children && !locked && (
						<ChevronRight
							className={cn(
								"size-3 transition-transform flex-shrink-0 text-muted-foreground/50",
								open && "rotate-90",
							)}
						/>
					)}
				</div>
			</CollapsibleTrigger>

			{children && (
				<CollapsibleContent>
					<div className="mt-1.5 mb-2 rounded-lg bg-muted/20 border border-border/30 text-xs overflow-hidden">
						{children}
					</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}

// ============================================================================
// InlineDiffView
// ============================================================================

function InlineDiffView({
	oldValue,
	newValue,
	filename,
}: {
	oldValue: string;
	newValue: string;
	filename: string;
}) {
	const patch = useMemo(() => {
		if (!oldValue && !newValue) return "";
		return createTwoFilesPatch(
			filename,
			filename,
			oldValue || "",
			newValue || "",
			"",
			"",
		);
	}, [oldValue, newValue, filename]);

	const diffLines = useMemo(() => patch.split("\n").slice(4), [patch]);

	// Extract code content (without +/-/space prefix) for highlighting
	const codeLines = useMemo(
		() =>
			diffLines.map((line) => {
				if (line.startsWith("@@") || line === "") return "";
				return line.length > 0 ? line.substring(1) : "";
			}),
		[diffLines],
	);

	const highlighted = useDiffHighlight(codeLines, filename);

	if (!patch) return null;

	return (
		<pre className="p-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
			{diffLines.map((line, i) => {
				const isAdd = line.startsWith("+");
				const isDel = line.startsWith("-");
				const isHunk = line.startsWith("@@");

				let cls = "text-muted-foreground/80";
				if (isAdd) cls = "bg-emerald-500/5";
				else if (isDel) cls = "bg-red-500/5";
				else if (isHunk) cls = "text-blue-500/70";

				if (isHunk || line === "") {
					return (
						<div key={i} className={cls}>
							{line}
						</div>
					);
				}

				const prefix = line[0] || " ";
				const highlightedTokens = highlighted?.[i];

				if (highlightedTokens) {
					const html = renderHighlightedLine(highlightedTokens, codeLines[i]);
					return (
						<div key={i} className={cls}>
							<span
								className={cn(
									isAdd && "text-emerald-500",
									isDel && "text-red-500",
								)}
							>
								{prefix}
							</span>
							<span dangerouslySetInnerHTML={{ __html: html }} />
						</div>
					);
				}

				return (
					<div
						key={i}
						className={cn(
							cls,
							isAdd && "text-emerald-500",
							isDel && "text-red-500",
						)}
					>
						{line}
					</div>
				);
			})}
		</pre>
	);
}

// ============================================================================
// DiagnosticsDisplay
// ============================================================================

function DiagnosticsDisplay({ diagnostics }: { diagnostics: Diagnostic[] }) {
	if (diagnostics.length === 0) return null;

	return (
		<div className="space-y-1 px-2 pb-2">
			{diagnostics.map((d, i) => (
				<div
					key={i}
					className="flex items-start gap-1.5 text-[10px] text-red-500"
				>
					<CircleAlert className="size-3 flex-shrink-0 mt-0.5" />
					<span>
						[{d.range.start.line + 1}:{d.range.start.character + 1}] {d.message}
					</span>
				</div>
			))}
		</div>
	);
}

// ============================================================================
// DiffChanges
// ============================================================================

function DiffChanges({
	additions,
	deletions,
}: {
	additions: number;
	deletions: number;
}) {
	if (additions === 0 && deletions === 0) return null;

	return (
		<span className="flex items-center gap-1.5 text-[10px] ml-auto whitespace-nowrap">
			{additions > 0 && <span className="text-emerald-500">+{additions}</span>}
			{deletions > 0 && <span className="text-red-500">-{deletions}</span>}
		</span>
	);
}

// ============================================================================
// Structured Output — imported from shared utility
// ============================================================================

/**
 * Render parsed structured output sections with semantic styling.
 */
function StructuredOutput({ sections }: { sections: OutputSection[] }) {
	const [showTrace, setShowTrace] = useState(false);

	return (
		<div className="space-y-1.5 p-2.5">
			{sections.map((section, i) => {
				switch (section.type) {
					case "warning":
						return (
							<div
								key={i}
								className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-yellow-500/5 border border-yellow-500/15"
							>
								<AlertTriangle className="size-3 flex-shrink-0 mt-0.5 text-yellow-500" />
								<p className="text-[11px] leading-relaxed text-yellow-700 dark:text-yellow-400 font-mono break-words">
									{section.text}
								</p>
							</div>
						);

					case "error":
						return (
							<div
								key={i}
								className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/60"
							>
								<Ban className="size-3 flex-shrink-0 mt-0.5 text-muted-foreground/70" />
								<div className="min-w-0 flex-1">
									{section.errorType && (
										<span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
											{section.errorType}
										</span>
									)}
									<p className="text-[11px] leading-relaxed text-muted-foreground font-mono break-words">
										{section.summary}
									</p>
								</div>
							</div>
						);

					case "traceback":
						return (
							<div key={i}>
								<button
									onClick={() => setShowTrace((v) => !v)}
									className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer w-full text-left"
								>
									<ChevronRight
										className={cn(
											"size-3 transition-transform flex-shrink-0",
											showTrace && "rotate-90",
										)}
									/>
									<span className="text-[10px] font-medium">Stack trace</span>
									<span className="text-[10px] text-muted-foreground/40 font-mono ml-1">
										{section.lines.length} lines
									</span>
								</button>
								{showTrace && (
									<div className="mt-1 rounded-md bg-muted/20 border border-border/30 overflow-hidden">
										<pre className="p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground/60 whitespace-pre-wrap break-all max-h-64 overflow-auto">
											{section.lines.map((line, li) => {
												// Highlight File "..." lines within the trace
												if (/^\s+File "/.test(line)) {
													return (
														<span key={li} className="text-muted-foreground/80">
															{line}
															{"\n"}
														</span>
													);
												}
												return (
													<span key={li}>
														{line}
														{"\n"}
													</span>
												);
											})}
										</pre>
									</div>
								)}
							</div>
						);

					case "install":
						return (
							<div
								key={i}
								className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/15"
							>
								<CheckCircle className="size-3 flex-shrink-0 text-emerald-500" />
								<span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
									{section.text}
								</span>
							</div>
						);

					case "info":
						return (
							<div
								key={i}
								className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-muted-foreground font-mono"
							>
								<span className="size-1 rounded-full bg-muted-foreground/30 flex-shrink-0" />
								<span className="break-words">{section.text}</span>
							</div>
						);

					case "plain":
						return (
							<pre
								key={i}
								className="px-2.5 py-1 font-mono text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-words"
							>
								{section.text}
							</pre>
						);

					default:
						return null;
				}
			})}
		</div>
	);
}

// ============================================================================
// Tool Renderers — self-registering
// ============================================================================

// --- Bash ---

/**
 * Try to pretty-print JSON output. Handles single JSON, arrays, and
 * mixed output with `===` section separators (e.g. reading multiple files).
 */
function formatBashOutput(rawOutput: string): {
	content: string;
	lang: string;
} {
	const trimmed = rawOutput.trim();
	if (!trimmed) return { content: "", lang: "bash" };

	// Try single JSON parse and pretty-print
	try {
		const parsed = JSON.parse(trimmed);
		return { content: JSON.stringify(parsed, null, 2), lang: "json" };
	} catch {
		/* not a single JSON blob */
	}

	// Check if it's a multi-section output (=== separators with JSON blocks)
	if (trimmed.includes("===") && trimmed.includes("{")) {
		const sections = trimmed.split(/^(={2,}\s.*)/m);
		let hasJson = false;
		const formatted = sections
			.map((section) => {
				const st = section.trim();
				if (!st) return "";
				if (/^={2,}\s/.test(st)) return st;
				try {
					const parsed = JSON.parse(st);
					hasJson = true;
					return JSON.stringify(parsed, null, 2);
				} catch {
					return st;
				}
			})
			.filter(Boolean)
			.join("\n\n");
		if (hasJson) return { content: formatted, lang: "json" };
	}

	// Plain text output — keep as bash
	return { content: trimmed, lang: "bash" };
}

// --- Session metadata rich rendering ---

interface ParsedSessionMeta {
	id: string;
	slug?: string;
	title: string;
	directory?: string;
	time: { created: number; updated: number };
	summary?: { additions: number; deletions: number; files: number };
	filePath?: string;
}

/**
 * Try to parse the === separator + JSON output as an array of session metadata objects.
 * Returns null if the output doesn't match the pattern.
 */
function parseSessionMetadataOutput(
	output: string,
): ParsedSessionMeta[] | null {
	const trimmed = output.trim();
	if (!trimmed.includes("===") || !trimmed.includes('"id"')) return null;

	// Split by === headers, extract JSON blocks
	const parts = trimmed.split(/^={2,}\s*(.*?)\s*={0,}\s*$/m);
	const sessions: ParsedSessionMeta[] = [];

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i].trim();
		if (!part) continue;

		// Try to parse as JSON session metadata
		try {
			const parsed = JSON.parse(part);
			if (parsed && typeof parsed === "object" && parsed.id && parsed.time) {
				// Look backwards for the file path header
				const header = i > 0 ? parts[i - 1]?.trim() : undefined;
				sessions.push({
					id: parsed.id,
					slug: parsed.slug,
					title: parsed.title || parsed.slug || "Untitled",
					directory: parsed.directory,
					time: parsed.time,
					summary: parsed.summary,
					filePath: header || undefined,
				});
			}
		} catch {
			/* not JSON */
		}
	}

	return sessions.length > 0 ? sessions : null;
}

function formatSessionTime(timestamp: number): string {
	const d = new Date(timestamp);
	const now = Date.now();
	const diff = now - timestamp;
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 7) return `${days}d ago`;
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SessionMetadataList({ sessions }: { sessions: ParsedSessionMeta[] }) {
	return (
		<div className="flex flex-col gap-1 p-1.5">
			<div className="px-1.5 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
				{sessions.length} session{sessions.length !== 1 ? "s" : ""}
			</div>
			{sessions.map((s) => (
				<button
					key={s.id}
					onClick={() =>
						openTabAndNavigate({
							id: s.id,
							title: s.title || "Session",
							type: "session",
							href: `/sessions/${s.id}`,
							serverId: useServerStore.getState().activeServerId,
						})
					}
					className={cn(
						"flex items-start gap-2.5 px-2.5 py-2 rounded-md text-left w-full",
						"hover:bg-muted/60 transition-colors group cursor-pointer",
					)}
				>
					<MessageCircle className="size-3.5 flex-shrink-0 mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors" />
					<div className="flex flex-col gap-0.5 min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-foreground truncate">
								{s.title}
							</span>
							{s.summary && s.summary.files > 0 && (
								<span className="flex items-center gap-1 text-[10px] flex-shrink-0">
									{s.summary.additions > 0 && (
										<span className="text-emerald-500">
											+{s.summary.additions}
										</span>
									)}
									{s.summary.deletions > 0 && (
										<span className="text-red-500">-{s.summary.deletions}</span>
									)}
									<span className="text-muted-foreground">
										{s.summary.files} file{s.summary.files !== 1 ? "s" : ""}
									</span>
								</span>
							)}
						</div>
						<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
							<span className="font-mono truncate">{s.slug || s.id}</span>
							<span className="flex-shrink-0">
								{formatSessionTime(s.time.updated)}
							</span>
						</div>
					</div>
					<ExternalLink className="size-3 flex-shrink-0 mt-1 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
				</button>
			))}
		</div>
	);
}

// --- Session messages rich rendering ---

interface ParsedSessionMessage {
	index: number;
	role: string;
	cost: number;
	content: string;
	tools?: string;
}

function parseSessionMessagesOutput(
	output: string,
): ParsedSessionMessage[] | null {
	const trimmed = output.trim();
	if (!trimmed.includes("--- Msg ")) return null;

	const msgRegex = /---\s*Msg\s+(\d+)\s+\[(\w+)\]\s+cost=\$?([\d.]+)\s*---/g;
	const matches = [...trimmed.matchAll(msgRegex)];
	if (matches.length < 1) return null;

	const messages: ParsedSessionMessage[] = [];
	for (let i = 0; i < matches.length; i++) {
		const m = matches[i];
		const start = m.index! + m[0].length;
		const end = i + 1 < matches.length ? matches[i + 1].index! : trimmed.length;
		const rawContent = trimmed.slice(start, end).trim();

		const toolsMatch = rawContent.match(/^\s*Tools used:\s*(.+)$/m);
		const content = rawContent.replace(/^\s*Tools used:\s*.+$/m, "").trim();

		messages.push({
			index: parseInt(m[1], 10),
			role: m[2].toLowerCase(),
			cost: parseFloat(m[3]),
			content,
			tools: toolsMatch?.[1],
		});
	}

	return messages.length > 0 ? messages : null;
}

function InlineSessionMessagesList({
	messages,
}: {
	messages: ParsedSessionMessage[];
}) {
	return (
		<div className="flex flex-col gap-1 p-1.5">
			<div className="px-1.5 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
				{messages.length} message{messages.length !== 1 ? "s" : ""}
			</div>
			{messages.map((msg) => (
				<div
					key={msg.index}
					className={cn(
						"rounded-md border overflow-hidden",
						msg.role === "user" ? "border-border/60" : "border-border/40",
					)}
				>
					<div
						className={cn(
							"flex items-center gap-2 px-2.5 py-1",
							msg.role === "user" ? "bg-muted/50" : "bg-card",
						)}
					>
						<span
							className={cn(
								"text-[10px] font-semibold uppercase tracking-wide",
								msg.role === "user" ? "text-blue-500" : "text-emerald-500",
							)}
						>
							{msg.role}
						</span>
						<span className="text-[10px] text-muted-foreground/50 ml-auto">
							#{msg.index}
						</span>
						{msg.cost > 0 && (
							<span className="text-[10px] text-muted-foreground/50">
								${msg.cost.toFixed(4)}
							</span>
						)}
					</div>
					<div className="px-2.5 py-1.5">
						<div className="text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
							{msg.content.slice(0, 800)}
							{msg.content.length > 800 && (
								<span className="text-muted-foreground/50">
									{" "}
									... (truncated)
								</span>
							)}
						</div>
						{msg.tools && (
							<div className="mt-1 flex items-center gap-1 flex-wrap">
								{msg.tools.split(",").map((t, i) => {
									const trimmedTool = t.trim();
									const nameMatch = trimmedTool.match(/^(\w+)\s*\((\w+)\)/);
									const name = nameMatch?.[1] || trimmedTool;
									const toolStatus = nameMatch?.[2] || "";
									return (
										<span
											key={i}
											className={cn(
												"text-[9px] px-1 py-0.5 rounded border",
												toolStatus === "completed"
													? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
													: "bg-muted/50 border-border/50 text-muted-foreground",
											)}
										>
											{name}
										</span>
									);
								})}
							</div>
						)}
					</div>
				</div>
			))}
		</div>
	);
}

function BashTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const streamingInput = partStreamingInput(part);
	const metadata = partMetadata(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const running = useContext(ToolRunningContext);
	const command =
		(input.command as string) || (metadata.command as string) || (streamingInput.command as string) || "";
	const description = (input.description as string) || (streamingInput.description as string) || "";
	const strippedOutput = output ? stripAnsi(output) : "";

	// Try to detect session metadata output for rich rendering
	const sessionMeta = useMemo(
		() => parseSessionMetadataOutput(strippedOutput),
		[strippedOutput],
	);

	// Try to detect session messages output (--- Msg N [ROLE] cost=$X.XXXX ---)
	const sessionMessages = useMemo(
		() => (sessionMeta ? null : parseSessionMessagesOutput(strippedOutput)),
		[strippedOutput, sessionMeta],
	);

	// Try to detect structured log-like output (warnings, tracebacks, etc.)
	const structuredSections = useMemo(() => {
		if (sessionMeta || sessionMessages || !strippedOutput) return null;
		const normalized = normalizeToolOutput(strippedOutput);
		if (!hasStructuredContent(normalized)) return null;
		return parseStructuredOutput(normalized);
	}, [strippedOutput, sessionMeta, sessionMessages]);

	const outputBlock = useMemo(() => {
		if (!strippedOutput || sessionMeta || sessionMessages || structuredSections)
			return "";
		const { content, lang } = formatBashOutput(strippedOutput);
		return `\`\`\`${lang}\n${content}\n\`\`\``;
	}, [strippedOutput, sessionMeta, sessionMessages, structuredSections]);

	const hasOutput =
		!!sessionMeta || !!sessionMessages || !!structuredSections || !!outputBlock;

	const isStreaming = status === "pending" && running;
	const isWaiting = !command && running;
	const isStalePending = !command && !running && (status === "pending" || status === "running");

	return (
		<BasicTool
			icon={<Terminal className="size-3.5 flex-shrink-0" />}
			trigger={isStalePending ? (
			<div className="flex items-center gap-1.5 min-w-0 flex-1">
				<span className="font-medium text-xs text-foreground whitespace-nowrap">Shell</span>
				<TextShimmer duration={1} spread={2} className="text-xs italic">
					Working...
				</TextShimmer>
			</div>
		) : { title: "Shell", subtitle: description || (isWaiting ? "Preparing command..." : undefined) }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			<div data-scrollable className="max-h-96 overflow-auto">
				{/* Command */}
				<div className="px-3 py-2.5 [&_code]:text-[12px] [&_code]:leading-relaxed [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:contents">
					{isWaiting ? (
						<div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
							<div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
								<Loader2 className="size-3 animate-spin" />
								<span>Preparing command...</span>
							</div>
						</div>
				) : isStalePending ? (
					<div className="px-3 py-2 text-muted-foreground/60 text-[11px] italic">
						Preparing command...
					</div>
				) : (
						<HighlightedCode code={`$ ${command}`} language="bash">
							{`$ ${command}`}
						</HighlightedCode>
					)}
				</div>
				{/* Output */}
				{hasOutput && (
					<div className="mx-2 mb-2 rounded-md border border-border/40 bg-background/50 overflow-hidden">
						{/* Output label */}
						<div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-border/30">
							<div className="size-1.5 rounded-full bg-muted-foreground/25" />
							<span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
								Output
							</span>
						</div>
						{sessionMeta ? (
							<div className="p-2">
								<SessionMetadataList sessions={sessionMeta} />
							</div>
						) : sessionMessages ? (
							<div className="p-2">
								<InlineSessionMessagesList messages={sessionMessages} />
							</div>
						) : structuredSections ? (
							<div className="p-2">
								<StructuredOutput sections={structuredSections} />
							</div>
						) : outputBlock ? (
							<div className={`p-2 ${MD_FLUSH_CLASSES}`}>
								<UnifiedMarkdown
									content={outputBlock}
									isStreaming={status === "running"}
								/>
							</div>
						) : null}
					</div>
				)}
			</div>
		</BasicTool>
	);
}
ToolRegistry.register("bash", BashTool);

// --- Pty Spawn ---
function PtySpawnTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);

	const parsed = useMemo(() => {
		const match = output.match(/<pty_spawned>([\s\S]*?)<\/pty_spawned>/);
		if (!match) return null;
		const fields: Record<string, string> = {};
		for (const line of match[1].trim().split("\n")) {
			const colonIdx = line.indexOf(":");
			if (colonIdx > 0) {
				fields[line.slice(0, colonIdx).trim()] = line
					.slice(colonIdx + 1)
					.trim();
			}
		}
		return fields;
	}, [output]);

	const title = parsed?.Title || (input.title as string) || "";
	const command = parsed?.Command || (input.command as string) || "";
	const processStatus = parsed?.Status || "";
	const pid = parsed?.PID || "";
	const ptyId = parsed?.ID || "";
	const workdir = parsed?.Workdir || "";

	return (
		<BasicTool
			icon={<Terminal className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Spawn", subtitle: title || command }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			<div className="space-y-0">
				{command && (
					<div className="px-3 py-2.5 [&_code]:text-[12px] [&_code]:leading-relaxed [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:contents">
						<HighlightedCode code={`$ ${command}`} language="bash">
							{`$ ${command}`}
						</HighlightedCode>
					</div>
				)}
				<div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border/20">
					{processStatus && (
						<span
							className={cn(
								"inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
								processStatus === "running"
									? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
									: processStatus === "exited" || processStatus === "stopped"
										? "bg-muted/60 text-muted-foreground"
										: "bg-muted/60 text-muted-foreground",
							)}
						>
							{processStatus === "running" && (
								<span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
							)}
							{processStatus}
						</span>
					)}
					{ptyId && (
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono">
							{ptyId}
						</span>
					)}
					{pid && (
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono">
							PID {pid}
						</span>
					)}
					{workdir && (
						<span
							className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono truncate max-w-[200px]"
							title={workdir}
						>
							{workdir}
						</span>
					)}
				</div>
			</div>
		</BasicTool>
	);
}
ToolRegistry.register("pty_spawn", PtySpawnTool);

// --- Pty Read ---
function PtyReadTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);

	const parsed = useMemo(() => {
		const match = output.match(
			/<pty_output\s+([^>]*)>([\s\S]*?)<\/pty_output>/,
		);
		if (!match)
			return {
				id: "",
				ptyStatus: "",
				content: stripAnsi(output),
				bufferInfo: "",
			};

		const attrs = match[1];
		const rawContent = match[2];

		const idMatch = attrs.match(/id="([^"]+)"/);
		const statusMatch = attrs.match(/status="([^"]+)"/);

		const lines = rawContent.trim().split("\n");
		const contentLines: string[] = [];
		let bufferInfo = "";

		for (const line of lines) {
			if (/^\(End of buffer/.test(line.trim())) {
				bufferInfo = line.trim();
				continue;
			}
			contentLines.push(line.replace(/^\d{5}\|\s?/, ""));
		}

		return {
			id: idMatch?.[1] || "",
			ptyStatus: statusMatch?.[1] || "",
			content: stripAnsi(contentLines.join("\n").trim()),
			bufferInfo,
		};
	}, [output]);

	const ptyId = parsed.id || (input.id as string) || "";

	return (
		<BasicTool
			icon={<Terminal className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Terminal Output
					</span>
					{ptyId && (
						<span className="text-muted-foreground text-[10px] truncate font-mono">
							{ptyId}
						</span>
					)}
					{parsed.ptyStatus && (
						<span
							className={cn(
								"inline-flex items-center gap-1 ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0",
								parsed.ptyStatus === "running"
									? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
									: "bg-muted/60 text-muted-foreground",
							)}
						>
							{parsed.ptyStatus === "running" && (
								<span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
							)}
							{parsed.ptyStatus}
						</span>
					)}
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{parsed.content && (
				<div data-scrollable className="max-h-96 overflow-auto">
					<pre className="p-2.5 font-mono text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
						{parsed.content}
					</pre>
					{parsed.bufferInfo && (
						<div className="px-2.5 pb-2 text-[10px] text-muted-foreground/50 italic">
							{parsed.bufferInfo}
						</div>
					)}
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("pty_read", PtyReadTool);

// --- Pty Write ---
function PtyWriteTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const ptyInput = (input.input as string) || (input.text as string) || "";
	const ptyId = (input.id as string) || (input.pty_id as string) || "";

	return (
		<BasicTool
			icon={<Terminal className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Terminal Input", subtitle: ptyId }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{ptyInput && (
				<div className="px-3 py-2.5">
					<pre className="font-mono text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
						<span className="text-muted-foreground/60 select-none">&gt; </span>
						{ptyInput}
					</pre>
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("pty_write", PtyWriteTool);
ToolRegistry.register("pty_input", PtyWriteTool);

// --- Pty Kill ---
function PtyKillTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const ptyId = (input.id as string) || (input.pty_id as string) || "";

	const cleanOutput = useMemo(() => {
		if (!output) return "";
		return (
			output
				.replace(/<\/?[\w_]+(?:\s[^>]*)?>[\s\S]*?(?:<\/[\w_]+>)?/g, "")
				.trim() || output.replace(/<\/?[\w_]+[^>]*>/g, "").trim()
		);
	}, [output]);

	return (
		<BasicTool
			icon={<Terminal className="size-3.5 flex-shrink-0" />}
			trigger={{
				title: "Kill Process",
				subtitle: ptyId,
			}}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{cleanOutput && (
				<div className="p-2.5 text-[11px] text-muted-foreground">
					{cleanOutput}
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("pty_kill", PtyKillTool);

// --- Edit ---
function EditTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const streamingInput = partStreamingInput(part);
	const metadata = partMetadata(part);
	const filediff = metadata.filediff as Record<string, unknown> | undefined;
	const filePath = (input.filePath as string) || (streamingInput.filePath as string) || (streamingInput.target_filepath as string) || undefined;
	const filename = getFilename(filePath) || "";
	const directory = filePath ? getDirectory(filePath) : undefined;
	const diagnostics = getDiagnostics(
		metadata.diagnostics as Record<string, Diagnostic[]> | undefined,
		filePath,
	);

	const additions = (filediff?.additions as number) ?? 0;
	const deletions = (filediff?.deletions as number) ?? 0;
	const before =
		(filediff?.before as string) ?? (input.oldString as string) ?? (streamingInput.oldString as string) ?? "";
	const after =
		(filediff?.after as string) ?? (input.newString as string) ?? (streamingInput.newString as string) ?? "";
	// For morph_edit, show streaming code_edit content
	const codeEdit = (input.code_edit as string) || (streamingInput.code_edit as string) || "";
	const morphInstructions = (input.instructions as string) || (streamingInput.instructions as string) || "";
	const hasDiff = before !== "" || after !== "";
	const isStreaming = partStatus(part) === "pending";
	const running = useContext(ToolRunningContext);

	return (
		<BasicTool
			icon={<FileCode2 className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Edit
					</span>
					<span className="text-xs text-foreground font-mono truncate">
						{filename}
					</span>
					{directory && (
						<span className="text-muted-foreground text-[10px] font-mono truncate hidden sm:inline">
							{directory}
						</span>
					)}
					{filediff && (
						<DiffChanges additions={additions} deletions={deletions} />
					)}
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{hasDiff ? (
				<div data-scrollable className="max-h-96 overflow-auto">
					<InlineDiffView
						oldValue={before}
						newValue={after}
						filename={filename}
					/>
				</div>
			) : codeEdit ? (
				<div data-scrollable className={`max-h-96 overflow-auto ${MD_FLUSH_CLASSES}`}>
					<div className="p-2">
						{morphInstructions && (
							<div className="mb-2 text-[11px] text-muted-foreground italic">
								{morphInstructions}
							</div>
						)}
						<UnifiedMarkdown
							content={`\`\`\`${filename.split(".").pop() || ""}\n${codeEdit}\n\`\`\``}
							isStreaming={isStreaming && running}
						/>
					</div>
				</div>
			) : null}
			<DiagnosticsDisplay diagnostics={diagnostics} />
		</BasicTool>
	);
}
ToolRegistry.register("edit", EditTool);
ToolRegistry.register("morph_edit", EditTool);

// --- Write ---
function WriteTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const streamingInput = partStreamingInput(part);
	const metadata = partMetadata(part);
	const status = partStatus(part);
	const running = useContext(ToolRunningContext);
	const filePath = (input.filePath as string) || (streamingInput.filePath as string) || undefined;
	const filename = getFilename(filePath) || "";
	const directory = filePath ? getDirectory(filePath) : undefined;
	const content = (input.content as string) || (streamingInput.content as string) || "";
	const ext = filename.split(".").pop() || "";
	const diagnostics = getDiagnostics(
		metadata.diagnostics as Record<string, Diagnostic[]> | undefined,
		filePath,
	);

	// Detect stale pending: tool part is pending/running but no longer actively
	// loading (ToolRunningContext is false) and no filename was received.
	const isStalePending = !running && !filename &&
		(status === "pending" || status === "running");
	const isStreaming = status === "pending" && running;

	return (
		<BasicTool
			icon={<FileCode2 className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Write
					</span>
				{filename ? (
					<>
						<span className="text-xs text-foreground font-mono truncate">
							{filename}
						</span>
						{directory && (
							<span className="text-muted-foreground text-[10px] font-mono truncate hidden sm:inline">
								{directory}
							</span>
						)}
					</>
				) : isStalePending ? (
					<TextShimmer duration={1} spread={2} className="text-xs italic">
						Working...
					</TextShimmer>
				) : null}
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{content ? (
				<div
					data-scrollable
					className={`max-h-96 overflow-auto ${MD_FLUSH_CLASSES}`}
				>
					<div className="p-2">
						<UnifiedMarkdown
							content={`\`\`\`${ext}\n${content}\n\`\`\``}
							isStreaming={isStreaming}
						/>
					</div>
				</div>
		) : isStalePending ? (
			<div className="px-3 py-2 text-muted-foreground/60 text-[11px] italic">
				Waiting for file content...
			</div>
		) : null}
			<DiagnosticsDisplay diagnostics={diagnostics} />
		</BasicTool>
	);
}
ToolRegistry.register("write", WriteTool);

// --- Read ---
function ReadTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const streamingInput = partStreamingInput(part);
	const metadata = partMetadata(part);
	const status = partStatus(part);
	const filePath = (input.filePath as string) || (streamingInput.filePath as string) || undefined;
	const filename = getFilename(filePath) || "";

	const args: string[] = [];
	if (input.offset) args.push("offset=" + String(input.offset));
	if (input.limit) args.push("limit=" + String(input.limit));

	const loaded = useMemo(() => {
		if (status !== "completed") return [];
		const val = metadata.loaded;
		if (!val || !Array.isArray(val)) return [];
		return val.filter((p): p is string => typeof p === "string");
	}, [status, metadata.loaded]);

	return (
		<>
			<BasicTool
				icon={<Glasses className="size-3.5 flex-shrink-0" />}
				trigger={{ title: "Read", subtitle: filename, args }}
				defaultOpen={defaultOpen}
				forceOpen={forceOpen}
				locked={locked}
			/>
			{loaded.length > 0 && (
				<div className="mt-1 space-y-0.5 pl-2">
					{loaded.map((filepath, i) => (
						<div
							key={i}
							className="flex items-center gap-1.5 text-xs text-muted-foreground"
						>
							<span className="text-emerald-500">+</span>
							<span className="truncate font-mono text-[10px]">{filepath}</span>
						</div>
					))}
				</div>
			)}
		</>
	);
}
ToolRegistry.register("read", ReadTool);

// ============================================================================
// Parsing helpers for Glob/Grep/List output
// ============================================================================

/** Try to parse output into a list of file paths (one per line) */
function parseFilePaths(output: string): string[] | null {
	if (!output) return null;
	const lines = output
		.trim()
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	if (lines.length === 0) return null;
	const pathLike = lines.filter(
		(l) => l.startsWith("/") || l.startsWith("./") || l.startsWith("~"),
	);
	if (pathLike.length >= lines.length * 0.7) return pathLike;
	return null;
}

interface GrepMatch {
	line: number;
	content: string;
}
interface GrepFileGroup {
	filePath: string;
	matches: GrepMatch[];
}

/** Parse grep output into structured file groups */
function parseGrepOutput(
	output: string,
): { matchCount: number; groups: GrepFileGroup[] } | null {
	if (!output) return null;
	const text = String(output).trim();
	const headerMatch = text.match(/^Found\s+(\d+)\s+match/i);
	const matchCount = headerMatch ? parseInt(headerMatch[1], 10) : 0;
	const body = headerMatch ? text.slice(headerMatch[0].length).trim() : text;
	if (!body) return null;

	const groups: GrepFileGroup[] = [];
	const blocks = body.split(/\n\n+/);

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed) continue;
		const fileMatch = trimmed.match(/^(\/[^:]+?):\s*/);
		if (!fileMatch) continue;
		const filePath = fileMatch[1];
		const rest = trimmed.slice(fileMatch[0].length);
		const matches: GrepMatch[] = [];
		const lineRegex = /Line\s+(\d+):\s*([\s\S]*?)(?=\s*(?:Line\s+\d+:|$))/g;
		let m: RegExpExecArray | null;
		while ((m = lineRegex.exec(rest)) !== null) {
			matches.push({
				line: parseInt(m[1], 10),
				content: m[2].trim().replace(/;$/, ""),
			});
		}
		if (matches.length > 0) groups.push({ filePath, matches });
	}

	if (groups.length === 0) return null;
	return {
		matchCount:
			matchCount || groups.reduce((sum, g) => sum + g.matches.length, 0),
		groups,
	};
}

// ============================================================================
// InlineFileList — styled file path list for Glob/List
// ============================================================================

function InlineFileList({
	paths,
	onFileClick,
	toDisplayPath,
}: {
	paths: string[];
	onFileClick: (path: string) => void;
	toDisplayPath: (p: string) => string;
}) {
	return (
		<div className="py-0.5">
			{paths.map((fp, i) => {
				const dp = toDisplayPath(fp);
				const name = getFilename(dp);
				const dir = getDirectory(dp);
				return (
					<div
						key={i}
						className="flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-muted/50 transition-colors group"
						onClick={() => onFileClick(fp)}
						title={dp}
					>
						<FileText className="size-3 text-muted-foreground/50 flex-shrink-0 group-hover:text-foreground/60 transition-colors" />
						<span className="text-[11px] min-w-0 flex items-baseline gap-1.5 overflow-hidden">
							<span className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0">
								{name}
							</span>
							{dir && (
								<span className="text-muted-foreground/40 truncate text-[10px]">
									{dir}
								</span>
							)}
						</span>
					</div>
				);
			})}
		</div>
	);
}

// ============================================================================
// InlineGrepResults — styled grep result groups
// ============================================================================

function InlineGrepResults({
	groups,
	onFileClick,
	toDisplayPath,
}: {
	groups: GrepFileGroup[];
	onFileClick: (path: string) => void;
	toDisplayPath: (p: string) => string;
}) {
	const [expandedIndex, setExpandedIndex] = useState<number | null>(
		groups.length === 1 ? 0 : null,
	);

	return (
		<div className="py-0.5">
			{groups.map((group, i) => {
				const dp = toDisplayPath(group.filePath);
				const name = getFilename(dp);
				const dir = getDirectory(dp);
				const isExpanded = expandedIndex === i;

				return (
					<div key={i}>
						<div
							className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors group"
							onClick={() => setExpandedIndex(isExpanded ? null : i)}
						>
							<ChevronRight
								className={cn(
									"size-3 text-muted-foreground flex-shrink-0 transition-transform",
									isExpanded && "rotate-90",
								)}
							/>
							<FileText className="size-3 text-muted-foreground/50 flex-shrink-0" />
							<span className="text-[11px] min-w-0 flex items-baseline gap-1.5 overflow-hidden flex-1">
								<span
									className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0 cursor-pointer hover:text-blue-500 transition-colors"
									onClick={(e) => {
										e.stopPropagation();
										onFileClick(group.filePath);
									}}
									title={group.filePath}
								>
									{name}
								</span>
								{dir && (
									<span className="text-muted-foreground/40 truncate text-[10px]">
										{dir}
									</span>
								)}
							</span>
							<span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
								{group.matches.length}
							</span>
						</div>
						{isExpanded && (
							<div className="border-t border-border/20 bg-muted/10">
								{group.matches.map((match, j) => (
									<div
										key={j}
										className="flex items-start gap-0 border-b last:border-b-0 border-border/10"
									>
										<span className="text-[10px] font-mono text-muted-foreground/50 w-10 text-right pr-2 py-1 flex-shrink-0 select-none">
											{match.line}
										</span>
										<span className="text-[10px] font-mono text-foreground/70 py-1 pr-2 break-all leading-relaxed">
											{match.content}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// --- Glob ---
function GlobTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const streamingInput = partStreamingInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const { openFile, openFileWithList, toDisplayPath } = useOcFileOpen();
	const directory = getDirectory((input.path as string) || (streamingInput.path as string)) || undefined;
	const args: string[] = [];
	const pattern = (input.pattern || streamingInput.pattern) as string | undefined;
	if (pattern) args.push("pattern=" + String(pattern));

	const filePaths = useMemo(() => parseFilePaths(output), [output]);
	const hasResults = filePaths && filePaths.length > 0;
	const isNoResults = !hasResults && status === "completed" && !!output;

	return (
		<BasicTool
			icon={<Search className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Glob", subtitle: directory, args: [...args, ...(isNoResults ? [] : []), ...(hasResults ? [`${filePaths.length} ${filePaths.length === 1 ? "file" : "files"}`] : isNoResults ? ["no matches"] : [])] }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{hasResults ? (
				<div data-scrollable className="max-h-72 overflow-auto">
					<InlineFileList
						paths={filePaths}
						onFileClick={(fp) => openFileWithList(fp, filePaths)}
						toDisplayPath={toDisplayPath}
					/>
				</div>
			) : isNoResults ? (
				<ToolEmptyState message="No matching files found" />
			) : output ? (
				<ToolOutputFallback output={output} toolName="glob" />
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("glob", GlobTool);

// --- Grep ---
function GrepTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const streamingInput = partStreamingInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const { openFile, toDisplayPath } = useOcFileOpen();
	const directory = getDirectory((input.path as string) || (streamingInput.path as string)) || undefined;
	const args: string[] = [];
	const grepPattern = (input.pattern || streamingInput.pattern) as string | undefined;
	const grepInclude = (input.include || streamingInput.include) as string | undefined;
	if (grepPattern) args.push("pattern=" + String(grepPattern));
	if (grepInclude) args.push("include=" + String(grepInclude));

	const grepResult = useMemo(() => parseGrepOutput(output), [output]);
	const hasResults = !!grepResult;
	const isNoResults = !hasResults && status === "completed" && !!output;

	return (
		<BasicTool
			icon={<Search className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Grep", subtitle: directory, args: [...args, ...(hasResults ? [`${grepResult.groups.length} ${grepResult.groups.length === 1 ? "file" : "files"}`] : isNoResults ? ["no matches"] : [])] }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{hasResults ? (
				<div data-scrollable className="max-h-72 overflow-auto">
					<InlineGrepResults
						groups={grepResult.groups}
						onFileClick={(fp) => openFile(fp)}
						toDisplayPath={toDisplayPath}
					/>
				</div>
			) : isNoResults ? (
				<ToolEmptyState message="No matching results found" />
			) : output ? (
				<ToolOutputFallback output={output} toolName="grep" />
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("grep", GrepTool);

// --- List ---
function ListTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const { openFile, openFileWithList, toDisplayPath } = useOcFileOpen();
	const directory =
		getDirectory(input.path as string) || (input.path as string) || undefined;

	const filePaths = useMemo(() => parseFilePaths(output), [output]);
	const hasResults = filePaths && filePaths.length > 0;
	const isNoResults = !hasResults && status === "completed" && !!output;

	return (
		<BasicTool
			icon={<ListTree className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "List", subtitle: directory, args: hasResults ? [`${filePaths.length} ${filePaths.length === 1 ? "file" : "files"}`] : isNoResults ? ["empty"] : undefined }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{hasResults ? (
				<div data-scrollable className="max-h-72 overflow-auto">
					<InlineFileList
						paths={filePaths}
						onFileClick={(fp) => openFileWithList(fp, filePaths)}
						toDisplayPath={toDisplayPath}
					/>
				</div>
			) : isNoResults ? (
				<ToolEmptyState message="Directory is empty" />
			) : output ? (
				<ToolOutputFallback output={output} toolName="list" />
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("list", ListTool);

// --- WebFetch ---
function WebFetchTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const url = (input.url as string) || "";
	const args: string[] = [];
	if (input.format) args.push("format=" + String(input.format));

	return (
		<BasicTool
			icon={<Globe className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Web Fetch
					</span>
					<span className="text-muted-foreground text-xs truncate font-mono">
						{url}
					</span>
					{args.map((arg, i) => (
						<span
							key={i}
							className="text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono whitespace-nowrap"
						>
							{arg}
						</span>
					))}
					<ExternalLink className="size-3 text-muted-foreground/60 flex-shrink-0 ml-auto" />
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{output && (
				<ToolOutputFallback output={output} toolName="web_fetch" />
			)}
		</BasicTool>
	);
}
ToolRegistry.register("webfetch", WebFetchTool);

// --- WebSearch ---

/** A single source link from search results */
interface WebSearchSource {
	title: string;
	url: string;
	snippet?: string;
	author?: string;
	publishedDate?: string;
}

/** A query block (batch mode returns multiple) */
interface WebSearchQueryResult {
	query: string;
	answer?: string;
	sources: WebSearchSource[];
}

/**
 * Parse web search output — handles both:
 * 1. JSON batch format: { batch_mode, results: [{ query, answer, results: [{ title, url, snippet }] }] }
 * 2. Plain text format: Title: ...\nURL: ...\nText: ...
 */
function parseWebSearchOutput(output: string | any): WebSearchQueryResult[] {
	if (!output) return [];

	// Handle both string and already-parsed object (+ double-encoded)
	let parsed: any = null;
	if (typeof output === "object" && output !== null) {
		parsed = output;
	} else if (typeof output === "string") {
		try {
			let result = JSON.parse(output);
			// Handle double-encoded JSON string
			if (typeof result === "string") {
				try {
					result = JSON.parse(result);
				} catch {
					/* keep */
				}
			}
			parsed = typeof result === "object" ? result : null;
		} catch {
			// Not JSON — try trimming whitespace/BOM
			const trimmed = output.trim().replace(/^\uFEFF/, "");
			if (trimmed !== output) {
				try {
					parsed = JSON.parse(trimmed);
				} catch {
					/* not JSON */
				}
			}
		}
	}

	if (parsed) {
		// Batch mode: { results: [{ query, answer, results: [...] }] }
		if (
			parsed.results &&
			Array.isArray(parsed.results) &&
			parsed.results.length > 0
		) {
			const firstItem = parsed.results[0];
			if (firstItem && typeof firstItem.query === "string") {
				// Batch query results
				const queryResults: WebSearchQueryResult[] = [];
				for (const r of parsed.results) {
					if (typeof r.query !== "string") continue;
					const sources: WebSearchSource[] = [];
					if (Array.isArray(r.results)) {
						for (const s of r.results) {
							if (s.title && s.url) {
								sources.push({
									title: s.title,
									url: s.url,
									snippet: s.snippet || s.content || s.text || undefined,
									author: s.author || undefined,
									publishedDate:
										s.publishedDate || s.published_date || undefined,
								});
							}
						}
					}
					queryResults.push({
						query: r.query,
						answer: r.answer || undefined,
						sources,
					});
				}
				if (queryResults.length > 0) return queryResults;
			} else if (firstItem && (firstItem.title || firstItem.url)) {
				// Direct results array: { results: [{title, url, content}, ...] }
				const sources: WebSearchSource[] = [];
				for (const s of parsed.results) {
					if (s.title && s.url) {
						sources.push({
							title: s.title,
							url: s.url,
							snippet: s.snippet || s.content || s.text || undefined,
							author: s.author || undefined,
							publishedDate: s.publishedDate || s.published_date || undefined,
						});
					}
				}
				if (sources.length > 0) {
					return [
						{
							query: parsed.query || "",
							answer: parsed.answer || undefined,
							sources,
						},
					];
				}
			}
		}

		// Single result: { query, answer, results: [...] }
		if (parsed.query && typeof parsed.query === "string") {
			const sources: WebSearchSource[] = [];
			if (Array.isArray(parsed.results)) {
				for (const s of parsed.results) {
					if (s.title && s.url) {
						sources.push({
							title: s.title,
							url: s.url,
							snippet: s.snippet || s.content || s.text || undefined,
							author: s.author || undefined,
							publishedDate: s.publishedDate || s.published_date || undefined,
						});
					}
				}
			}
			return [
				{ query: parsed.query, answer: parsed.answer || undefined, sources },
			];
		}

		// Flat array: [{title, url, content}, ...]
		if (
			Array.isArray(parsed) &&
			parsed.length > 0 &&
			parsed[0] &&
			(parsed[0].title || parsed[0].url)
		) {
			const sources: WebSearchSource[] = [];
			for (const s of parsed) {
				if (s.title && s.url) {
					sources.push({
						title: s.title,
						url: s.url,
						snippet: s.snippet || s.content || s.text || undefined,
						author: s.author || undefined,
						publishedDate: s.publishedDate || s.published_date || undefined,
					});
				}
			}
			if (sources.length > 0) return [{ query: "", sources }];
		}
	}

	// --- Plain text format ---
	if (typeof output === "string") {
		const blocks = output.split(/(?=^Title: )/m).filter(Boolean);
		const sources: WebSearchSource[] = [];
		for (const block of blocks) {
			const titleMatch = block.match(/^Title:\s*(.+)/m);
			const urlMatch = block.match(/^URL:\s*(.+)/m);
			const authorMatch = block.match(/^Author:\s*(.+)/m);
			const dateMatch = block.match(/^Published Date:\s*(.+)/m);
			const textMatch = block.match(/^Text:\s*([\s\S]*?)$/m);
			if (titleMatch && urlMatch) {
				sources.push({
					title: titleMatch[1].trim(),
					url: urlMatch[1].trim(),
					author: authorMatch?.[1]?.trim() || undefined,
					publishedDate: dateMatch?.[1]?.trim() || undefined,
					snippet: textMatch?.[1]?.trim() || undefined,
				});
			}
		}
		if (sources.length > 0) return [{ query: "", sources }];
	}
	return [];
}

function wsDomain(url: string): string {
	try {
		return new URL(url).hostname.replace("www.", "");
	} catch {
		return url;
	}
}

function wsFavicon(url: string): string | null {
	try {
		return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`;
	} catch {
		return null;
	}
}

function WebSearchTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const query = (input.query as string) || "";

	// Access raw state output to handle both string and object types
	const rawOutput =
		part.state.status === "completed" ? (part.state as any).output : undefined;
	const queryResults = useMemo(
		() => parseWebSearchOutput(rawOutput ?? output),
		[rawOutput, output],
	);
	const totalSources = useMemo(
		() => queryResults.reduce((n, q) => n + q.sources.length, 0),
		[queryResults],
	);
	const [expandedQuery, setExpandedQuery] = useState<number | null>(null);

	// Compact trigger badge
	const triggerBadge =
		status === "completed" && queryResults.length > 0
			? queryResults.length > 1
				? `${queryResults.length} queries`
				: totalSources > 0
					? `${totalSources} ${totalSources === 1 ? "source" : "sources"}`
					: undefined
			: undefined;

	return (
		<BasicTool
			icon={<Search className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Web Search
					</span>
					<span className="text-muted-foreground text-xs truncate font-mono">
						{query}
					</span>
					{triggerBadge && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium whitespace-nowrap ml-auto flex-shrink-0">
							{triggerBadge}
						</span>
					)}
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{queryResults.length > 0 ? (
				<div data-scrollable className="max-h-[400px] overflow-auto">
					{queryResults.map((qr, qi) => {
						const isMulti = queryResults.length > 1;
						const isExpanded = expandedQuery === qi;

						return (
							<div
								key={qi}
								className={cn(qi > 0 && "border-t border-border/30")}
							>
								{/* Query header (only in batch mode) */}
								{isMulti && (
									<button
										type="button"
										className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer text-left"
										onClick={() => setExpandedQuery(isExpanded ? null : qi)}
									>
										<Search className="size-3 text-muted-foreground/50 flex-shrink-0" />
										<span className="text-[11px] font-medium text-foreground truncate flex-1">
											{qr.query}
										</span>
										{qr.sources.length > 0 && (
											<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
												{qr.sources.length}
											</span>
										)}
										<ChevronRight
											className={cn(
												"size-3 text-muted-foreground/40 flex-shrink-0 transition-transform",
												(isExpanded || !isMulti) && "rotate-90",
											)}
										/>
									</button>
								)}

								{/* Answer + Sources (always visible in single mode, toggled in batch) */}
								{(!isMulti || isExpanded) && (
									<div className="px-3 pb-2.5">
										{/* AI Answer */}
										{qr.answer && (
											<div className="mb-2.5 mt-1">
												<p className="text-[11px] leading-relaxed text-foreground/80">
													{qr.answer}
												</p>
											</div>
										)}

										{/* Sources */}
										{qr.sources.length > 0 && (
											<div className="space-y-1">
												{qr.answer && (
													<div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-1.5">
														Sources
													</div>
												)}
												{qr.sources.map((src, si) => {
													const favicon = wsFavicon(src.url);
													const domain = wsDomain(src.url);
													return (
														<a
															key={si}
															href={src.url}
															target="_blank"
															rel="noopener noreferrer"
															className="group flex items-start gap-2 p-2 -mx-1 rounded-lg hover:bg-muted/40 transition-colors"
														>
															{/* Favicon */}
															<div className="size-5 rounded bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
																{favicon ? (
																	// eslint-disable-next-line @next/next/no-img-element
																	<img
																		src={favicon}
																		alt=""
																		className="size-4 rounded"
																		onError={(e) => {
																			(
																				e.target as HTMLImageElement
																			).style.display = "none";
																		}}
																	/>
																) : (
																	<Globe className="size-3 text-muted-foreground/50" />
																)}
															</div>
															<div className="min-w-0 flex-1">
																<div className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
																	{src.title}
																</div>
																<div className="flex items-center gap-1.5 mt-0.5">
																	<span className="text-[10px] text-muted-foreground/50 font-mono truncate">
																		{domain}
																	</span>
																	{src.author && (
																		<span className="text-[10px] text-muted-foreground/40 truncate">
																			{src.author}
																		</span>
																	)}
																</div>
																{src.snippet && (
																	<p className="text-[10px] text-muted-foreground/60 leading-relaxed line-clamp-2 mt-1">
																		{src.snippet.slice(0, 200)}
																	</p>
																)}
															</div>
															<ExternalLink className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 mt-1 transition-colors" />
														</a>
													);
												})}
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			) : output ? (
				<ToolOutputFallback output={output} isStreaming={status === "running"} toolName="web_search" />
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("websearch", WebSearchTool);
ToolRegistry.register("web-search", WebSearchTool);
ToolRegistry.register("web_search", WebSearchTool);

// --- ScrapeWebpage ---

interface ScrapeResult {
	url: string;
	success: boolean;
	title?: string;
	content?: string;
	error?: string;
}

interface ParsedScrapeOutput {
	total: number;
	successful: number;
	failed: number;
	results: ScrapeResult[];
}

function parseScrapeOutput(output: string | any): ParsedScrapeOutput | null {
	if (!output) return null;
	let parsed: any = null;
	if (typeof output === "object" && output !== null) {
		parsed = output;
	} else if (typeof output === "string") {
		try {
			let result = JSON.parse(output);
			if (typeof result === "string") {
				try {
					result = JSON.parse(result);
				} catch {
					/* keep */
				}
			}
			parsed = typeof result === "object" ? result : null;
		} catch {
			const trimmed = output.trim().replace(/^\uFEFF/, "");
			if (trimmed !== output) {
				try {
					parsed = JSON.parse(trimmed);
				} catch {
					/* not JSON */
				}
			}
		}
	}
	if (!parsed) return null;

	// Format: { total, successful, failed, results: [{url, success, title?, content?, error?}] }
	if (parsed.results && Array.isArray(parsed.results)) {
		return {
			total: parsed.total || parsed.results.length,
			successful:
				parsed.successful ??
				parsed.results.filter((r: any) => r.success !== false).length,
			failed:
				parsed.failed ??
				parsed.results.filter((r: any) => r.success === false).length,
			results: parsed.results.map((r: any) => ({
				url: r.url || "",
				success: r.success !== false,
				title: r.title || undefined,
				content: r.content || r.text || r.snippet || undefined,
				error: r.error || undefined,
			})),
		};
	}
	return null;
}

function ScrapeWebpageTool({
	part,
	defaultOpen,
	forceOpen,
	locked,
}: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const urls = (input.urls as string) || "";
	const firstUrl = urls?.split(",")[0]?.trim() || "";
	const domain = firstUrl ? wsDomain(firstUrl) : "";

	const rawOutput =
		part.state.status === "completed" ? (part.state as any).output : undefined;
	const scrapeData = useMemo(
		() => parseScrapeOutput(rawOutput ?? output),
		[rawOutput, output],
	);

	const triggerBadge = scrapeData
		? `${scrapeData.successful}/${scrapeData.total} scraped`
		: undefined;

	return (
		<BasicTool
			icon={<Globe className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Scrape
					</span>
					<span className="text-muted-foreground text-xs truncate font-mono">
						{domain || firstUrl}
					</span>
					{triggerBadge && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium whitespace-nowrap ml-auto flex-shrink-0">
							{triggerBadge}
						</span>
					)}
					{!triggerBadge && (
						<ExternalLink className="size-3 text-muted-foreground/60 flex-shrink-0 ml-auto" />
					)}
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{scrapeData && scrapeData.results.length > 0 ? (
				<div
					data-scrollable
					className="max-h-[400px] overflow-y-auto overflow-x-hidden p-2"
				>
					<div className="space-y-0.5">
						{scrapeData.results.map((result, idx) => {
							const favicon = result.url ? wsFavicon(result.url) : null;
							const resultDomain = result.url ? wsDomain(result.url) : "";
							const snippet = result.content
								? result.content
										.replace(/\\n/g, " ")
										.replace(/\s+/g, " ")
										.slice(0, 200)
								: undefined;

							return (
								<a
									key={idx}
									href={result.url}
									target="_blank"
									rel="noopener noreferrer"
									className="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors"
								>
									{/* Favicon */}
									<div className="size-5 rounded bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
										{favicon ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={favicon}
												alt=""
												className="size-4 rounded"
												onError={(e) => {
													(e.target as HTMLImageElement).style.display = "none";
												}}
											/>
										) : (
											<Globe className="size-3 text-muted-foreground/50" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
											{result.title || resultDomain || result.url}
										</div>
										<div className="flex items-center gap-1.5 mt-0.5">
											<span className="text-[10px] text-muted-foreground/50 font-mono truncate">
												{resultDomain}
											</span>
										</div>
										{result.success && snippet && (
											<p className="text-[10px] text-muted-foreground/60 leading-relaxed line-clamp-2 mt-1 break-words">
												{snippet}
											</p>
										)}
										{!result.success && result.error && (
											<p className="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2 mt-1 break-words">
												{result.error.slice(0, 150)}
											</p>
										)}
									</div>
									<div className="flex items-center gap-1 flex-shrink-0 mt-1">
										{result.success ? (
											<CheckCircle className="size-3 text-emerald-500/70" />
										) : (
											<AlertTriangle className="size-3 text-amber-500/70" />
										)}
										<ExternalLink className="size-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
									</div>
								</a>
							);
						})}
					</div>
				</div>
			) : output ? (
				<ToolOutputFallback output={output.slice(0, 3000)} isStreaming={status === "running"} toolName="scrape_webpage" />
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("scrape-webpage", ScrapeWebpageTool);

// --- ImageSearch ---
function ImageSearchTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const query = (input.query as string) || "";

	// Parse image results - handles single and batch formats
	const { imageResults, isBatch, batchCount, displayQuery } = useMemo(() => {
		if (!output)
			return {
				imageResults: [],
				isBatch: false,
				batchCount: 0,
				displayQuery: query,
			};
		try {
			const parsed = JSON.parse(output);

			// Handle batch mode: { batch_mode: true, results: [{ query, total, images }] }
			if (parsed.batch_mode === true && Array.isArray(parsed.results)) {
				const allImages = parsed.results.flatMap((r: any) =>
					Array.isArray(r.images) ? r.images : [],
				);
				const queries = parsed.results.map((r: any) => r.query).filter(Boolean);
				return {
					imageResults: allImages,
					isBatch: true,
					batchCount: parsed.results.length,
					displayQuery:
						queries.length > 1
							? `${queries.length} queries`
							: queries[0] || query,
				};
			}

			// Handle legacy batch_results
			if (parsed.batch_results && Array.isArray(parsed.batch_results)) {
				const allImages = parsed.batch_results.flatMap((r: any) =>
					Array.isArray(r.images) ? r.images : [],
				);
				return {
					imageResults: allImages,
					isBatch: true,
					batchCount: parsed.batch_results.length,
					displayQuery: query,
				};
			}

			// Single result formats
			if (Array.isArray(parsed))
				return {
					imageResults: parsed,
					isBatch: false,
					batchCount: 0,
					displayQuery: query,
				};
			if (parsed.images && Array.isArray(parsed.images))
				return {
					imageResults: parsed.images,
					isBatch: false,
					batchCount: 0,
					displayQuery: query,
				};
			if (parsed.results && Array.isArray(parsed.results))
				return {
					imageResults: parsed.results,
					isBatch: false,
					batchCount: 0,
					displayQuery: query,
				};
		} catch {
			// Not JSON — return empty
		}
		return {
			imageResults: [],
			isBatch: false,
			batchCount: 0,
			displayQuery: query,
		};
	}, [output, query]);

	return (
		<BasicTool
			icon={<ImageIcon className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Image Search
					</span>
					<span className="text-muted-foreground text-xs truncate font-mono">
						{displayQuery}
					</span>
					{imageResults.length > 0 && (
						<span className="text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono whitespace-nowrap ml-auto flex-shrink-0">
							{isBatch ? `${batchCount}q, ` : ""}
							{imageResults.length} images
						</span>
					)}
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{imageResults.length > 0 ? (
				<div data-scrollable className="p-2 max-h-80 overflow-auto">
					<div className="grid grid-cols-3 gap-1.5">
						{imageResults.slice(0, 9).map((img: any, i: number) => {
							const imgUrl = img.url || img.imageUrl || img.image_url || "";
							if (!imgUrl) return null;
							const title = img.title || "";
							return (
								<a
									key={i}
									href={imgUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="relative group overflow-hidden rounded border border-border/30 bg-muted/20 aspect-square"
									title={title}
								>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={imgUrl}
										alt={title}
										className="object-cover w-full h-full group-hover:opacity-80 transition-opacity"
										onError={(e) => {
											(e.target as HTMLImageElement).style.display = "none";
										}}
									/>
									<div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/50 to-transparent flex items-end p-1">
										<span className="text-[9px] text-white truncate">
											{title}
										</span>
									</div>
								</a>
							);
						})}
					</div>
				</div>
			) : output ? (
				<ToolOutputFallback output={output.slice(0, 3000)} isStreaming={status === "running"} toolName="image_search" />
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("image-search", ImageSearchTool);

// --- ImageGen ---
function ImageGenTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const prompt = input.prompt;
	const action = input.action;



	// Extract image info from output
	const { imagePath, directUrl } = useMemo(() => {
		if (!output) return { imagePath: null, directUrl: null };
		const trimmed = output.trim();

		// 1. Try JSON parse
		try {
			const parsed = JSON.parse(trimmed);
			const p = parsed.path || parsed.image_path || parsed.output_path || null;
			const url = parsed.replicate_url || parsed.url || parsed.image_url || null;
			return {
				imagePath: p ? String(p).trim() : null,
				directUrl: url ? String(url).trim() : null,
			};
		} catch {
			// not JSON
		}

		// 2. Check if output itself is a file path
		const cleaned = trimmed.replace(/^["']+|["']+$/g, '').trim();
		if (IMAGE_EXT_RE.test(cleaned)) {
			const normalized = (cleaned.startsWith('/workspace/') || cleaned.startsWith('workspace/'))
				? normalizeWorkspacePath(cleaned) : cleaned;
			return { imagePath: normalized, directUrl: null };
		}

		// 3. Extract path from surrounding text
		const extractedPath = trimmed.match(/\/workspace\/[^\s"']+\.(?:png|jpe?g|gif|webp|svg|bmp|ico)/i);
		if (extractedPath?.[0]) {
			return { imagePath: extractedPath[0], directUrl: null };
		}

		return { imagePath: null, directUrl: null };
	}, [output]);

	// If we have a direct HTTPS URL (e.g. replicate_url), use it directly — no need to fetch via sandbox
	// If we have a local sandbox path, use useFileContent to get base64 (same as ImagePreview.tsx)
	// Strip /workspace/ prefix since the SDK expects paths relative to project root
	const isLocalPath = imagePath ? isLocalSandboxFilePath(imagePath) : false;
	const fileContentPath = useMemo(() => {
		if (!isLocalPath || !imagePath || directUrl) return null;
		return imagePath.replace(/^\/workspace\//, '');
	}, [isLocalPath, imagePath, directUrl]);
	const { data: fileContentData, isLoading: isImageLoading } = useFileContent(
		fileContentPath,
		{ enabled: !!fileContentPath },
	);

	// Convert base64 to blob URL (same as ImagePreview.tsx)
	const imageUrl = useMemo(() => {
		if (fileContentData?.encoding === 'base64' && fileContentData?.content) {
			const binary = atob(fileContentData.content);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			const blob = new Blob([bytes], { type: fileContentData.mimeType || 'image/webp' });
			return URL.createObjectURL(blob);
		}
		return null;
	}, [fileContentData]);

	// Priority: direct URL > blob from sandbox > local path fallback
	const displayImageSrc = directUrl || imageUrl || '';

	const titleMap: Record<string, string> = {
		generate: "Generate Image",
		edit: "Edit Image",
		upscale: "Upscale Image",
		remove_bg: "Remove Background",
	};

	return (
		<BasicTool
			icon={<ImageIcon className="size-3.5 flex-shrink-0" />}
			trigger={{
				title: titleMap[action] || "Image Gen",
				subtitle: prompt?.slice(0, 60),
			}}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{(imagePath || directUrl) ? (
				<div className="p-2">
					{displayImageSrc ? (
						/* eslint-disable-next-line @next/next/no-img-element */
						<img
							src={displayImageSrc}
							alt={String(prompt || 'Generated image')}
							className="rounded border border-border/30 max-h-64 object-contain"
						/>
					) : isImageLoading ? (
						<div className="rounded border border-border/30 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
							Loading image preview...
						</div>
					) : (
						<div className="rounded border border-border/30 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground font-mono break-all">
							{imagePath}
						</div>
					)}
				</div>
			) : output ? (
				<div data-scrollable className="p-2 max-h-72 overflow-auto">
					<pre className="whitespace-pre-wrap text-[11px] text-muted-foreground font-mono">
						{output}
					</pre>
				</div>
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("image-gen", ImageGenTool);

// --- VideoGen ---
function VideoGenTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const prompt = input.prompt;

	return (
		<BasicTool
			icon={<Cpu className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Video Gen", subtitle: prompt?.slice(0, 60) }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{output && (
				<div data-scrollable className="p-2 max-h-72 overflow-auto">
					<pre className="whitespace-pre-wrap text-[11px] text-muted-foreground font-mono">
						{output}
					</pre>
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("video-gen", VideoGenTool);

// --- PresentationGen ---
interface PresentationOutput {
	success: boolean;
	action: string;
	error?: string;
	presentation_name?: string;
	presentation_path?: string;
	slide_number?: number;
	slide_title?: string;
	slide_file?: string;
	total_slides?: number;
	viewer_url?: string;
	viewer_file?: string;
	message?: string;
}

function parsePresentationOutput(output: string): PresentationOutput | null {
	if (!output) return null;
	try {
		return JSON.parse(output) as PresentationOutput;
	} catch {
		// If output starts with "Error:" it's a string error
		if (output.startsWith("Error:")) {
			return {
				success: false,
				action: "unknown",
				error: output.replace(/^Error:\s*/, ""),
			};
		}
		return null;
	}
}

function PresentationGenTool({
	part,
	defaultOpen,
	forceOpen,
	locked,
}: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const status = partStatus(part);
	const running = useContext(ToolRunningContext);
	const action = input.action;
	const presentationName = input.presentation_name;
	const slideTitle = input.slide_title;
	const slideNumber = input.slide_number;

	const parsed = useMemo(() => parsePresentationOutput(output), [output]);
	const isError = parsed ? !parsed.success : false;

	// Proxy-rewrite viewer URL so localhost:3210 → subdomain URL
	const activeServer = useServerStore((s) =>
		s.servers.find((srv) => srv.id === s.activeServerId) ?? null,
	);
	const subdomainOpts2 = useMemo(() => deriveSubdomainOpts(activeServer), [activeServer]);
	const viewerProxyUrl = useMemo(() => {
		if (!parsed?.viewer_url) return undefined;
		const sUrl = activeServer?.url || getActiveOpenCodeUrl();
		return proxyLocalhostUrl(parsed.viewer_url, sUrl, activeServer?.mappedPorts, subdomainOpts2);
	}, [parsed?.viewer_url, activeServer?.url, activeServer?.mappedPorts, subdomainOpts2]);

	// Build a nice trigger subtitle
	const triggerSubtitle = useMemo(() => {
		if (action === "create_slide" && slideTitle) {
			return `Slide ${slideNumber || "?"}: ${slideTitle}`;
		}
		if (action === "preview") return presentationName;
		if (action === "export_pdf") return `${presentationName} → PDF`;
		if (action === "export_pptx") return `${presentationName} → PPTX`;
		if (action === "list_slides") return presentationName;
		if (action === "list_presentations") return "All presentations";
		if (action === "delete_slide" || action === "delete_presentation")
			return presentationName;
		if (action === "validate_slide") return `Slide ${slideNumber || "?"}`;
		return presentationName || action;
	}, [action, presentationName, slideTitle, slideNumber]);

	// Action label
	const actionLabel = useMemo(() => {
		const labels: Record<string, string> = {
			create_slide: "Create Slide",
			list_slides: "List Slides",
			delete_slide: "Delete Slide",
			list_presentations: "List",
			delete_presentation: "Delete",
			validate_slide: "Validate",
			export_pdf: "Export PDF",
			export_pptx: "Export PPTX",
			preview: "Preview",
		};
		return labels[action] || action;
	}, [action]);

	return (
		<BasicTool
			icon={<Presentation className="size-3.5 flex-shrink-0" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					{actionLabel ? (
						<span className="font-medium text-xs text-foreground whitespace-nowrap">
							{actionLabel}
						</span>
					) : running ? (
						<span className="h-3 w-20 rounded bg-muted-foreground/10 animate-pulse" />
					) : null}
					{triggerSubtitle ? (
						<span className="text-muted-foreground text-xs truncate font-mono">
							{triggerSubtitle}
						</span>
					) : running && actionLabel ? (
						<span className="h-3 w-32 rounded bg-muted-foreground/10 animate-pulse" />
					) : null}
					{parsed?.success &&
						action === "create_slide" &&
						parsed.total_slides && (
							<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-mono whitespace-nowrap ml-auto flex-shrink-0">
								{parsed.total_slides}{" "}
								{parsed.total_slides === 1 ? "slide" : "slides"}
							</span>
						)}
					{viewerProxyUrl && (
						<a
							href={viewerProxyUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="ml-auto flex-shrink-0"
							onClick={(e) => e.stopPropagation()}
						>
							<ExternalLink className="size-3 text-muted-foreground/60 hover:text-foreground transition-colors" />
						</a>
					)}
				</div>
			}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{/* Error display */}
			{isError && parsed?.error && (
				<div className="flex items-start gap-2 px-3 py-2 text-xs text-muted-foreground">
					<CircleAlert className="size-3 flex-shrink-0 mt-0.5" />
					<span>{parsed.error}</span>
				</div>
			)}

			{/* Success: show relevant details */}
			{parsed?.success && (
				<div className="px-3 py-2.5 space-y-1.5">
					{/* Slide creation summary */}
					{action === "create_slide" && (
						<div className="flex items-center gap-2 text-xs">
							<Check className="size-3 text-emerald-500 flex-shrink-0" />
							<span className="text-foreground/80">
								Created slide {parsed.slide_number}
								{parsed.slide_title ? `: ${parsed.slide_title}` : ""}
							</span>
							{parsed.total_slides && (
								<span className="text-muted-foreground/50 ml-auto text-[10px]">
									({parsed.total_slides} total)
								</span>
							)}
						</div>
					)}

					{/* Validate slide */}
					{action === "validate_slide" && (
						<div className="flex items-center gap-2 text-xs">
							<Check className="size-3 text-emerald-500 flex-shrink-0" />
							<span className="text-foreground/80">
								Slide {parsed.slide_number || slideNumber || "?"} validated
							</span>
							{parsed.message &&
								parsed.message !== `Slide ${parsed.slide_number} validated` && (
									<span className="text-muted-foreground/60 truncate">
										{parsed.message}
									</span>
								)}
						</div>
					)}

					{/* Preview — embedded iframe */}
					{action === "preview" && parsed.viewer_url && (
						<InlineServicePreview
							url={parsed.viewer_url}
							label={`Presentation: ${parsed.presentation_name || presentationName || "Viewer"}`}
						/>
					)}

					{/* Export success */}
					{(action === "export_pdf" || action === "export_pptx") && (
						<div className="flex items-center gap-2 text-xs">
							<Check className="size-3 text-emerald-500 flex-shrink-0" />
							<span className="text-foreground/80">
								Exported {parsed.presentation_name || presentationName} to{" "}
								{action === "export_pdf" ? "PDF" : "PPTX"}
							</span>
						</div>
					)}

					{/* Generic fallback for other actions (list, delete, etc.) */}
					{![
						"create_slide",
						"validate_slide",
						"preview",
						"export_pdf",
						"export_pptx",
					].includes(action) && (
						<div className="flex items-center gap-2 text-xs">
							<Check className="size-3 text-emerald-500 flex-shrink-0" />
							<span className="text-foreground/80">
								{parsed.message || `${actionLabel} completed`}
							</span>
						</div>
					)}

					{/* File paths */}
					{parsed.slide_file && action !== "preview" && (
						<div className="text-[10px] text-muted-foreground/50 font-mono truncate">
							{parsed.slide_file}
						</div>
					)}
				</div>
			)}

			{/* Fallback for unrecognized output */}
			{!parsed && output && (
				<div data-scrollable className="p-2 max-h-72 overflow-auto">
					<pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground/60">
						{output}
					</pre>
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("presentation-gen", PresentationGenTool);

// --- Show (output to user) — standalone hero card renderer ---
// Uses ShowContentRenderer from file-renderers/ as the single source of truth
// for content rendering. This component only handles the card chrome + Open in Tab.

import { ShowContentRenderer, ShowCarousel, showDomain } from "@/components/file-renderers/show-content-renderer";
import type { ShowCarouselItem } from "@/components/file-renderers/show-content-renderer";

const SHOW_BORDER_STYLES: Record<string, string> = {
	default: "border-border/50",
	success: "border-emerald-500/20",
	warning: "border-amber-500/20",
	info: "border-blue-500/20",
	danger: "border-red-500/20",
};

function showTypeIcon(type: string, className = "size-4") {
	switch (type) {
		case "image": return <ImageIcon className={cn(className, "flex-shrink-0")} />;
		case "video": return <Video className={cn(className, "flex-shrink-0")} />;
		case "audio": return <Music className={cn(className, "flex-shrink-0")} />;
		case "code": return <Code2 className={cn(className, "flex-shrink-0")} />;
		case "markdown": return <Type className={cn(className, "flex-shrink-0")} />;
		case "html": return <Globe className={cn(className, "flex-shrink-0")} />;
		case "pdf": return <FileText className={cn(className, "flex-shrink-0")} />;
		case "url": return <Globe className={cn(className, "flex-shrink-0")} />;
		case "error": return <AlertTriangle className={cn(className, "flex-shrink-0")} />;
		case "file": return <FileIcon className={cn(className, "flex-shrink-0")} />;
		case "text": return <Type className={cn(className, "flex-shrink-0")} />;
		default: return <ExternalLink className={cn(className, "flex-shrink-0")} />;
	}
}

/** "Open in Tab" handler — opens the right tab type depending on content */
function useShowOpenInTab(props: { type: string; url: string; path: string; title: string }) {
	const { type, url, path, title } = props;
	const proxy = useProxyUrl(url);
	const hasLocalhostUrl = !!parseLocalhostUrl(url);

	return useCallback(() => {
		if (hasLocalhostUrl && proxy) {
			openTabAndNavigate({
				id: `preview:${proxy.port}`,
				title: title || `localhost:${proxy.port}`,
				type: "preview",
				href: `/preview/${proxy.port}`,
				metadata: enrichPreviewMetadata({
					url: proxy.proxyUrl,
					port: proxy.port,
					originalUrl: url,
				}),
			});
			return;
		}
		if (url) {
			window.open(url, "_blank", "noopener,noreferrer");
			return;
		}
		if (path) {
			const fileName = path.split("/").pop() || path;
			openTabAndNavigate({
				id: `file:${path}`,
				title: fileName,
				type: "file",
				href: `/files/${encodeURIComponent(path)}`,
			});
		}
	}, [hasLocalhostUrl, proxy, url, path, title]);
}

function ShowTool({ part }: ToolProps) {
	const input = partInput(part);
	const running = useContext(ToolRunningContext);

	const title = (input.title as string) || "";
	const description = (input.description as string) || "";
	const type = (input.type as string) || "";
	const path = (input.path as string) || "";
	const url = (input.url as string) || "";
	const content = (input.content as string) || "";
	const aspectRatio = (input.aspect_ratio as string) || "";
	const theme = (input.theme as string) || "default";
	const language = (input.language as string) || "";

	// ── Parse items[] for multi-item carousel mode ──
	const items = useMemo<ShowCarouselItem[] | null>(() => {
		const raw = input.items;
		if (!raw) return null;
		try {
			const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
			if (Array.isArray(parsed) && parsed.length > 0) return parsed;
		} catch { /* ignore */ }
		return null;
	}, [input.items]);

	const isCarousel = !!items && items.length > 0;

	const borderStyle = SHOW_BORDER_STYLES[theme] || SHOW_BORDER_STYLES.default;
	const hasLocalhostUrl = !!parseLocalhostUrl(url);

	const openInTab = useShowOpenInTab({ type, url, path, title });
	const canOpenInTab = !isCarousel && !!(url || path);
	const openInTabLabel = hasLocalhostUrl ? "Open in Tab" : url ? "Open Link" : "Open File";

	// Loading state
	if (running && !type && !items) {
		return (
			<div className="rounded-xl border border-border/50 overflow-hidden bg-card">
				<div className="flex items-center gap-3 px-5 py-4">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<TextShimmer duration={1} spread={2} className="text-sm">
						Preparing output...
					</TextShimmer>
				</div>
			</div>
		);
	}

	const displayTitle = isCarousel
		? (title || `${items!.length} items`)
		: (title || (type === "error" ? "Error" : type === "url" ? (showDomain(url) || "Link") : "Output"));

	const headerIcon = isCarousel ? "image" : type;

	return (
		<div className={cn("rounded-xl border overflow-hidden bg-card", borderStyle)}>
			{/* ── Header — always neutral colors, never themed ── */}
			<div className="flex items-center gap-3 px-5 py-3 border-b border-border/15">
				<span className="text-muted-foreground">
					{showTypeIcon(headerIcon, "size-4")}
				</span>
				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium text-foreground truncate">
						{displayTitle}
					</div>
					{description && (
						<div className="text-xs text-muted-foreground/70 truncate mt-0.5">
							{description}
						</div>
					)}
				</div>
				{isCarousel && (
					<span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground/60 font-medium flex-shrink-0">
						{items!.length} items
					</span>
				)}
				{canOpenInTab && (
					<button
						type="button"
						onClick={openInTab}
						className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						{hasLocalhostUrl ? <MonitorPlay className="size-3.5" /> : <Maximize2 className="size-3.5" />}
						{openInTabLabel}
					</button>
				)}
			</div>

			{/* ── Content — carousel or single ── */}
			{isCarousel ? (
				<ShowCarousel items={items!} LocalhostPreview={InlineServicePreview} />
			) : (
				<>
					<ShowContentRenderer
						type={type}
						title={title}
						description={description}
						path={path}
						url={url}
						content={content}
						language={language}
						aspectRatio={aspectRatio}
						LocalhostPreview={InlineServicePreview}
					/>
					{description && !title && (
						<div className="px-5 py-3 border-t border-border/15">
							<p className="text-xs text-muted-foreground/70">{description}</p>
						</div>
					)}
				</>
			)}
		</div>
	);
}
ToolRegistry.register("show", ShowTool);
ToolRegistry.register("show-user", ShowTool); // backward compat

// --- Task (sub-agent) — matches TUI: BasicTool with child tool list ---
function TaskTool({
	part,
	sessionId,
	defaultOpen,
	forceOpen,
	locked,
	onPermissionReply,
}: ToolProps) {
	const input = partInput(part);
	const status = partStatus(part);
	const childSessionId = getChildSessionId(part);
	const subagentType = (input.subagent_type as string) || "task";
	const description = (input.description as string) || "";

	// Sub-session modal state
	const [modalOpen, setModalOpen] = useState(false);

	// Fetch child session messages
	const { data: childMessages } = useOpenCodeMessages(childSessionId || "");

	// Get child session permissions from pending store
	const allPermissions = useOpenCodePendingStore((s) => s.permissions);
	const childPermission = useMemo(() => {
		if (!childSessionId) return undefined;
		return Object.values(allPermissions).find(
			(p) => p.sessionID === childSessionId,
		);
	}, [allPermissions, childSessionId]);

	// Extract child tool parts
	const childToolParts = useMemo(() => {
		if (!childMessages) return [];
		return getChildSessionToolParts(childMessages);
	}, [childMessages]);

	// Find the child tool part matching the permission
	const childPermissionToolPart = useMemo(() => {
		if (!childPermission?.tool || !childMessages) return undefined;
		for (const msg of childMessages) {
			if (msg.info.role !== "assistant") continue;
			for (const p of msg.parts) {
				if (isToolPart(p) && p.callID === childPermission.tool.callID) {
					return p;
				}
			}
		}
		return undefined;
	}, [childPermission, childMessages]);

	// Click subtitle → open inline modal (instead of navigating away)
	const handleSubtitleClick = useCallback(() => {
		if (childSessionId) {
			setModalOpen(true);
		}
	}, [childSessionId]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const userScrolledRef = useRef(false);
	const stepCount = childToolParts.length;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const handleScroll = () => {
			const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
			userScrolledRef.current = !atBottom;
		};
		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => el.removeEventListener("scroll", handleScroll);
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (el && !userScrolledRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [stepCount]);

	// Trigger content — agent type + clickable description (matches TUI)
	const trigger = useMemo(
		() => ({
			title: `${subagentType.charAt(0).toUpperCase() + subagentType.slice(1)} Agent`,
			subtitle: description || undefined,
		}),
		[subagentType, description],
	);

	// Sub-session modal (rendered always so open/close is instant)
	const modal = childSessionId ? (
		<SubSessionModal
			open={modalOpen}
			onOpenChange={setModalOpen}
			sessionId={childSessionId}
			parentSessionId={sessionId}
			title={description || `${subagentType} agent`}
		/>
	) : null;

	// Permission mode — render the child tool that needs attention inline
	if (childPermission) {
		return (
			<div className="space-y-1.5">
				{childPermissionToolPart ? (
					(() => {
						const Comp = ToolRegistry.get(childPermissionToolPart.tool);
						return Comp ? (
							<Comp
								part={childPermissionToolPart}
								sessionId={childSessionId}
								defaultOpen
								forceOpen
								locked
							/>
						) : (
							<GenericTool part={childPermissionToolPart} />
						);
					})()
				) : (
					<BasicTool
						icon={<SquareKanban className="size-3.5 flex-shrink-0" />}
						trigger={trigger}
						defaultOpen
						locked
						onSubtitleClick={childSessionId ? handleSubtitleClick : undefined}
					/>
				)}
				<PermissionPromptInline
					permission={childPermission}
					onReply={onPermissionReply}
				/>
				{modal}
			</div>
		);
	}

	// Normal mode — BasicTool with child tool list (matches TUI exactly)
	return (
		<>
			<BasicTool
				icon={<SquareKanban className="size-3.5 flex-shrink-0" />}
				trigger={trigger}
				defaultOpen={defaultOpen}
				forceOpen={forceOpen}
				locked={locked}
				onSubtitleClick={childSessionId ? handleSubtitleClick : undefined}
			>
				{childToolParts.length > 0 && (
					<div
						ref={scrollRef}
						data-scrollable
						className="max-h-48 overflow-y-auto"
					>
						{childToolParts.map((childPart, i) => {
							const info = getToolInfo(
								childPart.tool,
								childPart.state.input ?? {},
							);
							return (
								<div
									key={childPart.id}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-xs",
										i > 0 && "border-t border-border/20",
									)}
								>
									<ToolIconForName name={info.icon} />
									<span className="font-medium text-foreground/80 whitespace-nowrap">
										{info.title}
									</span>
									{info.subtitle && (
										<span className="truncate text-muted-foreground font-mono text-[10px]">
											{info.subtitle}
										</span>
									)}
								</div>
							);
						})}
					</div>
				)}
			</BasicTool>
			{modal}
		</>
	);
}
ToolRegistry.register("task", TaskTool);

// --- ToolIconForName: maps icon string to Lucide icon ---
function ToolIconForName({ name }: { name: string }) {
	const cls = "size-3 flex-shrink-0";
	switch (name) {
		case "terminal":
		case "console":
			return <Terminal className={cls} />;
		case "file-pen":
		case "code-lines":
			return <FileCode2 className={cls} />;
		case "glasses":
			return <Glasses className={cls} />;
		case "search":
		case "magnifying-glass-menu":
			return <Search className={cls} />;
		case "globe":
		case "window-cursor":
			return <Globe className={cls} />;
		case "list":
		case "bullet-list":
			return <ListTree className={cls} />;
		case "check-square":
		case "checklist":
			return <CheckSquare className={cls} />;
		case "message-circle":
		case "bubble-5":
			return <MessageCircle className={cls} />;
		case "square-kanban":
		case "task":
			return <SquareKanban className={cls} />;
		case "presentation":
			return <Presentation className={cls} />;
		case "image":
			return <ImageIcon className={cls} />;
		default:
			return <Cpu className={cls} />;
	}
}

// --- TodoWrite ---
function TodoWriteTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const metadata = partMetadata(part);

	const todos = useMemo(() => {
		const meta = metadata.todos;
		if (Array.isArray(meta)) return meta;
		const inp = input.todos;
		if (Array.isArray(inp)) return inp;
		return [];
	}, [metadata.todos, input.todos]);

	const completed = useMemo(
		() =>
			todos.filter((t: Record<string, unknown>) => t.status === "completed")
				.length,
		[todos],
	);

	const subtitle = todos.length > 0 ? `${completed}/${todos.length}` : "";

	return (
		<BasicTool
			icon={<CheckSquare className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Todos", subtitle }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{todos.length > 0 && (
				<div className="px-3 py-1.5 space-y-px max-h-[200px] overflow-y-auto scrollbar-hide">
					{todos.map((todo: Record<string, unknown>, i: number) => (
						<div
							key={i}
							className={cn(
								"flex items-center gap-2 py-0.5 text-[11px] cursor-default",
								todo.status === "completed" && "opacity-40",
							)}
						>
							<span
								className={cn(
									"size-3 rounded-sm flex-shrink-0 flex items-center justify-center border border-border/60",
									todo.status === "completed" && "bg-muted",
								)}
							>
								{todo.status === "completed" && (
									<Check className="size-2 text-muted-foreground" />
								)}
								{todo.status === "in_progress" && (
									<Loader2 className="size-2 text-muted-foreground animate-spin" />
								)}
							</span>
							<span
								className={cn(
									"leading-tight truncate",
									todo.status === "completed" &&
										"line-through text-muted-foreground",
								)}
							>
								{String(todo.content || "")}
							</span>
						</div>
					))}
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("todowrite", TodoWriteTool);

// --- Session Context ---
function SessionContextTool({
	part,
	defaultOpen,
	forceOpen,
	locked,
}: ToolProps) {
	const input = partInput(part);
	const metadata = partMetadata(part);
	const status = partStatus(part);

	const mode = String(metadata.mode || input.mode || "summary");
	const sessionTitle = String(metadata.sessionTitle || "");
	const modeLabels: Record<string, string> = {
		summary: "Summary",
		messages: "Messages",
		diffs: "Diffs",
		todo: "Todos",
	};
	const subtitle = sessionTitle
		? `${sessionTitle} — ${modeLabels[mode] || mode}`
		: modeLabels[mode] || mode;

	return (
		<BasicTool
			icon={<BookOpen className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Session Context", subtitle }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{status === "completed" && (
				<div className="px-3 py-2.5 text-xs text-muted-foreground max-h-48 overflow-y-auto whitespace-pre-wrap">
					{partOutput(part).slice(0, 2000)}
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("session_context", SessionContextTool);

// --- Skill ---
function SkillToolRenderer({
	part,
	defaultOpen,
	forceOpen,
	locked,
}: ToolProps) {
	const input = partInput(part);
	const metadata = partMetadata(part);
	const output = partOutput(part);

	const skillName = String(metadata.name || input.name || "Skill");
	const skillDir = String(metadata.dir || "");
	const subtitle = skillDir || undefined;

	return (
		<BasicTool
			icon={<BookOpen className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Skill", subtitle: skillName }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{output && (
				<div
					data-scrollable
					className={`p-2 max-h-48 overflow-auto ${MD_FLUSH_CLASSES}`}
				>
					<UnifiedMarkdown
						content={output.slice(0, 2000)}
						isStreaming={false}
					/>
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("skill", SkillToolRenderer);

// --- Code Search ---
function CodesearchToolRenderer({
	part,
	defaultOpen,
	forceOpen,
	locked,
}: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);

	const query = String(input.query || "");

	return (
		<BasicTool
			icon={<Globe className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Code Search", subtitle: query || undefined }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{output && (
				<div
					data-scrollable
					className={`p-2 max-h-72 overflow-auto ${MD_FLUSH_CLASSES}`}
				>
					<UnifiedMarkdown
						content={output.slice(0, 3000)}
						isStreaming={false}
					/>
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("codesearch", CodesearchToolRenderer);

// --- Batch ---
function BatchToolRenderer({
	part,
	defaultOpen,
	forceOpen,
	locked,
}: ToolProps) {
	const input = partInput(part);
	const metadata = partMetadata(part);
	const status = partStatus(part);
	const running = useContext(ToolRunningContext);

	const totalCalls = (metadata.totalCalls as number) || 0;
	const successful = (metadata.successful as number) || 0;
	const failed = (metadata.failed as number) || 0;
	const details = (
		Array.isArray(metadata.details) ? metadata.details : []
	) as Array<{ tool: string; success: boolean }>;

	const toolCalls =
		details.length > 0
			? details
			: (Array.isArray(input.tool_calls)
					? (input.tool_calls as Array<{ tool: string }>)
					: [])
				.map((c) => ({ tool: c.tool, success: true }));

	const subtitle =
		totalCalls > 0
			? `${successful}/${totalCalls} passed`
			: `${toolCalls.length} tool${toolCalls.length !== 1 ? "s" : ""}`;

	return (
		<BasicTool
			icon={<Layers className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Batch", subtitle }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{toolCalls.length > 0 && (
				<div className="px-3 py-2 space-y-1">
					{toolCalls.map(
						(call: { tool: string; success?: boolean }, i: number) => (
							<div key={i} className="flex items-center gap-2 text-xs">
							{running ? (
								<Loader2 className="size-2.5 text-muted-foreground animate-spin shrink-0" />
							) : call.success !== false ? (
									<Check className="size-2.5 text-emerald-500 shrink-0" />
								) : (
									<CircleAlert className="size-2.5 text-muted-foreground shrink-0" />
								)}
								<span className="font-mono truncate">{call.tool}</span>
							</div>
						),
					)}
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("batch", BatchToolRenderer);

// --- Plan (Enter/Exit) ---
function PlanToolRenderer({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const input = partInput(part);
	const status = partStatus(part);

	const toolName = (part as any).tool || "";
	const isExit = toolName === "plan_exit";
	const subtitle = isExit ? "Plan -> Build" : "Build -> Plan";

	return (
		<BasicTool
			icon={<SquareKanban className="size-3.5 flex-shrink-0" />}
			trigger={{
				title: isExit ? "Switch to Build" : "Switch to Plan",
				subtitle,
			}}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{status === "completed" && (
				<div className="px-3 py-2 text-xs text-muted-foreground">
					{isExit ? "Switched to build agent." : "Switched to plan agent."}
				</div>
			)}
			{status === "error" && (
				<div className="px-3 py-2 text-xs text-muted-foreground">
					User declined the switch.
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("plan_exit", PlanToolRenderer);
ToolRegistry.register("plan_enter", PlanToolRenderer);

// --- Question ---
function QuestionToolRenderer({
	part,
	defaultOpen,
	forceOpen,
	locked,
	hasActiveQuestion,
}: ToolProps) {
	const input = partInput(part);
	const metadata = partMetadata(part);
	const status = partStatus(part);
	const running = useContext(ToolRunningContext);

	const questions = useMemo(
		() =>
			(Array.isArray(input.questions) ? input.questions : []) as Array<{
				question: string;
				options?: { label: string; description?: string }[];
			}>,
		[input.questions],
	);

	const answers = useMemo(
		() =>
			(Array.isArray(metadata.answers) ? metadata.answers : []) as string[][],
		[metadata.answers],
	);

	const isAnswered = answers.length > 0;
	const isWaiting = running && questions.length > 0 && !hasActiveQuestion;
	const subtitle =
		questions.length > 0
			? isAnswered
				? `${answers.length} answered`
				: `${questions.length} ${questions.length > 1 ? "questions" : "question"}`
			: running
				? "Preparing..."
				: "";

	return (
		<BasicTool
			icon={<MessageCircle className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Questions", subtitle }}
			defaultOpen={defaultOpen ?? isAnswered}
			forceOpen={forceOpen || isAnswered}
			locked={locked}
		>
			{isAnswered ? (
				<div className="px-3 py-2 space-y-1.5">
					{questions.map((q, i) => {
						const answer = answers[i] || [];
						return (
							<div key={i} className="flex items-baseline gap-1.5 text-xs">
								<span className="font-medium text-foreground shrink-0">
									{q.question}
								</span>
								<span className="text-muted-foreground truncate">
									{answer.join(", ") || "No answer"}
								</span>
							</div>
						);
					})}
				</div>
			) : isWaiting ? (
				<div className="px-3 py-2 space-y-1.5">
					{questions.map((q, i) => (
						<div key={i} className="text-xs text-muted-foreground">
							{q.question}
						</div>
					))}
				</div>
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("question", QuestionToolRenderer);

// --- Apply Patch ---
function ApplyPatchTool({ part, defaultOpen, forceOpen, locked }: ToolProps) {
	const metadata = partMetadata(part);

	const files = useMemo(
		() =>
			(Array.isArray(metadata.files) ? metadata.files : []) as ApplyPatchFile[],
		[metadata.files],
	);

	const subtitle =
		files.length > 0
			? `${files.length} ${files.length > 1 ? "files" : "file"}`
			: "";

	return (
		<BasicTool
			icon={<FileCode2 className="size-3.5 flex-shrink-0" />}
			trigger={{ title: "Patch", subtitle }}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={locked}
		>
			{files.length > 0 && (
				<div className="p-2 space-y-2">
					{files.map((file, i) => (
						<div key={i} className="space-y-1">
							{/* File header */}
							<div className="flex items-center gap-2 text-xs">
								<span
									className={cn(
										"px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
										file.type === "add" && "bg-emerald-500/15 text-emerald-500",
										file.type === "update" && "bg-amber-500/15 text-amber-500",
										file.type === "delete" && "bg-red-500/15 text-red-500",
										file.type === "move" && "bg-blue-500/15 text-blue-500",
									)}
								>
									{file.type === "add"
										? "Created"
										: file.type === "update"
											? "Patched"
											: file.type === "delete"
												? "Deleted"
												: "Moved"}
								</span>
								<span className="font-mono text-[11px] text-foreground truncate">
									{file.relativePath}
								</span>
								{file.type !== "delete" && (
									<DiffChanges
										additions={file.additions}
										deletions={file.deletions}
									/>
								)}
								{file.type === "delete" && file.deletions > 0 && (
									<span className="ml-auto text-[10px] text-red-500">
										-{file.deletions}
									</span>
								)}
							</div>

							{/* File diff */}
							{file.type !== "delete" && (file.before || file.after) && (
								<div
									data-scrollable
									className="max-h-72 overflow-auto rounded-md bg-muted/10"
								>
									<InlineDiffView
										oldValue={file.before}
										newValue={file.after}
										filename={file.relativePath}
									/>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</BasicTool>
	);
}
ToolRegistry.register("apply_patch", ApplyPatchTool);









// ============================================================================
// DCP Tools (distill, compress, prune, context_info)
// ============================================================================

function DCPPruneTool({ part }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const isRunning = useContext(ToolRunningContext);
	const ids = input.ids;
	const reason = input.reason;

	return (
		<BasicTool
			icon={<Scissors className="size-3.5 flex-shrink-0 text-amber-500" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Prune
					</span>
					<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium whitespace-nowrap">
						DCP
					</span>
					{reason && (
						<span className="text-[10px] text-muted-foreground/70 truncate">
							{reason}
						</span>
					)}
					{ids && ids.length > 0 && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/70 ml-auto">
							{ids.length} tools
						</span>
					)}
					{isRunning && (
						<Loader2 className="size-3 animate-spin text-muted-foreground ml-auto" />
					)}
				</div>
			}
		>
			{output ? (
				<div data-scrollable className="p-2 max-h-48 overflow-auto">
					<pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground/60">
						{output}
					</pre>
				</div>
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("prune", DCPPruneTool);

function DCPDistillTool({ part }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const isRunning = useContext(ToolRunningContext);
	const ids = input.ids;

	return (
		<BasicTool
			icon={<Scissors className="size-3.5 flex-shrink-0 text-blue-500" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Distill
					</span>
					<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium whitespace-nowrap">
						DCP
					</span>
					{ids && ids.length > 0 && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/70 ml-auto">
							{ids.length} tools
						</span>
					)}
					{isRunning && (
						<Loader2 className="size-3 animate-spin text-muted-foreground ml-auto" />
					)}
				</div>
			}
		>
			{output ? (
				<div data-scrollable className="p-2 max-h-48 overflow-auto">
					<pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground/60">
						{output}
					</pre>
				</div>
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("distill", DCPDistillTool);

function DCPCompressTool({ part }: ToolProps) {
	const input = partInput(part);
	const output = partOutput(part);
	const isRunning = useContext(ToolRunningContext);
	const topic = input.topic;

	return (
		<BasicTool
			icon={<Scissors className="size-3.5 flex-shrink-0 text-purple-500" />}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-foreground whitespace-nowrap">
						Compress
					</span>
					<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500 font-medium whitespace-nowrap">
						DCP
					</span>
					{topic && (
						<span className="text-[10px] text-muted-foreground/70 truncate max-w-[200px]">
							{topic}
						</span>
					)}
					{isRunning && (
						<Loader2 className="size-3 animate-spin text-muted-foreground ml-auto" />
					)}
				</div>
			}
		>
			{output ? (
				<div data-scrollable className="p-2 max-h-48 overflow-auto">
					<pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground/60">
						{output}
					</pre>
				</div>
			) : null}
		</BasicTool>
	);
}
ToolRegistry.register("compress", DCPCompressTool);

function ContextInfoTool({ part }: ToolProps) {
	// context_info is a synthetic tool injected by DCP — render minimally or hide
	const output = partOutput(part);
	if (!output) return null;

	return (
		<BasicTool
			icon={
				<Scissors className="size-3.5 flex-shrink-0 text-muted-foreground/50" />
			}
			trigger={
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="font-medium text-xs text-muted-foreground/70 whitespace-nowrap">
						Context Info
					</span>
					<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/50 font-medium whitespace-nowrap">
						DCP
					</span>
				</div>
			}
		>
			<div data-scrollable className="p-2 max-h-32 overflow-auto">
				<pre className="font-mono text-[10px] whitespace-pre-wrap text-muted-foreground/60">
					{output}
				</pre>
			</div>
		</BasicTool>
	);
}
ToolRegistry.register("context_info", ContextInfoTool);

// ============================================================================
// ToolError
// ============================================================================

/**
 * A parsed Zod/JSON validation error issue.
 */
interface ValidationIssue {
	code: string;
	message: string;
	path: string[];
	values?: string[];
}

/**
 * Parse an error string into a summary line and optional traceback/details.
 */
function parseErrorContent(error: string): {
	summary: string;
	traceback: string | null;
	errorType: string | null;
	validationIssues: ValidationIssue[] | null;
} {
	const cleaned = error.replace(/^Error:\s*/, "");

	// Try to detect JSON validation errors (Zod-style arrays of issues)
	const trimmed = cleaned.trim();
	if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
		try {
			const parsed = JSON.parse(trimmed);
			const arr = Array.isArray(parsed) ? parsed : [parsed];
			// Check if it looks like validation issues (has code + message fields)
			if (
				arr.length > 0 &&
				arr.every(
					(item: any) => item && typeof item === "object" && "message" in item,
				)
			) {
				const issues: ValidationIssue[] = arr.map((item: any) => ({
					code: item.code || "error",
					message: item.message || String(item),
					path: Array.isArray(item.path) ? item.path.map(String) : [],
					values: Array.isArray(item.values)
						? item.values.map(String)
						: undefined,
				}));
				// Build a readable summary from the first issue
				const first = issues[0];
				const pathStr = first.path.length > 0 ? first.path.join(".") : "";
				const summary = pathStr
					? `${pathStr}: ${first.message}`
					: first.message;
				return {
					summary,
					traceback: null,
					errorType: "Validation Error",
					validationIssues: issues,
				};
			}
		} catch {
			// Not valid JSON — fall through to other detection methods
		}
	}

	// Try to extract Python-style traceback
	const tracebackIdx = cleaned.indexOf("Traceback (most recent call last):");
	if (tracebackIdx >= 0) {
		const before = cleaned.slice(0, tracebackIdx).trim();
		const traceSection = cleaned.slice(tracebackIdx);
		// Find the actual error line at the end (last line that isn't whitespace)
		const lines = traceSection.split("\n").filter((l) => l.trim());
		const lastLine = lines[lines.length - 1] || "";
		// Extract error type (e.g. "playwright._impl._errors.Error")
		const typeMatch = lastLine.match(
			/^([\w._]+(?:Error|Exception|Warning)):\s*/,
		);
		const errorType = typeMatch
			? typeMatch[1].split(".").pop() || typeMatch[1]
			: null;
		const summary = before || (errorType ? lastLine : lastLine.slice(0, 120));
		return {
			summary,
			traceback: traceSection,
			errorType,
			validationIssues: null,
		};
	}

	// Try to extract Node.js-style stack trace
	const stackIdx = cleaned.indexOf("\n    at ");
	if (stackIdx >= 0) {
		const summary = cleaned.slice(0, stackIdx).trim();
		return {
			summary,
			traceback: cleaned.slice(stackIdx),
			errorType: null,
			validationIssues: null,
		};
	}

	// Simple "ErrorType: message" pattern
	const colonIdx = cleaned.indexOf(": ");
	if (colonIdx > 0 && colonIdx < 60) {
		const left = cleaned.slice(0, colonIdx);
		if (/^[\w._-]+$/.test(left)) {
			return {
				summary: cleaned,
				traceback: null,
				errorType: left,
				validationIssues: null,
			};
		}
	}

	return {
		summary: cleaned,
		traceback: null,
		errorType: null,
		validationIssues: null,
	};
}

export function ToolError({
	error,
	toolName,
}: {
	error: string;
	toolName?: string;
}) {
	const [showTrace, setShowTrace] = useState(false);

	// Normalize and try structured rendering
	const structuredSections = useMemo(() => {
		const normalized = normalizeToolOutput(error);
		if (!hasStructuredContent(normalized)) return null;
		return parseStructuredOutput(normalized);
	}, [error]);

	const { summary, traceback, errorType, validationIssues } = useMemo(
		() => parseErrorContent(normalizeToolOutput(error)),
		[error],
	);

	// Display name: prefer short error type, else "Error"
	const displayType = errorType || "Error";

	// Use structured output when we detect warnings + tracebacks etc.
	if (structuredSections) {
		return (
			<div className="text-xs">
				<StructuredOutput sections={structuredSections} />
			</div>
		);
	}

	// Render validation issues with structured layout
	if (validationIssues && validationIssues.length > 0) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden text-xs">
				{/* Header */}
				<div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
					<Ban className="size-3 flex-shrink-0 text-muted-foreground/70" />
					<span className="font-medium text-muted-foreground">
						{displayType}
					</span>
					{toolName && (
						<span className="text-muted-foreground/50 font-mono text-[10px] ml-auto">
							{toolName}
						</span>
					)}
				</div>

				{/* Validation issues */}
				<div className="px-3 py-2.5 space-y-2.5">
					{validationIssues.map((issue, i) => (
						<div key={i} className="space-y-1.5">
							{/* Path + message */}
							<div className="flex items-start gap-2">
								<CircleAlert className="size-3 flex-shrink-0 text-muted-foreground/60 mt-0.5" />
								<div className="min-w-0 flex-1">
									{issue.path.length > 0 && (
										<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground/70 font-mono mr-1.5">
											{issue.path.join(".")}
										</span>
									)}
									<span className="text-foreground/80 text-[11px]">
										{issue.message}
									</span>
								</div>
							</div>

							{/* Valid values */}
							{issue.values && issue.values.length > 0 && (
								<div className="ml-5">
									<div className="text-[10px] text-muted-foreground/50 mb-1">
										Expected one of:
									</div>
									<div className="flex flex-wrap gap-1">
										{issue.values.map((val, vi) => (
											<span
											 key={vi}
											 className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/40 text-muted-foreground/70 font-mono"
											>
												{val}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden text-xs">
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
				<Ban className="size-3 flex-shrink-0 text-muted-foreground/70" />
				<span className="font-medium text-muted-foreground">{displayType}</span>
				{toolName && (
					<span className="text-muted-foreground/50 font-mono text-[10px] ml-auto">
						{toolName}
					</span>
				)}
			</div>

			{/* Summary */}
			<div className="px-3 py-2.5">
				<p className="text-foreground/80 leading-relaxed break-words whitespace-pre-wrap font-mono text-[11px]">
					{summary}
				</p>
			</div>

			{/* Stack trace toggle */}
			{traceback && (
				<>
					<button
						onClick={() => setShowTrace((v) => !v)}
					 className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left border-t border-border/40 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
					>
						<ChevronRight
						 className={cn(
								"size-3 transition-transform",
								showTrace && "rotate-90",
							)}
						/>
						<span className="text-[10px] font-medium">Stack trace</span>
					</button>
					{showTrace && (
						<div className="px-3 pb-2.5 max-h-64 overflow-auto">
							<pre className="font-mono text-[10px] leading-relaxed text-muted-foreground/60 whitespace-pre-wrap break-all">
								{traceback}
							</pre>
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ============================================================================
// GenericTool (fallback)
// ============================================================================

/**
 * Parse a tool name that may contain a namespace/server prefix.
 * e.g. "marko-kraemer/validate-slide" -> { server: "marko-kraemer", name: "validate-slide", display: "Validate Slide" }
 * e.g. "bash" -> { server: null, name: "bash", display: "Bash" }
 */
function parseToolName(tool: string): {
	server: string | null;
	name: string;
	display: string;
} {
	const slashIdx = tool.lastIndexOf("/");
	const server = slashIdx > 0 ? tool.slice(0, slashIdx) : null;
	const name = slashIdx > 0 ? tool.slice(slashIdx + 1) : tool;
	// Convert kebab/snake case to Title Case
	const display = name
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return { server, name, display };
}

export function GenericTool({ part }: ToolProps) {
	const output = partOutput(part);
	const strippedGenericOutput = output ? stripAnsi(output) : "";
	const running = useContext(ToolRunningContext);
	const input = partInput(part);
	const { server, display } = useMemo(
		() => parseToolName(part.tool),
		[part.tool],
	);

	// Try to detect structured log-like output (warnings, tracebacks, etc.)
	const genericStructuredSections = useMemo(() => {
		if (!strippedGenericOutput) return null;
		const normalized = normalizeToolOutput(strippedGenericOutput);
		if (!hasStructuredContent(normalized)) return null;
		return parseStructuredOutput(normalized);
	}, [strippedGenericOutput]);

	// Build trigger title with optional server badge
	const triggerNode = (
		<div className="flex items-center gap-1.5 min-w-0 flex-1">
			<span className="font-medium text-xs text-foreground whitespace-nowrap">
				{display}
			</span>
			{server && (
				<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/70 font-mono whitespace-nowrap">
					{server}
				</span>
			)}
			{genericStructuredSections && (
				<span className="text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono whitespace-nowrap">
					{genericStructuredSections.type}
				</span>
			)}
			{running && (
				<Loader2 className="size-3 animate-spin text-muted-foreground ml-auto flex-shrink-0" />
			)}
		</div>
	);

	const bodyContent = genericStructuredSections ? (
		<div className="p-2.5 max-h-72 overflow-auto">
			<StructuredOutput sections={genericStructuredSections.sections} />
		</div>
	) : output ? (
		<ToolOutputFallback output={output} toolName={part.tool} />
	) : null;

	return (
		<BasicTool
			icon={<Cpu className="size-3.5 flex-shrink-0" />}
			trigger={triggerNode}
		>
			{bodyContent}
		</BasicTool>
	);
}

// ============================================================================
// PermissionPromptInline
// ============================================================================

interface PermissionPromptInlineProps {
	permission: PermissionRequest;
	onReply?: (requestId: string, reply: "once" | "always" | "reject") => void;
}

function PermissionPromptInline({
	permission,
	onReply,
}: PermissionPromptInlineProps) {
	const [visible, setVisible] = useState(false);
	const [replying, setReplying] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setVisible(true), 50);
		return () => clearTimeout(timer);
	}, []);

	const label =
		PERMISSION_LABELS[permission.permission] || permission.permission;

	const handleReply = useCallback(
		(reply: "once" | "always" | "reject") => {
			if (replying) return;
			setReplying(true);
			onReply?.(permission.id, reply);
		},
		[replying, permission.id, onReply],
	);

	if (!visible) return null;

	return (
		<div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
			<span className="text-xs text-foreground flex-1">
				Permission: <span className="font-medium">{label}</span>
			</span>
			<div className="flex items-center gap-1.5">
				<button
					disabled={replying}
					onClick={() => handleReply("reject")}
					className="px-2 py-1 text-[11px] rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
				>
					Deny
				</button>
				<button
					disabled={replying}
					onClick={() => handleReply("always")}
					className="px-2 py-1 text-[11px] rounded-md text-foreground hover:bg-muted transition-colors border border-border disabled:opacity-50"
				>
					Allow always
				</button>
				<button
					disabled={replying}
					onClick={() => handleReply("once")}
					className="px-2 py-1 text-[11px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
				>
					Allow once
				</button>
			</div>
		</div>
	);
}

// ============================================================================
// ToolPartRenderer — main dispatch (primary export)
// ============================================================================

interface ToolPartRendererProps {
	part: ToolPart;
	permission?: PermissionRequest;
	question?: QuestionRequest;
	onPermissionReply?: (
		requestId: string,
		reply: "once" | "always" | "reject",
	) => void;
	onQuestionReply?: (requestId: string, answers: string[][]) => void;
	onQuestionReject?: (requestId: string) => void;
	defaultOpen?: boolean;
}

export function ToolPartRenderer({
	part,
	sessionId,
	permission,
	question,
	onPermissionReply,
	onQuestionReply,
	onQuestionReject,
	defaultOpen,
}: ToolPartRendererProps & { sessionId?: string }) {
	// Skip todoread
	if (part.tool === "todoread") return null;

	// Error state — show within a proper tool wrapper with the tool name
	if (part.state.status === "error" && "error" in part.state) {
		const errorStr = (part.state as { error: string }).error;
		const { display, server } = (() => {
			const slashIdx = part.tool.lastIndexOf("/");
			const s = slashIdx > 0 ? part.tool.slice(0, slashIdx) : null;
			const n = slashIdx > 0 ? part.tool.slice(slashIdx + 1) : part.tool;
			const d = n
				.replace(/[-_]/g, " ")
				.replace(/\b\w/g, (c) => c.toUpperCase());
			return { display: d, server: s };
		})();

		return (
			<BasicTool
				icon={
					<CircleAlert className="size-3.5 flex-shrink-0 text-muted-foreground/70" />
				}
				trigger={
					<div className="flex items-center gap-1.5 min-w-0 flex-1">
						<span className="font-medium text-xs text-foreground whitespace-nowrap">
							{display}
						</span>
						{server && (
							<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/70 font-mono whitespace-nowrap">
								{server}
							</span>
						)}
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium ml-auto flex-shrink-0">
						Error
					</span>
				</div>
			}
		>
				<div className="p-0">
					<ToolError error={errorStr} toolName={part.tool} />
				</div>
			</BasicTool>
		);
	}

	// Look up registered component
	const RegisteredComponent = ToolRegistry.get(part.tool);
	const forceOpen = !!permission || !!question;
	const isLocked = !!permission || !!question;

	// A tool part is "stale pending" when the backend sent a pending state
	// with empty input/raw and never followed up with running/completed.
	// This happens when the session ends abruptly. Don't show a spinner for these.
	const isStalePending =
		part.state.status === "pending" &&
		Object.keys(part.state.input ?? {}).length === 0 &&
		!(part.state as any).raw;

	const isRunning =
		!isStalePending &&
		(part.state.status === "running" || part.state.status === "pending");

	const toolElement = RegisteredComponent ? (
		<RegisteredComponent
			part={part}
			sessionId={sessionId}
			defaultOpen={defaultOpen}
			forceOpen={forceOpen}
			locked={isLocked}
			hasActiveQuestion={!!question}
			onPermissionReply={onPermissionReply}
		/>
	) : (
		<GenericTool part={part} />
	);

	return (
		<ToolRunningContext.Provider value={isRunning}>
		<StalePendingContext.Provider value={isStalePending}>
			<div className="relative">
				{toolElement}

				{/* Permission prompt */}
				{permission && onPermissionReply && (
					<div className="mt-1.5">
						<PermissionPromptInline
							permission={permission}
							onReply={onPermissionReply}
						/>
					</div>
				)}

				{/* Question prompt (renders inside tool part, matching SolidJS reference) */}
				{question && onQuestionReply && onQuestionReject && (
					<div className="mt-1.5">
						<QuestionPrompt
							request={question}
							onReply={onQuestionReply}
							onReject={onQuestionReject}
						/>
					</div>
				)}
			</div>
		</StalePendingContext.Provider>
		</ToolRunningContext.Provider>
	);
}
