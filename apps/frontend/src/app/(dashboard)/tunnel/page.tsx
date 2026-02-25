import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TunnelOverview } from '@/components/tunnel/tunnel-overview';

export default function TunnelPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-4 mt-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      }
    >
      <TunnelOverview />
    </Suspense>
  );
}
