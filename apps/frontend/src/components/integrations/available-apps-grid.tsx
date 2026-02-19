"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plug,
  Loader2,
  CheckCircle2,
  Plus,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { AppLogo } from './app-logo';
import { EmptyState } from './empty-state';
import { LoadingSkeleton } from './loading-skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import type { IntegrationApp, IntegrationConnection } from '@/hooks/integrations';

const AppCard = ({
  app,
  connections,
  onConnect,
  onManage,
  isConnecting,
}: {
  app: IntegrationApp;
  connections: IntegrationConnection[];
  onConnect: () => void;
  onManage: (connection: IntegrationConnection) => void;
  isConnecting: boolean;
}) => {
  const isConnected = connections.length > 0;
  const connectionCount = connections.length;

  return (
    <SpotlightCard className="bg-card border border-border/50">
      <div className="p-4 sm:p-5 flex flex-col h-full">
        <div className="flex items-center gap-3 mb-3">
          <AppLogo app={{ imgSrc: app.imgSrc, name: app.name }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm text-foreground truncate">
                {app.name}
              </h3>
              {isConnected && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              {connectionCount > 1 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {connectionCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {app.categories.slice(0, 1).map((cat) => (
                <span key={cat} className="text-xs text-muted-foreground">
                  {cat}
                </span>
              ))}
              {app.authType && (
                <span className="text-xs text-muted-foreground/50 uppercase tracking-wider">
                  {app.authType}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="h-[34px] mb-3">
          <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
            {app.description || '\u00A0'}
          </p>
        </div>

        <div className="flex justify-end gap-1">
          {isConnected && (
            <>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs"
                onClick={() => onManage(connections[0])}
              >
                <Settings className="h-3.5 w-3.5" />
                Manage
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-8 px-2 text-xs"
                onClick={onConnect}
                disabled={isConnecting}
                title="Add another account"
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
          {!isConnected && (
            <Button
              variant="default"
              className="h-8 px-3 text-xs"
              onClick={onConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Plug className="h-3.5 w-3.5" />
              )}
              Connect
            </Button>
          )}
        </div>
      </div>
    </SpotlightCard>
  );
};

export const AvailableAppsGrid = ({
  filteredApps,
  apps,
  connections,
  connectionsByApp,
  connectingApp,
  appsLoading,
  connectionsLoading,
  appsError,
  searchQuery,
  authFilter,
  hasNextPage,
  isFetchingNextPage,
  onConnect,
  onManage,
  onLoadMore,
}: {
  filteredApps: IntegrationApp[];
  apps: IntegrationApp[];
  connections: IntegrationConnection[];
  connectionsByApp: Map<string, IntegrationConnection[]>;
  connectingApp: string | null;
  appsLoading: boolean;
  connectionsLoading: boolean;
  appsError: Error | null;
  searchQuery: string;
  authFilter: string;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onConnect: (app: IntegrationApp) => void;
  onManage: (connection: IntegrationConnection) => void;
  onLoadMore: () => void;
}) => {
  return (
    <div className="pb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Available Apps
      </h2>
      {appsError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load available apps. Check that Pipedream credentials
            are configured.
          </AlertDescription>
        </Alert>
      ) : appsLoading || connectionsLoading ? (
        <LoadingSkeleton />
      ) : apps.length === 0 && connections.length === 0 ? (
        <EmptyState />
      ) : filteredApps.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No apps found{searchQuery ? ` for "${searchQuery}"` : ''}{authFilter !== 'all' ? ` with ${authFilter === 'oauth' ? 'OAuth' : 'API key'} auth` : ''}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredApps.map((app, index) => (
                <motion.div
                  key={app.slug}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: 0.3,
                    delay: Math.min(index * 0.03, 0.6),
                    ease: 'easeOut',
                  }}
                >
                  <AppCard
                    app={app}
                    connections={connectionsByApp.get(app.slug) || []}
                    onConnect={() => onConnect(app)}
                    onManage={onManage}
                    isConnecting={connectingApp === app.slug}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {hasNextPage && (
            <div className="flex justify-center pt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={isFetchingNextPage}
                className="h-10 px-8 rounded-2xl"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  'Load more apps'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
