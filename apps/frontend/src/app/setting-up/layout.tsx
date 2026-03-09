import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Setting Up Your Account | Kortix' },
  description:
    'Finish setting up your Kortix account, workspace, and billing configuration.',
};

export default function SettingUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
