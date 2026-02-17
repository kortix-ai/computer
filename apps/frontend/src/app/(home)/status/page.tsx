import type { Metadata } from 'next';
import StatusPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Kortix service status.',
};

export default function StatusPage() {
  return <StatusPageClient />;
}
