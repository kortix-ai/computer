import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'About Kortix' },
  description:
    'Learn what Kortix is building and how the team thinks about autonomous AI systems.',
};

export default function AboutPage() {
  return <PageClient />;
}
