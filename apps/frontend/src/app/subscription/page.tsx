import type { Metadata } from 'next';
import SubscriptionRequiredPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Subscription',
  description: 'Manage your Kortix subscription and billing.',
};

export default function SubscriptionRequiredPage() {
  return <SubscriptionRequiredPageClient />;
}
