'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      router.replace('/dashboard');
    } else {
      router.replace('/auth');
    }
  }, [user, isLoading, router]);

  // Show nothing while redirecting
  return (
    <div className="h-dvh flex items-center justify-center bg-background">
      <div className="size-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
    </div>
  );
}
