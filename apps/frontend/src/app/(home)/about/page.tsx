import type { Metadata } from 'next';
import AboutPageClient from './page-client';

export const metadata: Metadata = {
  title: 'About',
  description: 'About Kortix and our mission.',
};

export default function AboutPage() {
  return <AboutPageClient />;
}
