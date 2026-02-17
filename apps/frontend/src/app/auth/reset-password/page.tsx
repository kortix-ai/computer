import type { Metadata } from 'next';
import ResetPasswordClient from './page-client';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Reset your Kortix account password.',
};

export default function ResetPassword() {
  return <ResetPasswordClient />;
}
