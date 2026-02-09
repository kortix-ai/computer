'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy agents page - redirects to dashboard.
 * Agent configuration is now handled via the sidebar Agents tab
 * and the /agents/config/[agentId] route (OpenCode agents).
 */
export default function AgentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}
