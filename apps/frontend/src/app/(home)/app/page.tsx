import type { Metadata } from 'next';
import AppDownloadPageClient from './page-client';

export const metadata: Metadata = {
  title: 'App',
  description: 'Download the Kortix app.',
};

export default function AppDownloadPage() {
  return <AppDownloadPageClient />;
}
