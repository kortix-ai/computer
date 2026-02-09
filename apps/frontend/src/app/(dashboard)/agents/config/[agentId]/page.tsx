'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Bot, Copy, Check } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Button } from '@/components/ui/button';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { useOpenCodeAgent } from '@/hooks/opencode/use-opencode-sessions';

export default function AgentConfigPage() {
  const params = useParams();
  const router = useRouter();
  const agentName = decodeURIComponent(params.agentId as string);
  const [copied, setCopied] = React.useState(false);

  const { data: agent, isLoading } = useOpenCodeAgent(agentName);

  const handleCopy = React.useCallback(() => {
    if (!agent) return;
    navigator.clipboard.writeText(JSON.stringify(agent, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [agent]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <KortixLoader size="large" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background px-3 sm:px-4 md:px-7 pt-4 md:pt-7">
      {/* Header */}
      <div className="flex items-center gap-3 pt-6 sm:pt-8 md:pt-12 pb-4 sm:pb-6 w-full">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="flex-shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0"
          style={agent.color ? { borderColor: agent.color + '40' } : undefined}
        >
          <Bot
            className="h-5 w-5"
            style={agent.color ? { color: agent.color } : undefined}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg md:text-xl font-semibold text-foreground truncate">
            {agent.name}
          </h1>
          {agent.description && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {agent.description}
            </p>
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground flex-shrink-0 px-2 py-1 rounded-md bg-muted">
          {agent.mode}
        </span>
      </div>

      {/* JSON content */}
      <div className="flex-1 overflow-y-auto pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <SpotlightCard className="bg-card">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">
                Agent Configuration
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy JSON
                  </>
                )}
              </Button>
            </div>
            <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
              {JSON.stringify(agent, null, 2)}
            </pre>
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}
