'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Package, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import {
  fetchInstalledSnapshot,
  fetchMarketplaceComponent,
  isComponentInstalled,
} from '@/features/marketplace/api/marketplace-api';
import { useCreatePty } from '@/hooks/opencode/use-opencode-pty';
import { openTabAndNavigate } from '@/stores/tab-store';

interface MarketplaceDetailPageProps {
  slug?: string;
}

function prettyType(type: string): string {
  return type.replace('ocx:', '').replace('-', ' ');
}

export function MarketplaceDetailPage({ slug }: MarketplaceDetailPageProps) {
  const params = useParams<{ slug?: string }>();
  const componentSlug = slug || params?.slug;

  const componentQuery = useQuery({
    queryKey: ['marketplace', 'component', componentSlug],
    queryFn: () => fetchMarketplaceComponent(componentSlug || ''),
    enabled: Boolean(componentSlug),
    staleTime: 60_000,
  });

  const installedQuery = useQuery({
    queryKey: ['marketplace', 'installed'],
    queryFn: fetchInstalledSnapshot,
    staleTime: 15_000,
  });

  const latestVersion = useMemo(() => {
    const latest = componentQuery.data?.['dist-tags']?.latest;
    if (!latest) return null;
    return componentQuery.data?.versions?.[latest];
  }, [componentQuery.data]);

  const isInstalled = useMemo(() => {
    if (!installedQuery.data || !latestVersion || !componentSlug) return false;
    return isComponentInstalled(installedQuery.data, latestVersion.type, componentSlug);
  }, [installedQuery.data, latestVersion, componentSlug]);

  const installCommand = componentSlug ? `ocx add kortix/${componentSlug}` : '';
  const createPty = useCreatePty();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      toast.success('Install command copied');
    } catch {
      toast.error('Failed to copy command');
    }
  };

  const handleInstall = async () => {
    if (!componentSlug) return;
    try {
      const pty = await createPty.mutateAsync({
        command: 'sh',
        args: ['-lc', `${installCommand} && printf "\\n[ocx] install complete\\n"`],
        title: `Install ${componentSlug}`,
        env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      });

      openTabAndNavigate({
        id: `terminal:${pty.id}`,
        title: pty.title || `Install ${componentSlug}`,
        type: 'terminal',
        href: `/terminal/${pty.id}`,
      });

      toast.success('Install started in terminal');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start install');
    }
  };

  if (!componentSlug) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">Missing component slug.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to marketplace
        </Link>
      </div>

      <PageHeader icon={Package}>{componentSlug}</PageHeader>

      {(componentQuery.isLoading || installedQuery.isLoading) && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {componentQuery.error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load component: {componentQuery.error instanceof Error ? componentQuery.error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {!componentQuery.isLoading && !componentQuery.error && latestVersion && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">{prettyType(latestVersion.type)}</Badge>
                <Badge variant={isInstalled ? 'default' : 'secondary'}>{isInstalled ? 'Installed' : 'Not Installed'}</Badge>
                <Badge variant="secondary">Latest {componentQuery.data?.['dist-tags']?.latest || 'unknown'}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">{latestVersion.description || 'No description provided.'}</p>
              <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">{installCommand}</div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleCopy} className="gap-2">
                  <Copy className="h-4 w-4" />
                  Copy Install Command
                </Button>
                <Button
                  onClick={handleInstall}
                  className="gap-2"
                  variant="outline"
                  disabled={createPty.isPending}
                >
                  <TerminalSquare className="h-4 w-4" />
                  {createPty.isPending ? 'Starting Install...' : 'Install in Terminal'}
                </Button>
                <Button variant="ghost" onClick={() => void installedQuery.refetch()}>
                  Refresh Status
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Files</CardTitle>
            </CardHeader>
            <CardContent>
              {latestVersion.files?.length ? (
                <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                  {latestVersion.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No files listed.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dependencies</CardTitle>
            </CardHeader>
            <CardContent>
              {latestVersion.dependencies?.length ? (
                <div className="flex flex-wrap gap-2">
                  {latestVersion.dependencies.map((dependency) => (
                    <Badge key={dependency} variant="outline">{dependency}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No dependencies.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
