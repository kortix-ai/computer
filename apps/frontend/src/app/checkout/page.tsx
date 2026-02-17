import type { Metadata } from 'next';
import { Suspense } from 'react';
import CheckoutPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your Kortix purchase.',
};

export default function CheckoutPage() {
  return <Suspense><CheckoutPageClient /></Suspense>;
}
