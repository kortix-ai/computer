'use client';

import React, { useMemo } from 'react';
import {
  Presentation,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  FileText,
  Layers,
  Eye,
  Download,
  Trash2,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { useServerStore } from '@/stores/server-store';
import { proxyLocalhostUrl } from '@/lib/utils/sandbox-url';

// ============================================================================
// Parsing
// ============================================================================

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
  // list_slides / list_presentations may return arrays
  slides?: any[];
  presentations?: any[];
}

function parsePresentationOutput(output: string): PresentationOutput | null {
  if (!output) return null;
  try {
    return JSON.parse(output) as PresentationOutput;
  } catch {
    if (output.startsWith('Error:')) {
      return { success: false, action: 'unknown', error: output.replace(/^Error:\s*/, '') };
    }
    return null;
  }
}

const ACTION_LABELS: Record<string, string> = {
  create_slide: 'Create Slide',
  list_slides: 'List Slides',
  delete_slide: 'Delete Slide',
  list_presentations: 'List Presentations',
  delete_presentation: 'Delete Presentation',
  validate_slide: 'Validate Slide',
  export_pdf: 'Export PDF',
  export_pptx: 'Export PPTX',
  preview: 'Preview',
};

function getActionIcon(action: string) {
  switch (action) {
    case 'create_slide': return FileText;
    case 'preview': return Eye;
    case 'export_pdf':
    case 'export_pptx': return Download;
    case 'delete_slide':
    case 'delete_presentation': return Trash2;
    case 'list_slides':
    case 'list_presentations': return Layers;
    default: return Presentation;
  }
}

// ============================================================================
// Component
// ============================================================================

export function OcPresentationGenToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const action = (args.action as string) || (ocState?.input?.action as string) || '';
  const presentationName = (args.presentation_name as string) || (ocState?.input?.presentation_name as string) || '';
  const slideTitle = (args.slide_title as string) || (ocState?.input?.slide_title as string) || '';
  const slideNumber = (args.slide_number as number) || (ocState?.input?.slide_number as number) || undefined;
  const rawOutput = toolResult?.output || ocState?.output || '';
  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);

  const parsed = useMemo(() => parsePresentationOutput(output), [output]);
  const isError = parsed ? !parsed.success : (toolResult?.success === false || !!toolResult?.error);

  const actionLabel = ACTION_LABELS[action] || action || 'Presentation';
  const ActionIcon = getActionIcon(action);

  // Proxy-rewrite viewer URL so localhost:3210 → proxy/3210
  const activeServer = useServerStore((s) =>
    s.servers.find((srv) => srv.id === s.activeServerId) ?? null,
  );
  const serverUrl = activeServer?.url || 'http://localhost:4096';
  const mappedPorts = activeServer?.mappedPorts;

  const viewerUrl = useMemo(() => {
    if (!parsed?.viewer_url) return undefined;
    return proxyLocalhostUrl(parsed.viewer_url, serverUrl, mappedPorts);
  }, [parsed?.viewer_url, serverUrl, mappedPorts]);

  // Subtitle
  const subtitle = useMemo(() => {
    if (action === 'create_slide' && slideTitle) {
      return `Slide ${slideNumber || '?'}: ${slideTitle}`;
    }
    if (action === 'preview') return presentationName;
    if (action === 'export_pdf' || action === 'export_pptx') return presentationName;
    if (action === 'list_slides') return presentationName;
    return presentationName || undefined;
  }, [action, presentationName, slideTitle, slideNumber]);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title={actionLabel}
        subtitle={subtitle}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={ActionIcon}
            title={actionLabel}
            subtitle={subtitle}
          />
          {viewerUrl && (
            <a
              href={viewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 ml-2"
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-3 space-y-3">
            {/* Error */}
            {isError && (
              <div className="flex items-start gap-2.5 text-muted-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{parsed?.error || output || 'Operation failed'}</p>
              </div>
            )}

            {/* Success: Create Slide */}
            {parsed?.success && action === 'create_slide' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 font-semibold text-lg flex-shrink-0">
                    {parsed.slide_number || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {parsed.slide_title || slideTitle || 'Untitled Slide'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {parsed.presentation_name || presentationName}
                      {parsed.total_slides && (
                        <span className="ml-1.5 text-muted-foreground/50">
                          ({parsed.total_slides} {parsed.total_slides === 1 ? 'slide' : 'slides'} total)
                        </span>
                      )}
                    </p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                </div>

                {parsed.slide_file && (
                  <p className="text-[11px] text-muted-foreground/50 font-mono truncate px-1">
                    {parsed.slide_file}
                  </p>
                )}
              </div>
            )}

            {/* Success: Preview */}
            {parsed?.success && action === 'preview' && (
              <div className="space-y-3">
                {viewerUrl && (
                  <a
                    href={viewerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex-shrink-0">
                      <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">Open Presentation Viewer</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        localhost:3210
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                  </a>
                )}
                {parsed.message && (
                  <p className="text-xs text-muted-foreground px-1">{parsed.message}</p>
                )}
              </div>
            )}

            {/* Success: Export */}
            {parsed?.success && (action === 'export_pdf' || action === 'export_pptx') && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex-shrink-0">
                  <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Exported to {action === 'export_pdf' ? 'PDF' : 'PPTX'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {parsed.presentation_name || presentationName}
                  </p>
                </div>
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              </div>
            )}

            {/* Success: Validate Slide */}
            {parsed?.success && action === 'validate_slide' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 font-semibold text-lg flex-shrink-0">
                    {parsed.slide_number || slideNumber || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      Slide {parsed.slide_number || slideNumber || '?'} validated
                    </p>
                    {parsed.message && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {parsed.message}
                      </p>
                    )}
                    {(parsed.presentation_name || presentationName) && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {parsed.presentation_name || presentationName}
                      </p>
                    )}
                  </div>
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                </div>
              </div>
            )}

            {/* Success: Generic (list, delete, etc.) */}
            {parsed?.success && !['create_slide', 'validate_slide', 'preview', 'export_pdf', 'export_pptx'].includes(action) && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <p className="text-sm text-foreground">
                  {parsed.message || `${actionLabel} completed`}
                </p>
              </div>
            )}

            {/* Fallback: no parsed output */}
            {!parsed && output && !isError && (
              <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                {output.slice(0, 2000)}
              </pre>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && (
          isError ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              {actionLabel}
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
