import type { Metadata } from 'next';
import PasswordAuthClient from './page-client';

export const metadata: Metadata = {
  title: 'Set Password',
  description: 'Set your Kortix account password.',
};

export default function PasswordAuth() {
  return <PasswordAuthClient />;
}
