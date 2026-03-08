import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Exploration | Kortix' },
  description:
    'Explore positioning, architecture studies, and homepage concepts for Kortix.',
};

export default function ExplorationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
