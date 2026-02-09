'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Brain,
  Shield,
  Settings,
  Bot,
  Layers,
  Thermometer,
  Hash,
  Footprints,
  Info,
} from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { useOpenCodeAgent } from '@/hooks/opencode/use-opencode-sessions';

type ConfigView = 'overview' | 'prompt' | 'permissions' | 'settings';

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'primary':
      return 'Primary';
    case 'subagent':
      return 'Sub-agent';
    case 'all':
      return 'All';
    default:
      return mode;
  }
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground w-32 flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0">{children}</span>
    </div>
  );
}

function OverviewSection({ agent }: { agent: NonNullable<ReturnType<typeof useOpenCodeAgent>['data']> }) {
  return (
    <div className="flex-1 overflow-y-auto pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <h2 className="text-lg font-semibold mb-4">Overview</h2>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <InfoRow label="Name">{agent.name}</InfoRow>
          {agent.description && (
            <InfoRow label="Description">{agent.description}</InfoRow>
          )}
          <InfoRow label="Mode">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
              style={
                agent.color
                  ? { borderColor: agent.color + '40', color: agent.color }
                  : undefined
              }
            >
              <Layers className="h-3 w-3" />
              {getModeLabel(agent.mode)}
            </span>
          </InfoRow>
          {agent.model && (
            <InfoRow label="Model">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[13px]">{agent.model.modelID}</span>
                <span className="text-xs text-muted-foreground">{agent.model.providerID}</span>
              </div>
            </InfoRow>
          )}
          {agent.variant && (
            <InfoRow label="Variant">
              <span className="font-mono text-[13px]">{agent.variant}</span>
            </InfoRow>
          )}
          {agent.color && (
            <InfoRow label="Color">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="font-mono text-[13px]">{agent.color}</span>
              </div>
            </InfoRow>
          )}
          <InfoRow label="Native">
            {agent.native ? 'Yes' : 'No'}
          </InfoRow>
          {agent.steps != null && (
            <InfoRow label="Max Steps">{agent.steps}</InfoRow>
          )}
        </div>
      </SpotlightCard>
    </div>
  );
}

function PromptSection({ agent }: { agent: NonNullable<ReturnType<typeof useOpenCodeAgent>['data']> }) {
  return (
    <div className="flex-1 overflow-y-auto pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <h2 className="text-lg font-semibold mb-4">System Prompt</h2>
      {agent.prompt ? (
        <SpotlightCard className="bg-card">
          <div className="p-4 sm:p-5">
            <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
              {agent.prompt}
            </pre>
          </div>
        </SpotlightCard>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
            <Brain className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No custom prompt configured
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This agent uses the default system prompt
          </p>
        </div>
      )}
    </div>
  );
}

function PermissionsSection({ agent }: { agent: NonNullable<ReturnType<typeof useOpenCodeAgent>['data']> }) {
  const permissions = agent.permission || [];

  return (
    <div className="flex-1 overflow-y-auto pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <h2 className="text-lg font-semibold mb-4">Permission Rules</h2>
      {permissions.length > 0 ? (
        <div className="space-y-2">
          {permissions.map((rule, idx) => (
            <SpotlightCard key={idx} className="bg-card">
              <div className="p-4 flex items-start gap-3">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 text-xs font-medium',
                    rule.action === 'allow'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : rule.action === 'deny'
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-amber-500/10 text-amber-500'
                  )}
                >
                  {rule.action === 'allow' ? '✓' : rule.action === 'deny' ? '✕' : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        rule.action === 'allow'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : rule.action === 'deny'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-amber-500/10 text-amber-500'
                      )}
                    >
                      {rule.action.toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {rule.permission}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {rule.pattern}
                  </span>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No permission rules configured
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This agent uses default permissions
          </p>
        </div>
      )}
    </div>
  );
}

function SettingsSection({ agent }: { agent: NonNullable<ReturnType<typeof useOpenCodeAgent>['data']> }) {
  const hasSettings =
    agent.temperature != null || agent.topP != null || agent.steps != null || (agent.options && Object.keys(agent.options).length > 0);

  return (
    <div className="flex-1 overflow-y-auto pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <h2 className="text-lg font-semibold mb-4">Model Settings</h2>
      {hasSettings ? (
        <div className="space-y-4">
          <SpotlightCard className="bg-card">
            <div className="p-4 sm:p-5">
              {agent.temperature != null && (
                <InfoRow label="Temperature">
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-[13px]">{agent.temperature}</span>
                  </div>
                </InfoRow>
              )}
              {agent.topP != null && (
                <InfoRow label="Top P">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-[13px]">{agent.topP}</span>
                  </div>
                </InfoRow>
              )}
              {agent.steps != null && (
                <InfoRow label="Max Steps">
                  <div className="flex items-center gap-2">
                    <Footprints className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-[13px]">{agent.steps}</span>
                  </div>
                </InfoRow>
              )}
            </div>
          </SpotlightCard>

          {agent.options && Object.keys(agent.options).length > 0 && (
            <>
              <h3 className="text-sm font-medium text-muted-foreground mt-6 mb-2">
                Additional Options
              </h3>
              <SpotlightCard className="bg-card">
                <div className="p-4 sm:p-5">
                  <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {JSON.stringify(agent.options, null, 2)}
                  </pre>
                </div>
              </SpotlightCard>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
            <Settings className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No custom settings configured
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This agent uses default model settings
          </p>
        </div>
      )}
    </div>
  );
}

export default function AgentConfigPage() {
  const params = useParams();
  const router = useRouter();
  const agentName = decodeURIComponent(params.agentId as string);
  const [activeView, setActiveView] = useState<ConfigView>('overview');

  const { data: agent, isLoading } = useOpenCodeAgent(agentName);

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

  const menuItems = [
    { id: 'overview' as const, label: 'Overview', icon: Info },
    { id: 'prompt' as const, label: 'Prompt', icon: Brain },
    { id: 'permissions' as const, label: 'Permissions', icon: Shield },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden bg-background px-3 sm:px-4 md:px-7 pt-4 md:pt-7">
      {/* Left Sidebar Menu */}
      <div className="bg-background flex w-full md:w-48 md:flex-col md:pr-4 pt-14 sm:pt-16 md:pt-0 gap-2">
        {/* Back button - desktop */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="justify-start -ml-2 mb-6 text-foreground hover:bg-transparent hidden md:flex"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {/* Back button - mobile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="h-12 w-12 p-0 cursor-pointer hover:bg-muted/60 hover:border-[1.5px] hover:border-border md:hidden"
        >
          <ChevronLeft className="!h-5 !w-5" />
        </Button>

        {/* Menu items - desktop */}
        <div className="space-y-1 hidden md:block">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <SpotlightCard
                key={item.id}
                className={cn(
                  'transition-colors cursor-pointer',
                  isActive ? 'bg-muted' : 'bg-transparent'
                )}
              >
                <button
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-sm',
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              </SpotlightCard>
            );
          })}
        </div>

        {/* Menu items - mobile */}
        <div className="flex gap-2 md:hidden md:space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <Button
                key={item.id}
                variant="ghost"
                size="icon"
                className={cn(
                  'h-12 w-12 p-0 cursor-pointer hover:bg-muted/60 hover:border-[1.5px] hover:border-border',
                  isActive ? 'bg-muted/60 border-[1.5px] border-border' : ''
                )}
                onClick={() => setActiveView(item.id)}
              >
                <Icon className="!h-5 !w-5" />
              </Button>
            );
          })}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden w-full md:w-0 md:pl-1 md:pr-1 md:min-w-0 md:px-0">
        {/* Agent Header */}
        <div className="flex items-center gap-3 pt-6 sm:pt-8 md:pt-12 pb-4 sm:pb-6 w-full">
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
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0"
            style={
              agent.color
                ? { borderColor: agent.color + '40', color: agent.color }
                : undefined
            }
          >
            {getModeLabel(agent.mode)}
          </span>
        </div>

        {/* Dynamic Content */}
        {activeView === 'overview' && <OverviewSection agent={agent} />}
        {activeView === 'prompt' && <PromptSection agent={agent} />}
        {activeView === 'permissions' && <PermissionsSection agent={agent} />}
        {activeView === 'settings' && <SettingsSection agent={agent} />}
      </div>
    </div>
  );
}
