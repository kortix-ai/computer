'use client';

import { OpenCodeSessionList } from './opencode-session-list';

interface NavAgentsProps {
  projectId?: string | null;
}

export function NavAgents({ projectId }: NavAgentsProps = {}) {
  return <OpenCodeSessionList projectId={projectId} />;
}
