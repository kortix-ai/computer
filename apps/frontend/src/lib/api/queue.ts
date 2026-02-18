/**
 * Message queue API client.
 *
 * Communicates with the backend's /v1/queue/* endpoints to persist
 * queued messages on the filesystem. All mutations are fire-and-forget
 * from the frontend's perspective — the Zustand store is the immediate
 * source of truth, and the backend is synced asynchronously.
 */

import { backendApi } from '../api-client';

export interface PersistedQueuedMessage {
  id: string;
  sessionId: string;
  text: string;
  timestamp: number;
}

/** Fetch all queued messages for a session from the backend. */
export async function fetchSessionQueue(sessionId: string): Promise<PersistedQueuedMessage[]> {
  const res = await backendApi.get<{ messages: PersistedQueuedMessage[] }>(
    `/queue/sessions/${encodeURIComponent(sessionId)}`,
    { showErrors: false },
  );
  return res.data?.messages ?? [];
}

/** Fetch all queued messages across all sessions. */
export async function fetchAllQueues(): Promise<PersistedQueuedMessage[]> {
  const res = await backendApi.get<{ messages: PersistedQueuedMessage[] }>(
    '/queue/all',
    { showErrors: false },
  );
  return res.data?.messages ?? [];
}

/** Persist a new queued message to the backend. */
export async function persistEnqueue(
  sessionId: string,
  text: string,
  id: string,
): Promise<void> {
  await backendApi.post(
    `/queue/sessions/${encodeURIComponent(sessionId)}`,
    { text, id },
    { showErrors: false },
  );
}

/** Remove a queued message from the backend. */
export async function persistRemove(messageId: string, sessionId?: string): Promise<void> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  await backendApi.delete(
    `/queue/messages/${encodeURIComponent(messageId)}${qs}`,
    { showErrors: false },
  );
}

/** Move a message up in the backend queue. */
export async function persistMoveUp(messageId: string, sessionId: string): Promise<void> {
  await backendApi.post(
    `/queue/messages/${encodeURIComponent(messageId)}/move-up`,
    { sessionId },
    { showErrors: false },
  );
}

/** Move a message down in the backend queue. */
export async function persistMoveDown(messageId: string, sessionId: string): Promise<void> {
  await backendApi.post(
    `/queue/messages/${encodeURIComponent(messageId)}/move-down`,
    { sessionId },
    { showErrors: false },
  );
}

/** Clear all queued messages for a session on the backend. */
export async function persistClearSession(sessionId: string): Promise<void> {
  await backendApi.delete(
    `/queue/sessions/${encodeURIComponent(sessionId)}`,
    { showErrors: false },
  );
}
