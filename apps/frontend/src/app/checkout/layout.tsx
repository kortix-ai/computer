import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Checkout | Kortix' },
  description:
    'Complete your secure Kortix checkout and subscription setup.',
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
