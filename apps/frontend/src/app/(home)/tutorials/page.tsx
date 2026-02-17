import type { Metadata } from 'next';
import TutorialsPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Tutorials',
  description: 'Learn how to use Kortix with step-by-step tutorials.',
};

export default function TutorialsPage() {
  return <TutorialsPageClient />;
}
