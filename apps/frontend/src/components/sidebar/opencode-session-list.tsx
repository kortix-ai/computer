'use client';

import { useState, useMemo, startTransition, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  MoreHorizontal,
  Trash2,
  Frown,
  MessageCircle,
} from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import { DeleteConfirmationDialog } from '@/components/thread/DeleteConfirmationDialog';
import {
  useOpenCodeSessions,
  useDeleteOpenCodeSession,
} from '@/hooks/opencode/use-opencode-sessions';
import type { OpenCodeSession } from '@/lib/api/opencode';
import Link from 'next/link';

function formatSessionDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) {
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffMins < 60) return diffMins === 0 ? 'now' : `${diffMins}m`;
    return `${diffHours}h`;
  }
  if (diffDays <= 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDateGroup(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This Week';
  if (diffDays <= 30) return 'This Month';
  if (diffDays <= 90) return 'Last 3 Months';
  return 'Older';
}

interface SessionItemProps {
  session: OpenCodeSession;
  isActive: boolean;
  onClick: (e: React.MouseEvent, sessionId: string) => void;
  onDelete: (sessionId: string, title: string) => void;
}

function SessionItem({ session, isActive, onClick, onDelete }: SessionItemProps) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <SpotlightCard
      className={cn(
        'transition-colors cursor-pointer',
        isActive ? 'bg-muted' : 'bg-transparent'
      )}
    >
      <Link
        href={`/sessions/${session.id}`}
        onClick={(e) => onClick(e, session.id)}
        className="block"
      >
        <div
          className="flex items-center gap-3 p-2.5 text-sm"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {/* Icon */}
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0">
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {/* Title */}
          <span className="flex-1 truncate">
            {session.title || 'Untitled Session'}
          </span>

          {/* Date & Menu */}
          <div className="flex-shrink-0 relative">
            <span
              className={cn(
                'text-xs text-muted-foreground transition-opacity',
                isHovering ? 'opacity-0' : 'opacity-100'
              )}
            >
              {formatSessionDate(session.time.updated)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'absolute top-1/2 right-0 -translate-y-1/2 p-1 rounded-2xl hover:bg-accent transition-all text-muted-foreground',
                    isHovering ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <MoreHorizontal className="h-4 w-4 rotate-90" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(session.id, session.title || 'Untitled Session');
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Link>
    </SpotlightCard>
  );
}

interface OpenCodeSessionListProps {
  projectId?: string | null;
}

export function OpenCodeSessionList({ projectId }: OpenCodeSessionListProps = {}) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: sessions, isLoading, error } = useOpenCodeSessions();
  const { mutate: deleteSession, isPending: isDeleting } = useDeleteOpenCodeSession();

  // Filter by project, then group by date
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (projectId === null || projectId === undefined) return sessions;
    return sessions.filter((s) => s.projectID === projectId);
  }, [sessions, projectId]);

  // Group sessions by date
  const groupedSessions = useMemo(() => {
    if (filteredSessions.length === 0) return {};

    const groups: Record<string, OpenCodeSession[]> = {};
    const dateOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Last 3 Months', 'Older'];

    for (const session of filteredSessions) {
      const group = getDateGroup(session.time.updated);
      if (!groups[group]) groups[group] = [];
      groups[group].push(session);
    }

    // Return in correct order
    const ordered: Record<string, OpenCodeSession[]> = {};
    for (const key of dateOrder) {
      if (groups[key]) ordered[key] = groups[key];
    }
    return ordered;
  }, [filteredSessions]);

  const handleSessionClick = (e: React.MouseEvent, sessionId: string) => {
    if (e.metaKey || e.ctrlKey) return; // Let browser handle cmd+click

    e.preventDefault();

    if (isMobile) setOpenMobile(false);

    startTransition(() => {
      router.push(`/sessions/${sessionId}`);
    });
  };

  const handleDeleteSession = (sessionId: string, title: string) => {
    setSessionToDelete({ id: sessionId, name: title });
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!sessionToDelete) return;
    setIsDeleteDialogOpen(false);

    const isActive = pathname?.includes(sessionToDelete.id);

    deleteSession(sessionToDelete.id, {
      onSuccess: () => {
        if (isActive) {
          router.push('/dashboard');
        }
      },
    });

    setSessionToDelete(null);
  };

  const isActiveSession = (sessionId: string) => {
    return pathname?.includes(sessionId) || false;
  };

  return (
    <div>
      <div className="overflow-y-auto max-h-[calc(100vh-340px)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] pb-16">
        {(state !== 'collapsed' || isMobile) && (
          <>
            {isLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="flex items-center gap-3 px-2 py-2">
                    <div className="h-10 w-10 bg-muted/10 border-[1.5px] border-border rounded-2xl animate-pulse" />
                    <div className="h-4 bg-muted rounded flex-1 animate-pulse" />
                    <div className="h-3 w-8 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/30 border border-border mb-4">
                  <Frown className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Failed to connect
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Could not reach OpenCode server
                </p>
              </div>
            ) : filteredSessions.length > 0 ? (
              Object.entries(groupedSessions).map(([dateGroup, groupSessions]) => (
                <div key={dateGroup}>
                  <div className="py-2 mt-4 first:mt-2">
                    <div className="text-xs font-medium text-muted-foreground px-2.5">
                      {dateGroup}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {groupSessions.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        isActive={isActiveSession(session.id)}
                        onClick={handleSessionClick}
                        onDelete={handleDeleteSession}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/30 border border-border mb-4">
                  <MessageCircle className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  No sessions yet
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Start a new session to get going
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {sessionToDelete && (
        <DeleteConfirmationDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
          threadName={sessionToDelete.name}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
