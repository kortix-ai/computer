import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { trackCtaSignup } from "@/lib/analytics/gtm";
import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { GithubButton } from "./github-button";

const INSTALL_CMD = 'curl -fsSL https://kortix.com/install | bash';

export function CtaSection({ onLaunch }: { onLaunch: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <section className="relative w-full py-32 overflow-hidden">
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-foreground mb-6">
          Ready to launch your computer?
        </h2>
        <p className="text-lg text-muted-foreground/70 leading-relaxed mb-10 max-w-2xl mx-auto">
          Join thousands of engineers running autonomous agents on their own infrastructure. Open source, self-hosted, and free forever.
        </p>
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <Button
              size="lg"
              className="h-12 px-8 text-base rounded-full transition-all w-full sm:w-auto"
              onClick={() => {
                trackCtaSignup();
                onLaunch();
              }}
            >
              Get Started Now
              <ArrowRight className="ml-2 size-4" />
            </Button>
            <GithubButton size="lg" className="h-12" />
          </div>
          <div className="flex items-center gap-4 w-full max-w-xs mx-auto">
            <div className="h-px bg-border/30 flex-1" />
            <span className="text-xs text-muted-foreground/40 uppercase tracking-widest">-- or install on your machine</span>
            <div className="h-px bg-border/30 flex-1" />
          </div>
          <div className="w-full max-w-lg mx-auto">
            <button
              onClick={handleCopy}
              className="group w-full flex items-center gap-3 rounded-2xl border border-border/50 bg-card/30 px-5 py-3.5 text-left transition-colors hover:bg-muted/20 cursor-pointer"
            >
              <span className="text-muted-foreground/40 text-sm select-none font-mono">$</span>
              <code className="flex-1 text-sm font-mono text-foreground/80 truncate">
                {INSTALL_CMD}
              </code>
              <span className="shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors">
                {copied ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
