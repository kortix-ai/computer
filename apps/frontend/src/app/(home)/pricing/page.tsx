import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Pricing | Kortix' },
  description:
    'Compare Kortix plans and choose the option that fits your workflow.',
}

export default function PricingPage() {
  return <PageClient />;
}
