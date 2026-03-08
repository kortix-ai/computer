import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Tutorials | Kortix' },
  description:
    'Learn how to use Kortix with interactive step-by-step tutorials and product walkthroughs.',
};

export default function TutorialsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
