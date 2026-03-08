import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Engineer',
  description:
    'Join Kortix to build reliable AI agents that complete real work end to end.',
};

const responsibilities = [
  "Build and maintain AI agents that handle real tasks end-to-end",
  "Work on prompt engineering, context management, and tool integrations",
  "Develop evaluation systems to track agent performance",
  "Debug agent failures and improve reliability",
  "Ship features alongside the product and design team",
  "Stay current with new models and techniques",
];

const qualifications = [
  "Experience building LLM-powered products or agents",
  "Solid understanding of prompting techniques and agent patterns",
  "Proficient in Python",
  "Experience shipping AI agents to production",
  "Comfortable debugging unpredictable AI behavior",
];

const bonuses = [
  "Experience with multi-agent systems or complex tool use",
  "Background in reinforcement learning or planning",
  "Open source contributions in AI",
  "Published writing or research on AI topics",
];

export default function AIEngineerPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 pt-24 sm:pt-32 pb-24 sm:pb-32">

        {/* Back */}
        <Link
          href="/careers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/60 hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft className="size-3.5" />
          All positions
        </Link>

        {/* Header */}
        <p className="text-sm text-muted-foreground/70 mb-3">Engineering · Remote</p>
        <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground mb-6">
          AI Engineer
        </h1>
        <p className="text-sm text-muted-foreground/70 leading-relaxed mb-16">
          Help us build AI agents that can complete real tasks. You{"'"}ll work on
          improving reliability, adding new capabilities, and shipping features.
        </p>

        {/* ── About the Role ── */}
        <div className="mb-12">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            About the Role
          </h2>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3">
            We{"'"}re building AI agents that handle real work from start to finish.
            Not just something that answers questions — agents that can actually
            get things done.
          </p>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3">
            You{"'"}ll spend most of your time improving our agents: better prompts,
            evaluation systems, debugging failures, trying new approaches when
            current ones hit limits.
          </p>
          <p className="text-sm text-muted-foreground/70 leading-relaxed">
            Small team, big impact. Significant ownership, direct product influence.
          </p>
        </div>

        {/* ── What You'll Do ── */}
        <div className="mb-12">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            What You{"'"}ll Do
          </h2>
          <ul className="space-y-2">
            {responsibilities.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30 mt-2 shrink-0" />
                <span className="text-sm text-muted-foreground/70 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── What We're Looking For ── */}
        <div className="mb-12">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            What We{"'"}re Looking For
          </h2>
          <ul className="space-y-2">
            {qualifications.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30 mt-2 shrink-0" />
                <span className="text-sm text-muted-foreground/70 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Bonus Points ── */}
        <div className="mb-16">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            Bonus Points
          </h2>
          <ul className="space-y-2">
            {bonuses.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30 mt-2 shrink-0" />
                <span className="text-sm text-muted-foreground/70 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Apply ── */}
        <div className="border-t border-border/50 pt-12">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            Apply
          </h2>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-6">
            Send us your resume and a short note about yourself. Include any
            relevant projects or work.
          </p>
          <Button asChild variant="outline" className="h-10 px-5 text-sm rounded-lg shadow-none">
            <a href="mailto:marko@kortix.com?subject=AI Engineer Application">
              Apply now
              <ArrowRight className="ml-1.5 size-3.5" />
            </a>
          </Button>
        </div>

      </div>
    </main>
  );
}
