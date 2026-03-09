import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Work at Kortix',
  description:
    'Explore open roles at Kortix and learn what it is like to build with us.',
};

const openings = [
  {
    title: "AI Engineer",
    location: "Remote",
    description: "Work on our AI agents — make them reliable, fast, and actually useful. LLM experience required.",
    href: "/careers/ai-engineer",
  },
  {
    title: "Product / Design Engineer",
    location: "Remote",
    description: "Own UX/UI end-to-end. Design it, ship it, iterate on it.",
    href: "/careers/design-engineer",
  },
];

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <div className="max-w-2xl mx-auto px-6 pt-24 sm:pt-32 pb-10 sm:pb-12">
        <p className="text-sm text-muted-foreground/70 mb-4">We{"'"}re hiring</p>
        <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground mb-6">
          Work at Kortix
        </h1>
        <p className="text-sm text-muted-foreground/70 leading-relaxed max-w-lg">
          Small team, high intensity, real ownership. If you{"'"}re good at what
          you do, we{"'"}d like to talk.
        </p>
      </div>

      {/* Content — matches homepage editorial style */}
      <div className="max-w-2xl mx-auto px-6 pb-24 sm:pb-32">

        {/* ── The Mantra ── */}
        <div className="mb-16 flex justify-center">
          <Image
            src="/images/careers/shackleton.png"
            alt="Men wanted for hazardous journey, small wages, bitter cold, long months of complete darkness, constant danger, safe return doubtful, honor and recognition in case of success. — Ernest Shackleton"
            width={380}
            height={253}
            className="rounded-md opacity-80"
            priority
          />
        </div>

        {/* ── Open Positions ── */}
        <div className="mb-16">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            Open Positions
          </h2>
          <div className="divide-y divide-border/50">
            {openings.map((job) => (
              <Link
                key={job.title}
                href={job.href}
                className="group flex items-start justify-between gap-4 py-5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:underline underline-offset-4 transition-colors">
                    {job.title}
                  </p>
                  <p className="text-sm text-muted-foreground/70 leading-relaxed mt-1">
                    {job.description}
                  </p>
                  <p className="text-xs text-muted-foreground/40 mt-1.5">
                    {job.location}
                  </p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground/30 group-hover:text-foreground shrink-0 mt-0.5 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* ── Don't See Your Role? ── */}
        <div className="mb-16">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            Don{"'"}t See Your Role?
          </h2>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
            We{"'"}re always looking for exceptional people. If you{"'"}re passionate
            about AI and want to build with us, reach out.
          </p>
          <Button asChild variant="outline" className="h-10 px-5 text-sm rounded-lg shadow-none">
            <a href="mailto:marko@kortix.com">
              Get in touch
              <ArrowRight className="ml-1.5 size-3.5" />
            </a>
          </Button>
        </div>

        {/* ── Closing ── */}
        <p className="text-sm text-muted-foreground/40 text-center">
          Honor and recognition in case of success.
        </p>
      </div>

    </main>
  );
}
