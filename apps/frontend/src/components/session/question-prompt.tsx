/**
 * QuestionPrompt — compact question prompt that matches the chat input chip style.
 *
 * Features:
 * - Tab bar for multi-question flows
 * - Single-question immediate submit
 * - Multi-select toggle
 * - "Type own answer" with form input
 * - Review/confirm tab
 * - Submit + Dismiss buttons
 * - Keyboard: Enter to submit custom, Escape to cancel
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, ChevronRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionRequest, QuestionAnswer, QuestionInfo } from '@/ui';

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

export function QuestionPrompt({ request, onReply, onReject }: QuestionPromptProps) {
  const questions = request.questions;
  const isSingle = questions.length === 1 && !questions[0].multiple;

  const [tab, setTab] = useState(0);
  const [answers, setAnswers] = useState<QuestionAnswer[]>(() =>
    questions.map(() => []),
  );
  const [customInputs, setCustomInputs] = useState<string[]>(() =>
    questions.map(() => ''),
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
      // Last option is "Type own answer"
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
        nextCustom[tab] = '';
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
  // Render
  // -----------------------------------------------------------------------

  if (replying) {
    return (
      <div className="rounded-xl bg-muted/50 px-3 py-2">
        <p className="text-xs text-muted-foreground">Submitting...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-muted/50 overflow-hidden">
      {/* Tab bar (multi-question only) */}
      {!isSingle && (
        <div className="flex items-center gap-0.5 px-2.5 pt-2 pb-0.5 overflow-x-auto">
          {questions.map((q, i) => (
            <button
              key={i}
              onClick={() => { setTab(i); setEditing(false); }}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap',
                tab === i
                   ? 'bg-muted text-foreground'
                   : 'text-muted-foreground hover:text-foreground hover:bg-muted/80',
                 (answers[i]?.length ?? 0) > 0 && tab !== i && 'text-foreground/70',
              )}
            >
              {q.header || `Q${i + 1}`}
            </button>
          ))}
          <button
            onClick={() => { setTab(questions.length); setEditing(false); }}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all cursor-pointer',
              isConfirm
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80',
            )}
          >
            Confirm
          </button>
        </div>
      )}

      <div className="px-3 py-2.5">
        {/* Confirm / review tab */}
        {isConfirm ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              Review your answers
            </p>
            {questions.map((q, i) => {
              const ans = answers[i] ?? [];
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground font-medium min-w-0 shrink-0">
                    {q.header || q.question}:
                  </span>
                  <span className={cn('min-w-0', ans.length > 0 ? 'text-foreground' : 'text-muted-foreground/50')}>
                    {ans.length > 0 ? ans.join(', ') : 'Not answered'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : currentQuestion ? (
          <div className="space-y-2">
            {/* Question text */}
            <div>
              <p className="text-xs font-medium text-foreground leading-relaxed">
                {currentQuestion.question}
              </p>
              {isMulti && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Select one or more
                </p>
              )}
            </div>

            {/* Options */}
            <div className="space-y-1">
              {options.map((opt, i) => {
                const isPicked = currentAnswers.includes(opt.label);
                return (
                  <button
                    key={i}
                    onClick={() => selectOption(i)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all cursor-pointer group',
                      isPicked
                        ? 'bg-muted text-foreground'
                        : 'text-foreground/80 hover:bg-muted/80',
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{opt.label}</span>
                      {opt.description && (
                        <span className="text-muted-foreground ml-1.5">
                          {opt.description}
                        </span>
                      )}
                    </span>
                    {isPicked ? (
                      <Check className="size-3 shrink-0 text-foreground" />
                    ) : (
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                    )}
                  </button>
                );
              })}

              {/* Type own answer option */}
              {showCustom && !editing && (
                <button
                  onClick={() => selectOption(options.length)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all cursor-pointer group',
                    customInputs[tab]
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/80',
                  )}
                >
                  <Pencil className="size-2.5 shrink-0 opacity-50 group-hover:opacity-80 transition-opacity" />
                  <span className="flex-1">Type your own answer</span>
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                </button>
              )}

              {/* Custom input */}
              {editing && (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCustomSubmit(inputRef.current?.value ?? '');
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type your answer..."
                    defaultValue={customInputs[tab]}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditing(false);
                      }
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-border transition-all"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer"
                  >
                    {isMulti ? 'Add' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors rounded-lg cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-border/20">
          <button
            onClick={reject}
            className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-all rounded-lg hover:bg-muted/80 cursor-pointer"
          >
            Dismiss
          </button>

          {/* Next button for multi-select (not on confirm) */}
          {!isSingle && !isConfirm && isMulti && (
            <button
              onClick={() => { setTab(tab + 1); setEditing(false); }}
              disabled={currentAnswers.length === 0}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all',
                currentAnswers.length > 0
                  ? 'bg-muted text-foreground hover:bg-muted/80 cursor-pointer'
                  : 'bg-muted/30 text-muted-foreground/50 cursor-not-allowed',
              )}
            >
              Next
            </button>
          )}

          {/* Submit button (multi-question confirm tab) */}
          {!isSingle && isConfirm && (
            <button
              onClick={submit}
              className="px-3 py-1 text-[11px] font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-all cursor-pointer"
            >
              Submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
