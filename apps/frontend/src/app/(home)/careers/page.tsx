import type { Metadata } from 'next';
import CareersPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Join the Kortix team.',
};

export default function CareersPage() {
  return <CareersPageClient />;
}
