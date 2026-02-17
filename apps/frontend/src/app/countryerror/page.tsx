import type { Metadata } from 'next';
import CountryErrorClient from './page-client';

export const metadata: Metadata = {
  title: 'Region Unavailable',
  description: 'Kortix is currently unavailable in your country.',
};

export default function CountryErrorPage() {
  return <CountryErrorClient />;
}
