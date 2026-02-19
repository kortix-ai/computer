"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { AppLogo } from './app-logo';
import {
  useIntegrationSandboxes,
  type IntegrationConnection,
} from '@/hooks/integrations';

const ConnectionCard = ({
  connection,
  imgSrc,
  onManage,
  index,
}: {
  connection: IntegrationConnection;
  imgSrc?: string;
  onManage: () => void;
  index: number;
}) => {
  const { data: sandboxData } = useIntegrationSandboxes(connection.integrationId);
  const linkedCount = sandboxData?.sandboxes.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
      className="w-[280px] shrink-0"
    >
      <SpotlightCard className="bg-card border border-border/50">
        <div className="p-4 sm:p-5 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <AppLogo
                app={{
                  imgSrc,
                  name: connection.appName || connection.app,
                }}
              />
              {connection.status === 'active' && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-background" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm text-foreground truncate">
                  {connection.label || connection.appName || connection.app}
                </h3>
              </div>
              {connection.label ? (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {connection.appName || connection.app}
                </p>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    Connected {new Date(connection.connectedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="h-[34px] mb-3">
            <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
              {connection.label && (
                <>Connected {new Date(connection.connectedAt).toLocaleDateString()}</>
              )}
              {connection.lastUsedAt && (
                <> &middot; Used {new Date(connection.lastUsedAt).toLocaleDateString()}</>
              )}
              {linkedCount > 0 && (
                <>
                  {' '}&middot;{' '}
                  <Monitor className="h-3 w-3 inline mr-0.5" />
                  {linkedCount} sandbox{linkedCount !== 1 ? 'es' : ''}
                </>
              )}
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs"
              onClick={onManage}
            >
              <Settings className="h-3.5 w-3.5" />
              Manage
            </Button>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
};

// ── Connected Section ─────────────────────────────────────────────────────────

export const ConnectedSection = ({
  connections,
  appImgMap,
  onManage,
}: {
  connections: IntegrationConnection[];
  appImgMap: Map<string, string>;
  onManage: (connection: IntegrationConnection) => void;
}) => {
  if (connections.length === 0) return null;

  return (
    <div className="pb-6 sm:pb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Connected
        </h2>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {connections.length}
        </Badge>
      </div>

      {/* Mobile: Stack vertically */}
      <div className="sm:hidden space-y-3">
        {connections.map((connection, index) => (
          <ConnectionCard
            key={connection.integrationId}
            connection={connection}
            imgSrc={appImgMap.get(connection.app)}
            onManage={() => onManage(connection)}
            index={index}
          />
        ))}
      </div>

      {/* Desktop: Horizontal scroll strip */}
      <div className="hidden sm:block relative">
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-2">
            {connections.map((connection, index) => (
              <ConnectionCard
                key={connection.integrationId}
                connection={connection}
                imgSrc={appImgMap.get(connection.app)}
                onManage={() => onManage(connection)}
                index={index}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {connections.length > 3 && (
          <div className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none bg-gradient-to-l from-background to-transparent z-10" />
        )}
      </div>
    </div>
  );
};
