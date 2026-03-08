import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AuthPageClient } from './page-client';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Sign In | Kortix',
};

export default async function AuthPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const readParam = (key: string) =>
    Array.isArray(resolvedSearchParams[key])
      ? resolvedSearchParams[key]?.[0]
      : resolvedSearchParams[key];

  return (
    <Suspense fallback={null}>
      <AuthPageClient
        mode={readParam('mode')}
        returnUrl={readParam('returnUrl') ?? readParam('redirect')}
        message={readParam('message')}
        isExpired={readParam('expired') === 'true'}
        expiredEmail={readParam('email') ?? ''}
        referralCodeParam={readParam('ref') ?? ''}
        redirectParam={readParam('redirect')}
      />
    </Suspense>
  );
}
