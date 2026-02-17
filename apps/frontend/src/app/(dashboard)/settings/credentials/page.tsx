'use client';

import React from 'react';
import { SecretsManager } from '@/components/secrets/secrets-manager';
import { ProviderSettings } from '@/components/providers/provider-settings';

export default function SecretsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-6 sm:space-y-8">
        {/* Secrets */}
        <div className="space-y-4">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">Secrets Manager</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage environment variables and API keys for your sandbox.
            </p>
          </div>
          <div className="border rounded-lg">
            <SecretsManager />
          </div>
        </div>

        {/* Providers */}
        <div className="space-y-4">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">Providers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect LLM providers to power your agent.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <ProviderSettings />
          </div>
        </div>
      </div>
    </div>
  );
}
