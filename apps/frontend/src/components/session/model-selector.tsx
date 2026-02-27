'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronUp,
  Check,
  X,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { useModelStore } from '@/hooks/opencode/use-model-store';
import type { FlatModel } from './session-chat-input';
import type { ProviderListResponse } from '@/hooks/opencode/use-opencode-sessions';
import { ConnectProviderContent } from '@/components/providers/connect-provider-content';

// Re-export for consumers
export { ConnectProviderContent } from '@/components/providers/connect-provider-content';

// =============================================================================
// Constants
// =============================================================================

const POPULAR_PROVIDERS = [
  'kortix',
  'opencode',
  'anthropic',
  'github-copilot',
  'openai',
  'google',
  'openrouter',
  'vercel',
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI',
  moonshotai: 'Moonshot',
  'moonshotai-cn': 'Moonshot',
  opencode: 'OpenCode',
  kortix: 'Kortix',
  firmware: 'Firmware',
  bedrock: 'AWS Bedrock',
  openrouter: 'OpenRouter',
  'github-copilot': 'GitHub Copilot',
  vercel: 'Vercel',
};

// =============================================================================
// Helpers
// =============================================================================

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

// =============================================================================
// Tag
// =============================================================================

export function Tag({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'free' | 'latest' | 'recommended' | 'custom' }) {
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded text-[10px] font-medium leading-none flex-shrink-0',
        variant === 'free' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        variant === 'latest' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        variant === 'recommended' && 'bg-primary/10 text-primary',
        variant === 'custom' && 'bg-muted text-muted-foreground',
        variant === 'default' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

// =============================================================================
// Model Tooltip
// =============================================================================

function ModelTooltipContent({ model, isLatest, isFree }: { model: FlatModel; isLatest: boolean; isFree: boolean }) {
  const tags: string[] = [];
  if (isLatest) tags.push('Latest');
  if (isFree) tags.push('Free');
  const suffix = tags.length ? ` (${tags.join(', ')})` : '';

  const inputs: string[] = [];
  if (model.capabilities?.vision) inputs.push('Image');
  if (model.capabilities?.reasoning) inputs.push('Reasoning');
  if (model.capabilities?.toolcall) inputs.push('Tool Use');

  return (
    <div className="flex flex-col gap-0.5 py-0.5 max-w-[220px]">
      <div className="text-xs font-medium">{model.providerName} {model.modelName}{suffix}</div>
      {inputs.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Supports: {inputs.join(', ')}
        </div>
      )}
      {model.capabilities?.reasoning !== undefined && (
        <div className="text-[11px] text-muted-foreground">
          {model.capabilities.reasoning ? 'Reasoning: allowed' : 'Reasoning: none'}
        </div>
      )}
      {model.contextWindow && model.contextWindow > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Context: {formatContext(model.contextWindow)}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Manage Models Dialog
// =============================================================================

export function ManageModelsDialog({
  open,
  onOpenChange,
  models,
  modelStore,
  onConnectProvider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: FlatModel[];
  modelStore: ReturnType<typeof useModelStore>;
  onConnectProvider: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return models
      .filter((m) =>
        !q ||
        m.modelName.toLowerCase().includes(q) ||
        m.modelID.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q),
      )
      .sort((a, b) => a.modelName.localeCompare(b.modelName));
  }, [models, search]);

  // Group by provider, sort groups by popularity
  const grouped = useMemo(() => {
    const groups = new Map<string, FlatModel[]>();
    for (const m of filtered) {
      const list = groups.get(m.providerID) || [];
      list.push(m);
      groups.set(m.providerID, list);
    }
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => {
      const ai = POPULAR_PROVIDERS.indexOf(a[0]);
      const bi = POPULAR_PROVIDERS.indexOf(b[0]);
      if (ai >= 0 && bi < 0) return -1;
      if (ai < 0 && bi >= 0) return 1;
      if (ai >= 0 && bi >= 0) return ai - bi;
      return a[0].localeCompare(b[0]);
    });
    return entries;
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] !grid-rows-[auto_1fr] overflow-hidden p-0" aria-describedby="manage-models-desc">
        {/* Fixed header */}
        <div className="px-5 pt-5 pb-0 space-y-3">
          <DialogHeader className="p-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-semibold">Manage Models</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5 rounded-lg"
                onClick={() => {
                  onOpenChange(false);
                  onConnectProvider();
                }}
              >
                <Plus className="h-3 w-3" />
                Connect Provider
              </Button>
            </div>
            <DialogDescription id="manage-models-desc" className="text-xs text-muted-foreground/60">
              Choose which models appear in the model selector.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm rounded-lg"
              autoFocus
            />
          </div>
        </div>

        {/* Scrollable model list */}
        <div className="overflow-y-auto px-5 pb-5 pt-1">
          <div className="space-y-3">
            {grouped.map(([providerID, providerModels]) => (
              <div key={providerID}>
                <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider px-1 pb-1">
                  {PROVIDER_LABELS[providerID] || providerModels[0]?.providerName || providerID}
                </div>
                <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30">
                  {providerModels.map((model) => {
                    const key = { providerID: model.providerID, modelID: model.modelID };
                    const visible = modelStore.isVisible(key);
                    return (
                      <div
                        key={`${model.providerID}:${model.modelID}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
                        onClick={() => modelStore.setVisibility(key, !visible)}
                      >
                        <span className="text-sm truncate">{model.modelName}</span>
                        <div onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={visible}
                            onCheckedChange={(checked) => modelStore.setVisibility(key, checked)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {grouped.length === 0 && (
              <div className="text-xs text-center py-8 text-muted-foreground/60">No models found</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Connect Provider Dialog
// =============================================================================

export function ConnectProviderDialog({
  open,
  onOpenChange,
  providers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ProviderListResponse | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[80vh] !grid-rows-[1fr] overflow-hidden p-0" aria-describedby="connect-provider-desc">
        <DialogHeader className="sr-only">
          <DialogTitle>Connect Provider</DialogTitle>
          <DialogDescription id="connect-provider-desc">Select a provider to connect.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col min-h-0 overflow-hidden px-5 py-5">
          <ConnectProviderContent
            providers={providers}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// ModelSelector Popover
// =============================================================================

export interface ModelSelectorProps {
  models: FlatModel[];
  selectedModel: { providerID: string; modelID: string } | null;
  onSelect: (model: { providerID: string; modelID: string } | null) => void;
  providers?: ProviderListResponse;
}

export function ModelSelector({ models, selectedModel, onSelect, providers }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [manageModelsOpen, setManageModelsOpen] = useState(false);
  const [connectProviderOpen, setConnectProviderOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const modelStore = useModelStore(models);

  const current = models.find(
    (m) => m.providerID === selectedModel?.providerID && m.modelID === selectedModel?.modelID,
  );
  const displayName = current?.modelName || models[0]?.modelName || 'Model';

  const visibleModels = useMemo(() => {
    const q = search.toLowerCase();
    return models
      .filter((m) => {
        if (!q && !modelStore.isVisible({ providerID: m.providerID, modelID: m.modelID })) {
          return false;
        }
        return !q ||
          m.modelName.toLowerCase().includes(q) ||
          m.modelID.toLowerCase().includes(q) ||
          m.providerName.toLowerCase().includes(q);
      })
      .sort((a, b) => a.modelName.localeCompare(b.modelName));
  }, [models, search, modelStore]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { providerName: string; providerID: string; models: FlatModel[] }>();
    for (const m of visibleModels) {
      const existing = groups.get(m.providerID);
      if (existing) {
        existing.models.push(m);
      } else {
        groups.set(m.providerID, {
          providerID: m.providerID,
          providerName: PROVIDER_LABELS[m.providerID] || m.providerName,
          models: [m],
        });
      }
    }
    const entries = Array.from(groups.values());
    entries.sort((a, b) => {
      const ai = POPULAR_PROVIDERS.indexOf(a.providerID);
      const bi = POPULAR_PROVIDERS.indexOf(b.providerID);
      if (ai >= 0 && bi < 0) return -1;
      if (ai < 0 && bi >= 0) return 1;
      if (ai >= 0 && bi >= 0) return ai - bi;
      return a.providerName.localeCompare(b.providerName);
    });
    return entries;
  }, [visibleModels]);

  const flatList = useMemo(() => grouped.flatMap((g) => g.models), [grouped]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
      setHighlightedIndex(-1);
    }
  }, [open]);

  const handleSelect = useCallback(
    (model: FlatModel) => {
      onSelect({ providerID: model.providerID, modelID: model.modelID });
      setOpen(false);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const len = flatList.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i < len - 1 ? i + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : len - 1));
      } else if (e.key === 'Enter' && highlightedIndex >= 0 && flatList[highlightedIndex]) {
        e.preventDefault();
        handleSelect(flatList[highlightedIndex]);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [flatList, highlightedIndex, handleSelect],
  );

  let flatIndex = -1;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <span className="truncate max-w-[120px]">{displayName}</span>
                <ChevronUp className={cn('size-3 transition-transform', open && 'rotate-180')} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Choose model</TooltipContent>
        </Tooltip>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[280px] p-0 overflow-hidden rounded-xl border"
        >
          <div className="flex flex-col h-[320px] overflow-hidden">
            {/* Search bar with action buttons */}
            <div className="flex items-center gap-1 p-2 border-b border-border/40 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search models..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full h-7 pl-7 pr-6 rounded-md text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/50 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setConnectProviderOpen(true);
                      }}
                      className="size-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Connect provider</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setManageModelsOpen(true);
                      }}
                      className="size-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Manage models</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Model list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-1">
              {grouped.length > 0 ? (
                grouped.map((group) => (
                  <div key={group.providerID}>
                    <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider px-2 pt-2 pb-0.5">
                      {group.providerName}
                    </div>
                    {group.models.map((model) => {
                      flatIndex++;
                      const idx = flatIndex;
                      const isSelected =
                        selectedModel?.providerID === model.providerID &&
                        selectedModel?.modelID === model.modelID;
                      const isHighlighted = idx === highlightedIndex;
                      const isLatestModel = modelStore.isLatest({ providerID: model.providerID, modelID: model.modelID });
                      const isFree = model.providerID === 'opencode' && (!model.cost || model.cost.input === 0);

                      return (
                        <Tooltip key={`${model.providerID}:${model.modelID}`}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors cursor-pointer',
                                (isHighlighted || isSelected) ? 'bg-accent' : 'hover:bg-accent/50',
                              )}
                              onClick={() => handleSelect(model)}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                            >
                              <span className="truncate flex-1">{model.modelName}</span>
                              {isFree && <Tag variant="free">Free</Tag>}
                              {isLatestModel && <Tag variant="latest">Latest</Tag>}
                              {isSelected && <Check className="h-3 w-3 text-foreground flex-shrink-0" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="start" sideOffset={12} className="p-2">
                            <ModelTooltipContent model={model} isLatest={isLatestModel} isFree={isFree} />
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="text-xs text-center py-8 text-muted-foreground/60">
                  No models found
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Manage Models Dialog */}
      <ManageModelsDialog
        open={manageModelsOpen}
        onOpenChange={setManageModelsOpen}
        models={models}
        modelStore={modelStore}
        onConnectProvider={() => setConnectProviderOpen(true)}
      />

      {/* Connect Provider Dialog */}
      <ConnectProviderDialog
        open={connectProviderOpen}
        onOpenChange={setConnectProviderOpen}
        providers={providers}
      />
    </>
  );
}
