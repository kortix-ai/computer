import { Suspense } from 'react';
import type { Metadata } from 'next';

import PageClient from './page-client';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: { absolute: 'Legal Information | Kortix' },
  description:
    'Read the Kortix terms of service, privacy policy, and company imprint.',
}

export default async function LegalPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialTab = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab;

  return (
    <Suspense fallback={null}>
      <PageClient initialTab={initialTab} />
    </Suspense>
  );
}
