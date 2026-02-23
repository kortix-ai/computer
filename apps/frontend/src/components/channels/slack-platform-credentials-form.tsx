"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, ExternalLink, Loader2 } from 'lucide-react';
import { useSavePlatformCredentials } from '@/hooks/channels';
import { toast } from 'sonner';

interface SlackPlatformCredentialsFormProps {
  onSaved: () => void;
  onBack: () => void;
  sandboxId?: string | null;
}

export function SlackPlatformCredentialsForm({ onSaved, onBack, sandboxId }: SlackPlatformCredentialsFormProps) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [signingSecret, setSigningSecret] = useState('');

  const saveMutation = useSavePlatformCredentials();

  const isValid = clientId.trim() && clientSecret.trim() && signingSecret.trim();

  const handleSave = async () => {
    if (!isValid) return;

    try {
      await saveMutation.mutateAsync({
        channelType: 'slack',
        credentials: {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          signingSecret: signingSecret.trim(),
        },
        sandboxId: sandboxId ?? null,
      });
      toast.success('Slack credentials saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save credentials');
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">
          Enter your Slack App credentials. You can find these in your{' '}
          <a
            href="https://api.slack.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="underline inline-flex items-center gap-1"
          >
            Slack App settings
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slack-client-id">Client ID</Label>
        <Input
          id="slack-client-id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="1234567890.1234567890"
          className="rounded-xl focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-xs text-muted-foreground">
          Found under Basic Information &gt; App Credentials
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slack-client-secret">Client Secret</Label>
        <Input
          id="slack-client-secret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="abcdef1234567890..."
          className="rounded-xl focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slack-signing-secret">Signing Secret</Label>
        <Input
          id="slack-signing-secret"
          type="password"
          value={signingSecret}
          onChange={(e) => setSigningSecret(e.target.value)}
          placeholder="abcdef1234567890..."
          className="rounded-xl focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="rounded-xl">
          Back
        </Button>
        <Button
          onClick={handleSave}
          disabled={!isValid || saveMutation.isPending}
          className="rounded-xl"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Save & Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
