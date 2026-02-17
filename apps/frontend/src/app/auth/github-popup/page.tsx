import type { Metadata } from 'next';
import GitHubOAuthPopupClient from './page-client';

export const metadata: Metadata = {
  title: 'GitHub Authentication',
  description: 'Authenticate with GitHub.',
};

export default function GitHubOAuthPopup() {
  return <GitHubOAuthPopupClient />;
}
