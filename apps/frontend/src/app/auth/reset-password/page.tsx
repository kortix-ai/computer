import { Suspense } from 'react';
import type { Metadata } from 'next';

import PageClient from './page-client';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: { absolute: 'Reset Password | Kortix' },
  description:
    'Create a new password for your Kortix account using your reset link.',
}

export default async function ResetPassword({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const code = Array.isArray(resolvedSearchParams.code)
    ? resolvedSearchParams.code[0]
    : resolvedSearchParams.code;

  return (
    <Suspense fallback={null}>
      <PageClient code={code} />
    </Suspense>
  );
}
