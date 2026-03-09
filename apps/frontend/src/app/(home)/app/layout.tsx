import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Kortix for Mobile' },
  description:
    'Download the Kortix mobile app for iOS or Android and take your AI worker with you.',
};

export default function AppDownloadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
