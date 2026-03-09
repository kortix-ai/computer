import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Start Your Trial | Kortix' },
  description:
    'Start your Kortix free trial and unlock access to your AI workspace.',
};

export default function ActivateTrialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
