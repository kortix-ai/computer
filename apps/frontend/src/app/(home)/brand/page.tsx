'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Download, Check, Copy, X, ArrowDown, ArrowRight, Mail, Search, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Toggle } from '@/components/ui/toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/* ─────────────────────── Data ─────────────────────── */

const BRAND_COLORS = [
  { name: 'Black', hex: '#000000', oklch: 'oklch(0 0 0)', light: false },
  { name: 'Off-Black', hex: '#1A1A1A', oklch: 'oklch(0.145 0 0)', light: false },
  { name: 'White', hex: '#FFFFFF', oklch: 'oklch(1 0 0)', light: true },
  { name: 'Off-White', hex: '#F5F5F5', oklch: 'oklch(0.965 0 0)', light: true },
] as const;

const ACCENT_COLORS = [
  { name: 'Teal', hex: '#22808D', oklch: 'oklch(0.52 0.115 195)', light: false },
  { name: 'Amber', hex: '#D4A017', oklch: 'oklch(0.55 0.145 84)', light: true },
  { name: 'Rose', hex: '#D14D72', oklch: 'oklch(0.55 0.19 360)', light: false },
  { name: 'Violet', hex: '#7C5CFC', oklch: 'oklch(0.52 0.20 292)', light: false },
  { name: 'Emerald', hex: '#2D9F6F', oklch: 'oklch(0.55 0.14 162)', light: false },
  { name: 'Neon', hex: '#E8E000', oklch: 'oklch(0.91 0.21 110)', light: true },
] as const;

const LOGO_ASSETS: readonly { id: string; label: string; variant: string; src: string; dark: boolean; invert: boolean; png?: boolean }[] = [
  { id: 'symbol-black', label: 'Symbol', variant: 'Black', src: '/kortix-symbol.svg', dark: false, invert: false },
  { id: 'symbol-white', label: 'Symbol', variant: 'White', src: '/kortix-symbol.svg', dark: true, invert: true },
  { id: 'logomark-black', label: 'Logomark', variant: 'Black', src: '/Logomark-Black.png', dark: false, invert: false, png: true },
  { id: 'logomark-white', label: 'Logomark', variant: 'White', src: '/logomark-white.svg', dark: true, invert: false },
  { id: 'lockup-black', label: 'Lockup', variant: 'Black', src: '/kortix-computer-black.svg', dark: false, invert: false },
  { id: 'lockup-white', label: 'Lockup', variant: 'White', src: '/kortix-computer-white.svg', dark: true, invert: false },
];

/* ─────────────────── Utilities ─────────────────── */

function Hex({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="inline-flex items-center gap-1.5 group cursor-pointer"
    >
      <span className="font-mono text-[11px] text-foreground/40 group-hover:text-foreground/60 transition-colors">
        {value}
      </span>
      {copied
        ? <Check className="size-2.5 text-emerald-500" />
        : <Copy className="size-2.5 text-foreground/20 group-hover:text-foreground/40 transition-colors" />}
    </button>
  );
}

function SectionLabel({ number }: { number: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase">{number}</span>
      <div className="h-px flex-1 bg-foreground/[0.06]" />
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-foreground/[0.04]">
      <span className="text-xs text-foreground/40">{label}</span>
      <span className="font-mono text-[11px] text-foreground/50">{value}</span>
    </div>
  );
}

/* ───────────────────── Page ───────────────────── */

export default function BrandPage() {
  return (
    <div className="min-h-screen">

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kortix-brandmark-bg.svg"
            alt=""
            aria-hidden="true"
            className="w-[140%] max-w-none h-auto opacity-[0.04] dark:opacity-[0.06] dark:invert"
          />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-32 pb-24 md:pt-44 md:pb-32">
          <p className="font-mono text-[10px] text-foreground/25 tracking-[0.25em] uppercase mb-8">
            Brand Guidelines
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-foreground mb-5">
            Kortix Identity
          </h1>
          <p className="text-base md:text-lg text-foreground/40 max-w-lg leading-relaxed">
            Logo assets, color palette, typography, components, and usage rules
            for representing Kortix consistently.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <a
              href="#logos"
              className="inline-flex items-center gap-2 h-9 px-5 bg-foreground text-background rounded-full text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <ArrowDown className="size-3" />
              Explore
            </a>
          </div>
        </div>
      </section>

      {/* Sticky nav — sits below navbar with breathing room */}
      <nav className="border-y border-foreground/[0.06] sticky top-[76px] z-40 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-6 overflow-x-auto scrollbar-hide py-3 text-xs">
            {[
              ['#logos', 'Logo'],
              ['#colors', 'Colors'],
              ['#typography', 'Typography'],
              ['#components', 'Components'],
              ['#radius', 'Radius & Spacing'],
              ['#clearspace', 'Clear Space'],
              ['#guidelines', 'Guidelines'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="text-foreground/30 hover:text-foreground/60 whitespace-nowrap transition-colors font-medium"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6">

        {/* ─── 01 Logo ─── */}
        <section id="logos" className="py-20 md:py-28">
          <SectionLabel number="01" />
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">Logo</h2>
          <p className="text-sm text-foreground/40 max-w-lg mb-12 leading-relaxed">
            Three forms — the symbol, the logomark, and the full lockup.
            Each available in black and white. Always use the provided files.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {LOGO_ASSETS.map((a) => (
              <div key={a.id} className="group relative">
                <div className={cn(
                  'aspect-[3/2] rounded-2xl flex items-center justify-center p-10 transition-all',
                  a.dark
                    ? 'bg-neutral-950 ring-1 ring-white/[0.06]'
                    : 'bg-white ring-1 ring-black/[0.06]'
                )}>
                  {a.png ? (
                    <Image src={a.src} alt={`Kortix ${a.label} ${a.variant}`} width={220} height={60}
                      className={cn('max-h-10 md:max-h-12 w-auto object-contain', a.invert && 'invert')} unoptimized />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.src} alt={`Kortix ${a.label} ${a.variant}`}
                      className={cn('max-h-10 md:max-h-12 w-auto object-contain', a.invert && 'invert')} />
                  )}
                  <a href={a.src} download
                    className="absolute inset-0 flex items-center justify-center rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity bg-black/[0.03] dark:bg-white/[0.03]">
                    <span className="flex items-center gap-1.5 text-[10px] font-medium bg-background ring-1 ring-border rounded-full px-3 py-1.5">
                      <Download className="size-2.5" /> Download
                    </span>
                  </a>
                </div>
                <div className="mt-2 flex items-baseline justify-between px-1">
                  <span className="text-xs font-medium text-foreground/60">{a.label}</span>
                  <span className="text-[10px] font-mono text-foreground/25">{a.variant}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Symbol deep dive */}
          <div className="mt-20 grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-base font-medium tracking-tight mb-3 text-foreground/80">The Symbol</h3>
              <p className="text-sm text-foreground/35 leading-relaxed mb-4">
                Derived from the letter K, the Kortix symbol abstracts connectivity
                and intelligence into a geometric mark. The interlocking shapes represent
                convergence — AI and human intent meeting.
              </p>
              <p className="text-sm text-foreground/35 leading-relaxed">
                Use it as a favicon, app icon, or whenever the full wordmark
                isn&apos;t practical. Never stretch, rotate, or recolor it.
              </p>
            </div>
            <div className="flex items-center justify-center bg-foreground/[0.03] rounded-2xl aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kortix-symbol.svg" alt="Kortix symbol" className="w-28 h-auto dark:invert" />
            </div>
          </div>
        </section>

        {/* ─── 02 Colors ─── */}
        <section id="colors" className="py-20 md:py-28 border-t border-foreground/[0.06]">
          <SectionLabel number="02" />
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">Colors</h2>
          <p className="text-sm text-foreground/40 max-w-lg mb-14 leading-relaxed">
            Black and white is the foundation. Each UI theme pairs the neutral base
            with exactly one accent color — used for primary actions, focus rings, and charts.
          </p>

          {/* Foundation */}
          <div className="mb-14">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-5">Foundation</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {BRAND_COLORS.map((c) => (
                <div key={c.hex}>
                  <div className={cn('aspect-[4/3] rounded-2xl', c.light ? 'ring-1 ring-black/[0.08]' : '')}
                    style={{ backgroundColor: c.hex }} />
                  <div className="mt-2.5 px-0.5 space-y-1">
                    <span className="text-xs font-medium text-foreground/60">{c.name}</span>
                    <div className="flex flex-col gap-0.5">
                      <Hex value={c.hex} />
                      <Hex value={c.oklch} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Accents */}
          <div className="mb-14">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-5">Theme Accents</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {ACCENT_COLORS.map((c) => (
                <div key={c.hex}>
                  <div className={cn('aspect-square rounded-2xl', c.light ? 'ring-1 ring-black/[0.06]' : '')}
                    style={{ backgroundColor: c.hex }} />
                  <div className="mt-2.5 px-0.5 space-y-1">
                    <span className="text-xs font-medium text-foreground/60">{c.name}</span>
                    <div><Hex value={c.hex} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Philosophy */}
          <div className="bg-foreground/[0.02] rounded-2xl p-6 md:p-8">
            <div className="grid md:grid-cols-3 gap-8 text-sm">
              {[
                ['Black & White', 'All backgrounds, surfaces, borders, and text use pure neutral values — zero color chroma.'],
                ['One Accent', 'Each theme applies exactly one accent color to primary actions, links, rings, and charts.'],
                ['OKLCH', 'Colors are defined in the perceptually uniform OKLCH space for consistent lightness across hues.'],
              ].map(([title, desc]) => (
                <div key={title}>
                  <p className="font-medium text-foreground/70 mb-1">{title}</p>
                  <p className="text-foreground/30 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 03 Typography ─── */}
        <section id="typography" className="py-20 md:py-28 border-t border-foreground/[0.06]">
          <SectionLabel number="03" />
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">Typography</h2>
          <p className="text-sm text-foreground/40 max-w-lg mb-14 leading-relaxed">
            Roobert — a geometric sans-serif. Clean proportions, modern feel.
            Roobert Mono for code and data. Font-medium (500) is the brand weight.
          </p>

          <div className="space-y-8 mb-14">
            {[
              { label: 'Medium', weight: '500', cls: 'font-medium' },
              { label: 'Regular', weight: '400', cls: 'font-normal' },
            ].map((s) => (
              <div key={s.label} className="border-b border-foreground/[0.06] pb-6">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-[10px] text-foreground/25 tracking-widest">{s.label}</span>
                  <span className="font-mono text-[10px] text-foreground/20">{s.weight}</span>
                </div>
                <p className={cn('text-3xl md:text-5xl tracking-tight text-foreground/80', s.cls)}>
                  Kortix Computer
                </p>
              </div>
            ))}
          </div>

          {/* Mono */}
          <div className="bg-neutral-950 text-neutral-100 rounded-2xl p-6 md:p-8 mb-14">
            <div className="flex items-baseline justify-between mb-4">
              <span className="font-mono text-[10px] text-neutral-500 tracking-widest">Roobert Mono</span>
            </div>
            <p className="font-mono text-xl md:text-3xl tracking-tight">const agent = new Kortix();</p>
            <p className="font-mono text-xs text-neutral-600 mt-5">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 !@#$%
            </p>
          </div>

          {/* Type scale */}
          <div>
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Scale</p>
            <div className="space-y-3">
              {[
                { label: 'Display', size: 'text-5xl md:text-7xl', px: '60–72' },
                { label: 'H1', size: 'text-4xl md:text-5xl', px: '36–48' },
                { label: 'H2', size: 'text-2xl md:text-3xl', px: '24–30' },
                { label: 'H3', size: 'text-xl', px: '20' },
                { label: 'Body', size: 'text-base', px: '16' },
                { label: 'Small', size: 'text-sm', px: '14' },
                { label: 'Caption', size: 'text-xs', px: '12' },
              ].map((item) => (
                <div key={item.label} className="flex items-baseline gap-4 border-b border-foreground/[0.04] pb-3">
                  <span className="font-mono text-[10px] text-foreground/20 w-14 shrink-0">{item.label}</span>
                  <span className={cn(item.size, 'font-medium tracking-tight text-foreground/70 truncate flex-1')}>Kortix</span>
                  <span className="font-mono text-[10px] text-foreground/15 shrink-0">{item.px}px</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 04 Components ─── */}
        <section id="components" className="py-20 md:py-28 border-t border-foreground/[0.06]">
          <SectionLabel number="04" />
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">Components</h2>
          <p className="text-sm text-foreground/40 max-w-lg mb-14 leading-relaxed">
            Live rendered components from the design system. All elements use the active
            theme&apos;s accent color for primary states.
          </p>

          {/* Buttons */}
          <div className="mb-16">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Buttons</p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Variants */}
              <div>
                <p className="text-xs text-foreground/40 mb-4">Variants</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Button variant="default" size="default">Primary</Button>
                    <span className="font-mono text-[10px] text-foreground/20">default</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="secondary" size="default">Secondary</Button>
                    <span className="font-mono text-[10px] text-foreground/20">secondary</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="default">Outline</Button>
                    <span className="font-mono text-[10px] text-foreground/20">outline</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="default">Ghost</Button>
                    <span className="font-mono text-[10px] text-foreground/20">ghost</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="destructive" size="default">Destructive</Button>
                    <span className="font-mono text-[10px] text-foreground/20">destructive</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="link" size="default">Link</Button>
                    <span className="font-mono text-[10px] text-foreground/20">link</span>
                  </div>
                </div>
              </div>

              {/* Sizes */}
              <div>
                <p className="text-xs text-foreground/40 mb-4">Sizes</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Button variant="default" size="sm">Small</Button>
                    <span className="font-mono text-[10px] text-foreground/20">sm · h-8</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="default" size="default">Default</Button>
                    <span className="font-mono text-[10px] text-foreground/20">default · h-9</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="default" size="lg">Large</Button>
                    <span className="font-mono text-[10px] text-foreground/20">lg · h-10</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="default" size="icon"><Search className="size-4" /></Button>
                    <span className="font-mono text-[10px] text-foreground/20">icon · 36×36</span>
                  </div>
                </div>

                <p className="text-xs text-foreground/40 mt-6 mb-4">With icons</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Button variant="default"><Mail className="size-4" /> Send Email</Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline"><ArrowRight className="size-4" /> Continue</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Button specs */}
            <div className="mt-8 bg-foreground/[0.02] rounded-2xl p-5 md:p-6">
              <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-4">Button Specs</p>
              <div className="grid md:grid-cols-2 gap-x-12">
                <SpecRow label="Border Radius" value="rounded-xl (12px)" />
                <SpecRow label="Font Weight" value="500 (medium)" />
                <SpecRow label="Font Size" value="14px (text-sm)" />
                <SpecRow label="Border Width (outline)" value="1.5px" />
                <SpecRow label="Default Height" value="36px (h-9)" />
                <SpecRow label="Focus Ring" value="3px ring-ring/50" />
              </div>
            </div>
          </div>

          {/* Inputs & Form Controls */}
          <div className="mb-16">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Form Controls</p>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-foreground/40 mb-1.5 block">Text Input</label>
                  <Input placeholder="Enter your email..." />
                </div>
                <div>
                  <label className="text-xs text-foreground/40 mb-1.5 block">With value</label>
                  <Input defaultValue="hello@kortix.ai" />
                </div>
                <div>
                  <label className="text-xs text-foreground/40 mb-1.5 block">Disabled</label>
                  <Input placeholder="Disabled input" disabled />
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <Switch id="switch-demo" />
                  <label htmlFor="switch-demo" className="text-sm text-foreground/60">Switch</label>
                  <span className="font-mono text-[10px] text-foreground/20 ml-auto">h-[1.15rem] w-8</span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="switch-on" defaultChecked />
                  <label htmlFor="switch-on" className="text-sm text-foreground/60">Switch (on)</label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox id="check-demo" />
                  <label htmlFor="check-demo" className="text-sm text-foreground/60">Checkbox</label>
                  <span className="font-mono text-[10px] text-foreground/20 ml-auto">16×16 rounded-2xl</span>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox id="check-on" defaultChecked />
                  <label htmlFor="check-on" className="text-sm text-foreground/60">Checkbox (checked)</label>
                </div>
                <div className="flex items-center gap-3">
                  <Toggle aria-label="Toggle bold">
                    <span className="text-sm">B</span>
                  </Toggle>
                  <span className="text-sm text-foreground/60">Toggle</span>
                  <span className="font-mono text-[10px] text-foreground/20 ml-auto">h-9 rounded-2xl</span>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-foreground/[0.02] rounded-2xl p-5 md:p-6">
              <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-4">Input Specs</p>
              <div className="grid md:grid-cols-2 gap-x-12">
                <SpecRow label="Height" value="44px (h-11)" />
                <SpecRow label="Border Radius" value="rounded-2xl (16px)" />
                <SpecRow label="Background" value="bg-card" />
                <SpecRow label="Focus Ring" value="2px ring-primary/50" />
                <SpecRow label="Font Weight" value="500 (medium)" />
                <SpecRow label="Font Size" value="14px (text-sm)" />
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="mb-16">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Badges</p>
            <div className="flex flex-wrap gap-3 mb-4">
              <Badge variant="default">Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="new">New</Badge>
              <Badge variant="beta">Beta</Badge>
              <Badge variant="highlight">Highlight</Badge>
            </div>
            <div className="bg-foreground/[0.02] rounded-2xl p-5 md:p-6">
              <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-4">Badge Specs</p>
              <div className="grid md:grid-cols-2 gap-x-12">
                <SpecRow label="Border Radius" value="rounded-2xl (16px)" />
                <SpecRow label="Padding" value="px-3 py-1.5" />
                <SpecRow label="Font Size" value="12px (text-xs)" />
                <SpecRow label="Font Weight" value="500 (medium)" />
              </div>
            </div>
          </div>

          {/* Cards */}
          <div className="mb-16">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Cards</p>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Default Card</CardTitle>
                  <CardDescription>Standard card with bg-card background and border.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground/40">Card content area with px-6 horizontal padding.</p>
                </CardContent>
              </Card>
              <Card variant="glass">
                <CardHeader>
                  <CardTitle>Glass Card</CardTitle>
                  <CardDescription>Translucent background with backdrop blur.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground/40">bg-background/40 backdrop-blur-xl</p>
                </CardContent>
              </Card>
            </div>
            <div className="mt-4 bg-foreground/[0.02] rounded-2xl p-5 md:p-6">
              <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-4">Card Specs</p>
              <div className="grid md:grid-cols-2 gap-x-12">
                <SpecRow label="Border Radius" value="rounded-2xl (16px)" />
                <SpecRow label="Padding" value="py-6, content px-6" />
                <SpecRow label="Gap" value="gap-6 (24px)" />
                <SpecRow label="Background" value="bg-card / bg-background/40" />
              </div>
            </div>
          </div>

          {/* Avatars */}
          <div className="mb-16">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Avatars</p>
            <div className="flex items-center gap-4 mb-4">
              <Avatar>
                <AvatarFallback>KX</AvatarFallback>
              </Avatar>
              <Avatar className="size-10">
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              <Avatar className="size-12">
                <AvatarFallback>MK</AvatarFallback>
              </Avatar>
              <span className="font-mono text-[10px] text-foreground/20 ml-2">size-8 (default) · rounded-full</span>
            </div>
          </div>

          {/* Sidebar pattern */}
          <div>
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Sidebar Pattern</p>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-sidebar rounded-2xl border border-sidebar-border p-2 space-y-0.5 max-w-[280px]">
                <div className="flex items-center gap-2 h-8 px-2 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground text-sm font-medium">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/kortix-symbol.svg" alt="" className="size-4 dark:invert" />
                  <span>Dashboard</span>
                </div>
                <div className="flex items-center gap-2 h-8 px-2 rounded-lg text-sidebar-foreground/60 text-sm hover:bg-sidebar-accent/50 transition-colors">
                  <Search className="size-4" />
                  <span>Search</span>
                </div>
                <div className="flex items-center gap-2 h-8 px-2 rounded-lg text-sidebar-foreground/60 text-sm hover:bg-sidebar-accent/50 transition-colors">
                  <Bell className="size-4" />
                  <span>Notifications</span>
                </div>
                <div className="flex items-center gap-2 h-8 px-2 rounded-lg text-sidebar-foreground/60 text-sm hover:bg-sidebar-accent/50 transition-colors">
                  <Mail className="size-4" />
                  <span>Messages</span>
                </div>
              </div>

              <div>
                <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-4">Sidebar Specs</p>
                <SpecRow label="Width" value="280px" />
                <SpecRow label="Item Height" value="32px (h-8)" />
                <SpecRow label="Item Radius" value="rounded-lg (10px)" />
                <SpecRow label="Item Padding" value="p-2" />
                <SpecRow label="Background" value="bg-sidebar" />
                <SpecRow label="Active State" value="bg-sidebar-accent, font-medium" />
                <SpecRow label="Icon Size" value="16×16 (size-4)" />
                <SpecRow label="Font Size" value="14px (text-sm)" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── 05 Radius & Spacing ─── */}
        <section id="radius" className="py-20 md:py-28 border-t border-foreground/[0.06]">
          <SectionLabel number="05" />
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">Radius &amp; Spacing</h2>
          <p className="text-sm text-foreground/40 max-w-lg mb-14 leading-relaxed">
            A consistent radius hierarchy creates visual harmony. The base radius is 0.625rem (10px).
          </p>

          {/* Radius scale visual */}
          <div className="mb-14">
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Radius Scale</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {[
                { label: 'sm', value: '6px', radius: '6px', usage: 'Small tags' },
                { label: 'md', value: '8px', radius: '8px', usage: 'Tooltips' },
                { label: 'lg', value: '10px', radius: '10px', usage: 'Sidebar items' },
                { label: 'xl', value: '14px', radius: '14px', usage: 'Buttons' },
                { label: '2xl', value: '16px', radius: '16px', usage: 'Cards, inputs' },
                { label: 'full', value: '9999px', radius: '9999px', usage: 'Pills, avatars' },
              ].map((r) => (
                <div key={r.label} className="text-center">
                  <div
                    className="aspect-square bg-foreground/[0.06] border border-foreground/[0.08] mb-3 flex items-center justify-center"
                    style={{ borderRadius: r.radius }}
                  >
                    <span className="font-mono text-[10px] text-foreground/30">{r.value}</span>
                  </div>
                  <p className="font-mono text-[11px] text-foreground/50">{r.label}</p>
                  <p className="text-[10px] text-foreground/25 mt-0.5">{r.usage}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Spacing */}
          <div>
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-6">Spacing System</p>
            <div className="bg-foreground/[0.02] rounded-2xl p-5 md:p-6">
              <div className="grid md:grid-cols-2 gap-x-12">
                <SpecRow label="Base unit" value="4px" />
                <SpecRow label="Component gap" value="gap-6 (24px)" />
                <SpecRow label="Section padding" value="py-20 md:py-28" />
                <SpecRow label="Content max-width" value="max-w-5xl (1024px)" />
                <SpecRow label="Card padding" value="px-6 (24px)" />
                <SpecRow label="Page gutter" value="px-6 (24px)" />
                <SpecRow label="Border width" value="1px default, 1.5px outline btns" />
                <SpecRow label="Sidebar width" value="280px" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── 06 Clear Space ─── */}
        <section id="clearspace" className="py-20 md:py-28 border-t border-foreground/[0.06]">
          <SectionLabel number="06" />
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">Clear Space &amp; Sizing</h2>
          <p className="text-sm text-foreground/40 max-w-lg mb-14 leading-relaxed">
            The minimum clear space equals the height of one K-bar in the symbol, applied on all sides.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-foreground/[0.02] rounded-2xl p-10 flex items-center justify-center">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/kortix-symbol.svg" alt="" className="h-16 w-auto dark:invert" />
                <div className="absolute -top-6 left-0 right-0 h-4 border-l border-r border-t border-dashed border-foreground/15" />
                <div className="absolute -bottom-6 left-0 right-0 h-4 border-l border-r border-b border-dashed border-foreground/15" />
                <div className="absolute top-0 bottom-0 -left-6 w-4 border-t border-b border-l border-dashed border-foreground/15" />
                <div className="absolute top-0 bottom-0 -right-6 w-4 border-t border-b border-r border-dashed border-foreground/15" />
              </div>
            </div>

            <div>
              <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-5">Minimum sizes</p>
              {[
                { ctx: 'Print', symbol: '12mm', logomark: '24mm' },
                { ctx: 'Digital', symbol: '24px', logomark: '80px' },
                { ctx: 'Favicon', symbol: '16px', logomark: '—' },
              ].map((r) => (
                <div key={r.ctx} className="flex items-center gap-4 py-3.5 border-b border-foreground/[0.05]">
                  <span className="text-sm font-medium text-foreground/50 w-16">{r.ctx}</span>
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-mono text-[9px] text-foreground/20 uppercase tracking-wider block mb-0.5">Symbol</span>
                      <span className="font-mono text-xs text-foreground/50">{r.symbol}</span>
                    </div>
                    <div>
                      <span className="font-mono text-[9px] text-foreground/20 uppercase tracking-wider block mb-0.5">Logomark</span>
                      <span className="font-mono text-xs text-foreground/50">{r.logomark}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 07 Guidelines ─── */}
        <section id="guidelines" className="py-20 md:py-28 border-t border-foreground/[0.06]">
          <SectionLabel number="07" />
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">Usage</h2>
          <p className="text-sm text-foreground/40 max-w-lg mb-14 leading-relaxed">
            Follow these rules to keep the Kortix brand consistent across all touchpoints.
          </p>

          <div className="grid md:grid-cols-2 gap-12 md:gap-20 mb-20">
            <div>
              <p className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 tracking-widest uppercase mb-5">Do</p>
              {[
                'Use the logo on solid black or white backgrounds',
                'Maintain minimum clear space on all sides',
                'Use the provided SVG/PNG files — don\'t recreate',
                'Black logo on light, white on dark',
                'Scale proportionally — never stretch',
                'Use font-medium (500) for headings, not bold',
                'Use opacity layering for text hierarchy',
              ].map((t) => (
                <div key={t} className="flex items-start gap-3 py-2.5 border-b border-foreground/[0.04]">
                  <span className="mt-0.5 flex items-center justify-center size-4 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Check className="size-2.5" />
                  </span>
                  <span className="text-sm text-foreground/50">{t}</span>
                </div>
              ))}
            </div>

            <div>
              <p className="font-mono text-[10px] text-red-600 dark:text-red-400 tracking-widest uppercase mb-5">Don&apos;t</p>
              {[
                'Rotate or skew the logo',
                'Change the logo proportions',
                'Add drop shadows or effects',
                'Place on busy or patterned backgrounds',
                'Use unapproved color combinations',
                'Use bold (700) for headings — it\'s not the brand',
                'Use colored/tinted backgrounds — keep them neutral',
              ].map((t) => (
                <div key={t} className="flex items-start gap-3 py-2.5 border-b border-foreground/[0.04]">
                  <span className="mt-0.5 flex items-center justify-center size-4 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
                    <X className="size-2.5" />
                  </span>
                  <span className="text-sm text-foreground/50">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual incorrect examples */}
          <div>
            <p className="font-mono text-[10px] text-foreground/25 tracking-widest uppercase mb-5">Incorrect Usage</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Don\'t rotate', transform: 'rotate(15deg)' },
                { label: 'Don\'t stretch', transform: 'scaleX(1.5)' },
                { label: 'Don\'t squish', transform: 'scaleY(0.6)' },
                { label: 'Don\'t add effects', filter: 'drop-shadow(4px 4px 8px rgba(0,0,0,0.5))' },
                { label: 'Don\'t skew', transform: 'skewX(-15deg)' },
                { label: 'Don\'t recolor', filter: 'hue-rotate(180deg) saturate(3)' },
              ].map((item) => (
                <div key={item.label}
                  className="relative aspect-[3/2] bg-foreground/[0.02] rounded-2xl flex items-center justify-center ring-1 ring-red-500/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/kortix-symbol.svg" alt={item.label} className="h-8 w-auto dark:invert"
                    style={{ transform: item.transform, filter: item.filter }} />
                  <span className="absolute top-2 right-2 flex items-center justify-center size-4 rounded-full bg-red-500/10 text-red-500">
                    <X className="size-2.5" />
                  </span>
                  <span className="absolute bottom-2.5 left-0 right-0 text-center font-mono text-[9px] text-foreground/25">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>


    </div>
  );
}
