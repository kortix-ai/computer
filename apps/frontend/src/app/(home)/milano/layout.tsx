import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Kortix Milano' },
  description:
    'Meet Kortix in Milano - an autonomous AI worker built for complex tasks.',
};

export default function MilanoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
