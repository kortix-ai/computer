import type { Metadata } from 'next';
import { Suspense } from 'react';
import LegalPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Legal',
  description: 'Kortix legal information and policies.',
};

export default function LegalPage() {
  return <Suspense><LegalPageClient /></Suspense>;
}
