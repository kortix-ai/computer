import { Suspense } from 'react';
import type { Metadata } from 'next';

import PageClient from './page-client';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: { absolute: 'Support | Kortix' },
  description:
    'Get help with Kortix, browse FAQs, and contact the support team.',
}

export default async function SupportPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const section = Array.isArray(resolvedSearchParams.section)
    ? resolvedSearchParams.section[0]
    : resolvedSearchParams.section;

  return (
    <Suspense fallback={null}>
      <PageClient section={section} />
    </Suspense>
  );
}
