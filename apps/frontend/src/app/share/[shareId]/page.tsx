import type { Metadata } from 'next';
import SharePageClient from './page-client';

export const metadata: Metadata = {
  title: 'Shared Page',
  description: 'View a shared Kortix page.',
};

export default function SharePage() {
  return <SharePageClient />;
}
