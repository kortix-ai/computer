import type { Metadata } from 'next';
import TemplateSharePageClient from './page-client';

export const metadata: Metadata = {
  title: 'Template',
  description: 'View a Kortix template.',
};

export default function TemplateSharePage() {
  return <TemplateSharePageClient />;
}
