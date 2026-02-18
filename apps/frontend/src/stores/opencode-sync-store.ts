'use client';

import { create } from 'zustand';
import type {
  Message,
  Part,
  SessionStatus,
  PermissionRequest,
  QuestionRequest,
  FileDiff,
  Todo,
  Event as OpenCodeEvent,
} from '@kortix/opencode-sdk/v2/client';

// ============================================================================
// Binary search — ported from @opencode-ai/util/binary (20 lines)
// ============================================================================

export const Binary = {
  search<T>(array: T[], id: string, compare: (item: T) => string): { found: boolean; index: number } {
    let left = 0;
    let right = array.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midId = compare(array[mid]);
      if (midId === id) return { found: true, index: mid };
      if (midId < id) left = mid + 1;
      else right = mid - 1;
    }
    return { found: false, index: left };
  },
};

// ============================================================================
// Ascending ID generator — server-compatible monotonic IDs
// ============================================================================

let lastTs = 0;
let counter = 0;
const chars62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function ascendingId(prefix: 'msg' | 'prt' = 'msg'): string {
  const now = Date.now();
  if (now !== lastTs) { lastTs = now; counter = 0; }
  counter++;
  const encoded = BigInt(now) * BigInt(0x1000) + BigInt(counter);
  const hex = encoded.toString(16).padStart(12, '0').slice(0, 12);
  let rand = '';
  for (let i = 0; i < 14; i++) rand += chars62[Math.floor(Math.random() * 62)];
  return `${prefix}_${hex}${rand}`;
}

// ============================================================================
// MessageWithParts — the shape components consume
// ============================================================================

export interface MessageWithParts {
  info: Message;
  parts: Part[];
}

// ============================================================================
// Store State
// ============================================================================

interface SyncState {
  // Core data (per-session, sorted arrays — matches SolidJS store shape)
  messages: Record<string, Message[]>;
  parts: Record<string, Part[]>;
  sessionStatus: Record<string, SessionStatus>;
  permissions: Record<string, PermissionRequest[]>;
  questions: Record<string, QuestionRequest[]>;
  diffs: Record<string, FileDiff[]>;
  todos: Record<string, Todo[]>;

  // ---- Actions ----
  applyEvent: (event: OpenCodeEvent) => void;
  upsertMessage: (sessionID: string, message: Message) => void;
  removeMessage: (sessionID: string, messageID: string) => void;
  upsertPart: (messageID: string, part: Part) => void;
  removePart: (messageID: string, partID: string) => void;
  applyPartDelta: (messageID: string, partID: string, field: string, delta: string) => void;
  setStatus: (sessionID: string, status: SessionStatus) => void;
  addPermission: (permission: PermissionRequest) => void;
  removePermission: (sessionID: string, permissionID: string) => void;
  addQuestion: (question: QuestionRequest) => void;
  removeQuestion: (sessionID: string, questionID: string) => void;
  setDiff: (sessionID: string, diffs: FileDiff[]) => void;
  setTodo: (sessionID: string, todos: Todo[]) => void;
  optimisticAdd: (sessionID: string, message: Message, messageParts: Part[]) => void;
  optimisticRemove: (sessionID: string, messageID: string) => void;
  hydrate: (sessionID: string, msgs: Array<{ info: Message; parts: Part[] }>) => void;
  reset: () => void;

  // ---- Selector ----
  getMessages: (sessionID: string) => MessageWithParts[];

  // ---- Compat selectors (for old store consumers) ----
  // These mirror the old store shapes so external components can migrate gradually
  statuses: Record<string, SessionStatus>;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useSyncStore = create<SyncState>()((set, get) => ({
  messages: {},
  parts: {},
  sessionStatus: {},
  permissions: {},
  questions: {},
  diffs: {},
  todos: {},

  // Compat alias
  get statuses() { return get().sessionStatus; },

  // ---- Core mutations ----

  upsertMessage: (sessionID, message) => set((s) => {
    const list = s.messages[sessionID] ?? [];
    const result = Binary.search(list, message.id, (m) => m.id);
    const next = [...list];
    if (result.found) {
      next[result.index] = message;
    } else {
      next.splice(result.index, 0, message);
    }
    return { messages: { ...s.messages, [sessionID]: next } };
  }),

  removeMessage: (sessionID, messageID) => set((s) => {
    const list = s.messages[sessionID];
    if (!list) return s;
    const result = Binary.search(list, messageID, (m) => m.id);
    if (!result.found) return s;
    const next = [...list];
    next.splice(result.index, 1);
    const { [messageID]: _, ...restParts } = s.parts;
    return {
      messages: { ...s.messages, [sessionID]: next },
      parts: restParts,
    };
  }),

  upsertPart: (messageID, part) => set((s) => {
    const list = s.parts[messageID] ?? [];
    const result = Binary.search(list, part.id, (p) => p.id);
    const next = [...list];
    if (result.found) {
      next[result.index] = part;
    } else {
      next.splice(result.index, 0, part);
    }
    return { parts: { ...s.parts, [messageID]: next } };
  }),

  removePart: (messageID, partID) => set((s) => {
    const list = s.parts[messageID];
    if (!list) return s;
    const result = Binary.search(list, partID, (p) => p.id);
    if (!result.found) return s;
    const next = [...list];
    next.splice(result.index, 1);
    if (next.length === 0) {
      const { [messageID]: _, ...restParts } = s.parts;
      return { parts: restParts };
    }
    return { parts: { ...s.parts, [messageID]: next } };
  }),

  applyPartDelta: (messageID, partID, field, delta) => set((s) => {
    const list = s.parts[messageID];
    if (!list) return s;
    const result = Binary.search(list, partID, (p) => p.id);
    if (!result.found) return s;
    const next = [...list];
    const part = { ...next[result.index] };
    const existing = (part as Record<string, unknown>)[field] as string | undefined;
    (part as Record<string, unknown>)[field] = (existing ?? '') + delta;
    next[result.index] = part as Part;
    return { parts: { ...s.parts, [messageID]: next } };
  }),

  setStatus: (sessionID, status) => set((s) => ({
    sessionStatus: { ...s.sessionStatus, [sessionID]: status },
  })),

  addPermission: (permission) => set((s) => {
    const sessionID = permission.sessionID;
    const list = s.permissions[sessionID] ?? [];
    const result = Binary.search(list, permission.id, (p) => p.id);
    const next = [...list];
    if (result.found) {
      next[result.index] = permission;
    } else {
      next.splice(result.index, 0, permission);
    }
    return { permissions: { ...s.permissions, [sessionID]: next } };
  }),

  removePermission: (sessionID, permissionID) => set((s) => {
    const list = s.permissions[sessionID];
    if (!list) return s;
    const result = Binary.search(list, permissionID, (p) => p.id);
    if (!result.found) return s;
    const next = [...list];
    next.splice(result.index, 1);
    return { permissions: { ...s.permissions, [sessionID]: next } };
  }),

  addQuestion: (question) => set((s) => {
    const sessionID = question.sessionID;
    const list = s.questions[sessionID] ?? [];
    const result = Binary.search(list, question.id, (q) => q.id);
    const next = [...list];
    if (result.found) {
      next[result.index] = question;
    } else {
      next.splice(result.index, 0, question);
    }
    return { questions: { ...s.questions, [sessionID]: next } };
  }),

  removeQuestion: (sessionID, questionID) => set((s) => {
    const list = s.questions[sessionID];
    if (!list) return s;
    const result = Binary.search(list, questionID, (q) => q.id);
    if (!result.found) return s;
    const next = [...list];
    next.splice(result.index, 1);
    return { questions: { ...s.questions, [sessionID]: next } };
  }),

  setDiff: (sessionID, diffs) => set((s) => ({
    diffs: { ...s.diffs, [sessionID]: diffs },
  })),

  setTodo: (sessionID, todos) => set((s) => ({
    todos: { ...s.todos, [sessionID]: todos },
  })),

  optimisticAdd: (sessionID, message, messageParts) => set((s) => {
    const list = s.messages[sessionID] ?? [];
    const result = Binary.search(list, message.id, (m) => m.id);
    const nextMsgs = [...list];
    if (result.found) {
      nextMsgs[result.index] = message; // already exists — update in place
    } else {
      nextMsgs.splice(result.index, 0, message);
    }
    const sorted = messageParts.filter((p) => !!p?.id).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return {
      messages: { ...s.messages, [sessionID]: nextMsgs },
      parts: { ...s.parts, [message.id]: sorted },
    };
  }),

  optimisticRemove: (sessionID, messageID) => set((s) => {
    const list = s.messages[sessionID];
    if (!list) return s;
    const result = Binary.search(list, messageID, (m) => m.id);
    if (!result.found) return s;
    const nextMsgs = [...list];
    nextMsgs.splice(result.index, 1);
    const { [messageID]: _, ...restParts } = s.parts;
    return {
      messages: { ...s.messages, [sessionID]: nextMsgs },
      parts: restParts,
    };
  }),

  hydrate: (sessionID, msgs) => set((s) => {
    const sorted = msgs
      .filter((m) => !!m?.info?.id)
      .map((m) => m.info)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const newParts = { ...s.parts };
    for (const m of msgs) {
      if (!m?.info?.id) continue;
      newParts[m.info.id] = m.parts
        .filter((p) => !!p?.id)
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    // Merge: keep any optimistic messages that aren't in the fetched set
    const existing = s.messages[sessionID] ?? [];
    const fetchedIds = new Set(sorted.map((m) => m.id));
    const optimistic = existing.filter((m) => !fetchedIds.has(m.id));
    const merged = [...sorted];
    for (const m of optimistic) {
      const r = Binary.search(merged, m.id, (x) => x.id);
      if (!r.found) merged.splice(r.index, 0, m);
    }
    return {
      messages: { ...s.messages, [sessionID]: merged },
      parts: newParts,
    };
  }),

  reset: () => set({
    messages: {},
    parts: {},
    sessionStatus: {},
    permissions: {},
    questions: {},
    diffs: {},
    todos: {},
  }),

  // ---- Selector: join messages + parts into MessageWithParts[] ----

  getMessages: (sessionID) => {
    const s = get();
    const msgs = s.messages[sessionID];
    if (!msgs) return [];
    return msgs.map((info) => ({
      info,
      parts: s.parts[info.id] ?? [],
    }));
  },

  // ---- Event reducer (matches SolidJS event-reducer.ts 1:1) ----

  applyEvent: (event) => {
    const store = get();
    switch (event.type) {
      case 'message.updated': {
        const info = (event.properties as { info: Message }).info;
        if (!info?.sessionID) return;
        store.upsertMessage(info.sessionID, info);
        return;
      }
      case 'message.removed': {
        const props = event.properties as { sessionID: string; messageID: string };
        if (!props.sessionID || !props.messageID) return;
        store.removeMessage(props.sessionID, props.messageID);
        return;
      }
      case 'message.part.updated': {
        const part = (event.properties as { part: Part }).part;
        if (!part?.messageID) return;
        store.upsertPart(part.messageID, part);
        return;
      }
      case 'message.part.removed': {
        const props = event.properties as { messageID: string; partID: string };
        if (!props.messageID || !props.partID) return;
        store.removePart(props.messageID, props.partID);
        return;
      }
      case 'message.part.delta': {
        const props = event.properties as { messageID: string; partID: string; field: string; delta: string };
        if (!props.messageID || !props.partID || !props.field) return;
        store.applyPartDelta(props.messageID, props.partID, props.field, props.delta);
        return;
      }
      case 'session.status': {
        const props = event.properties as { sessionID: string; status: SessionStatus };
        if (props.sessionID && props.status) store.setStatus(props.sessionID, props.status);
        return;
      }
      case 'session.idle': {
        const sessionID = (event.properties as { sessionID: string }).sessionID;
        if (sessionID) store.setStatus(sessionID, { type: 'idle' });
        return;
      }
      case 'session.diff': {
        const props = event.properties as { sessionID: string; diff: FileDiff[] };
        if (props.sessionID) store.setDiff(props.sessionID, props.diff);
        return;
      }
      case 'todo.updated': {
        const props = event.properties as { sessionID: string; todos: Todo[] };
        if (props.sessionID) store.setTodo(props.sessionID, props.todos);
        return;
      }
      case 'permission.asked': {
        const permission = event.properties as PermissionRequest;
        if (permission?.id && permission?.sessionID) store.addPermission(permission);
        return;
      }
      case 'permission.replied': {
        const props = event.properties as { sessionID: string; requestID: string };
        if (props.sessionID && props.requestID) store.removePermission(props.sessionID, props.requestID);
        return;
      }
      case 'question.asked': {
        const question = event.properties as QuestionRequest;
        if (question?.id && question?.sessionID) store.addQuestion(question);
        return;
      }
      case 'question.replied':
      case 'question.rejected': {
        const props = event.properties as { sessionID: string; requestID: string };
        if (props.sessionID && props.requestID) store.removeQuestion(props.sessionID, props.requestID);
        return;
      }
      default:
        return;
    }
  },
}));
