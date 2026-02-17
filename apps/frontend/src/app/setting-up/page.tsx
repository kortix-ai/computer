import type { Metadata } from 'next';
import SettingUpPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Setting Up',
  description: 'Configuring your Kortix workspace.',
};

export default function SettingUpPage() {
  return <SettingUpPageClient />;
}
