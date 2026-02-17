import type { Metadata } from 'next';
import HelpCenterPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Get help with Kortix.',
};

export default function HelpCenterPage() {
  return <HelpCenterPageClient />;
}
