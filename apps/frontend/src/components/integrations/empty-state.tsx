import React from 'react';
import { Plug } from 'lucide-react';
import { Ripple } from '@/components/ui/ripple';

export const EmptyState = () => (
  <div className="relative bg-muted/20 rounded-3xl border border-dashed border-border/50 flex flex-col items-center justify-center py-20 px-4 overflow-hidden">
    <Ripple mainCircleSize={160} mainCircleOpacity={0.12} numCircles={6} />
    <div className="relative z-10 flex flex-col items-center">
      <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
        <Plug className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        No integrations yet
      </h3>
      <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md">
        Connect third-party apps like Google Sheets, Slack, or GitHub so your
        agents can interact with them using your credentials.
      </p>
    </div>
  </div>
);
