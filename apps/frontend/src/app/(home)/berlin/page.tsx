import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Kortix Berlin' },
  description:
    'Meet Kortix in Berlin - an autonomous AI worker built for complex tasks.',
}

export default function BerlinPage() {
  return <PageClient />;
}
