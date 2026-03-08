import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Kortix for Mobile' },
  description:
    'Download the Kortix mobile app for iOS or Android and take your AI worker with you.',
}

export default function AppDownloadPage() {
  return <PageClient />;
}
