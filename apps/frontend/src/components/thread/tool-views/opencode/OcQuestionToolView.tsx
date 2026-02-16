'use client';

import React, { useMemo } from 'react';
import { MessageCircle, CheckCircle, Clock } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';

interface QuestionOption {
  label: string;
  description?: string;
}

interface QuestionInfo {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiple?: boolean;
}

export function OcQuestionToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;

  const questions = useMemo<QuestionInfo[]>(() => {
    const raw = args.questions || ocState?.input?.questions;
    return Array.isArray(raw) ? raw : [];
  }, [args.questions, ocState?.input?.questions]);

  const answers = useMemo<string[][]>(() => {
    const raw = ocState?.metadata?.answers;
    return Array.isArray(raw) ? raw : [];
  }, [ocState?.metadata?.answers]);

  const isAnswered = answers.length > 0;
  const isRunning = !toolResult && !isAnswered;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title="Questions"
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={MessageCircle}
            title={isAnswered ? `Asked ${questions.length} ${questions.length === 1 ? 'Question' : 'Questions'}` : 'Questions'}
          />
          {isAnswered && (
            <Badge variant="outline" className="h-5 text-[10px] bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Answered
            </Badge>
          )}
          {isRunning && (
            <Badge variant="outline" className="h-5 text-[10px] bg-muted">
              <Clock className="h-3 w-3 text-muted-foreground" />
              Waiting
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-4">
            {questions.map((q, i) => {
              const answer = answers[i] || [];
              const hasAnswer = answer.length > 0;

              return (
                <div key={i} className="space-y-2">
                  {/* Question header */}
                  {q.header && (
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {q.header}
                    </span>
                  )}

                  {/* Question text */}
                  <p className="text-sm font-medium text-foreground">{q.question}</p>

                  {/* Options */}
                  {q.options && q.options.length > 0 && (
                    <div className="space-y-1.5">
                      {q.options.map((opt, j) => {
                        const isSelected = hasAnswer && answer.includes(opt.label);
                        return (
                          <div
                            key={j}
                            className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                              isSelected
                                ? 'border-foreground/20 bg-foreground/5'
                                : 'border-border/50 bg-transparent'
                            }`}
                          >
                            {/* Selection indicator */}
                            <div className={`mt-0.5 flex-shrink-0 size-4 rounded-full border-2 flex items-center justify-center ${
                              isSelected
                                ? 'border-foreground bg-foreground'
                                : 'border-muted-foreground/30'
                            }`}>
                              {isSelected && (
                                <div className="size-1.5 rounded-full bg-background" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>
                                {opt.label}
                              </span>
                              {opt.description && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Custom answer (not from options) */}
                  {hasAnswer && q.options && !q.options.some(o => answer.includes(o.label)) && (
                    <div className="px-3 py-2 rounded-lg border border-foreground/20 bg-foreground/5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Custom answer</span>
                      <p className="text-xs text-foreground mt-0.5">{answer.join(', ')}</p>
                    </div>
                  )}

                  {/* Answer display when no options */}
                  {hasAnswer && (!q.options || q.options.length === 0) && (
                    <div className="px-3 py-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-foreground">{answer.join(', ')}</p>
                    </div>
                  )}

                  {/* Divider between questions */}
                  {i < questions.length - 1 && (
                    <div className="h-px bg-border/50 mt-3" />
                  )}
                </div>
              );
            })}

            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground">No questions to display.</p>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && isAnswered && (
          <Badge variant="outline" className="h-6 py-0.5 bg-muted">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            Completed
          </Badge>
        )}
      </ToolViewFooter>
    </Card>
  );
}
