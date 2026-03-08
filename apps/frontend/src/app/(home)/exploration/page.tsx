import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Exploration | Kortix' },
  description:
    'Explore positioning, architecture studies, and homepage concepts for Kortix.',
}

export default function ExplorationPage() {
  return <PageClient />;
}
