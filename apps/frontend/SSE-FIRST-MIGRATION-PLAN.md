# SSE-First Architecture Migration Plan

> **Problem**: The React frontend makes ~100+ HTTP requests at boot and ~60-120/min steady-state. The SolidJS OpenCode reference makes ~15-20 at boot and ~6/min steady-state. The difference: SolidJS boots once, then SSE drives everything. Our React frontend uses React Query polling + `invalidateQueries` (which triggers full refetches) on every SSE event.

> **Goal**: Match SolidJS — boot once, SSE drives everything, near-zero polling.

---

## How SolidJS Works (Reference Architecture)

### Boot (one-time, ~15-20 requests total)
1. `global-sdk.tsx` opens **1 SSE connection** to `/global/event` — stays open forever, auto-reconnects with 250ms delay
2. `bootstrapGlobal()` fires 5 parallel requests ONCE: `path.get()`, `config.get()`, `project.list()`, `provider.list()`, `provider.auth()`
3. `bootstrapDirectory()` fires ~12 parallel requests ONCE per project: `project.current()`, `provider.list()`, `app.agents()`, `config.get()`, `path.get()`, `command.list()`, `session.status()`, `session.list()`, `mcp.status()`, `lsp.status()`, `app.skills()`, `vcs.get()`, `permission.list()`, `question.list()`
4. Messages fetched ONLY when you open a session — one `session.messages()` call, then never again

### Steady-state (after boot)
- **Zero HTTP requests from SSE events.** Every SSE event (`session.created`, `message.part.updated`, `permission.asked`, etc.) is handled with a surgical binary-search insert/update/delete into the SolidJS store. No refetching.
- **1 health check** every 10s → `/global/health`
- **No polling** for sessions, messages, status, permissions, questions, path, project, config, agents, commands, etc.
- Only `server.instance.disposed` triggers a full re-bootstrap

### What Our React Frontend Does Differently
- SSE events trigger `queryClient.invalidateQueries()` → full HTTP refetches
- React Query default `staleTime: 20s` → any component mounting after 20s triggers another fetch
- Multiple independent health/connection monitors hitting different endpoints
- `ONBOARDING_COMPLETE` checked on every page load + polled every 5s during onboarding
- `useSessionPolling` — 2s fallback polling of status + messages
- Every mutation's `onSuccess` calls `invalidateQueries` → more refetches

---

## The 7 Worst Offenders

### 1. `/env/ONBOARDING_COMPLETE` — ~50+ requests in logs
- **Source**: `layout-content.tsx` checks on every page load, `setup-overlay.tsx` polls every 5s, `onboarding/page.tsx` polls every 5s
- **SolidJS**: No equivalent (no onboarding flow)
- **Fix**: Check once on app load, cache in sessionStorage. During onboarding, listen for SSE `session.idle` event, then check once.

### 2. `/path` + `/project/current` — ~80+ paired requests
- **Source**: `useOpenCodePathInfo()` and `useOpenCodeCurrentProject()` called from multiple components. `staleTime: 60s` / `5min` still causes repeated fetches on mount.
- **SolidJS**: `bootstrapGlobal()` fetches ONCE. Only `project.updated` SSE event updates the store. Zero polling.
- **Fix**: Fetch once at boot, set `staleTime: Infinity`, update only via SSE.

### 3. `/session` (list) — ~40+ requests
- **Source**: `useOpenCodeSessions()` with `staleTime: 30s`, `refetchOnWindowFocus: true`. SSE events call `invalidateQueries({ queryKey: sessions() })` → triggers full refetch of session list.
- **SolidJS**: `session.list()` called once. SSE events do binary-search insert/update/splice. Zero refetching.
- **Fix**: `staleTime: Infinity`, replace `invalidateQueries` with `setQueryData` surgical updates.

### 4. `/session/status` — ~20+ requests
- **Source**: `useSandboxConnection` health check hits `/session` every 30s. SSE reconnect calls `session.status()`. `useSessionPolling` calls it every 2s.
- **SolidJS**: SSE `session.status` events → direct store write. Health check uses `/global/health`. Zero polling.
- **Fix**: Use `/global/health` for connection checks. Remove 2s polling fallback.

### 5. `/permission` + `/question` — ~15+ requests
- **Source**: `useOpenCodeEventStream` hydrates on every SSE connect AND reconnect.
- **SolidJS**: SSE events → direct store write. `permission.list()` only called once at boot.
- **Fix**: Hydrate once at boot, not on every reconnect.

### 6. `/global/event` (SSE) — repeated connection chatter
- **Source**: SSE reconnects produce connect/disconnect logs. Multiple rapid reconnections visible.
- **SolidJS**: Same SSE pattern but simpler reconnect (250ms wait).
- **Fix**: Minor — tune reconnect backoff.

### 7. `/kortix/health` — ~10+ requests
- **Source**: `useSandboxConnection` + platform frontend both check it.
- **SolidJS**: No equivalent (no kortix-master layer).
- **Fix**: Consolidate to single health check loop.

---

## Root Cause: `invalidateQueries` = HTTP Request

The fundamental issue: `invalidateQueries()` in React Query means "mark stale + immediately refetch from server." Every SSE event in our `handleEvent()` calls it, turning every SSE event into 1-3 HTTP requests. In SolidJS, the same SSE event just mutates the store — zero HTTP.

---

## Migration Phases

### Phase 1: Quick Wins (staleTime + polling kills) — ~2-3 hours, ~80% reduction

#### 1a. Increase staleTime on boot-once data

**File: `src/hooks/opencode/use-opencode-sessions.ts`**

```
useOpenCodePathInfo()       → staleTime: Infinity  (was 5min)
useOpenCodeCurrentProject() → staleTime: Infinity  (was 60s)
useOpenCodeProviders()      → staleTime: Infinity  (was 5min)
useOpenCodeCommands()       → staleTime: Infinity  (was 5min)
useOpenCodeAgents()         → staleTime: Infinity  (was 5min)
useOpenCodeSkills()         → staleTime: Infinity  (was 5min)
useOpenCodeMcpStatus()      → staleTime: Infinity  (was 30s)
useOpenCodeSessions()       → staleTime: 5 * 60 * 1000  (was 30s), refetchOnWindowFocus: false
```

All of these are kept fresh by SSE events — the staleTime just prevents unnecessary background refetches.

#### 1b. Disable default refetchOnMount for SSE-driven data

**File: `src/app/react-query-provider.tsx`**

Change default `refetchOnMount: true` to `refetchOnMount: false` is too aggressive globally. Instead, set `refetchOnMount: false` on each hook above individually.

#### 1c. Cache ONBOARDING_COMPLETE

**File: `src/components/dashboard/layout-content.tsx`**

```
// Before checking the server, check sessionStorage
const cached = sessionStorage.getItem('onboarding_complete');
if (cached === 'true') { setOnboardingChecked(true); return; }

// After successful check, cache it
sessionStorage.setItem('onboarding_complete', 'true');
```

Do the same in `setup-overlay.tsx` and `onboarding/page.tsx`. Stop the 5s polling once ONBOARDING_COMPLETE=true is confirmed.

#### 1d. Kill useSessionPolling (the 2s fallback)

**File: `src/hooks/opencode/use-opencode-sessions.ts`**

The `useSessionPolling` hook polls `session.status()` + `refetchQueries(messages)` every 2 seconds. SSE reconnects within 250ms-3s. This fallback is unnecessary.

Options:
- **Delete it entirely** — SSE is reliable enough
- **Or**: Only activate after SSE has been disconnected for >10s (check via a flag set by `use-opencode-events.ts`)

#### 1e. Switch health check endpoint

**File: `src/hooks/platform/use-sandbox-connection.ts`**

Change from `authenticatedFetch(\`${url}/session\`)` to `authenticatedFetch(\`${url}/global/health\`)`. The `/session` endpoint returns the full session list — wasteful for a health check. `/global/health` returns `{ healthy: true }` — tiny response.

Also increase `POLL_CONNECTED` from 30s to match SolidJS's 10s if we want faster detection, or keep at 30s to reduce load.

---

### Phase 2: Replace invalidateQueries with setQueryData — ~3-4 hours, ~30% further reduction

**File: `src/hooks/opencode/use-opencode-events.ts`**

The `handleEvent` switch statement currently does this for session events:

```typescript
// CURRENT — triggers full HTTP refetch
case "session.created":
case "session.updated":
case "session.deleted": {
    queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
    // ...
}
```

Replace with surgical cache mutations (matching SolidJS `event-reducer.ts`):

```typescript
// NEW — zero HTTP requests
case "session.created": {
    const info = (event.properties as any).info;
    queryClient.setQueryData<Session[]>(opencodeKeys.sessions(), (old) => {
        if (!old) return [info];
        // Binary search insert, maintain sort order by updated time
        const exists = old.findIndex(s => s.id === info.id);
        if (exists >= 0) {
            const next = [...old];
            next[exists] = info;
            return next.sort((a, b) => b.time.updated - a.time.updated);
        }
        return [info, ...old].sort((a, b) => b.time.updated - a.time.updated);
    });
    break;
}

case "session.updated": {
    const info = (event.properties as any).info;
    queryClient.setQueryData<Session[]>(opencodeKeys.sessions(), (old) => {
        if (!old) return old;
        const idx = old.findIndex(s => s.id === info.id);
        if (idx < 0) return old;
        const next = [...old];
        next[idx] = info;
        return next.sort((a, b) => b.time.updated - a.time.updated);
    });
    queryClient.setQueryData(opencodeKeys.session(info.id), info);
    break;
}

case "session.deleted": {
    const info = (event.properties as any).info;
    queryClient.setQueryData<Session[]>(opencodeKeys.sessions(), (old) => {
        if (!old) return old;
        return old.filter(s => s.id !== info.id);
    });
    queryClient.removeQueries({ queryKey: opencodeKeys.session(info.id) });
    queryClient.removeQueries({ queryKey: opencodeKeys.messages(info.id) });
    break;
}
```

Same pattern for these events that currently use `invalidateQueries`:
- `session.compacted` — refetch messages for that session only (already does this, just remove the session invalidation)
- `mcp.tools.changed` — `setQueryData` for mcp status instead of invalidate
- `project.updated` — `setQueryData` for projects/currentProject instead of invalidate
- `file.edited` — invalidation is OK here (user-initiated, infrequent)

#### Also fix: SSE reconnect hydration

Currently, every SSE reconnect re-fetches `permission.list()`, `question.list()`, and `session.status()`. Change to:
- Only hydrate if reconnect gap was >5s (track `lastEventTime`)
- On quick reconnects (<5s), skip hydration — events will catch up

---

### Phase 3: Unified Sync Store (full architectural fix) — ~2-3 days

This is the proper long-term fix that matches SolidJS architecture.

#### 3a. Create GlobalStore (Zustand)

**New file: `src/stores/opencode-global-store.ts`**

```typescript
interface GlobalStore {
  // Boot state
  ready: boolean;
  status: 'loading' | 'partial' | 'complete';
  
  // Boot-once global data
  path: Path;
  projects: Project[];
  providers: ProviderListResponse;
  config: Config;
  
  // Per-directory data
  sessions: Session[];  // sorted by updated time
  agents: Agent[];
  commands: Command[];
  skills: Skill[];
  mcpStatus: Record<string, McpStatus>;
  currentProject: Project | null;
  
  // Per-session data (SSE-driven)
  sessionStatus: Record<string, SessionStatus>;
  sessionDiff: Record<string, FileDiff[]>;
  todos: Record<string, Todo[]>;
  permissions: Record<string, PermissionRequest[]>;
  questions: Record<string, QuestionRequest[]>;
  
  // Actions
  bootstrap(): Promise<void>;
  applyEvent(event: OpenCodeEvent): void;
  upsertSession(session: Session): void;
  removeSession(id: string): void;
  // ... etc
}
```

#### 3b. Create Bootstrap Hook

**New file: `src/hooks/opencode/use-opencode-bootstrap.ts`**

Replaces all the individual `useQuery` hooks. Fires once on app mount:

```typescript
export function useOpenCodeBootstrap() {
  const store = useGlobalStore();
  
  useEffect(() => {
    if (store.ready) return;
    store.bootstrap();  // parallel fetch of all boot data
  }, []);
}
```

`bootstrap()` does exactly what SolidJS `bootstrapGlobal()` + `bootstrapDirectory()` do:
1. `/global/health` check
2. Parallel: `path.get()`, `config.get()`, `project.list()`, `provider.list()`
3. Parallel per-directory: `project.current()`, `app.agents()`, `config.get()`, `session.list()`, `session.status()`, `permission.list()`, `question.list()`, `command.list()`, `mcp.status()`, `app.skills()`, `vcs.get()`
4. Set `ready = true`

#### 3c. Refactor SSE Handler to Use GlobalStore

**File: `src/hooks/opencode/use-opencode-events.ts`**

Replace all `queryClient.invalidateQueries()` and `queryClient.setQueryData()` with `globalStore.applyEvent(event)`. The store's `applyEvent` method contains the full event reducer logic (matching SolidJS `event-reducer.ts`).

#### 3d. Create Selector Hooks

Replace existing hooks with thin selectors over GlobalStore:

```typescript
// Old: triggers HTTP request
export function useOpenCodeSessions() {
  return useQuery<Session[]>({ queryKey: opencodeKeys.sessions(), queryFn: ... });
}

// New: reads from store (no HTTP)
export function useOpenCodeSessions() {
  return useGlobalStore(s => s.sessions);
}

// Old: triggers HTTP request
export function useOpenCodeSession(id: string) {
  return useQuery<Session>({ queryKey: opencodeKeys.session(id), queryFn: ... });
}

// New: reads from store (no HTTP)
export function useOpenCodeSession(id: string) {
  return useGlobalStore(s => s.sessions.find(s => s.id === id));
}
```

Hooks to migrate:
- `useOpenCodeSessions()` → `useGlobalStore(s => s.sessions)`
- `useOpenCodeSession(id)` → `useGlobalStore(s => s.sessions.find(...))`
- `useOpenCodeMessages(id)` → stays in sync store (already done)
- `useOpenCodeAgents()` → `useGlobalStore(s => s.agents)`
- `useOpenCodeCommands()` → `useGlobalStore(s => s.commands)`
- `useOpenCodeProviders()` → `useGlobalStore(s => s.providers)`
- `useOpenCodeCurrentProject()` → `useGlobalStore(s => s.currentProject)`
- `useOpenCodePathInfo()` → `useGlobalStore(s => s.path)`
- `useOpenCodeMcpStatus()` → `useGlobalStore(s => s.mcpStatus)`
- `useOpenCodeSkills()` → `useGlobalStore(s => s.skills)`
- `useOpenCodeSessionTodo(id)` → `useGlobalStore(s => s.todos[id])`
- `useOpenCodeSessionDiff(id)` → `useGlobalStore(s => s.sessionDiff[id])`

#### 3e. Simplify Connection Health

**New file: `src/hooks/opencode/use-opencode-health.ts`**

Single health check loop replacing `useSandboxConnection`:

```typescript
export function useOpenCodeHealth() {
  useEffect(() => {
    const check = async () => {
      const url = getActiveOpenCodeUrl();
      const res = await fetch(`${url}/global/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) { setConnected(); } else { setDisconnected(); }
    };
    const interval = setInterval(check, 10_000);
    check();
    return () => clearInterval(interval);
  }, []);
}
```

---

### Phase 4: Keep React Query Only for Non-SSE Data

React Query remains for data that SSE doesn't cover:

| Keep in React Query | Reason |
|---|---|
| `useFileContent` | User-initiated file reads |
| `useFileList` | User-initiated directory browsing |
| `useGitStatus` | SSE `file.edited` can trigger invalidation (OK — infrequent) |
| Billing / subscription | External Supabase API |
| Integrations | External API, 30s refresh is fine |
| Scheduled tasks | External API, 30s refresh is fine |
| Sandbox update check | External, infrequent |
| PTY list | SSE `pty.*` events can trigger invalidation (OK — infrequent) |

---

## Migration Order & Estimated Impact

| Step | Effort | Reduction | Risk | Phase |
|---|---|---|---|---|
| 1a. Increase staleTime on SSE-driven hooks | 30 min | ~20% | Very low | 1 |
| 1b. Set refetchOnWindowFocus: false on sessions | 5 min | ~5% | Very low | 1 |
| 1c. Cache ONBOARDING_COMPLETE in sessionStorage | 30 min | ~15% | Low | 1 |
| 1d. Kill/gate useSessionPolling | 30 min | ~5-10% | Low | 1 |
| 1e. Switch health check to /global/health | 30 min | ~5% | Low | 1 |
| 2. Replace invalidateQueries with setQueryData in SSE handler | 3-4 hrs | ~30% | Medium | 2 |
| 2b. Gate SSE reconnect hydration (skip if <5s gap) | 30 min | ~5% | Low | 2 |
| 3a. Create GlobalStore (Zustand) | 4-6 hrs | Foundation | Medium | 3 |
| 3b. Create bootstrap hook | 2-3 hrs | Foundation | Medium | 3 |
| 3c. Refactor SSE handler to GlobalStore | 3-4 hrs | ~10% more | Medium | 3 |
| 3d. Migrate hooks to GlobalStore selectors | 4-6 hrs | Final cleanup | Higher | 3 |
| 3e. Simplify connection health | 1-2 hrs | Cleanup | Low | 3 |

## Expected Results

| Metric | Current | After Phase 1 | After Phase 2 | After Phase 3 |
|---|---|---|---|---|
| HTTP requests at boot | ~80-100 | ~40-50 | ~25-30 | ~15-20 |
| HTTP requests/min (idle) | ~60-120 | ~15-20 | ~8-10 | ~6 |
| SSE connections | 1 | 1 | 1 | 1 |
| Polling timers | 5+ | 2 | 1 | 1 |
| React Query cache entries | ~30+ | ~30+ | ~25 | ~10 (non-SSE only) |

---

## Files to Touch

### Phase 1
- `src/hooks/opencode/use-opencode-sessions.ts` — staleTime changes
- `src/app/react-query-provider.tsx` — possibly adjust defaults
- `src/components/dashboard/layout-content.tsx` — cache ONBOARDING_COMPLETE
- `src/components/dashboard/setup-overlay.tsx` — cache ONBOARDING_COMPLETE
- `src/app/onboarding/page.tsx` — cache ONBOARDING_COMPLETE
- `src/hooks/platform/use-sandbox-connection.ts` — switch to /global/health

### Phase 2
- `src/hooks/opencode/use-opencode-events.ts` — replace invalidateQueries with setQueryData

### Phase 3
- **NEW** `src/stores/opencode-global-store.ts`
- **NEW** `src/hooks/opencode/use-opencode-bootstrap.ts`
- **NEW** `src/hooks/opencode/use-opencode-health.ts`
- `src/hooks/opencode/use-opencode-events.ts` — refactor to GlobalStore
- `src/hooks/opencode/use-opencode-sessions.ts` — replace useQuery hooks with store selectors
- All consumers of the above hooks (components importing from use-opencode-sessions)

---

## Key Reference Files (SolidJS)

These are the files to mirror:
- `services/opencode/packages/app/src/context/global-sdk.tsx` — SSE connection + event coalescing
- `services/opencode/packages/app/src/context/global-sync.tsx` — boot-once store + event dispatch
- `services/opencode/packages/app/src/context/global-sync/bootstrap.ts` — one-time data loading
- `services/opencode/packages/app/src/context/global-sync/event-reducer.ts` — surgical store mutations per SSE event type
- `services/opencode/packages/app/src/context/sync.tsx` — per-session data (messages, parts)
- `services/opencode/packages/app/src/context/server.tsx` — health check (single 10s poll to /global/health)
- `services/opencode/packages/app/src/utils/server-health.ts` — health check utility
