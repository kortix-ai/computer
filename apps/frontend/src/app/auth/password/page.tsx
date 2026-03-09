import { Suspense } from 'react';
import type { Metadata } from 'next';

import PageClient from './page-client';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: { absolute: 'Password Sign In | Kortix' },
  description:
    'Sign in to Kortix with your email and password, or create a new account.',
}

export default async function PasswordAuth({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const returnUrl = Array.isArray(resolvedSearchParams.returnUrl)
    ? resolvedSearchParams.returnUrl[0]
    : Array.isArray(resolvedSearchParams.redirect)
      ? resolvedSearchParams.redirect[0]
      : (resolvedSearchParams.returnUrl ?? resolvedSearchParams.redirect);

  return (
    <Suspense fallback={null}>
      <PageClient returnUrl={returnUrl} />
    </Suspense>
  );
}
