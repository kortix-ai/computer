import type { Metadata } from 'next';
import DesignEngineerPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Design Engineer',
  description: 'Design Engineer position at Kortix.',
};

export default function DesignEngineerPage() {
  return <DesignEngineerPageClient />;
}
