import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'System Status | Kortix' },
  description:
    'Check the real-time operational status of Kortix services.',
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
