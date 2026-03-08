import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LLM Providers | Kortix',
  description: 'Connect and manage LLM providers for your sandbox',
};

export default async function ProvidersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
