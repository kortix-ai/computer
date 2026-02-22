'use client';

/**
 * ProviderSettings — renders ConnectProviderContent inline.
 *
 * Used in:
 * - Setup overlay (variant="setup"): shows provider list + sticky Continue footer
 * - Settings modal (variant="settings"): shows provider list, no footer
 *
 * One component. Same UI everywhere. No intermediate screens.
 */

import { ConnectProviderContent } from '@/components/providers/connect-provider-content';
import { useOpenCodeProviders } from '@/hooks/opencode/use-opencode-sessions';
import { Button } from '@/components/ui/button';

interface ProviderSettingsProps {
  variant?: 'settings' | 'setup';
  onContinue?: () => void;
  onProviderChange?: () => void;
}

const LLM_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'google', 'groq', 'xai']);

export function ProviderSettings({
  variant = 'settings',
  onContinue,
  onProviderChange,
}: ProviderSettingsProps) {
  const { data: providersData } = useOpenCodeProviders();

  const hasProvider = providersData?.all?.some(
    (p) => p.models && Object.keys(p.models).length > 0
  );
  const hasLLMProvider = providersData?.all?.some(
    (p) => LLM_PROVIDERS.has(p.id) && p.models && Object.keys(p.models).length > 0
  );

  const canContinue = variant === 'setup' ? hasLLMProvider : true;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto p-1">
        <ConnectProviderContent
          providers={providersData}
          onProviderConnected={onProviderChange}
        />
      </div>

      {variant === 'setup' && (
        <div className="flex-shrink-0 pt-4 mt-2">
          {!canContinue && !hasProvider && (
            <p className="text-xs text-muted-foreground text-center mb-3">
              At least one LLM provider is required
            </p>
          )}
          <Button
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full"
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
