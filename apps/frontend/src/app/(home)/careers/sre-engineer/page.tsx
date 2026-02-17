import type { Metadata } from 'next';
import SREEngineerPageClient from './page-client';

export const metadata: Metadata = {
  title: 'SRE Engineer',
  description: 'SRE Engineer position at Kortix.',
};

export default function SREEngineerPage() {
  return <SREEngineerPageClient />;
}
