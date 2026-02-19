"use client";

import React from 'react';
import { Plug, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { useIntegrationsPage } from './use-integrations-page';
import { ConnectedSection } from './connected-section';
import { SearchFilterBar } from './search-filter-bar';
import { AvailableAppsGrid } from './available-apps-grid';
import { ManageProfileDialog } from './manage-profile-dialog';

export function IntegrationsPage() {
  const {
    searchQuery,
    setSearchQuery,
    authFilter,
    setAuthFilter,
    connectingApp,
    manageConnection,
    setManageConnection,
    connections,
    filteredApps,
    connectionsByApp,
    appImgMap,
    apps,
    appsLoading,
    connectionsLoading,
    appsError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    handleConnect,
    handleManage,
  } = useIntegrationsPage();

  if (error) {
    return (
      <div className="h-screen flex flex-col">
        <div className="max-w-4xl mx-auto w-full py-8 px-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load integrations. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
        <PageHeader icon={Plug}>
          <div className="space-y-2 sm:space-y-4">
            <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
              <span className="text-primary">Integrations</span>
            </div>
          </div>
        </PageHeader>
      </div>
      <div className="container mx-auto max-w-7xl px-3 sm:px-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
          <ConnectedSection
            connections={connections}
            appImgMap={appImgMap}
            onManage={handleManage}
          />
        </div>
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
          <SearchFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            authFilter={authFilter}
            onAuthFilterChange={setAuthFilter}
          />
        </div>
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
          <AvailableAppsGrid
            filteredApps={filteredApps}
            apps={apps}
            connections={connections}
            connectionsByApp={connectionsByApp}
            connectingApp={connectingApp}
            appsLoading={appsLoading}
            connectionsLoading={connectionsLoading}
            appsError={appsError}
            searchQuery={searchQuery}
            authFilter={authFilter}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onConnect={handleConnect}
            onManage={handleManage}
            onLoadMore={fetchNextPage}
          />
        </div>
      </div>
      <ManageProfileDialog
        open={!!manageConnection}
        onOpenChange={(open) => {
          if (!open) setManageConnection(null);
        }}
        connection={manageConnection}
        imgSrc={manageConnection ? appImgMap.get(manageConnection.app) : undefined}
      />
    </div>
  );
}
