import type { Metadata } from 'next';
import SetupPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Setup',
  description: 'Set up your Kortix workspace.',
};

export default function SetupPage() {
  return <SetupPageClient />;
}
