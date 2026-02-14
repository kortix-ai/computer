import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agents | OpenCode',
  description: 'Manage your OpenCode agents',
  openGraph: {
    title: 'Agents | OpenCode',
    description: 'Manage your OpenCode agents',
    type: 'website',
  },
};

export default async function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
