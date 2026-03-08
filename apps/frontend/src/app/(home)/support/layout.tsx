import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Support | Kortix' },
  description:
    'Get help with Kortix, browse FAQs, and contact the support team.',
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
