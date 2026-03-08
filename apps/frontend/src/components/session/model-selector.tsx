'use client';

import { useRef, useState, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronDown,
  Check,
  X,
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

function handleDivButtonKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  onActivate: () => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onActivate();
  }
}

// =============================================================================
// Tag
// =============================================================================

export function Tag({ children }: { children: React.ReactNode; variant?: string }) {
  return (
    <span className="px-1 py-0.5 rounded text-[10px] font-medium leading-none flex-shrink-0 bg-muted text-muted-foreground/60">
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
            <DialogTitle className="text-sm font-medium">Models</DialogTitle>
            <DialogDescription id="manage-models-desc" className="text-xs text-muted-foreground/50">
              Toggle which models appear in the selector.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm rounded-lg border-border/50 bg-transparent"
            />
          </div>
        </div>

        {/* Scrollable model list */}
        <div className="overflow-y-auto px-5 pb-5 pt-2">
          <div className="space-y-3">
            {grouped.map(([providerID, providerModels]) => (
              <div key={providerID}>
                <div className="text-[10px] text-muted-foreground/40 uppercase tracking-widest px-1 pb-1 font-medium">
                  {PROVIDER_LABELS[providerID] || providerModels[0]?.providerName || providerID}
                </div>
                <div className="divide-y divide-border/30">
                  {providerModels.map((model) => {
                    const key = { providerID: model.providerID, modelID: model.modelID };
                    const visible = modelStore.isVisible(key);
                    return (
                      <div
                        key={`${model.providerID}:${model.modelID}`}
                        className="flex items-center justify-between gap-3 px-1 py-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-md"
                        role="button"
                        tabIndex={0}
                        onClick={() => modelStore.setVisibility(key, !visible)}
                        onKeyDown={(event) => handleDivButtonKeyDown(event, () => modelStore.setVisibility(key, !visible))}
                      >
                        <span className="text-sm truncate text-foreground/80">{model.modelName}</span>
                        <Switch
                          checked={visible}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) => modelStore.setVisibility(key, checked)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {grouped.length === 0 && (
              <div className="text-xs text-center py-8 text-muted-foreground/40">No models found</div>
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

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
      return;
    }
    setSearch('');
    setHighlightedIndex(-1);
  }, []);

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
      <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 cursor-pointer",
              open && "bg-muted text-foreground",
            )}
          >
            <span className="truncate max-w-[140px]">{displayName}</span>
            <ChevronDown className={cn('size-3 opacity-50 transition-transform duration-200', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[260px] p-0 overflow-hidden rounded-xl border border-border/60 shadow-lg"
        >
          <div className="flex flex-col h-[300px] overflow-hidden">
            {/* Search bar */}
            <div className="flex items-center px-3 py-2 border-b border-border/40 flex-shrink-0">
              <Search className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mr-2" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 h-6 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="ml-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Model list */}
            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              {grouped.length > 0 ? (
                grouped.map((group) => (
                  <div key={group.providerID}>
                    <div className="text-[10px] text-muted-foreground/40 uppercase tracking-widest px-3 pt-2.5 pb-0.5 font-medium">
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
                                'w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[13px] transition-colors cursor-pointer',
                                (isHighlighted || isSelected) ? 'bg-muted/60' : 'hover:bg-muted/30',
                              )}
                              onClick={() => handleSelect(model)}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                            >
                              <span className="truncate flex-1">{model.modelName}</span>
                              {isFree && <Tag>Free</Tag>}
                              {isLatestModel && <Tag>New</Tag>}
                              {isSelected && <Check className="h-3 w-3 text-foreground/60 flex-shrink-0" />}
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
                <div className="text-xs text-center py-8 text-muted-foreground/40">
                  No models
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-3 px-3 py-2 border-t border-border/40 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setOpen(false); setConnectProviderOpen(true); }}
                className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              >
                Connect provider
              </button>
              <span className="text-border/60">·</span>
              <button
                type="button"
                onClick={() => { setOpen(false); setManageModelsOpen(true); }}
                className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              >
                Manage models
              </button>
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
