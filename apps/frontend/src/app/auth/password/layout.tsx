import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Password Sign In | Kortix' },
  description:
    'Sign in to Kortix with your email and password, or create a new account.',
};

export default function PasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
