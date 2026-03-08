import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Choose a Plan | Kortix' },
  description:
    'Select a Kortix subscription plan to continue using your AI workspace.',
}

export default function SubscriptionRequiredPage() {
  return <PageClient />;
}
