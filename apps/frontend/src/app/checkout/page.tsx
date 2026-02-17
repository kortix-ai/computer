import type { Metadata } from 'next';
import CheckoutPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your Kortix purchase.',
};

export default function CheckoutPage() {
  return <CheckoutPageClient />;
}
