'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SimpleFooter } from '@/components/home/simple-footer';
import Cal, { getCalApi } from '@calcom/embed-react';
import { useTheme } from 'next-themes';
import {
  ChevronDown,
  Check,
  Pause,
  ShieldCheck,
  ArrowRight,
  Zap,
  ArrowDown,
  Workflow,
  Cable,
  Bot,
  Clock,
  MessageSquare,
  Users,
  Search,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Animation                                                          */
/* ------------------------------------------------------------------ */
const fade = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: i * 0.08,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */
const STRIPE_CHECKOUT_URL = '#pricing'; // TODO: replace with real Stripe payment link
const CAL_LINK = 'team/kortix/enterprise-demo';

const PLAN = {
  name: 'Monthly',
  price: '$4,995',
  period: '/mo',
  badge: 'PAUSE OR CANCEL ANYTIME',
  features: [
    'One request at a time',
    'Avg. 48-hour delivery',
    'Unlimited requests',
    'Custom integrations',
    'Dedicated engineer',
    'Direct Slack channel',
    'Workflow audits included',
    'Pause or cancel anytime',
  ],
};

/* ================================================================== */
/*  HERO                                                               */
/* ================================================================== */
function HeroSection() {
  return (
    <section className="w-full">
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-20 md:pt-28 md:pb-28">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="max-w-3xl"
        >
          <motion.div
            variants={fade}
            custom={0}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs font-medium text-muted-foreground mb-8"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Now accepting new clients
          </motion.div>

          <motion.h1
            variants={fade}
            custom={1}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-medium tracking-tighter leading-[1.05]"
          >
            We automate
            <br />
            your company.
          </motion.h1>

          <motion.p
            variants={fade}
            custom={2}
            className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed"
          >
            A subscription service for growing companies. We embed with your
            team, understand your workflows, and automate everything — so you
            can focus on what matters.
          </motion.p>

          <motion.p
            variants={fade}
            custom={3}
            className="mt-3 text-sm text-muted-foreground/60"
          >
            Pause or cancel anytime. No contracts.
          </motion.p>

          <motion.div
            variants={fade}
            custom={4}
            className="mt-10 flex flex-col sm:flex-row items-start gap-3"
          >
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 bg-foreground text-background font-medium text-sm px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              See plans &amp; pricing
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#book"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-3"
            >
              Book a 15-min intro call
              <ArrowDown className="w-3.5 h-3.5" />
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  LOGO BAR                                                           */
/* ================================================================== */
const clients = [
  'Y Combinator',
  'Sequoia',
  'a16z',
  'Accel',
  'Index Ventures',
  'Greylock',
  'Benchmark',
  'Lightspeed',
];

function LogoBar() {
  return (
    <section className="w-full border-y border-border/50 py-7">
      <p className="text-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/40 mb-5">
        Trusted by teams backed by
      </p>
      <div
        className="relative overflow-hidden"
        style={
          {
            maskImage:
              'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          } as React.CSSProperties
        }
      >
        <div
          className="flex overflow-hidden"
          style={
            {
              '--duration': '25s',
              '--gap': '3rem',
              gap: 'var(--gap)',
            } as React.CSSProperties
          }
        >
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="flex shrink-0 animate-marquee"
              style={{ gap: 'var(--gap)' } as React.CSSProperties}
              aria-hidden={copy === 1}
            >
              {clients.map((name) => (
                <span
                  key={`${copy}-${name}`}
                  className="text-sm font-semibold tracking-tight text-muted-foreground/25 whitespace-nowrap select-none"
                >
                  {name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  HOW IT WORKS                                                       */
/* ================================================================== */
function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      title: 'Subscribe',
      desc: 'Pick a plan. Submit unlimited automation requests through your dedicated Slack channel.',
      icon: <Zap className="w-4 h-4" />,
    },
    {
      num: '02',
      title: 'We audit',
      desc: 'We map your workflows, tools, and bottlenecks. We find the highest-leverage automation opportunities.',
      icon: <Search className="w-4 h-4" />,
    },
    {
      num: '03',
      title: 'We ship',
      desc: 'Custom automations delivered in ~48 hours. Fully tested, integrated, and monitored.',
      icon: <Workflow className="w-4 h-4" />,
    },
  ];

  return (
    <section className="w-full">
      <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
          className="mb-14"
        >
          <motion.p
            variants={fade}
            custom={0}
            className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/50 mb-4"
          >
            How it works
          </motion.p>
          <motion.h2
            variants={fade}
            custom={1}
            className="text-3xl md:text-4xl font-medium tracking-tighter"
          >
            Subscribe. We handle the rest.
          </motion.h2>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
        >
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              variants={fade}
              custom={i}
              className="bg-background p-8 md:p-10 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-foreground">
                  {step.icon}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                  Step {step.num}
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  SERVICE MARQUEE                                                    */
/* ================================================================== */
function ServiceMarquee() {
  const row1 = [
    'CRM Workflows',
    'Email Automation',
    'Data Pipelines',
    'Lead Scoring',
    'Invoice Processing',
    'API Integrations',
  ];
  const row2 = [
    'Slack Bots',
    'Report Generation',
    'Customer Onboarding',
    'Document Processing',
    'Sales Automation',
    'Support Tickets',
  ];
  const row3 = [
    'HR Workflows',
    'Inventory Management',
    'Social Media',
    'Payment Processing',
    'Contract Management',
    'Analytics Dashboards',
  ];

  return (
    <section className="w-full border-y border-border/50 py-6 space-y-1.5 overflow-hidden">
      <MarqueeRow items={row1} />
      <MarqueeRow items={row2} reverse />
      <MarqueeRow items={row3} />
    </section>
  );
}

function MarqueeRow({
  items,
  reverse = false,
}: {
  items: string[];
  reverse?: boolean;
}) {
  return (
    <div
      className="flex overflow-hidden gap-2 py-1"
      style={
        {
          maskImage:
            'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
          '--duration': '35s',
          '--gap': '0.5rem',
        } as React.CSSProperties
      }
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          className={`flex shrink-0 gap-2 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}
          style={{ gap: 'var(--gap)' } as React.CSSProperties}
          aria-hidden={copy === 1}
        >
          {items.map((item, i) => (
            <span
              key={`${copy}-${i}`}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground/50 whitespace-nowrap border border-border/50"
            >
              {item}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  BENEFITS                                                           */
/* ================================================================== */
function BenefitsSection() {
  const benefits = [
    {
      icon: <Workflow className="w-4 h-4" />,
      title: 'Unlimited requests',
      desc: 'Submit as many automation requests as you want. We work through them one by one.',
    },
    {
      icon: <Clock className="w-4 h-4" />,
      title: 'Avg. 48-hour delivery',
      desc: 'Most automations are built and deployed within two business days.',
    },
    {
      icon: <Bot className="w-4 h-4" />,
      title: 'Powered by AI agents',
      desc: 'We use Kortix AI agents to build, test, and deploy automations at superhuman speed.',
    },
    {
      icon: <Users className="w-4 h-4" />,
      title: 'Dedicated engineer',
      desc: 'A senior automation engineer assigned to your account. They learn your stack inside out.',
    },
    {
      icon: <Cable className="w-4 h-4" />,
      title: 'Custom integrations',
      desc: 'Slack, HubSpot, Salesforce, Notion, Airtable, APIs — we connect everything.',
    },
    {
      icon: <MessageSquare className="w-4 h-4" />,
      title: 'Direct Slack channel',
      desc: 'Real-time communication. No tickets, no waiting rooms. Just ping us.',
    },
    {
      icon: <Search className="w-4 h-4" />,
      title: 'Workflow audits',
      desc: 'We audit your operations and find the highest-leverage automation opportunities.',
    },
    {
      icon: <Pause className="w-4 h-4" />,
      title: 'Pause or cancel anytime',
      desc: 'No contracts. No commitments. Pause when you need to, cancel when you want.',
    },
  ];

  return (
    <section className="w-full">
      <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
          className="mb-14"
        >
          <motion.p
            variants={fade}
            custom={0}
            className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/50 mb-4"
          >
            What you get
          </motion.p>
          <motion.h2
            variants={fade}
            custom={1}
            className="text-3xl md:text-4xl font-medium tracking-tighter max-w-lg"
          >
            One subscription replaces your entire automation backlog.
          </motion.h2>
          <motion.p
            variants={fade}
            custom={2}
            className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed"
          >
            No more freelancer roulette. No more six-figure consulting
            engagements. One flat fee, one team, unlimited automation.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
        >
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              variants={fade}
              custom={i}
              className="bg-background p-6 space-y-3"
            >
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-foreground">
                {b.icon}
              </div>
              <h3 className="text-sm font-semibold tracking-tight">
                {b.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {b.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  SOCIAL PROOF                                                       */
/* ================================================================== */
function SocialProofSection() {
  return (
    <section className="w-full border-y border-border/50">
      <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border border-border"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.blockquote
            variants={fade}
            custom={0}
            className="bg-background p-8 md:p-10 space-y-6"
          >
            <p className="text-lg md:text-xl font-medium tracking-tight leading-snug text-balance">
              &ldquo;They automated in 2 weeks what our team couldn&apos;t
              build in 6 months. Genuinely feels like adding 3 engineers.&rdquo;
            </p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-foreground">
                H
              </div>
              <div>
                <p className="text-sm font-medium">Head of Operations</p>
                <p className="text-xs text-muted-foreground">
                  Series B SaaS Company
                </p>
              </div>
            </div>
          </motion.blockquote>

          <motion.blockquote
            variants={fade}
            custom={1}
            className="bg-background p-8 md:p-10 space-y-6"
          >
            <p className="text-lg md:text-xl font-medium tracking-tight leading-snug text-balance">
              &ldquo;Like having a senior engineer on retainer who actually
              ships. Every single week.&rdquo;
            </p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-foreground">
                C
              </div>
              <div>
                <p className="text-sm font-medium">CTO</p>
                <p className="text-xs text-muted-foreground">
                  YC-backed Startup
                </p>
              </div>
            </div>
          </motion.blockquote>
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  PRICING                                                            */
/* ================================================================== */
function PricingSection() {
  return (
    <section id="pricing" className="w-full scroll-mt-8">
      <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
          className="mb-14"
        >
          <motion.p
            variants={fade}
            custom={0}
            className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/50 mb-4"
          >
            Pricing
          </motion.p>
          <motion.h2
            variants={fade}
            custom={1}
            className="text-3xl md:text-4xl font-medium tracking-tighter"
          >
            Simple pricing. No surprises.
          </motion.h2>
        </motion.div>

        {/* Pricing card — full width, dark */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl bg-foreground text-background overflow-hidden"
        >
          <div className="p-8 md:p-12 lg:p-14">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10">
              {/* Left — price */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {PLAN.name}
                  </h3>
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] bg-background/10 px-2.5 py-1 rounded-full">
                    {PLAN.badge}
                  </span>
                </div>
                <div>
                  <span className="text-5xl md:text-6xl font-bold tracking-tighter">
                    {PLAN.price}
                  </span>
                  <span className="text-lg text-background/40 ml-1">
                    {PLAN.period}
                  </span>
                </div>
                <p className="text-sm text-background/50 max-w-xs leading-relaxed">
                  One flat fee. Unlimited automation requests. Dedicated
                  engineer. Cancel anytime.
                </p>
                <a
                  href={STRIPE_CHECKOUT_URL}
                  className="inline-flex items-center gap-2 bg-background text-foreground font-semibold text-sm px-8 py-3.5 rounded-xl hover:opacity-90 transition-opacity mt-2"
                >
                  Get started
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              {/* Right — features */}
              <div className="flex-1 max-w-md">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-background/30 mb-5">
                  Everything included
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {PLAN.features.map((f) => (
                    <div
                      key={f}
                      className="flex items-center gap-2.5 text-sm text-background/70"
                    >
                      <Check className="w-3.5 h-3.5 text-background/30 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Guarantee cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border border-border mt-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
        >
          <motion.div
            variants={fade}
            custom={0}
            className="bg-background p-6 md:p-8 flex items-start gap-4"
          >
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
              <Pause className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <h4 className="text-sm font-semibold tracking-tight">
                Pause anytime
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Need to slow down? Pause your subscription and pick back up
                when ready. Remaining days carry over.
              </p>
            </div>
          </motion.div>

          <motion.div
            variants={fade}
            custom={1}
            className="bg-background p-6 md:p-8 flex items-start gap-4"
          >
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <h4 className="text-sm font-semibold tracking-tight">
                Risk-free guarantee
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Not happy after the first week? Full refund, no questions
                asked.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  FAQ                                                                */
/* ================================================================== */
function FAQItem({
  q,
  a,
  index,
}: {
  q: string;
  a: string;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      variants={fade}
      custom={index}
      className="border-b border-border last:border-0"
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-5 text-left group cursor-pointer"
      >
        <span className="text-sm font-medium tracking-tight pr-4 group-hover:text-foreground transition-colors">
          {q}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${open ? 'max-h-96 pb-5' : 'max-h-0'}`}
      >
        <p className="text-sm text-muted-foreground leading-relaxed pr-8">
          {a}
        </p>
      </div>
    </motion.div>
  );
}

function FAQSection() {
  const faqs = [
    {
      q: 'How fast will I receive my automations?',
      a: "Most automations are delivered within 48 hours. More complex multi-system integrations may take 3-5 days. You'll always have visibility into progress via your dedicated Slack channel.",
    },
    {
      q: 'What kind of automations do you build?',
      a: 'Anything your business needs. CRM workflows, email sequences, data pipelines, API integrations, Slack bots, document processing, reporting dashboards, customer onboarding flows — you name it.',
    },
    {
      q: 'Do I need technical staff on my end?',
      a: 'No. We handle everything from architecture to deployment. You just tell us how your business operates and what you need automated.',
    },
    {
      q: 'How does the pause feature work?',
      a: "Billing cycles are 31 days. If you use 15 days and pause, you'll have 16 days remaining when you resume.",
    },
    {
      q: 'What tools and platforms do you integrate with?',
      a: 'Everything — Slack, HubSpot, Salesforce, Notion, Airtable, Google Workspace, Microsoft 365, custom APIs, databases, and more. If it has an API, we can connect it.',
    },
    {
      q: 'How do I submit automation requests?',
      a: "Through your dedicated Slack channel or project board. Submit as many as you want — we work through them one at a time.",
    },
    {
      q: "What if I'm not happy with the result?",
      a: "We revise until you're 100% satisfied. Unlimited revisions included.",
    },
    {
      q: 'How does onboarding work?',
      a: 'After subscribing, we schedule a 30-minute kickoff to understand your business and map your workflows. Most clients submit their first request within 24 hours.',
    },
    {
      q: 'Are there any refunds?',
      a: "If you're not satisfied within the first week, full refund. No questions asked.",
    },
    {
      q: 'Can I use this for just a month?',
      a: "Yes. No minimum commitment. Many clients start with one month and end up staying for years.",
    },
  ];

  return (
    <section className="w-full">
      <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16">
          {/* FAQ Column */}
          <div className="lg:col-span-3">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={stagger}
            >
              <motion.p
                variants={fade}
                custom={0}
                className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/50 mb-4"
              >
                FAQ
              </motion.p>
              <motion.h2
                variants={fade}
                custom={1}
                className="text-3xl md:text-4xl font-medium tracking-tighter mb-6"
              >
                Questions &amp; answers
              </motion.h2>
              <div className="rounded-2xl border border-border overflow-hidden bg-background px-6">
                {faqs.map((faq, i) => (
                  <FAQItem key={i} q={faq.q} a={faq.a} index={i + 2} />
                ))}
              </div>
            </motion.div>
          </div>

          {/* Sticky CTA */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 space-y-4">
              <div className="rounded-2xl bg-foreground text-background p-8 space-y-5">
                <h3 className="text-xl font-semibold tracking-tight leading-tight">
                  Not sure yet?
                  <br />
                  Talk to us.
                </h3>
                <p className="text-sm text-background/50 leading-relaxed">
                  15-minute call. No pitch, no pressure. We&apos;ll tell you
                  exactly what we&apos;d automate first.
                </p>
                <a
                  href="#book"
                  className="inline-flex items-center justify-center w-full bg-background text-foreground font-medium text-sm px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
                >
                  Book a call
                </a>
              </div>
              <div className="rounded-2xl border border-border p-6">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Prefer email?{' '}
                  <a
                    href="mailto:enterprise@kortix.ai"
                    className="text-foreground hover:underline underline-offset-2"
                  >
                    enterprise@kortix.ai
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  BOOK A CALL                                                        */
/* ================================================================== */
function BookCallSection() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    (async function () {
      const cal = await getCalApi({ namespace: 'automations-intro' });
      cal('ui', { hideEventTypeDetails: true, layout: 'month_view' });
    })();
  }, []);

  return (
    <section id="book" className="w-full border-t border-border scroll-mt-8">
      <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
          className="text-center space-y-3 mb-12"
        >
          <motion.h2
            variants={fade}
            custom={0}
            className="text-3xl md:text-4xl font-medium tracking-tighter"
          >
            Let&apos;s talk automation.
          </motion.h2>
          <motion.p
            variants={fade}
            custom={1}
            className="text-base text-muted-foreground max-w-lg mx-auto leading-relaxed"
          >
            15 minutes. We&apos;ll learn how your company operates and show you
            exactly what we&apos;d automate first.
          </motion.p>
        </motion.div>

        <div
          className="rounded-2xl border border-border overflow-hidden bg-background"
          style={{ minHeight: 500 }}
        >
          <Cal
            namespace="automations-intro"
            calLink={CAL_LINK}
            style={{ width: '100%', height: '100%', minHeight: 500 }}
            config={{
              layout: 'month_view',
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            }}
          />
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */
export default function EnterprisePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <HeroSection />
      <LogoBar />
      <HowItWorksSection />
      <ServiceMarquee />
      <BenefitsSection />
      <SocialProofSection />
      <PricingSection />
      <FAQSection />
      <BookCallSection />
      <SimpleFooter />
    </main>
  );
}
