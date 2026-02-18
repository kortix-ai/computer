# Session Chat Refactor Plan

## Goal
Match the SolidJS reference (`opencode/packages/app/src/pages/session.tsx`) 1:1 in behavior, architecture, and snappiness. Remove all client-side busy-padding, polling, watchdogs, and optimistic rendering hacks that make the NextJS version sluggish and unreliable.

---

## The Core Problem

The SolidJS version has **2 stores** (`ui` + `store`) with ~15 fields total and **~8 reactive effects**. It trusts SSE completely.

The NextJS version has **9 useState hooks** in SessionChat, **18 useEffects**, **5 watchdog/recovery mechanisms**, and **3 separate optimistic rendering paths**. It doesn't trust SSE and papers over every gap with polling, timeouts, and client-side busy inference. This creates:

1. **Race conditions**: Multiple effects competing to clear/set the same state
2. **Sluggishness**: Polling intervals (2s), grace periods (5s), safety timeouts (30s), watchdog checks (5s + 15s intervals) all add latency
3. **Ghost busy states**: `isBusy` stays true long after the server is idle because of `pendingUserMessage` and `pendingSendInFlight`
4. **Double renders**: Optimistic messages render, then real messages arrive, causing flicker

---

## Architecture: SolidJS vs NextJS (What Changes)

### Status / `isBusy`

| SolidJS | NextJS (current) | NextJS (target) |
|---------|-------------------|-----------------|
| `status = sync.data.session_status[id] ?? idle` | `sessionStatus = store.statuses[id]` | Keep — same |
| `isBusy = status.type !== 'idle'` | `isBusy = isServerBusy \|\| !!pendingUserMessage \|\| pendingSendInFlight` | `isBusy = isServerBusy` |
| No polling | 2s polling + 5min timeout | **Remove entirely** |
| No watchdog | 5s+15s watchdog, message-based idle detection | **Remove entirely** |

### Send Flow

| SolidJS | NextJS (current) | NextJS (target) |
|---------|-------------------|-----------------|
| `sync.session.optimistic.add()` → inserts into store.message[] | `setPendingUserMessage(text)` → renders separate JSX | Fire-and-forget, no optimistic UI |
| `sdk.client.session.promptAsync()` | `sendMessage.mutateAsync()` with 3 retries | Keep `sendMessage.mutateAsync()` |
| On fail: `optimistic.remove()`, restore input, show toast | On fail: clear pendingUserMessage, stop polling | On fail: show toast, done |
| No pending states | `pendingSendInFlight`, `pendingUserMessage`, `optimisticPrompt` | **Remove all three** |
| No polling on send | `setPollingActive(true)` | **Remove** |

### Dashboard → Session Handoff

| SolidJS | NextJS (current) | NextJS (target) |
|---------|-------------------|-----------------|
| Module-level `Map<string, HandoffSession>` | `sessionStorage.getItem(opencode_pending_prompt:${id})` | Keep sessionStorage approach (works for NextJS) |
| Shows handoff prompt as visual preview only | Renders full optimistic bubble, retries 2x outer + 3x inner | Send once via `sendMessage.mutateAsync()`. On fail: show toast. No optimistic bubble. |
| Not used for busy state | Sets `pendingSendInFlight=true` → `isBusy=true` | No busy padding. SSE sets busy when server starts. |

### Expanded State

| SolidJS | NextJS (current) | NextJS (target) |
|---------|-------------------|-----------------|
| `store.expanded[lastUserMsgId] = status.type !== 'idle'` | Same but uses isBusy (includes client state) | Use `isServerBusy` only |
| Reset to `{}` on session key change | Same | Keep |
| Toggle: `setStore('expanded', id, fn => !fn)` | Same | Keep |

### Scroll

| SolidJS | NextJS (current) | NextJS (target) |
|---------|-------------------|-----------------|
| `createAutoScroll({ working: () => true, overflowAnchor: 'dynamic' })` | `useAutoScroll({ working: isBusy })` | Change to `working: true` (always active, like SolidJS) |
| Gesture-gated scroll detection (250ms window) | Wheel/touch/keyboard handlers | Keep current — functionally equivalent |
| `resumeScroll()` = clear messageId + forceScrollToBottom | `scrollToBottom()` | Keep |
| Staggered initial scroll | Staggered initial scroll | Keep |

### Message Queue

| SolidJS | NextJS (current) | NextJS (target) |
|---------|-------------------|-----------------|
| Does not exist | Full queue system with auto-drain, send-now, reorder | **Keep** — this is a feature addition, not a bug |

### Permission / Question

| SolidJS | NextJS (current) | NextJS (target) |
|---------|-------------------|-----------------|
| `blocked = !!permRequest() \|\| !!questionRequest()` hides prompt | Permission/question inline rendering | Keep current approach |
| `decide()` with `responding` flag prevents double-click | Direct calls, no double-click guard | **Add `responding` guard** |

---

## Execution Plan

### Phase 1: Strip Client-Side Busy Padding

**Files:** `session-chat.tsx`

Remove these **useState** hooks:
- `pollingActive` → remove
- `pendingUserMessage` → remove
- `pendingCommand` → remove
- `isRetrying` → remove
- `pendingSendInFlight` → remove
- `optimisticPrompt` → remove

Remove these **useRef** hooks:
- `pendingPromptHandled` → remove
- `commandMessagesRef` → remove (or keep if needed for command pill display)
- `pendingCommandStashRef` → remove
- `lastSendTimeRef` → remove
- `prevMsgLenRef` → remove
- `prevServerBusyRef` → remove
- `drainScheduledRef` → remove

Remove these **useEffect** hooks:
- Hydrate + send pending prompt (line 1986) → rewrite as simple fire-and-forget
- Clear optimistic prompt (line 2051) → remove
- Stop polling grace period (line 2183) → remove
- Clear pendingSendInFlight on server busy (line 2206) → remove
- pendingSendInFlight safety timeout (line 2222) → remove
- Stale session watchdog (line 2235) → remove
- Message-based idle detection (line 2268) → remove
- Clear pendingUserMessage on server ack (line 2297) → remove
- Associate stashed command info (line 2315) → remove
- Update prevMsgLenRef (line 2330) → remove
- Auto-drain queue primary (line 2119) → simplify
- Fallback drain (line 2147) → remove (keep only primary)

Remove the **useSessionBusyPolling** call.

**Result:** `isBusy` becomes simply `isServerBusy`.

### Phase 2: Rewrite Send Flow

**Files:** `session-chat.tsx`

Rewrite `handleSend`:
```typescript
const handleSend = useCallback(async (text: string, files?: AttachedFile[], mentions?: TrackedMention[]) => {
  playSound('send');
  scrollToBottom();

  const options: Record<string, unknown> = {};
  if (local.agent.current) options.agent = local.agent.current.name;
  if (local.model.currentKey) options.model = local.model.currentKey;
  if (local.model.variant.current) options.variant = local.model.variant.current;

  const parts = [{ type: 'text', text }];
  // ... file uploads (keep existing logic)
  // ... session mentions (keep existing logic)

  sendMessage.mutateAsync({
    sessionId,
    parts,
    options: Object.keys(options).length > 0 ? options : undefined,
  }).catch(() => {
    // Toast on failure — user re-submits manually
  });
}, [sessionId, sendMessage, ...]);
```

Key changes:
- No `setPendingUserMessage` — no optimistic bubble
- No `setPollingActive` — no polling
- No `lastSendTimeRef` — no grace period
- Fire-and-forget: the `await` is removed. Server will update via SSE.
- On catch: just toast the error. Done.

Rewrite dashboard handoff (the sessionStorage hydration effect):
```typescript
useEffect(() => {
  const pending = sessionStorage.getItem(`opencode_pending_prompt:${sessionId}`);
  if (!pending) return;
  sessionStorage.removeItem(`opencode_pending_prompt:${sessionId}`);

  const options = (() => { /* parse from sessionStorage */ })();

  sendMessage.mutateAsync({
    sessionId,
    parts: [{ type: 'text', text: pending }],
    options,
  }).catch(() => {
    // Toast on failure
  });
}, [sessionId]);
```

### Phase 3: Fix Expanded State, Scroll, Busy Logic

**Files:** `session-chat.tsx`, `use-auto-scroll.ts`

1. **`isBusy`** — change to:
   ```typescript
   const isBusy = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';
   ```
   (Just `isServerBusy`, no client-side padding)

2. **Expanded auto-expand** — change to use `isServerBusy` only:
   ```typescript
   useEffect(() => {
     if (!messages || messages.length === 0) return;
     const lastUserId = [...messages].reverse().find(m => m.info.role === 'user')?.info.id;
     if (lastUserId && isServerBusy) {
       setExpanded(prev => ({ ...prev, [lastUserId]: true }));
     }
   }, [sessionStatus, messages]);
   ```

3. **Auto-scroll** — change `working` to always true:
   ```typescript
   const { scrollRef, contentRef, showScrollButton, scrollToBottom } = useAutoScroll({
     working: true,  // Always active, like SolidJS
   });
   ```

4. **Message queue drain** — simplify to single effect:
   ```typescript
   useEffect(() => {
     if (isServerBusy) return; // Still busy — don't drain yet
     const next = queueDequeue(sessionId);
     if (!next) return;
     setTimeout(() => handleSend(next.text, next.files), 500);
   }, [isServerBusy, queuedMessages.length]);
   ```

### Phase 4: Remove Optimistic Rendering from JSX

**Files:** `session-chat.tsx`

Remove from the render tree:
1. The `showOptimistic` block (lines 2789-2832) — the optimistic prompt bubble
2. The `pendingUserMessage && !showOptimistic` block (lines 2887-2928) — the in-session optimistic bubble
3. The standalone busy indicator block (lines 2931-2941) — when no turns but busy
4. The `isRetrying` retrying indicator

Simplify the render condition:
```typescript
// Before:
const showOptimistic = !!optimisticPrompt && !hasMessages;
// After: removed entirely. The content area shows messages OR welcome.
```

The message area now just renders `turns` from server data. No optimistic ghosts.

### Phase 5: Add Permission Double-Click Guard

**Files:** `session-chat.tsx`

Add a `responding` state (like SolidJS's `ui.responding`):
```typescript
const [responding, setResponding] = useState(false);

const handlePermissionReply = useCallback(async (requestId, reply) => {
  if (responding) return;
  setResponding(true);
  replyToPermission(requestId, reply)
    .then(() => removePermission(requestId))
    .catch(() => {})
    .finally(() => setResponding(false));
}, [responding, removePermission]);
```

### Phase 6: Clean Up Unused Code

**Files:** `use-opencode-sessions.ts`, `session-chat.tsx`

1. **Remove `useSessionBusyPolling`** from `use-opencode-sessions.ts` — no longer called
2. **Remove the `commandMessagesRef` / `pendingCommandStashRef` pattern** — commands render the same as any user message once server processes them
3. **Clean up imports** — remove unused icons (Loader2, etc.), unused state

### Phase 7: Verify

1. `npx tsc --noEmit` — TypeScript must compile clean
2. Verify behaviors:
   - Send message → no optimistic bubble → message appears when SSE delivers it
   - Dashboard prompt → navigates to session → message appears via SSE
   - Stop button → aborts correctly
   - Scroll follows streaming content
   - Expanded state: last turn expands during busy, collapses on idle
   - Permission/question blocks input correctly
   - Message queue auto-drains between turns
   - Triple-click context modal still works

---

## What We Keep

- SSE event handling (`use-opencode-events.ts`) — already good, matches SolidJS
- React Query cache updates via `setQueryData` — already incremental
- `useAutoScroll` hook — just change `working` to `true`
- Message queue store and UI — useful feature addition
- `useOpenCodeLocal` — already 1:1 port
- `SessionContextModal` — already done
- Billing deduction effect — keep as-is
- Fork/revert/unrevert handlers — keep as-is
- File upload logic — keep as-is

## What We Remove

| Thing | Lines saved (est.) | Why |
|-------|-------------------|-----|
| `pollingActive` + `useSessionBusyPolling` | ~80 | SSE is reliable |
| `pendingUserMessage` + clearing effects | ~60 | No optimistic bubble |
| `pendingSendInFlight` + safety timeout | ~40 | No busy padding |
| `optimisticPrompt` + rendering | ~50 | No optimistic bubble |
| Stale session watchdog | ~30 | SSE handles status |
| Message-based idle detection | ~25 | SSE handles status |
| `isRetrying` + retry UI | ~20 | Toast on failure |
| `pendingCommand` + stash pattern | ~40 | Commands are just messages |
| Optimistic JSX blocks | ~80 | Server data only |
| **Total** | **~425 lines** | |

## Net Result

- **SessionChat state**: 9 useState → 3 useState (`contextModalOpen`, `expanded`, `responding`)
- **SessionChat effects**: 18 useEffect → 6 useEffect (session reset, restore model/agent, auto-expand, initial scroll, queue drain, billing)
- **Busy logic**: 3-layer → 1-layer (server status only)
- **Polling/watchdog**: 5 mechanisms → 0
- **Optimistic paths**: 3 → 0
- **File size**: ~3121 lines → ~2600 lines (est.)
