'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { BackgroundAALChecker } from '@/components/auth/background-aal-checker';
import { HeroSection } from '@/components/home/hero-section';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // Authenticated users skip the landing page entirely.
  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading || user) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="size-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BackgroundAALChecker>
      <div className="h-dvh">
        <HeroSection />
      </div>
    </BackgroundAALChecker>
  );
}
