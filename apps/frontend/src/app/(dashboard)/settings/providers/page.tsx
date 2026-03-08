'use client';

import React from 'react';
import { ProviderSettings } from '@/components/providers/provider-settings';

export default function ProvidersPage() {
  return (
    <div className="container mx-auto max-w-4xl px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">LLM Providers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect model providers that power your agent.
          </p>
        </div>
        <div>
          <ProviderSettings />
        </div>
      </div>
    </div>
  );
}
