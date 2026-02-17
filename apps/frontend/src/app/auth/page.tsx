import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginClient from './page-client';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Kortix account.',
};

export default function Login() {
  return <Suspense><LoginClient /></Suspense>;
}
