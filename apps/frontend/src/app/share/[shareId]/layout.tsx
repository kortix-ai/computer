import { Metadata } from 'next';

export async function generateMetadata({ params }): Promise<Metadata> {
  const { shareId } = await params;
  return {
    title: 'Shared Session | Kortix',
    description: 'View this shared session on Kortix',
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_URL || 'https://www.kortix.com'}/share/${shareId}`,
    },
    openGraph: {
      title: 'Shared Session | Kortix',
      description: 'View this shared session on Kortix',
      images: [`${process.env.NEXT_PUBLIC_URL || 'https://www.kortix.com'}/share-page/og-fallback.png`],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Shared Session | Kortix',
      description: 'View this shared session on Kortix',
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
