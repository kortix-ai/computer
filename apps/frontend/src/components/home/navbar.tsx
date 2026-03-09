'use client';

import { ThemeToggle } from '@/components/home/theme-toggle';
import { siteConfig } from '@/lib/site-config';
import { cn } from '@/lib/utils';
import { X, Menu } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { useTranslations } from 'next-intl';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { AppDownloadQR } from '@/components/common/app-download-qr';
import { isMobileDevice } from '@/lib/utils/is-mobile-device';
import { Button } from '@/components/ui/button';
import { useGitHubStars } from '@/hooks/utils/use-github-stars';

// Apple logo SVG
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

// Play icon SVG
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 406 455" fill="currentColor">
      <path d="M382.634 187.308C413.301 205.014 413.301 249.277 382.634 266.983L69.0001 448.06C38.3334 465.765 3.84111e-05 443.633 3.9959e-05 408.222L5.57892e-05 46.0689C5.73371e-05 10.6581 38.3334 -11.4738 69.0001 6.23166L382.634 187.308Z"/>
    </svg>
  );
}

// macOS-style power button
function PowerButton({ href, onClick, label = 'Launch Kortix' }: { href?: string; onClick?: () => void; label?: string }) {
  const [hovered, setHovered] = useState(false);

  const inner = (
    <span
      className={cn(
        "relative flex items-center justify-center size-[34px] rounded-full border transition-all duration-200 cursor-pointer select-none",
        "border-foreground/20 bg-background/60",
        hovered
          ? "border-foreground/50 shadow-[0_0_0_3px_hsl(var(--foreground)/0.08),0_0_12px_hsl(var(--foreground)/0.12)]"
          : "shadow-none"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Power icon */}
      <svg
        viewBox="0 0 24 24"
        className={cn("size-[15px] transition-colors duration-200", hovered ? "text-foreground" : "text-foreground/50")}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        {/* Arc */}
        <path d="M7.19 5.54A8 8 0 1 0 16.83 5.5" />
        {/* Vertical stem */}
        <line x1="12" y1="2" x2="12" y2="12" />
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.span
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-foreground/70 bg-background border border-border/60 rounded-md px-2 py-0.5 pointer-events-none z-50 shadow-sm"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} suppressHydrationWarning>
        {inner}
      </Link>
    );
  }
  return <button onClick={onClick}>{inner}</button>;
}

// Scroll threshold with hysteresis to prevent flickering
const SCROLL_THRESHOLD_DOWN = 50;
const SCROLL_THRESHOLD_UP = 20;

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const drawerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.2,
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

const drawerMenuContainerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const drawerMenuVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut" as const,
    },
  },
};

interface NavbarProps {
  isAbsolute?: boolean;
}

export function Navbar({ isAbsolute = false }: NavbarProps) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('common');
  const lastScrollY = useRef(0);

  const filteredNavLinks = siteConfig.nav.links;
  const { formattedStars, loading: starsLoading } = useGitHubStars('kortix-ai', 'kortix');

  // Detect if user is on an actual mobile device (iOS/Android)
  // Mobile users clicking "Try Free" will be redirected to /app which then redirects to app stores
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // Get the appropriate CTA link based on device type
  const ctaLink = isMobile ? '/app' : '/auth';

  // Single unified scroll handler with hysteresis
  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    
    // Hysteresis: different thresholds for scrolling up vs down
    if (!hasScrolled && currentScrollY > SCROLL_THRESHOLD_DOWN) {
      setHasScrolled(true);
    } else if (hasScrolled && currentScrollY < SCROLL_THRESHOLD_UP) {
      setHasScrolled(false);
    }

    // Update active section
    const sections = filteredNavLinks.map((item) => item.href.substring(1));
    for (const section of sections) {
      const element = document.getElementById(section);
      if (element) {
        const rect = element.getBoundingClientRect();
        if (rect.top <= 150 && rect.bottom >= 150) {
          setActiveSection(section);
          break;
        }
      }
    }

    lastScrollY.current = currentScrollY;
  }, [hasScrolled, filteredNavLinks]);

  useEffect(() => {
    // Use passive listener for better scroll performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const toggleDrawer = () => setIsDrawerOpen((prev) => !prev);
  const handleOverlayClick = () => setIsDrawerOpen(false);

  return (
    <header className={cn(
      "w-full px-5 pt-4 transition-all duration-300",
      isAbsolute ? "" : "sticky top-0 z-50",
      hasScrolled && !isAbsolute && "bg-background/80 backdrop-blur-xl border-b border-border/40 pb-2"
    )}>
      <div className="grid grid-cols-3 items-center h-[52px]">
        {/* Left — Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <KortixLogo size={18} variant='logomark' />
          </Link>
        </div>

        {/* Center — Nav Links */}
        <nav className="hidden md:flex items-center justify-center gap-1">
          {filteredNavLinks.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                pathname === item.href
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.name}
            </Link>
          ))}

          {/* Mobile App Download with QR Popover — commented out for now
          <div className="relative group">
            <Link
              href="/app"
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                pathname === '/app'
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mobile
            </Link>
            
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="relative bg-[#E8E8E8] dark:bg-[#1a1a1a] rounded-2xl border border-border/60 dark:border-[#2a2a2a] p-4 min-w-[200px]">
                <AppDownloadQR size={160} logoSize={24} className="rounded-xl p-3 shadow-md" />
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Scan to download
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <AppleLogo className="h-3 w-3 text-muted-foreground/60" />
                  <PlayIcon className="h-2.5 w-2.5 text-muted-foreground/60" />
                </div>
              </div>
            </div>
          </div>
          */}
        </nav>

        {/* Right — Actions */}
        <div className="flex items-center justify-end gap-3">
          {/* GitHub stars */}
          <a
            href="https://github.com/kortix-ai/suna"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span className={cn("font-medium tabular-nums", starsLoading && "opacity-50")}>
              {formattedStars}
            </span>
          </a>

          {user ? (
            <Link 
              href="/dashboard"
              className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium text-primary-foreground bg-primary rounded-full hover:bg-primary/90 transition-colors shadow-sm"
            >
              Dashboard
            </Link>
          ) : (
            <button
              onClick={() => {
                trackCtaSignup();
                // If on homepage, trigger launch modal? 
                // Since this component doesn't know about launch modal state, we'll just link to auth for now
                // or replicate the launch modal trigger logic if we lift state up.
                // For simplicity/robustness, linking to /auth or respecting the ctaLink logic:
                router.push(ctaLink);
              }}
              className="inline-flex items-center justify-center h-9 px-5 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-full hover:opacity-90 transition-opacity shadow-sm"
            >
              Launch Kortix
            </button>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={toggleDrawer}
            className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer - Full Screen */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
            className="fixed inset-0 bg-background z-50 flex flex-col pt-4"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={drawerVariants}
          >
            {/* Header - matches navbar positioning */}
            <div className="flex h-[56px] items-center justify-between px-6 py-2">
              <Link href="/" className="flex items-center gap-3" onClick={() => setIsDrawerOpen(false)}>
                <KortixLogo size={18} variant='logomark' />
              </Link>
              <button
                onClick={toggleDrawer}
                className="border border-border rounded-lg p-2 cursor-pointer hover:bg-accent transition-colors"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Navigation Links - Big Typography, Left Aligned */}
            <motion.nav
              className="flex-1 px-6 pt-8"
              variants={drawerMenuContainerVariants}
            >
              <ul className="flex flex-col gap-1">
                {filteredNavLinks.map((item) => (
                  <motion.li
                    key={item.id}
                    variants={drawerMenuVariants}
                  >
                    <a
                      href={item.href}
                      onClick={(e) => {
                        if (!item.href.startsWith('#')) {
                          setIsDrawerOpen(false);
                          return;
                        }
                        e.preventDefault();
                        if (pathname !== '/') {
                          router.push(`/${item.href}`);
                          setIsDrawerOpen(false);
                          return;
                        }
                        const element = document.getElementById(item.href.substring(1));
                        element?.scrollIntoView({ behavior: 'smooth' });
                        setIsDrawerOpen(false);
                      }}
                      className={`block py-3 text-4xl font-medium tracking-tight transition-colors ${
                        (item.href.startsWith('#') && pathname === '/' && activeSection === item.href.substring(1)) || (item.href === pathname)
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {item.name}
                    </a>
                  </motion.li>
                ))}
                {/* Mobile App Link — commented out for now
                <motion.li variants={drawerMenuVariants}>
                  <Link
                    href="/app"
                    onClick={() => setIsDrawerOpen(false)}
                    className={`block py-3 text-4xl font-medium tracking-tight transition-colors ${
                      pathname === '/app'
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Mobile
                  </Link>
                </motion.li>
                */}
              </ul>
            </motion.nav>

            {/* Footer Actions */}
            <div className="px-6 pb-8 mt-auto">
              <motion.div 
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
              >
                {user ? (
                  <Button asChild size="lg" className="w-full h-14 text-lg">
                    <Link
                      href="/dashboard"
                      onClick={() => setIsDrawerOpen(false)}
                    >
                      Dashboard
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" className="w-full h-14 text-lg">
                    <Link
                      href={ctaLink}
                      onClick={() => {
                        trackCtaSignup();
                        setIsDrawerOpen(false);
                      }}
                      suppressHydrationWarning
                    >
                      {t('tryFree')}
                    </Link>
                  </Button>
                )}
                
                {/* Theme Toggle */}
                <div className="flex items-center justify-between">
                  <ThemeToggle />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

