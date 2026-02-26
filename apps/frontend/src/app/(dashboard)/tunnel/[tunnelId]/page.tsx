import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TunnelDetail } from '@/components/tunnel/tunnel-detail';

interface TunnelDetailPageProps {
  params: Promise<{ tunnelId: string }>;
}

export default async function TunnelDetailPage({ params }: TunnelDetailPageProps) {
  const { tunnelId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-64 rounded-xl mt-4" />
        </div>
      }
    >
      <TunnelDetail tunnelId={tunnelId} />
    </Suspense>
  );
}
