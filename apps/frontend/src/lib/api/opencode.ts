const OPENCODE_URL = process.env.NEXT_PUBLIC_OPENCODE_URL || 'http://localhost:4096';

// --- Types ---

export interface OpenCodeSession {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  parentID?: string;
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
    archived?: number;
  };
  share?: {
    url: string;
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
}

export interface OpenCodeMessageUser {
  id: string;
  sessionID: string;
  role: 'user';
  time: { created: number };
  agent: string;
  model: {
    providerID: string;
    modelID: string;
  };
  system?: string;
}

export interface OpenCodeMessageAssistant {
  id: string;
  sessionID: string;
  role: 'assistant';
  time: { created: number; completed?: number };
  parentID: string;
  modelID: string;
  providerID: string;
  agent: string;
  path: { cwd: string; root: string };
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
}

export type OpenCodeMessage = OpenCodeMessageUser | OpenCodeMessageAssistant;

export interface OpenCodeMessagePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface OpenCodeMessageWithParts {
  info: OpenCodeMessage;
  parts: OpenCodeMessagePart[];
}

// --- API Functions ---

async function opencodeFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${OPENCODE_URL}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenCode API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

export async function getOpenCodeSessions(): Promise<OpenCodeSession[]> {
  const data = await opencodeFetch<OpenCodeSession[]>('/session');
  // Sort by updated time descending
  return data.sort((a, b) => b.time.updated - a.time.updated);
}

export async function getOpenCodeSession(sessionId: string): Promise<OpenCodeSession> {
  return opencodeFetch<OpenCodeSession>(`/session/${sessionId}`);
}

export async function createOpenCodeSession(): Promise<OpenCodeSession> {
  const response = await fetch(`${OPENCODE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create session: ${errorText}`);
  }

  return response.json();
}

export async function deleteOpenCodeSession(sessionId: string): Promise<void> {
  const response = await fetch(`${OPENCODE_URL}/session/${sessionId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to delete session: ${errorText}`);
  }
}

export async function getOpenCodeMessages(sessionId: string): Promise<OpenCodeMessageWithParts[]> {
  return opencodeFetch<OpenCodeMessageWithParts[]>(`/session/${sessionId}/message`);
}

// --- Session Status Types & API ---

export interface OpenCodeSessionStatusIdle {
  type: 'idle';
}

export interface OpenCodeSessionStatusBusy {
  type: 'busy';
}

export interface OpenCodeSessionStatusRetry {
  type: 'retry';
  attempt: number;
  message: string;
  next: number;
}

export type OpenCodeSessionStatus =
  | OpenCodeSessionStatusIdle
  | OpenCodeSessionStatusBusy
  | OpenCodeSessionStatusRetry;

export async function getOpenCodeSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>> {
  return opencodeFetch<Record<string, OpenCodeSessionStatus>>('/session/status');
}

// --- Prompt / Abort API ---

export interface OpenCodePromptPart {
  type: 'text';
  text: string;
  id?: string;
}

export interface SendOpenCodeMessageOptions {
  model?: { providerID: string; modelID: string };
  agent?: string;
  variant?: string;
}

export async function sendOpenCodeMessage(
  sessionId: string,
  parts: OpenCodePromptPart[],
  options?: SendOpenCodeMessageOptions,
): Promise<void> {
  const response = await fetch(`${OPENCODE_URL}/session/${sessionId}/prompt_async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts, ...options }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to send message: ${errorText}`);
  }
}

export async function abortOpenCodeSession(sessionId: string): Promise<void> {
  const response = await fetch(`${OPENCODE_URL}/session/${sessionId}/abort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to abort session: ${errorText}`);
  }
}

export function getOpenCodeEventStreamUrl(): string {
  return `${OPENCODE_URL}/event`;
}

// --- Agent Types & API ---

export interface OpenCodePermissionRule {
  permission: string;
  action: 'allow' | 'deny' | 'ask';
  pattern: string;
}

export interface OpenCodeAgent {
  name: string;
  description?: string;
  mode: 'subagent' | 'primary' | 'all';
  native?: boolean;
  hidden?: boolean;
  topP?: number;
  temperature?: number;
  color?: string;
  model?: {
    modelID: string;
    providerID: string;
  };
  variant?: string;
  prompt?: string;
  steps?: number;
  permission?: OpenCodePermissionRule[];
  options?: Record<string, unknown>;
}

export async function getOpenCodeAgents(): Promise<OpenCodeAgent[]> {
  return opencodeFetch<OpenCodeAgent[]>('/agent');
}

export async function getOpenCodeAgent(agentName: string): Promise<OpenCodeAgent | undefined> {
  const agents = await getOpenCodeAgents();
  return agents.find((a) => a.name === agentName);
}

// --- Project Types & API ---

export interface OpenCodeProject {
  id: string;
  worktree: string;
  vcs?: 'git';
  name?: string;
  icon?: {
    url?: string;
    override?: string;
    color?: string;
  };
  commands?: {
    start?: string;
  };
  time: {
    created: number;
    updated: number;
    initialized?: number;
  };
  sandboxes: string[];
}

export async function getOpenCodeProjects(): Promise<OpenCodeProject[]> {
  return opencodeFetch<OpenCodeProject[]>('/project');
}

export async function getOpenCodeCurrentProject(): Promise<OpenCodeProject> {
  return opencodeFetch<OpenCodeProject>('/project/current');
}

// --- Provider / Model Types & API ---

export interface OpenCodeModel {
  id: string;
  name: string;
  family?: string;
  reasoning: boolean;
  attachment: boolean;
  limit: { context: number; output: number };
  cost?: { input: number; output: number };
  variants?: Record<string, Record<string, unknown>>;
  status?: 'alpha' | 'beta' | 'deprecated' | 'active';
}

export interface OpenCodeProviderInfo {
  id: string;
  name: string;
  models: Record<string, OpenCodeModel>;
}

export interface OpenCodeProviderListResponse {
  all: OpenCodeProviderInfo[];
  default: Record<string, string>;
  connected: string[];
}

export async function getOpenCodeProviders(): Promise<OpenCodeProviderListResponse> {
  return opencodeFetch<OpenCodeProviderListResponse>('/provider');
}

// --- Command Types & API ---

export interface OpenCodeCommand {
  name: string;
  title?: string;
  description?: string;
  args?: Record<string, unknown>;
}

export async function getOpenCodeCommands(): Promise<OpenCodeCommand[]> {
  return opencodeFetch<OpenCodeCommand[]>('/command');
}

export async function executeOpenCodeCommand(
  sessionId: string,
  command: string,
  args?: string,
): Promise<void> {
  const response = await fetch(`${OPENCODE_URL}/session/${sessionId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, arguments: args || '' }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to execute command: ${errorText}`);
  }
}

export async function summarizeOpenCodeSession(sessionId: string): Promise<void> {
  const response = await fetch(`${OPENCODE_URL}/session/${sessionId}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to summarize session: ${errorText}`);
  }
}

// --- Tool Types & API ---

export interface OpenCodeTool {
  id: string;
  description: string;
  parameters: unknown;
}

export async function getOpenCodeToolIds(): Promise<string[]> {
  return opencodeFetch<string[]>('/experimental/tool/ids');
}
