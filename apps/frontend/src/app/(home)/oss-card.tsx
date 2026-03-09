'use client';

import { Heart } from 'lucide-react';
import { GithubButton } from '@/components/home/github-button';

export const OSSCard = () => {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border/50 bg-card/30 p-8 sm:p-12 shadow-sm">
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-6 flex items-center justify-center size-12 rounded-2xl bg-muted/20 border border-border/50">
          <Heart className="size-5 text-muted-foreground/60" />
        </div>
        <h3 className="text-xl sm:text-2xl font-medium text-foreground mb-3">
          Fully Open Source.
        </h3>
        <p className="text-muted-foreground/70 max-w-lg leading-relaxed mb-8">
          Kortix is Elastic 2.0 licensed so you can view the source code, contribute, and self-host.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <GithubButton size="lg" className="h-12" />
        </div>
      </div>
    </div>
  );
};
