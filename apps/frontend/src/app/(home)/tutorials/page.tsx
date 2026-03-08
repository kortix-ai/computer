import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Tutorials | Kortix' },
  description:
    'Learn how to use Kortix with interactive step-by-step tutorials and product walkthroughs.',
}

export default function TutorialsPage() {
  return <PageClient />;
}
