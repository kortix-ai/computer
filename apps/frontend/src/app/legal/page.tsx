import type { Metadata } from 'next';
import LegalPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Legal',
  description: 'Kortix legal information and policies.',
};

export default function LegalPage() {
  return <LegalPageClient />;
}
