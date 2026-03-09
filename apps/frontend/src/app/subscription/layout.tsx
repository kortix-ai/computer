import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Choose a Plan | Kortix' },
  description:
    'Select a Kortix subscription plan to continue using your AI workspace.',
};

export default function SubscriptionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
