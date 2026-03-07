'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { History, ChevronDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useLegacyThreads } from '@/hooks/legacy/use-legacy-threads';
import { useSidebar } from '@/components/ui/sidebar';
import { openTabAndNavigate } from '@/stores/tab-store';

export function LegacyThreadsSection() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { data, isLoading } = useLegacyThreads();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  if (state === 'collapsed' && !isMobile) return null;
  if (isLoading) return null;
  if (!data || data.threads.length === 0) return null;

  const handleClick = (threadId: string, name: string) => {
    openTabAndNavigate({
      id: `legacy:${threadId}`,
      title: name || 'Previous Chat',
      type: 'page',
      href: `/legacy/${threadId}`,
    });
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="px-3 flex-shrink-0">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer group">
            <History className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">Previous Chats</span>
            <span className="text-[10px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {data.total}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="px-2 pb-2 pl-4">
          <div className="space-y-0.5">
            {data.threads.map((thread) => {
              const isActive = pathname?.includes(thread.thread_id);
              return (
                <button
                  key={thread.thread_id}
                  onClick={() => handleClick(thread.thread_id, thread.name)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[13px] cursor-pointer',
                    'transition-colors duration-150',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )}
                >
                  <span className="flex-1 truncate text-left">{thread.name || 'Untitled'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
