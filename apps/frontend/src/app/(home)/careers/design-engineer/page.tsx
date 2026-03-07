'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const responsibilities = [
  "Own features end-to-end: design, build, ship, iterate",
  "Shape the UX/UI across the entire product",
  "Build new features and experiences from scratch",
  "Create polished interfaces with animations and interactions",
  "Work closely with the team to define what we build next",
];

const qualifications = [
  "Strong frontend skills with React and TypeScript",
  "Good understanding of CSS, including Tailwind and animations",
  "You care how things look and notice small details",
  "Portfolio showing both technical and design work",
  "Experience shipping polished interfaces",
];

const bonuses = [
  "Experience with Framer Motion or similar animation libraries",
  "Background in graphic design or typography",
  "Experience building or contributing to design systems",
  "Worked on products with real-time or complex interactions",
];

export default function DesignEngineerPage() {
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
        <p className="text-sm text-muted-foreground/70 mb-3">Product + Design · Remote</p>
        <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground mb-6">
          Product / Design Engineer
        </h1>
        <p className="text-sm text-muted-foreground/70 leading-relaxed mb-16">
          Own UX/UI and build new features end-to-end. Design it, build it,
          ship it, iterate on it.
        </p>

        {/* ── About the Role ── */}
        <div className="mb-12">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            About the Role
          </h2>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3">
            We need someone who can own features fully — from figuring out what
            to build, to designing it, to shipping it, to making it better.
          </p>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3">
            You{"'"}ll shape how people interact with our AI agents. The chat
            experience, dashboards, new features — you{"'"}ll have real influence
            over what we build and how it works.
          </p>
          <p className="text-sm text-muted-foreground/70 leading-relaxed">
            Small team, big impact. Move fast, ship often, iterate based on
            what you learn.
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
            Send us your resume and portfolio. Include any projects that show
            your work.
          </p>
          <Button asChild variant="outline" className="h-10 px-5 text-sm rounded-lg shadow-none">
            <a href="mailto:marko@kortix.com?subject=Design Engineer Application">
              Apply now
              <ArrowRight className="ml-1.5 size-3.5" />
            </a>
          </Button>
        </div>

      </div>
    </main>
  );
}
