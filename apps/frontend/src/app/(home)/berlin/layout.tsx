import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Kortix Berlin' },
  description:
    'Meet Kortix in Berlin - an autonomous AI worker built for complex tasks.',
};

export default function BerlinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
