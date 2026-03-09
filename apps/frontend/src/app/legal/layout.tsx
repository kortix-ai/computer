import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Legal Information | Kortix' },
  description:
    'Read the Kortix terms of service, privacy policy, and company imprint.',
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
