'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Store, ExternalLink } from 'lucide-react';

import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import {
  fetchInstalledSnapshot,
  fetchMarketplaceIndex,
  getRegistryUrl,
  isComponentInstalled,
} from '@/features/marketplace/api/marketplace-api';
import type { MarketplaceComponentType } from '@/features/marketplace/types';

const TABS: Array<{ label: string; value: MarketplaceComponentType | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Skills', value: 'ocx:skill' },
  { label: 'Tools', value: 'ocx:tool' },
  { label: 'Plugins', value: 'ocx:plugin' },
  { label: 'Bundles', value: 'ocx:bundle' },
  { label: 'Agents', value: 'ocx:agent' },
  { label: 'Commands', value: 'ocx:command' },
];

function prettyType(type: string): string {
  return type.replace('ocx:', '').replace('-', ' ');
}

export function MarketplacePage() {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<MarketplaceComponentType | 'all'>('all');

  const indexQuery = useQuery({
    queryKey: ['marketplace', 'index'],
    queryFn: fetchMarketplaceIndex,
    staleTime: 60_000,
  });

  const installedQuery = useQuery({
    queryKey: ['marketplace', 'installed'],
    queryFn: fetchInstalledSnapshot,
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const list = indexQuery.data?.components || [];
    const q = query.trim().toLowerCase();

    return list
      .filter((component) => activeType === 'all' || component.type === activeType)
      .filter((component) => {
        if (!q) return true;
        return (
          component.name.toLowerCase().includes(q)
          || component.type.toLowerCase().includes(q)
          || component.description?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [indexQuery.data?.components, query, activeType]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader icon={Store}>Marketplace</PageHeader>

      <div className="rounded-2xl border bg-card/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="Search components"
            />
          </div>
          <Link href={getRegistryUrl()} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              Open Registry
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={activeType === tab.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveType(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {(indexQuery.isLoading || installedQuery.isLoading) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      )}

      {indexQuery.error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load marketplace index: {indexQuery.error instanceof Error ? indexQuery.error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {!indexQuery.isLoading && !indexQuery.error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((component) => {
            const installed = installedQuery.data
              ? isComponentInstalled(installedQuery.data, component.type, component.name)
              : false;

            return (
              <Link key={component.name} href={`/marketplace/${component.name}`}>
                <Card className="h-full transition hover:border-primary/50 hover:bg-card">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{component.name}</CardTitle>
                      <Badge variant={installed ? 'default' : 'secondary'}>
                        {installed ? 'Installed' : 'Not Installed'}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="w-fit capitalize">
                      {prettyType(component.type)}
                    </Badge>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {component.description || 'No description provided.'}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {!indexQuery.isLoading && !indexQuery.error && filtered.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No components match your search.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
