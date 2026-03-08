import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Infrastructure / SRE Engineer',
  description:
    'Help keep Kortix infrastructure fast, reliable, and ready to scale.',
};

const responsibilities = [
  "Build and maintain infrastructure on AWS ECS and related services",
  "Manage and optimize Supabase (PostgreSQL) for performance and reliability",
  "Design and implement CI/CD pipelines with GitHub Actions for fast deployments",
  "Set up monitoring, alerting, and observability across all services",
  "Optimize application and infrastructure performance for scale",
  "Ensure system reliability with a target of 99.99% uptime",
  "Review code for scalability and performance issues",
  "Automate infrastructure provisioning and management",
  "Respond to incidents and conduct post-mortems to prevent recurrence",
];

const qualifications = [
  "Strong experience with AWS ECS and container orchestration",
  "Proficient with Supabase or PostgreSQL performance tuning and optimization",
  "Experience building and maintaining CI/CD pipelines with GitHub Actions",
  "Solid understanding of containerization with Docker",
  "Experience with monitoring and observability tools (Datadog, Prometheus, Grafana, CloudWatch)",
  "Comfortable debugging production issues under pressure",
  "Strong scripting skills (Python, Bash, or similar)",
];

const bonuses = [
  "Experience scaling ECS services to handle high traffic",
  "Background in security best practices and compliance",
  "Experience with AWS cost optimization",
  "Deep knowledge of PostgreSQL and Redis optimization",
  "Experience with infrastructure-as-code (Terraform, CloudFormation)",
  "Open source contributions to infrastructure tools",
];

export default function SREEngineerPage() {
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
        <p className="text-sm text-muted-foreground/70 mb-3">Infrastructure · Remote</p>
        <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground mb-6">
          Infrastructure / SRE Engineer
        </h1>
        <p className="text-sm text-muted-foreground/70 leading-relaxed mb-16">
          Make sure everything scales and stays rock solid. Own our
          infrastructure, optimize our systems, keep us at 99.99% uptime.
        </p>

        {/* ── About the Role ── */}
        <div className="mb-12">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
            About the Role
          </h2>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3">
            We{"'"}re building AI agents that handle real work at scale. We need
            someone to make sure our infrastructure can keep up as we grow.
          </p>
          <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3">
            You{"'"}ll work across the stack — from optimizing application code to
            architecting our AWS infrastructure. CI/CD, monitoring, alerting,
            observability — you{"'"}ll own it all. When something breaks, you{"'"}ll
            be the one who figures out why and makes sure it doesn{"'"}t happen again.
          </p>
          <p className="text-sm text-muted-foreground/70 leading-relaxed">
            Small team, big impact. Significant ownership over how we scale.
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
            <a href="mailto:marko@kortix.com?subject=Infrastructure / SRE Engineer Application">
              Apply now
              <ArrowRight className="ml-1.5 size-3.5" />
            </a>
          </Button>
        </div>

      </div>
    </main>
  );
}
