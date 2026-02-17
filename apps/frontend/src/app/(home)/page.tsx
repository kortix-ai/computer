import type { Metadata } from 'next';
import HomeClient from './page-client';

export const metadata: Metadata = {
  title: 'Kortix — Your Autonomous AI Worker',
  description: 'Built for complex tasks, designed for everything. The ultimate AI assistant that handles it all — from simple requests to mega-complex projects.',
};

export default function Home() {
  return <HomeClient />;
}
