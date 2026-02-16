'use client'

import React, { useState, useMemo } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Ban,
  Clock,
  Wrench,
  Copy,
  Check,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from './types';
import { formatTimestamp, getToolTitle } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from '@/components/ui/button';
import { LoadingState } from './shared/LoadingState';
import { toast } from '@/lib/toast';
import { AppIcon } from './shared/AppIcon';
import { SmartJsonViewer } from './shared/SmartJsonViewer';
import { ToolViewIconTitle } from './shared/ToolViewIconTitle';
import { useSmoothStream } from '@/lib/streaming';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import {
  type OutputSection as OutputSectionType,
  normalizeToolOutput,
  hasStructuredContent,
  parseStructuredOutput,
} from '@/lib/utils/structured-output';

/** Strip XML wrapper tags like <skill_content> and detect if content looks like markdown */
function extractMarkdownContent(text: string): { content: string; isMarkdown: boolean } {
  let content = text;
  // Strip <skill_content ...> ... </skill_content> wrapper
  const skillMatch = content.match(/^<skill_content[^>]*>\s*([\s\S]*?)\s*<\/skill_content>\s*$/);
  if (skillMatch) {
    content = skillMatch[1];
  }
  // Detect markdown: headers, bold, lists, code blocks, links
  const isMarkdown = /^#{1,6}\s|^\*\*|^\- |\n#{1,6}\s|\n\*\*|\n\- |```/.test(content);
  return { content, isMarkdown };
}

export function GenericToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const parseContent = React.useCallback((content: any): any => {
    if (!content) return null;

    if (typeof content === 'object') {
      return content;
    }

    if (typeof content === 'string') {
      const textContentMatch = content.match(/text=(['"])((?:(?!\1|\\).|\\.)*)\1/);
      
      if (textContentMatch) {
         try {
           let jsonStr = textContentMatch[2];
           if (textContentMatch[1] === "'") {
             jsonStr = jsonStr.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
           } else {
             jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
           }
           
           try {
             return JSON.parse(jsonStr);
           } catch {
             return jsonStr;
           }
         } catch (e) {
         }
      }

      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'string') {
           try {
             return JSON.parse(parsed);
           } catch {
             return parsed;
           }
        }
        return parsed;
      } catch (e) {
      }
    }
    
    return content;
  }, []);

  // Format arguments from toolCall
  const parsedAssistantContent = React.useMemo(
    () => parseContent(toolCall?.arguments),
    [toolCall?.arguments, parseContent],
  );
  
  // Format output from toolResult
  const parsedToolContent = React.useMemo(
    () => toolResult ? parseContent(toolResult.output) : null,
    [toolResult, parseContent],
  );

  const formatAsString = (content: any) => {
    if (typeof content === 'object' && content !== null) {
      return JSON.stringify(content, null, 2);
    }
    return String(content);
  };

  const rawAssistantContent = React.useMemo(
    () => parsedAssistantContent ? formatAsString(parsedAssistantContent) : null,
    [parsedAssistantContent]
  );

  // Apply smooth text streaming for arguments when streaming
  const smoothAssistantContent = useSmoothStream(
    rawAssistantContent || '',
    true
  );
  const isAssistantAnimating = isStreaming && !toolResult && !!rawAssistantContent;

  const formattedAssistantContent = isStreaming && smoothAssistantContent ? smoothAssistantContent : rawAssistantContent;

  const formattedToolContent = React.useMemo(
    () => parsedToolContent ? formatAsString(parsedToolContent) : null,
    [parsedToolContent]
  );

  // Add copy functionality state
  const [isCopyingInput, setIsCopyingInput] = React.useState(false);
  const [isCopyingOutput, setIsCopyingOutput] = React.useState(false);

  // Copy functions
  const copyToClipboard = React.useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy text: ', err);
      return false;
    }
  }, []);

  const handleCopyInput = React.useCallback(async () => {
    if (!formattedAssistantContent) return;

    setIsCopyingInput(true);
    const success = await copyToClipboard(formattedAssistantContent);
    if (success) {
      toast.success('File content copied to clipboard');
    } else {
      toast.error('Failed to copy file content');
    }
    setTimeout(() => setIsCopyingInput(false), 500);
  }, [formattedAssistantContent, copyToClipboard]);

  const handleCopyOutput = React.useCallback(async () => {
    if (!formattedToolContent) return;

    setIsCopyingOutput(true);
    const success = await copyToClipboard(formattedToolContent);
    if (success) {
      toast.success('File content copied to clipboard');
    } else {
      toast.error('Failed to copy file content');
    }
    setTimeout(() => setIsCopyingOutput(false), 500);
  }, [formattedToolContent, copyToClipboard]);

  const isError = React.useMemo(() => {
    if (toolResult?.success === false) return true;
    if (toolResult?.error) return true;
    
    if (typeof toolResult?.output === 'string') {
      const output = toolResult.output.toLowerCase();
      if (output.startsWith('error:') || output.includes('failed') || output.includes('exception')) {
        return true;
      }
    }
    
    return !isSuccess;
  }, [toolResult, isSuccess]);

  const errorMessage = React.useMemo(() => {
    if (!isError) return null;
    
    if (toolResult?.error) return String(toolResult.error);
    if (typeof toolResult?.output === 'string') return toolResult.output;
    
    return 'Tool execution failed';
  }, [isError, toolResult]);

  if (!toolCall || !toolCall.function_name) {
    console.warn('GenericToolView: toolCall is undefined or missing function_name. Tool views should use structured props.');
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4">
          <CardTitle className="text-base font-medium text-foreground">
            Tool View Error
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            This tool view requires structured metadata. Please update the component to use toolCall and toolResult props.
          </p>
        </CardContent>
      </Card>
    );
  }

  const name = toolCall.function_name.replace(/_/g, '-').toLowerCase();
  const toolTitle = (toolCall as any)._display_hint || getToolTitle(name);

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative p-2 rounded-lg border bg-muted border-border flex-shrink-0">
              <AppIcon toolCall={toolCall} size={20} className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-medium text-foreground truncate">
                {toolTitle}
              </CardTitle>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
        {isStreaming ? (
          <LoadingState
            icon={Wrench}
            iconColor="text-orange-500 dark:text-orange-400"
            bgColor="bg-gradient-to-b from-orange-100 to-orange-50 shadow-inner dark:from-orange-800/40 dark:to-orange-900/60 dark:shadow-orange-950/20"
            title={toolTitle}
            filePath={name}
            showProgress={true}
          />
        ) : isError ? (
          <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 w-full">
              <div className="p-4 space-y-4">
                {/* Structured error display */}
                <GenericToolErrorDisplay
                  errorMessage={errorMessage}
                  formattedToolContent={formattedToolContent}
                  parsedToolContent={parsedToolContent}
                />

                {/* Input section */}
                {formattedAssistantContent && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground flex items-center justify-between">
                      <div className="flex items-center">Input</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyInput}
                        disabled={isCopyingInput}
                        className="h-6 w-6 p-0"
                        title="Copy input"
                      >
                        {isCopyingInput ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <div className="border-muted bg-muted/20 rounded-lg overflow-hidden border">
                      <div className="p-4">
                        {typeof parsedAssistantContent === 'object' && parsedAssistantContent !== null ? (
                          <SmartJsonViewer data={parsedAssistantContent} />
                        ) : (
                          <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                            {formattedAssistantContent}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : formattedAssistantContent || formattedToolContent ? (
          <ScrollArea className="h-full w-full">
            <div className="p-4 space-y-4">
              {formattedAssistantContent && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground flex items-center justify-between">
                    <div className="flex items-center">
                      Input
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyInput}
                      disabled={isCopyingInput}
                      className="h-6 w-6 p-0"
                      title="Copy file content"
                    >
                      {isCopyingInput ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <div className="border-muted bg-muted/20 rounded-lg overflow-hidden border">
                    <div className="p-4">
                      {typeof parsedAssistantContent === 'object' && parsedAssistantContent !== null ? (
                        <SmartJsonViewer data={parsedAssistantContent} />
                      ) : (
                        <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                          {formattedAssistantContent}
                          {isAssistantAnimating && <span className="animate-pulse text-muted-foreground">▌</span>}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {formattedToolContent && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground flex items-center justify-between">
                    <div className="flex items-center">
                      Output
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyOutput}
                      disabled={isCopyingOutput}
                      className="h-6 w-6 p-0"
                      title="Copy file content"
                    >
                      {isCopyingOutput ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <div className="border-muted bg-muted/20 rounded-lg overflow-hidden border">
                    <div className="p-4">
                      {typeof parsedToolContent === 'object' && parsedToolContent !== null ? (
                        <SmartJsonViewer data={parsedToolContent} />
                      ) : (() => {
                        // Try structured output rendering for warnings/tracebacks
                        const normalized = normalizeToolOutput(formattedToolContent || '');
                        if (hasStructuredContent(normalized)) {
                          const sections = parseStructuredOutput(normalized);
                          return <GenericStructuredOutputDisplay sections={sections} />;
                        }
                        const { content, isMarkdown } = extractMarkdownContent(formattedToolContent || '');
                        return isMarkdown ? (
                          <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                            <UnifiedMarkdown content={content} isStreaming={false} />
                          </div>
                        ) : (
                          <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                            {formattedToolContent}
                          </pre>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 bg-gradient-to-b from-background to-muted/50">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-gradient-to-b from-muted to-muted/50 shadow-inner">
              <Wrench className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              No Content Available
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              This tool execution did not produce any input or output content to display.
            </p>
          </div>
        )}
      </CardContent>

      <div className="px-4 py-2 h-10 bg-gradient-to-r bg-muted/50 backdrop-blur-sm border-t border-border flex justify-between items-center gap-4">
        <div className="h-full flex items-center gap-2 text-sm text-muted-foreground">
          {!isStreaming && (formattedAssistantContent || formattedToolContent || isError) && (
            isError ? (
              <Badge variant="outline" className="h-6 py-0.5 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300">
                <AlertCircle className="h-3 w-3" />
                Failed
              </Badge>
            ) : (
              <Badge variant="outline" className="h-6 py-0.5 bg-muted">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                Completed
              </Badge>
            )
          )}
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          {toolTimestamp && !isStreaming
            ? formatTimestamp(toolTimestamp)
            : assistantTimestamp
              ? formatTimestamp(assistantTimestamp)
              : ''}
        </div>
      </div>
    </Card>
  );
}

/** Render parsed structured output sections with semantic styling (for detail panel). */
function GenericStructuredOutputDisplay({ sections }: { sections: OutputSectionType[] }) {
  const [showTrace, setShowTrace] = useState(false);

  return (
    <div className="space-y-2">
      {sections.map((section, i) => {
        switch (section.type) {
          case 'warning':
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-yellow-500/5 border border-yellow-500/15"
              >
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-yellow-500" />
                <p className="text-xs leading-relaxed text-yellow-700 dark:text-yellow-400 font-mono break-words">
                  {section.text}
                </p>
              </div>
            );

          case 'error':
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15"
              >
                <Ban className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-red-400" />
                <div className="min-w-0 flex-1">
                  {section.errorType && (
                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                      {section.errorType}
                    </span>
                  )}
                  <p className="text-xs leading-relaxed text-red-600 dark:text-red-400 font-mono break-words">
                    {section.summary}
                  </p>
                </div>
              </div>
            );

          case 'traceback':
            return (
              <div key={i}>
                <button
                  onClick={() => setShowTrace((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer w-full text-left"
                >
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 transition-transform flex-shrink-0',
                      showTrace && 'rotate-90',
                    )}
                  />
                  <span className="text-xs font-medium">Stack trace</span>
                  <span className="text-[10px] text-muted-foreground/40 font-mono ml-1">
                    {section.lines.length} lines
                  </span>
                </button>
                {showTrace && (
                  <div className="mt-1 rounded-lg bg-muted/20 border border-border/30 overflow-hidden">
                    <pre className="p-3 font-mono text-[10px] leading-relaxed text-muted-foreground/60 whitespace-pre-wrap break-all max-h-80 overflow-auto">
                      {section.lines.map((line, li) => {
                        if (/^\s+File "/.test(line)) {
                          return (
                            <span key={li} className="text-muted-foreground/80">
                              {line}
                              {'\n'}
                            </span>
                          );
                        }
                        return (
                          <span key={li}>
                            {line}
                            {'\n'}
                          </span>
                        );
                      })}
                    </pre>
                  </div>
                )}
              </div>
            );

          case 'install':
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15"
              >
                <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-mono">
                  {section.text}
                </span>
              </div>
            );

          case 'info':
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-muted-foreground font-mono"
              >
                <span className="size-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                <span className="break-words">{section.text}</span>
              </div>
            );

          case 'plain':
            return (
              <pre
                key={i}
                className="px-3 py-1.5 font-mono text-xs leading-relaxed text-foreground/70 whitespace-pre-wrap break-words"
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

/** Structured error display with collapsible traceback */
function GenericToolErrorDisplay({
  errorMessage,
  formattedToolContent,
  parsedToolContent,
}: {
  errorMessage: string | null;
  formattedToolContent: string | null;
  parsedToolContent: any;
}) {
  const [showTrace, setShowTrace] = useState(false);

  const errorText = formattedToolContent || errorMessage || 'Tool execution failed';

  // Try structured rendering for error output with warnings/tracebacks
  const structuredSections = React.useMemo(() => {
    if (typeof parsedToolContent === 'object' && parsedToolContent !== null) return null;
    const normalized = normalizeToolOutput(errorText);
    if (!hasStructuredContent(normalized)) return null;
    return parseStructuredOutput(normalized);
  }, [errorText, parsedToolContent]);

  const { summary, traceback, errorType } = React.useMemo(() => {
    const cleaned = errorText.replace(/^Error:\s*/, '');

    // Python-style traceback
    const tbIdx = cleaned.indexOf('Traceback (most recent call last):');
    if (tbIdx >= 0) {
      const before = cleaned.slice(0, tbIdx).trim();
      const traceSection = cleaned.slice(tbIdx);
      const lines = traceSection.split('\n').filter((l: string) => l.trim());
      const lastLine = lines[lines.length - 1] || '';
      const typeMatch = lastLine.match(/^([\w._]+(?:Error|Exception|Warning)):\s*/);
      const errType = typeMatch ? typeMatch[1].split('.').pop() || typeMatch[1] : null;
      const sum = before || (errType ? lastLine : lastLine.slice(0, 150));
      return { summary: sum, traceback: traceSection, errorType: errType };
    }

    // Node.js-style stack
    const stackIdx = cleaned.indexOf('\n    at ');
    if (stackIdx >= 0) {
      return { summary: cleaned.slice(0, stackIdx).trim(), traceback: cleaned.slice(stackIdx), errorType: null };
    }

    return { summary: cleaned.length > 300 ? cleaned.slice(0, 300) + '...' : cleaned, traceback: cleaned.length > 300 ? cleaned : null, errorType: null };
  }, [errorText]);

  const displayType = errorType || 'Error';

  // If structured output was detected, render it
  if (structuredSections) {
    return <GenericStructuredOutputDisplay sections={structuredSections} />;
  }

  // If the content is structured JSON, show it with SmartJsonViewer
  if (typeof parsedToolContent === 'object' && parsedToolContent !== null) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/10">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
          <span className="text-xs font-medium text-red-400">Error</span>
        </div>
        <div className="p-3">
          <SmartJsonViewer data={parsedToolContent} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/10">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
        <span className="text-xs font-medium text-red-400">{displayType}</span>
      </div>

      {/* Summary */}
      <div className="px-3 py-2.5">
        <p className="text-xs text-foreground/80 leading-relaxed break-words whitespace-pre-wrap font-mono">
          {summary}
        </p>
      </div>

      {/* Collapsible stack trace */}
      {traceback && (
        <>
          <button
            onClick={() => setShowTrace((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left border-t border-red-500/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showTrace ? 'rotate-90' : ''}`} />
            <span className="text-[10px] font-medium">
              {traceback.includes('Traceback') ? 'Stack trace' : 'Full output'}
            </span>
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
