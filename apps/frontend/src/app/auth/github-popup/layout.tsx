import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'GitHub Sign-In | Kortix' },
  description:
    'Complete GitHub authentication for your Kortix account.',
};

export default function GitHubPopupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
