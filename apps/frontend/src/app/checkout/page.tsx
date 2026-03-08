import { Suspense } from 'react';
import type { Metadata } from 'next';

import PageClient from './page-client';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: { absolute: 'Checkout | Kortix' },
  description:
    'Complete your secure Kortix checkout and subscription setup.',
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const clientSecret = Array.isArray(resolvedSearchParams.client_secret)
    ? resolvedSearchParams.client_secret[0]
    : resolvedSearchParams.client_secret;

  return (
    <Suspense fallback={null}>
      <PageClient clientSecret={clientSecret} />
    </Suspense>
  );
}
