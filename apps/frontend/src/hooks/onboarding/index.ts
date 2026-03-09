'use client';

import { useCallback, useState } from 'react';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
  canSkip?: boolean;
  actionLabel?: string;
}

export function useOnboarding() {
  const [isOpen, setIsOpen] = useState(false);

  const completeOnboarding = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    completeOnboarding,
  };
}
