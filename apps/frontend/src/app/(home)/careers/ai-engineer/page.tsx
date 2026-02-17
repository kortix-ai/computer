import type { Metadata } from 'next';
import AIEngineerPageClient from './page-client';

export const metadata: Metadata = {
  title: 'AI Engineer',
  description: 'AI Engineer position at Kortix.',
};

export default function AIEngineerPage() {
  return <AIEngineerPageClient />;
}
