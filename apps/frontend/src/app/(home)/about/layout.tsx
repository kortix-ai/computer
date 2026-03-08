import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'About Kortix' },
  description:
    'Learn what Kortix is building and how the team thinks about autonomous AI systems.',
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
