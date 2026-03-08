import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'GitHub Sign-In | Kortix' },
  description:
    'Complete GitHub authentication for your Kortix account.',
}

export default function GitHubOAuthPopup() {
  return <PageClient />;
}
