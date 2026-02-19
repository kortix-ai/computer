'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { isMobileDevice } from '@/lib/utils/is-mobile-device';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';

const ROTATING_WORDS = [
  'AI Computer',
  'AI OS',
  'AI Workforce',
  'AGI Box',
];

const INSTALL_CMD = 'curl -fsSL https://get.kortix.ai/install | bash';

function useRotatingWord(words: string[], intervalMs = 2800) {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length);
        setIsVisible(true);
      }, 250);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [words.length, intervalMs]);

  return { word: words[index], isVisible };
}

export function HeroSection() {
  const { word, isVisible } = useRotatingWord(ROTATING_WORDS);
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
    <section id="hero" className="w-full h-dvh relative overflow-hidden">
      <div className="flex flex-col h-full w-full overflow-hidden relative">
        {/* Wallpaper Background */}
        <WallpaperBackground />

        {/* Centered content */}
        <div className="flex-1 flex flex-col relative z-[1]">
          <div className="absolute inset-0 flex items-center justify-center px-4 pb-28 sm:pb-0 pointer-events-none">
            <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center pointer-events-auto">
              {/* Headline */}
              <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tighter text-foreground leading-[0.95]">
                  Your{' '}
                  <span
                    className={`inline-block transition-opacity duration-250 ease-out ${
                      isVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {word}
                  </span>
                </h1>
              </div>

              {/* Subtitle */}
              <p className="mt-3 sm:mt-4 text-sm sm:text-base text-muted-foreground/70 max-w-xl animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
                Run AI Workers 24/7 on your own cloud computer.
                <br className="hidden sm:block" />
                The operating system built for AI.
              </p>

              {/* Install command */}
              <div className="mt-8 sm:mt-10 w-full max-w-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
                <button
                  onClick={handleCopy}
                  className="group w-full flex items-center gap-3 rounded-2xl border border-border bg-background/80 backdrop-blur-sm px-4 py-3 text-left transition-colors hover:bg-accent/50 cursor-pointer"
                >
                  <span className="text-muted-foreground/50 text-sm select-none">$</span>
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

              {/* CTA */}
              <div className="mt-4 flex flex-col sm:flex-row gap-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
                <Button asChild>
                  <Link
                    href={ctaLink}
                    onClick={() => trackCtaSignup()}
                  >
                    Launch Your Kortix
                  </Link>
                </Button>
              </div>

              {/* Trust signal */}
              <p className="mt-6 text-xs text-muted-foreground/50 animate-in fade-in-0 duration-500 delay-300 fill-mode-both">
                Open Source &middot; Self-Hosted &middot; Cloud &middot; No Vendor Lock-in
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
