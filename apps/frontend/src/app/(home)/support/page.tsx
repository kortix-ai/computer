import type { Metadata } from 'next';
import { Suspense } from 'react';
import SupportPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get support for Kortix.',
};

export default function SupportPage() {
  return <Suspense><SupportPageClient /></Suspense>;
}
