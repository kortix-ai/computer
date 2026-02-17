import type { Metadata } from 'next';
import BerlinPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Berlin',
  description: 'Kortix in Berlin.',
};

export default function BerlinPage() {
  return <BerlinPageClient />;
}
