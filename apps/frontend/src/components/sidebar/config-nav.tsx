'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bot, Sparkles, Wrench, Terminal, Settings, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { useTabStore } from '@/stores/tab-store';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const CONFIG_ITEMS = [
  { label: 'Settings', href: '/configuration', icon: Settings },
  { label: 'Agents', href: '/agents', icon: Bot },
  { label: 'Skills', href: '/skills', icon: Sparkles },
  { label: 'Tools', href: '/tools', icon: Wrench },
  { label: 'Commands', href: '/commands', icon: Terminal },
] as const;

export function ConfigNav() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  if (state === 'collapsed' && !isMobile) return null;

  const handleNavClick = (href: string, label: string) => {
    useTabStore.getState().openTab({
      id: `page:${href}`,
      title: label,
      type: 'page',
      href,
    });
    router.push(href);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="px-3">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full py-2 group">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Configuration
            </span>
            <ChevronRight className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-90'
            )} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-0.5 pb-2">
            {CONFIG_ITEMS.map(({ label, href, icon: Icon }) => {
              const isActive = pathname?.startsWith(href);
              return (
                <button
                  key={href}
                  onClick={() => handleNavClick(href, label)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-muted/80 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
