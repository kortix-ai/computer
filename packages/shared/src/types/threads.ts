/**
 * Shared thread & project types for AgentPress
 * Canonical definitions consumed by both frontend and mobile.
 *
 * Source of truth: frontend (apps/frontend/src/lib/api/threads.ts)
 * Reconciled with: mobile  (apps/mobile/api/types.ts)
 */

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

export type ThreadStatus = 'pending' | 'initializing' | 'ready' | 'error';

export interface Thread {
  thread_id: string;
  account_id?: string;
  project_id?: string | null;
  /** Display name — mobile calls this `title`, frontend calls this `name` */
  title?: string;
  /** @deprecated Use `title` — kept for frontend backward-compat */
  name?: string;
  is_public?: boolean;
  created_at: string;
  updated_at: string;
  status?: ThreadStatus;
  agent_id?: string | null;
  metadata?: Record<string, any>;
  initialization_error?: string | null;
  initialization_started_at?: string | null;
  initialization_completed_at?: string | null;
  /** Nested project data (included by some API responses) */
  project?: Project;
  /** Allow additional properties for forward-compat */
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface ProjectSandbox {
  vnc_preview?: string;
  sandbox_url?: string;
  id?: string;
  pass?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  account_id?: string;
  created_at: string;
  updated_at?: string;
  sandbox: ProjectSandbox;
  is_public?: boolean;
  icon_name?: string | null;
  /** Allow additional properties for forward-compat */
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Thread CRUD requests
// ---------------------------------------------------------------------------

export interface CreateThreadRequest {
  project_id?: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface UpdateThreadRequest {
  title?: string;
  is_public?: boolean;
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Thread list / pagination helpers
// ---------------------------------------------------------------------------

export interface ThreadPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ThreadsResponse {
  threads: Thread[];
  pagination: ThreadPagination;
}
