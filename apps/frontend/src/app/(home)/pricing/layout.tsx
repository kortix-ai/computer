import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Pricing | Kortix' },
  description:
    'Compare Kortix plans and choose the option that fits your workflow.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
