import type { Metadata } from 'next';

import { HomePageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Kortix: The AI Computer',
};

export default function HomePage() {
  return <HomePageClient />;
}
