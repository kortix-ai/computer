'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { isMobileDevice } from '@/lib/utils/is-mobile-device';
import { Check, Copy, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GithubButton } from './github-button';

const INSTALL_CMD = 'curl -fsSL https://get.kortix.ai/install | bash';

export function HeroSection() {
  const [isMobileDetected, setIsMobileDetected] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsMobileDetected(isMobileDevice());
  }, []);

  const ctaLink = isMobileDetected ? '/app' : '/auth';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <section id="hero" className="w-full relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
      </div>

      <div className="relative z-[1] max-w-4xl mx-auto px-6 pt-32 sm:pt-40 md:pt-48 pb-20 sm:pb-28 md:pb-36">
        {/* Pill badge */}
        <div className="flex justify-center mb-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Open Source &middot; Apache 2.0
          </div>
        </div>

        {/* Main headline */}
        <div className="text-center animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-medium tracking-tighter text-foreground leading-[0.95]">
            The AI Computer.
          </h1>
        </div>

        {/* Subtitle */}
        <p className="mt-6 sm:mt-8 text-center text-lg sm:text-xl text-muted-foreground/80 max-w-2xl mx-auto leading-relaxed animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
          One machine. Your entire business context.
          <br className="hidden sm:block" />
          Agents that work while you sleep.
        </p>

        {/* Secondary description */}
        <p className="mt-4 text-center text-sm sm:text-base text-muted-foreground/60 max-w-xl mx-auto animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
          Install Kortix on any machine. Connect your data. Deploy agents. They run 24/7.
        </p>

        {/* Install command */}
        <div className="mt-10 sm:mt-12 w-full max-w-lg mx-auto animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
          <button
            onClick={handleCopy}
            className="group w-full flex items-center gap-3 rounded-2xl border border-border bg-background/80 backdrop-blur-sm px-5 py-3.5 text-left transition-colors hover:bg-accent/50 cursor-pointer"
          >
            <span className="text-muted-foreground/50 text-sm select-none font-mono">$</span>
            <code className="flex-1 text-sm font-mono text-foreground truncate">
              {INSTALL_CMD}
            </code>
            <span className="shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
              {copied ? (
                <Check className="size-4 text-green-500" />
              ) : (
                <Copy className="size-4" />
              )}
            </span>
          </button>
        </div>

        {/* CTAs */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-[400ms] fill-mode-both">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link
              href={ctaLink}
              onClick={() => trackCtaSignup()}
            >
              Get Started Free
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <GithubButton />
        </div>

        {/* Trust signals */}
        <p className="mt-8 text-center text-xs text-muted-foreground/50 animate-in fade-in-0 duration-500 delay-500 fill-mode-both">
          Self-Host or Cloud &middot; Full SSH Access &middot; You Own Everything
        </p>
      </div>
    </section>
  );
}
