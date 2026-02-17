import type { Metadata } from 'next';
import SupportPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get support for Kortix.',
};

export default function SupportPage() {
  return <SupportPageClient />;
}
