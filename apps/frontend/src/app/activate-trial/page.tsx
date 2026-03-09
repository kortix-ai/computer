import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Start Your Trial | Kortix' },
  description:
    'Start your Kortix free trial and unlock access to your AI workspace.',
}

export default function ActivateTrialPage() {
  return <PageClient />;
}
