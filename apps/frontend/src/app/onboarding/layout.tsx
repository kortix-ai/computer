import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Onboarding | Kortix' },
  description:
    'Set up your Kortix workspace and complete your first-run onboarding flow.',
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
