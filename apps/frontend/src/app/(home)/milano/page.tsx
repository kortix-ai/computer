import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Kortix Milano' },
  description:
    'Meet Kortix in Milano - an autonomous AI worker built for complex tasks.',
}

export default function MilanoPage() {
  return <PageClient />;
}
