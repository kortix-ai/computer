"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Check,
  Copy,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { useDetectPublicUrl, useGenerateManifest } from '@/hooks/channels';
import { useSavePlatformCredentials } from '@/hooks/channels';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SlackSetupWizardProps {
  onSaved: (publicUrl?: string) => void;
  onBack: () => void;
  sandboxId?: string | null;
}

type WizardStep = 1 | 2 | 3;

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = [
    { num: 1 as const, label: 'Detect URL' },
    { num: 2 as const, label: 'Create App' },
    { num: 3 as const, label: 'Credentials' },
  ];

  return (
    <div className="flex items-center justify-center gap-0 px-6 py-4">
      {steps.map((s, i) => (
        <React.Fragment key={s.num}>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors',
                current === s.num
                  ? 'bg-primary text-primary-foreground'
                  : current > s.num
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {current > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
            </div>
            <span
              className={cn(
                'text-xs font-medium hidden sm:inline',
                current === s.num ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'w-8 h-px mx-2',
                current > s.num ? 'bg-primary/40' : 'bg-border',
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function SlackSetupWizard({ onSaved, onBack, sandboxId }: SlackSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const detectQuery = useDetectPublicUrl();
  const [publicUrl, setPublicUrl] = useState('');

  // Step 2 state
  const [botName, setBotName] = useState('Kortix Agent');
  const generateMutation = useGenerateManifest();
  const [manifestJson, setManifestJson] = useState('');
  const [copied, setCopied] = useState(false);

  // Step 3 state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const saveMutation = useSavePlatformCredentials();

  // Pre-fill URL when detection completes
  useEffect(() => {
    if (detectQuery.data?.detected && detectQuery.data.url && !publicUrl) {
      setPublicUrl(detectQuery.data.url);
    }
  }, [detectQuery.data, publicUrl]);

  // Step 1 handlers
  const handleStep1Next = () => {
    if (!publicUrl.trim()) {
      toast.error('Please enter a public URL');
      return;
    }
    setStep(2);
  };

  // Step 2 handlers
  const handleGenerateManifest = async () => {
    try {
      const result = await generateMutation.mutateAsync({
        publicUrl: publicUrl.trim(),
        botName: botName.trim() || undefined,
      });
      setManifestJson(JSON.stringify(result.manifest, null, 2));
    } catch {
      toast.error('Failed to generate manifest');
    }
  };

  const handleCopyManifest = async () => {
    try {
      await navigator.clipboard.writeText(manifestJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Step 3 handlers
  const isCredsValid = clientId.trim() && clientSecret.trim() && signingSecret.trim();

  const handleSaveCredentials = async () => {
    if (!isCredsValid) return;
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
      onSaved(publicUrl.trim() || undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save credentials');
    }
  };

  return (
    <div>
      <StepIndicator current={step} />

      {/* Step 1: Detect URL */}
      {step === 1 && (
        <div className="space-y-4 px-6 pb-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Slack needs a public URL to send webhooks. We'll try to detect your ngrok tunnel automatically.
            </p>
            <p className="text-xs text-muted-foreground">
              Make sure your tunnel points to port <span className="font-mono font-medium text-foreground">8008</span> (kortix-api).
            </p>
          </div>

          <div className="rounded-xl border p-3">
            {detectQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Detecting ngrok tunnel...
              </div>
            ) : detectQuery.data?.detected ? (
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15">
                  <Check className="h-3 w-3 text-emerald-600" />
                </div>
                <span className="text-emerald-600 font-medium">
                  {detectQuery.data.source === 'ngrok' ? 'ngrok tunnel detected' : 'Public URL configured'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15">
                  <AlertCircle className="h-3 w-3 text-amber-600" />
                </div>
                <span className="text-amber-600 font-medium">
                  No tunnel detected — enter your public URL manually
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="public-url">Public URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="public-url"
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                  placeholder="https://abc123.ngrok-free.app"
                  className="pl-9 rounded-xl focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center gap-2 pt-2">
            <Button variant="outline" onClick={onBack} className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(3)}
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
              >
                Skip — enter credentials manually
              </button>
              <Button
                onClick={handleStep1Next}
                disabled={!publicUrl.trim()}
                className="rounded-xl"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Create App from Manifest */}
      {step === 2 && (
        <div className="space-y-4 px-6 pb-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="bot-name">Bot Name</Label>
              <Input
                id="bot-name"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="Kortix Agent"
                className="rounded-xl focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {!manifestJson ? (
              <Button
                onClick={handleGenerateManifest}
                disabled={generateMutation.isPending}
                className="w-full rounded-xl"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Manifest'
                )}
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">App Manifest</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyManifest}
                      className="h-7 rounded-lg text-xs"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  {/* <pre className="rounded-xl border bg-muted/50 p-3 text-xs overflow-auto max-h-48 font-mono">
                    {manifestJson}
                  </pre> */}
                </div>

                <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-medium">Create your Slack app:</p>
                  <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>
                      Open{' '}
                      <a
                        href="https://api.slack.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5 text-foreground"
                      >
                        api.slack.com/apps
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Click <strong>"Create New App"</strong> then <strong>"From a manifest"</strong></li>
                    <li>Select your workspace, click Next</li>
                    <li>Switch to the <strong>JSON</strong> tab, paste the manifest above</li>
                    <li>Click <strong>Next</strong>, review, then <strong>Create</strong></li>
                    <li>Go to <strong>"Install App"</strong> and install to your workspace</li>
                  </ol>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!manifestJson}
              className="rounded-xl"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Paste Credentials */}
      {step === 3 && (
        <div className="space-y-4 px-6 pb-6">
          <p className="text-sm text-muted-foreground">
            Found under <strong>Basic Information</strong> &gt; <strong>App Credentials</strong> in your{' '}
            <a
              href="https://api.slack.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              Slack App settings
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>

          <div className="space-y-2">
            <Label htmlFor="wiz-client-id">Client ID</Label>
            <Input
              id="wiz-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="1234567890.1234567890"
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wiz-client-secret">Client Secret</Label>
            <Input
              id="wiz-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="abcdef1234567890..."
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wiz-signing-secret">Signing Secret</Label>
            <Input
              id="wiz-signing-secret"
              type="password"
              value={signingSecret}
              onChange={(e) => setSigningSecret(e.target.value)}
              placeholder="abcdef1234567890..."
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="rounded-xl"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleSaveCredentials}
              disabled={!isCredsValid || saveMutation.isPending}
              className="rounded-xl"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save & Install
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
