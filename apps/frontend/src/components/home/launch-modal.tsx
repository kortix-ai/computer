'use client';

import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { X, Check, Terminal, Copy } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { trackCtaSignup } from '@/lib/analytics/gtm';

interface LaunchModalProps {
  open: boolean;
  onClose: () => void;
}

const INCLUDED = [
  '24/7 always-on AI Computer',
  'Full SSH & root access',
  'LLM compute credits included',
  'Multi-model router — use any model',
  'Persistent memory & filesystem',
  'Unlimited agents & workflows',
  'Auto backups & monitoring',
  'OpenCode engine & MCP ecosystem',
];

export function LaunchModal({ open, onClose }: LaunchModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <LazyMotion features={domAnimation}>
          {/* Backdrop */}
          <m.div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal */}
          <m.div
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <m.div
              className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-background rounded-2xl border border-border"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-2 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <X className="size-4" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2">
                {/* ── Left: Product visual ── */}
                <div className="flex flex-col items-center justify-center p-8 sm:p-10 md:p-12 bg-muted/20 md:rounded-l-2xl md:border-r border-border/50">
                  <div className="relative w-full max-w-[320px]">
                    <Image
                      src="/kortixbox.png"
                      alt="Kortix Computer"
                      width={320}
                      height={320}
                      sizes="(max-width: 768px) 100vw, 320px"
                      className="w-full h-auto object-contain select-none"
                      draggable={false}
                    />
                  </div>
                  {/* Price anchored beneath the image */}
                  <div className="mt-6 text-center">
                    <div className="flex items-baseline justify-center gap-1.5">
                      <span className="text-4xl font-medium tracking-tight text-foreground">$49</span>
                      <span className="text-sm text-muted-foreground/50">/month</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/40 mt-1">
                      Starting price. Scale compute &amp; credits as you grow.
                    </p>
                  </div>
                </div>

                {/* ── Right: Product details ── */}
                <div className="p-6 sm:p-8 md:p-10 flex flex-col">
                  {/* Breadcrumb-style label */}
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground/40 mb-3">
                    Kortix Cloud
                  </span>

                  {/* Product name */}
                  <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mb-1">
                    Kortix Computer
                  </h2>
                  <p className="text-sm text-muted-foreground/60 mb-6">
                    Your 24/7 AI machine, managed by us.
                  </p>

                  {/* Divider */}
                  <div className="border-t border-border/50 mb-6" />

                  {/* What's included */}
                  <h3 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-3">
                    Included
                  </h3>
                  <ul className="space-y-2.5 mb-8">
                    {INCLUDED.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Check className="size-3.5 text-foreground/40 mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground/70">{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="mt-auto space-y-4">
                    <Button
                      asChild
                      size="lg"
                      className="w-full h-12 text-sm rounded-xl shadow-none"
                      onClick={() => trackCtaSignup()}
                    >
                      <Link href="/auth">
                        Get Your Kortix
                      </Link>
                    </Button>
                    <p className="text-[11px] text-center text-muted-foreground/30">
                      Free to try &middot; No commitment &middot; Cancel anytime
                    </p>

                    {/* Self-host divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t border-border/50" />
                      <span className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">or self-host</span>
                      <div className="flex-1 border-t border-border/50" />
                    </div>

                    {/* Install command */}
                    <SelfHostInstall />
                  </div>
                </div>
              </div>
            </m.div>
          </m.div>
        </LazyMotion>
      )}
    </AnimatePresence>
  );
}

const INSTALL_CMD = 'curl -fsSL https://get.kortix.ai/install | bash';

function SelfHostInstall() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground/40">
        Install on your own machine, VPS, or bare metal server.
      </p>
      <button
        onClick={handleCopy}
        className="group w-full flex items-center gap-2 h-10 px-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
      >
        <Terminal className="size-3.5 text-muted-foreground/40 shrink-0" />
        <code className="text-xs font-mono text-muted-foreground/60 truncate flex-1 text-left">
          {INSTALL_CMD}
        </code>
        {copied ? (
          <Check className="size-3.5 text-green-500 shrink-0" />
        ) : (
          <Copy className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
        )}
      </button>
    </div>
  );
}
