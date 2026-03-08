import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Reset Password | Kortix' },
  description:
    'Create a new password for your Kortix account using your reset link.',
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
