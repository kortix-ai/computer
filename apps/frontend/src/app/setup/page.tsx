import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Set Up Kortix',
  description: 'Open Kortix setup and finish connecting your account.',
};

/**
 * /setup — redirects to /dashboard.
 * Setup is now an overlay inside the dashboard layout (SetupOverlay).
 * This page exists only so that the installer's auto-open URL still works.
 */
export default function SetupPage() {
  redirect('/dashboard');
}
