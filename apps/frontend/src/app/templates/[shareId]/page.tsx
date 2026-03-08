import type { Metadata } from 'next';

import { TemplateSharePageClient } from './page-client';

export const metadata: Metadata = {
  title: 'AI Worker Template | Kortix',
};

export default function TemplateSharePage() {
  return <TemplateSharePageClient />;
}
