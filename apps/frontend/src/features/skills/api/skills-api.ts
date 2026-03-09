/**
 * Skills API — CRUD operations for SKILL.md files.
 *
 * - List: uses `client.app.skills()` (GET /skill)
 * - Create/Update: writes SKILL.md via kortix-master /file/upload
 * - Delete: removes the skill directory via kortix-master DELETE /file
 *
 * Skills are created in .opencode/skills/<name>/SKILL.md (project-relative).
 * After any mutation, `instance.dispose()` is called to force the OpenCode
 * server to rescan skill directories (the skill list is cached at startup).
 */

import { getClient } from '@/lib/opencode-sdk';
import type { Skill } from '../types';

// ---------------------------------------------------------------------------
// Helper: unwrap SDK response
// ---------------------------------------------------------------------------

function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error) {
    const err = result.error as any;
    throw new Error(err?.data?.message || err?.message || 'SDK request failed');
  }
  return result.data as T;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * List all available skills from the OpenCode server.
 */
export async function listSkills(): Promise<Skill[]> {
  const client = getClient();
  const result = await client.app.skills();
  return unwrap(result) as Skill[];
}
