import type { Metadata } from 'next';
import MilanoPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Milano',
  description: 'Kortix in Milano.',
};

export default function MilanoPage() {
  return <MilanoPageClient />;
}
