"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SandboxAgent } from '@/hooks/scheduled-tasks';

interface ScheduledTaskAgentSelectorProps {
  agents: SandboxAgent[];
  selectedAgent: string;
  onSelect: (agentName: string) => void;
  placeholder?: string;
  defaultLabel?: string;
}

export function ScheduledTaskAgentSelector({
  agents,
  selectedAgent,
  onSelect,
  placeholder = 'Default agent',
  defaultLabel = 'Default agent',
}: ScheduledTaskAgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const primaryAgents = useMemo(() => agents.filter((a) => a.mode !== 'subagent'), [agents]);
  const subAgents = useMemo(() => agents.filter((a) => a.mode === 'subagent'), [agents]);
  const allOrdered = useMemo(() => [...primaryAgents, ...subAgents], [primaryAgents, subAgents]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    if (!open) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = allOrdered.findIndex((a) => a.name === selectedAgent);
    setFocusedIndex(idx >= 0 ? idx : 0);
  }, [open, allOrdered, selectedAgent]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-agent-index="${focusedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, allOrdered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex === -1) {
        onSelect('');
      } else if (focusedIndex >= 0 && focusedIndex < allOrdered.length) {
        onSelect(allOrdered[focusedIndex]?.name ?? '');
      }
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }, [allOrdered, focusedIndex, onSelect, open]);

  const currentAgent = agents.find((a) => a.name === selectedAgent);
  const displayName = currentAgent?.name || placeholder;

  return (
    <div className="relative" ref={ref} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex w-full items-center justify-between gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm text-left',
          'hover:bg-muted/40 transition-colors',
          open && 'bg-muted/50'
        )}
      >
        <span className={cn('truncate', currentAgent ? 'text-foreground' : 'text-muted-foreground')}>
          {displayName}
        </span>
        <ChevronDown className={cn('size-4 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full rounded-xl border border-border bg-popover shadow-md overflow-hidden">
          <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1">
            <button
              type="button"
              data-agent-index={-1}
              onMouseEnter={() => setFocusedIndex(-1)}
              onClick={() => {
                onSelect('');
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer',
                focusedIndex === -1 ? 'bg-muted' : 'hover:bg-muted',
                !selectedAgent && focusedIndex !== -1 && 'bg-muted/50'
              )}
            >
              <span className="truncate">{defaultLabel}</span>
              {!selectedAgent && <Check className="size-3 text-foreground shrink-0" />}
            </button>

            {primaryAgents.length > 0 && (
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Agents
              </div>
            )}

            {primaryAgents.map((agent) => {
              const globalIdx = allOrdered.indexOf(agent);
              const isSelected = selectedAgent === agent.name;
              const isFocused = focusedIndex === globalIdx;

              return (
                <button
                  key={agent.name}
                  type="button"
                  data-agent-index={globalIdx}
                  onMouseEnter={() => setFocusedIndex(globalIdx)}
                  onClick={() => {
                    onSelect(agent.name);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer group',
                    isFocused ? 'bg-muted' : 'hover:bg-muted',
                    isSelected && !isFocused && 'bg-muted/50'
                  )}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate capitalize">{agent.name}</span>
                      {isSelected && <Check className="size-3 text-foreground shrink-0" />}
                    </div>
                    {agent.description && (
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">
                        {agent.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}

            {subAgents.length > 0 && (
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Subagents
              </div>
            )}

            {subAgents.map((agent) => {
              const globalIdx = allOrdered.indexOf(agent);
              const isSelected = selectedAgent === agent.name;
              const isFocused = focusedIndex === globalIdx;

              return (
                <button
                  key={agent.name}
                  type="button"
                  data-agent-index={globalIdx}
                  onMouseEnter={() => setFocusedIndex(globalIdx)}
                  onClick={() => {
                    onSelect(agent.name);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer group',
                    isFocused ? 'bg-muted' : 'hover:bg-muted',
                    isSelected && !isFocused && 'bg-muted/50'
                  )}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{agent.name}</span>
                      {isSelected && <Check className="size-3 text-foreground shrink-0" />}
                    </div>
                    {agent.description && (
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">
                        {agent.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
