import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'System Status | Kortix' },
  description:
    'Check the real-time operational status of Kortix services.',
}

export default function StatusPage() {
  return <PageClient />;
}
