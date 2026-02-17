import type { Metadata } from 'next';
import ActivateTrialPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Activate Trial',
  description: 'Start your free trial of Kortix.',
};

export default function ActivateTrialPage() {
  return <ActivateTrialPageClient />;
}
