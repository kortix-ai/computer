import type { Metadata } from 'next';

import PageClient from './page-client';

export const metadata: Metadata = {
  title: { absolute: 'Setting Up Your Account | Kortix' },
  description:
    'Finish setting up your Kortix account, workspace, and billing configuration.',
}

export default function SettingUpPage() {
  return <PageClient />;
}
