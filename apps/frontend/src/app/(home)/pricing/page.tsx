import type { Metadata } from 'next';
import PricingPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Choose the right Kortix plan for you. From free to enterprise, find the plan that fits your needs.',
};

export default function PricingPage() {
  return <PricingPageClient />;
}
