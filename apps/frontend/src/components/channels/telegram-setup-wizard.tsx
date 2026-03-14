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
  Globe,
  AlertCircle,
  Terminal,
  ChevronDown,
  ChevronUp,
  Play,
  Shield,
} from 'lucide-react';
import {
  useTelegramVerifyToken,
  useTelegramConnect,
} from '@/hooks/channels/use-telegram-wizard';
import { useNgrokStatus, useNgrokStart } from '@/hooks/channels/use-ngrok';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TelegramSetupWizardProps {
  onCreated: () => void;
  onBack: () => void;
  sandboxId?: string | null;
}

type WizardStep = 1 | 2;

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = [
    { num: 1 as const, label: 'Bot Token' },
    { num: 2 as const, label: 'Webhook URL' },
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

export function TelegramSetupWizard({ onCreated, onBack }: TelegramSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [botVerified, setBotVerified] = useState(false);
  const verifyMutation = useTelegramVerifyToken();

  // Step 2 state
  const TUNNEL_PORT = 8008; // kortix-api — single tunnel for all channels
  const ngrokQuery = useNgrokStatus(TUNNEL_PORT);
  const ngrokStart = useNgrokStart();
  const [publicUrl, setPublicUrl] = useState('');
  const [showLocalDev, setShowLocalDev] = useState(false);
  const connectMutation = useTelegramConnect();

  // Auto-fill URL from ngrok detection
  useEffect(() => {
    if (ngrokQuery.data?.detected && ngrokQuery.data.url && !publicUrl) {
      setPublicUrl(ngrokQuery.data.url);
    }
  }, [ngrokQuery.data, publicUrl]);

  const ngrokInstalled = ngrokQuery.data?.ngrokInstalled ?? false;

  const fullWebhookUrl = publicUrl.trim()
    ? `${publicUrl.replace(/\/$/, '')}/webhooks/telegram`
    : null;

  const handleVerifyToken = async () => {
    if (!botToken.trim()) return;
    try {
      const result = await verifyMutation.mutateAsync({ botToken: botToken.trim() });
      if (!result.valid) {
        toast.error(result.error ?? 'Invalid bot token');
        return;
      }
      setBotUsername(result.bot?.username ?? '');
      setBotVerified(true);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify token');
    }
  };

  const handleStartNgrok = async () => {
    try {
      const result = await ngrokStart.mutateAsync({ port: TUNNEL_PORT });
      if (result.url) setPublicUrl(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start ngrok');
    }
  };

  const handleConnect = async () => {
    if (!publicUrl.trim()) return;
    try {
      await connectMutation.mutateAsync({
        botToken: botToken.trim(),
        publicUrl: publicUrl.trim(),
        botUsername: botUsername || undefined,
      });
      toast.success('Telegram bot connected!');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect bot');
    }
  };

  return (
    <div>
      <StepIndicator current={step} />

      {/* Step 1: Bot Token */}
      {step === 1 && (
        <div className="space-y-4 px-6 pb-6">
          <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium">Create a Telegram bot:</p>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>
                Open Telegram and message{' '}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-0.5 text-foreground"
                >
                  @BotFather
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                Send <span className="font-mono font-medium text-foreground">/newbot</span> and follow the prompts
              </li>
              <li>Copy the bot token it gives you and paste it below</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tg-bot-token">Bot Token</Label>
            <Input
              id="tg-bot-token"
              type="password"
              value={botToken}
              onChange={(e) => {
                setBotToken(e.target.value);
                setBotVerified(false);
              }}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyToken();
              }}
            />
          </div>

          {botVerified && (
            <div className="rounded-xl border p-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15">
                  <Check className="h-3 w-3 text-emerald-600" />
                </div>
                <span className="text-emerald-600 font-medium">
                  Verified: @{botUsername}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center gap-2 pt-2">
            <Button variant="outline" onClick={onBack} className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleVerifyToken}
              disabled={!botToken.trim() || verifyMutation.isPending}
              className="rounded-xl"
            >
              {verifyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify & Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Webhook URL + Connect */}
      {step === 2 && (
        <div className="space-y-4 px-6 pb-6">
          <p className="text-sm text-muted-foreground">
            Enter the public URL where Telegram will send webhook events.
            This should point to <span className="font-mono font-medium text-foreground">kortix-api</span> (port {TUNNEL_PORT}).
          </p>

          {/* URL input — the primary element */}
          <div className="space-y-2">
            <Label htmlFor="tg-public-url">Public URL</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="tg-public-url"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                placeholder="https://yourdomain.com"
                className="pl-9 rounded-xl focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Webhook:{' '}
              <span className="font-mono">
                {fullWebhookUrl ?? '...'}
              </span>
            </p>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 rounded-xl border p-3 bg-muted/30">
            <Shield className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              The webhook URL is public, but a random secret token is generated and shared with Telegram.
              Only requests with the matching <span className="font-mono">X-Telegram-Bot-Api-Secret-Token</span> header are accepted.
            </p>
          </div>

          {/* Local dev helper — collapsed by default */}
          <button
            onClick={() => setShowLocalDev(!showLocalDev)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <Terminal className="h-3 w-3" />
            <span>Local development (ngrok)</span>
            {showLocalDev ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
          </button>

          {showLocalDev && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3 text-xs">
              <p className="text-muted-foreground">
                If you&apos;re running locally and your machine isn&apos;t publicly reachable,
                use <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" className="underline text-foreground">ngrok</a> to
                create a tunnel to your sandbox.
              </p>

              {/* Detection status */}
              <div className="rounded-lg border p-2.5">
                {ngrokQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Detecting tunnel...</span>
                  </div>
                ) : ngrokQuery.data?.detected ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15">
                      <Check className="h-2.5 w-2.5 text-emerald-600" />
                    </div>
                    <span className="text-emerald-600 font-medium">Tunnel detected</span>
                    {ngrokQuery.data.portMatches === false && (
                      <span className="text-amber-600 ml-1">
                        (port {ngrokQuery.data.forwardPort} — expected {TUNNEL_PORT})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/15">
                        <AlertCircle className="h-2.5 w-2.5 text-amber-600" />
                      </div>
                      <span className="text-amber-600 font-medium">No tunnel running</span>
                    </div>
                    {ngrokInstalled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartNgrok}
                        disabled={ngrokStart.isPending}
                        className="rounded-lg text-[11px] h-6 px-2"
                      >
                        {ngrokStart.isPending ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Start on port {TUNNEL_PORT}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-muted-foreground">
                <p className="font-medium text-foreground">Manual setup:</p>
                <pre className="bg-background rounded-lg p-2 font-mono text-[11px] overflow-x-auto">
                  ngrok http {TUNNEL_PORT}
                </pre>
                <p>
                  Port <span className="font-mono text-foreground">{TUNNEL_PORT}</span> is
                  kortix-api, which proxies to your sandbox.
                  On a VPS you&apos;d use a reverse proxy (nginx, caddy) pointing to this port instead.
                </p>
              </div>
            </div>
          )}

          {/* Verified bot badge */}
          <div className="rounded-xl border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15">
                <Check className="h-3 w-3 text-emerald-600" />
              </div>
              <span className="font-medium">@{botUsername}</span>
              <span className="text-muted-foreground text-xs">verified</span>
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleConnect}
              disabled={!publicUrl.trim() || connectMutation.isPending}
              className="rounded-xl"
            >
              {connectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect Bot
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
