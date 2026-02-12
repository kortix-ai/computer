'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DynamicGreeting } from '@/components/ui/dynamic-greeting';
import { trackCtaSignup } from '@/lib/analytics/gtm';

export function HeroSection() {
  const t = useTranslations('dashboard');

  return (
    <section id="hero" className="w-full h-dvh relative overflow-hidden">
      <div className="flex flex-col h-full w-full overflow-hidden relative">
        {/* Brandmark Background */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <img
            src="/kortix-brandmark-bg.svg"
            alt=""
            className="absolute left-1/2 -translate-x-1/2 top-[-10%] sm:top-1/2 sm:-translate-y-1/2 w-[140vw] min-w-[700px] h-auto sm:w-[160vw] sm:min-w-[1000px] md:min-w-[1200px] lg:w-[162vw] lg:min-w-[1620px] object-contain select-none invert dark:invert-0"
            draggable={false}
          />
        </div>

        {/* Centered content */}
        <div className="flex-1 flex flex-col relative z-[1]">
          <div className="absolute inset-0 flex items-center justify-center px-4 pb-28 sm:pb-0 pointer-events-none">
            <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center pointer-events-auto">
              {/* Greeting */}
              <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
                <DynamicGreeting className="text-2xl sm:text-3xl md:text-4xl font-medium text-foreground tracking-tight" />
              </div>

              {/* Subtitle */}
              <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground/70 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
                {t('modeSubtitle')}
              </p>

              {/* CTA */}
              <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
                <Link
                  href="/auth"
                  onClick={() => trackCtaSignup()}
                  className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-all"
                >
                  Get Started
                </Link>
                <a
                  href="https://github.com/kortix-ai/suna"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-input bg-background px-8 py-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-all"
                >
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
