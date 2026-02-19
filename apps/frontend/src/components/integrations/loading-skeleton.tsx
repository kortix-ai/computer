import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const LoadingSkeleton = () => (
  <div className="space-y-8">
    <div>
      <Skeleton className="h-4 w-28 mb-3" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-[280px] shrink-0 rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-3 w-full mb-1.5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
    <div>
      <Skeleton className="h-4 w-32 mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-9 w-9 rounded-[10px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-3 w-full mb-1.5" />
            <Skeleton className="h-3 w-3/4 mb-4" />
            <div className="flex justify-end">
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
