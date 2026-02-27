/**
 * QuestionPrompt — compact self-contained inline chip inside the chat input card.
 *
 * - Compact header row (icon + summary + dismiss/chevron)
 * - Expandable body with question options
 * - Single-question immediate submit on pick
 * - Multi-select toggle + Next/Confirm flow
 * - "Type your own answer" inline input
 */

"use client";

import { MessageCircle, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { QuestionAnswer, QuestionInfo, QuestionRequest } from "@/ui";

// ---------------------------------------------------------------------------
// Lightweight markdown renderer for question text (no Shiki/KaTeX/Mermaid)
// ---------------------------------------------------------------------------

function QuestionMarkdown({ content, className }: { content: string; className?: string }) {
	return (
		<div className={cn("question-md", className)}>
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				p: ({ children }) => <p className="my-0.5 leading-snug">{children}</p>,
				strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
				em: ({ children }) => <em className="text-muted-foreground">{children}</em>,
				ul: ({ children }) => <ul className="my-0.5 pl-4 list-disc">{children}</ul>,
				ol: ({ children }) => <ol className="my-0.5 pl-4 list-decimal">{children}</ol>,
				li: ({ children }) => <li className="my-0">{children}</li>,
				code: ({ children }) => (
					<code className="text-[11px] px-1 py-0.5 rounded bg-muted font-mono">{children}</code>
				),
				a: ({ href, children }) => (
					<a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
						{children}
					</a>
				),
			}}
		>
			{content}
		</ReactMarkdown>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuestionPromptProps {
	request: QuestionRequest;
	onReply: (requestId: string, answers: QuestionAnswer[]) => void;
	onReject: (requestId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionPrompt({
	request,
	onReply,
	onReject,
}: QuestionPromptProps) {
	const questions = request.questions;
	const isSingle = questions.length === 1 && !questions[0].multiple;

	const [tab, setTab] = useState(0);
	const [answers, setAnswers] = useState<QuestionAnswer[]>(() =>
		questions.map(() => []),
	);
	const [customInputs, setCustomInputs] = useState<string[]>(() =>
		questions.map(() => ""),
	);
	const [editing, setEditing] = useState(false);
	const [replying, setReplying] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const isConfirm = tab === questions.length;
	const currentQuestion = questions[tab] as QuestionInfo | undefined;
	const isMulti = currentQuestion?.multiple ?? false;
	const options = currentQuestion?.options ?? [];
	const currentAnswers = answers[tab] ?? [];
	const showCustom = currentQuestion?.custom !== false;

	// Auto-focus input when editing
	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
		}
	}, [editing]);

	// -----------------------------------------------------------------------
	// Handlers
	// -----------------------------------------------------------------------

	const pick = useCallback(
		(answer: string, isCustom = false) => {
			const next = [...answers];
			next[tab] = [answer];
			setAnswers(next);

			if (isCustom) {
				const nextCustom = [...customInputs];
				nextCustom[tab] = answer;
				setCustomInputs(nextCustom);
			}

			if (isSingle) {
				setReplying(true);
				onReply(request.id, [[answer]]);
				return;
			}

			// Advance to next tab
			setTab(tab + 1);
			setEditing(false);
		},
		[answers, customInputs, tab, isSingle, request.id, onReply],
	);

	const toggle = useCallback(
		(answer: string) => {
			const existing = answers[tab] ?? [];
			const next = [...existing];
			const idx = next.indexOf(answer);
			if (idx === -1) next.push(answer);
			else next.splice(idx, 1);

			const updated = [...answers];
			updated[tab] = next;
			setAnswers(updated);
		},
		[answers, tab],
	);

	const selectOption = useCallback(
		(optIndex: number) => {
			const opts = currentQuestion?.options ?? [];
			if (showCustom && optIndex === opts.length) {
				setEditing(true);
				return;
			}
			const opt = opts[optIndex];
			if (!opt) return;

			if (isMulti) {
				toggle(opt.label);
			} else {
				pick(opt.label);
			}
		},
		[currentQuestion?.options, isMulti, showCustom, toggle, pick],
	);

	const handleCustomSubmit = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			if (!trimmed) {
				setEditing(false);
				return;
			}

			if (isMulti) {
				const existing = answers[tab] ?? [];
				if (!existing.includes(trimmed)) {
					const next = [...existing, trimmed];
					const updated = [...answers];
					updated[tab] = next;
					setAnswers(updated);
				}
				setEditing(false);
				const nextCustom = [...customInputs];
				nextCustom[tab] = "";
				setCustomInputs(nextCustom);
				return;
			}

			pick(trimmed, true);
			setEditing(false);
		},
		[isMulti, answers, customInputs, tab, pick],
	);

	const submit = useCallback(() => {
		setReplying(true);
		const finalAnswers = questions.map((_, i) => answers[i] ?? []);
		onReply(request.id, finalAnswers);
	}, [answers, questions, request.id, onReply]);

	const reject = useCallback(() => {
		setReplying(true);
		onReject(request.id);
	}, [request.id, onReject]);

	// -----------------------------------------------------------------------
	// Once replied, hide completely
	// -----------------------------------------------------------------------

	if (replying) return null;

	// -----------------------------------------------------------------------
	// Header summary text
	// -----------------------------------------------------------------------

	const headerSummary = (() => {
		if (isSingle) {
			const q = questions[0];
			return q.question;
		}
		const answered = answers.filter((a) => a.length > 0).length;
		return `${answered} of ${questions.length} answered`;
	})();

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------

	return (
		<div className="rounded-xl border border-border/40 bg-muted/40 overflow-hidden">
			{/* Header row */}
			<div className="flex items-center gap-2 w-full px-3 py-1.5">
				<MessageCircle className="size-3.5 text-muted-foreground flex-shrink-0" />
				<span className="text-xs text-muted-foreground flex-1 min-w-0 truncate text-left">
					{isSingle ? "" : `${questions.length} questions \u00B7 `}
					<span className="text-foreground/80 font-medium truncate">
						{headerSummary}
					</span>
				</span>
				<span
					role="button"
					tabIndex={0}
					onClick={reject}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							reject();
						}
					}}
					className="inline-flex items-center justify-center size-5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
				>
					<X className="size-3" />
				</span>
			</div>

			{/* Body */}
			<div className="border-t border-border/30">
					{/* Tab bar (multi-question only) */}
					{!isSingle && (
						<div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-hide border-b border-border/30 bg-muted/20">
							{questions.map((q, i) => {
								const isAnswered = (answers[i]?.length ?? 0) > 0;
								return (
									<button
										key={i}
										onClick={() => {
											setTab(i);
											setEditing(false);
										}}
										className={cn(
											"flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border transition-all duration-150 cursor-pointer whitespace-nowrap",
											tab === i
												? "bg-background/80 text-foreground border-border/70"
												: "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/70",
										)}
									>
										<span
											className={cn(
												"size-3 rounded-sm flex-shrink-0 flex items-center justify-center border",
												isAnswered
													? "border-border bg-muted"
													: tab === i
														? "border-foreground/30"
														: "border-border",
											)}
										>
											{isAnswered && (
												<svg viewBox="0 0 12 12" fill="none" width="7" height="7">
													<path d="M3 7.17905L5.02703 8.85135L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" className="text-foreground" />
												</svg>
											)}
											{!isAnswered && tab === i && (
												<div className="size-0.5 rounded-full bg-foreground" />
											)}
										</span>
										{q.header || `Q${i + 1}`}
									</button>
								);
							})}
							<button
								onClick={() => {
									setTab(questions.length);
									setEditing(false);
								}}
								className={cn(
									"px-2 py-0.5 text-[11px] font-medium rounded-md border transition-all duration-150 cursor-pointer",
									isConfirm
										? "bg-background/80 text-foreground border-border/70"
										: "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/70",
								)}
							>
								Confirm
							</button>
						</div>
					)}

					<div className="px-3 py-2">
						{/* Confirm / review tab */}
						{isConfirm ? (
							<div className="space-y-0.5">
								{questions.map((q, i) => {
									const ans = answers[i] ?? [];
									const done = ans.length > 0;
									return (
										<div
											key={i}
											className={cn(
												"flex items-center gap-1.5 py-0.5",
												!done && "opacity-40",
											)}
										>
											<span
												className={cn(
													"size-3 rounded-sm flex-shrink-0 flex items-center justify-center border",
													done ? "border-border bg-muted" : "border-border",
												)}
											>
												{done && (
													<svg viewBox="0 0 12 12" fill="none" width="7" height="7">
														<path d="M3 7.17905L5.02703 8.85135L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" className="text-foreground" />
													</svg>
												)}
											</span>
											<span
												className={cn(
													"text-[11px] leading-tight flex-1 min-w-0",
													done ? "text-foreground" : "text-muted-foreground",
												)}
											>
												<span className="truncate block">{q.header || q.question}</span>
											</span>
											<span className="text-[10px] text-muted-foreground truncate max-w-[40%] shrink-0">
												{ans.length > 0 ? ans.join(", ") : "\u2014"}
											</span>
										</div>
									);
								})}
								<div className="flex items-center justify-end pt-2">
									<button
										onClick={submit}
										className="px-4 py-1.5 text-xs font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-all cursor-pointer"
									>
										Submit
									</button>
								</div>
							</div>
						) : currentQuestion ? (
							<div className="space-y-1">
								{/* Question text */}
								<div className="text-xs text-foreground leading-snug max-h-[300px] overflow-y-auto">
									<QuestionMarkdown
										content={currentQuestion.question + (isMulti ? " *(select multiple)*" : "")}
									/>
								</div>

								{/* Options — compact rows */}
								<div className="space-y-px">
									{options.map((opt, i) => {
										const isPicked = currentAnswers.includes(opt.label);
										return (
											<button
												key={i}
												onClick={() => selectOption(i)}
												className={cn(
													"w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left cursor-pointer group border transition-all duration-150 ease-out active:scale-[0.998]",
													isPicked
														? "bg-primary/10 border-primary/30"
														: "border-transparent hover:bg-muted/40",
												)}
											>
												<span
													className={cn(
														"size-4 rounded-[4px] flex-shrink-0 flex items-center justify-center border transition-colors",
														isPicked
															? "border-primary/50 bg-primary/10"
															: "border-border group-hover:border-foreground/30",
													)}
												>
													{isPicked && (
														<svg viewBox="0 0 12 12" fill="none" width="8" height="8">
															<path d="M3 7.17905L5.02703 8.85135L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" className="text-foreground" />
														</svg>
													)}
												</span>
												<span className="text-xs leading-tight min-w-0">
													<span
														className={cn(
															"font-semibold transition-colors duration-150",
															isPicked ? "text-foreground" : "text-foreground/80",
														)}
													>
														{opt.label}
													</span>
													{opt.description && (
														<span className={cn("ml-1", isPicked ? "text-muted-foreground/90" : "text-muted-foreground")}>
															{opt.description}
														</span>
													)}
												</span>
											</button>
										);
									})}

									{/* Type own answer */}
									{showCustom && !editing && (
										<button
											onClick={() => selectOption(options.length)}
											className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left cursor-pointer group border border-transparent hover:bg-muted/40 transition-colors"
										>
											<Pencil className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors" />
											<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
												Type your own answer
											</span>
										</button>
									)}

									{/* Custom input */}
									{editing && (
										<form
											className="flex items-center gap-1.5 mt-1"
											onSubmit={(e) => {
												e.preventDefault();
												handleCustomSubmit(inputRef.current?.value ?? "");
											}}
										>
											<input
												ref={inputRef}
												type="text"
												placeholder="Type your answer..."
												defaultValue={customInputs[tab]}
												onKeyDown={(e) => {
													if (e.key === "Escape") {
														e.preventDefault();
														setEditing(false);
													}
												}}
												className="h-8 flex-1 min-w-0 px-3 text-xs bg-background/90 border border-border/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all"
											/>
											<button
												type="submit"
												className="h-8 px-2.5 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all duration-150 cursor-pointer shrink-0"
											>
												{isMulti ? "Add" : "Go"}
											</button>
											<button
												type="button"
												onClick={() => setEditing(false)}
												className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50 cursor-pointer shrink-0"
											>
												<X className="size-3.5" />
											</button>
										</form>
									)}
								</div>

								{/* Next button for multi-select */}
								{!isSingle && isMulti && (
									<div className="flex items-center justify-end">
										<button
											onClick={() => {
												setTab(tab + 1);
												setEditing(false);
											}}
											disabled={currentAnswers.length === 0}
											className={cn(
												"px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-all",
												currentAnswers.length > 0
													? "bg-muted text-foreground hover:bg-muted/80 cursor-pointer"
													: "bg-muted/30 text-muted-foreground/50 cursor-not-allowed",
											)}
										>
											Next
										</button>
									</div>
								)}
							</div>
						) : null}
					</div>
				</div>
		</div>
	);
}
