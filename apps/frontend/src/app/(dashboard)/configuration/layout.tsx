import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Configuration | Kortix',
  description: 'OpenCode configuration settings',
};

export default function ConfigurationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
