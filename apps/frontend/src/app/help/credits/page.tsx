import type { Metadata } from 'next';
import CreditsPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Credits',
  description: 'Understand how Kortix credits work.',
};

export default function CreditsPage() {
  return <CreditsPageClient />;
}
