'use client';

import { use } from 'react';
import { SessionChat } from '@/components/session/session-chat';

export default function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return <SessionChat sessionId={sessionId} />;
}
