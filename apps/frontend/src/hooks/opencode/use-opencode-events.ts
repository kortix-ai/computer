"use client";

import type {
	Event as OpenCodeEvent,
	Part,
} from "@kortix/opencode-sdk/v2/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fileContentKeys } from "@/features/files/hooks/use-file-content";
import { fileListKeys } from "@/features/files/hooks/use-file-list";
import { gitStatusKeys } from "@/features/files/hooks/use-git-status";
import { clearConfigOverrides } from "@/hooks/opencode/use-opencode-config";
import { getSupabaseAccessToken, invalidateTokenCache } from "@/lib/auth-token";
import { logger } from "@/lib/logger";
import { getClient, resetClient } from "@/lib/opencode-sdk";
import { toast } from "@/lib/toast";
import {
	notifyPermissionRequest,
	notifyQuestion,
	notifySessionError,
	notifyTaskComplete,
} from "@/lib/web-notifications";
import { useDiagnosticsStore } from "@/stores/diagnostics-store";
import { useOpenCodePendingStore } from "@/stores/opencode-pending-store";
import { useOpenCodeSessionStatusStore } from "@/stores/opencode-session-status-store";
import { useSyncStore } from "@/stores/opencode-sync-store";
import { useServerStore } from "@/stores/server-store";
import { ptyKeys } from "./use-opencode-pty";
import { opencodeKeys } from "./use-opencode-sessions";

/**
 * Connects to OpenCode's SSE event stream via the SDK and
 * performs INCREMENTAL cache updates on React Query data.
 *
 * Instead of invalidating queries (which triggers full refetches),
 * we use setQueryData to surgically update messages, parts, sessions, etc.
 * This matches the SolidJS reference implementation's approach.
 */
export function useOpenCodeEventStream() {
	const queryClient = useQueryClient();
	const setStatus = useOpenCodeSessionStatusStore((s) => s.setStatus);
	const clearStatuses = useOpenCodeSessionStatusStore((s) => s.setStatuses);
	const addPermission = useOpenCodePendingStore((s) => s.addPermission);
	const removePermission = useOpenCodePendingStore((s) => s.removePermission);
	const addQuestion = useOpenCodePendingStore((s) => s.addQuestion);
	const removeQuestion = useOpenCodePendingStore((s) => s.removeQuestion);
	const clearPending = useOpenCodePendingStore((s) => s.clear);
	const applySyncEvent = useSyncStore((s) => s.applyEvent);
	const serverVersion = useServerStore((s) => s.serverVersion);
	const abortRef = useRef<AbortController | null>(null);
	const prevServerVersionRef = useRef(serverVersion);

	useEffect(() => {
		// Only nuke caches on actual server switches (not URL/port updates)
		const isServerSwitch = prevServerVersionRef.current !== serverVersion;
		prevServerVersionRef.current = serverVersion;

		// Only reset the SDK client on actual server switches — NOT on URL/port
		// updates. Resetting on every urlVersion change tears down the client
		// unnecessarily, causing SSE disconnection → reconnection → cache
		// invalidation cascade that manifests as random loading flashes.
		if (isServerSwitch) {
			resetClient();
			clearConfigOverrides();
			clearStatuses({});
			clearPending();
			useSyncStore.getState().reset();
			useDiagnosticsStore.getState().clearAll();
			queryClient.removeQueries({ queryKey: opcodeKeys.all });
		}

		const client = getClient();

		// Hydrate pending permissions, questions, AND session statuses on connect.
		// The sync store is in-memory only — on hard refresh ALL session statuses
		// are wiped, so the UI thinks every session is idle. Without this hydration,
		// a busy session won't show as busy until a session.status SSE event arrives
		// (which only fires on status *changes*, not for already-busy sessions).
		client.permission
			.list()
			.then((res) => {
				if (res.data) (res.data as any[]).forEach(addPermission);
			})
			.catch((err) => {
				logger.error("Failed to hydrate pending permissions", {
					error: String(err),
				});
			});

		client.question
			.list()
			.then((res) => {
				if (res.data) (res.data as any[]).forEach(addQuestion);
			})
			.catch((err) => {
				logger.error("Failed to hydrate pending questions", {
					error: String(err),
				});
			});

		client.session
			.status()
			.then((res) => {
				if (res.data) {
					const statuses = res.data as Record<string, any>;
					for (const [sessionID, status] of Object.entries(statuses)) {
						applySyncEvent({
							type: "session.status",
							properties: { sessionID, status },
						} as any);
					}
				}
			})
			.catch((err) => {
				logger.error("Failed to hydrate session statuses", {
					error: String(err),
				});
			});

		// Set up SSE via the SDK's AsyncGenerator
		const abortController = new AbortController();
		abortRef.current = abortController;

		// Event coalescing queue (like the SolidJS reference)
		let queue: ({ type: string; event: OpenCodeEvent } | undefined)[] = [];
		let flushTimer: ReturnType<typeof setTimeout> | undefined;
		let lastFlush = 0;

		// Coalescing map — replaces earlier events of the same key
		const coalesced = new Map<string, number>();

		// Coalescing keys — matches OpenCode global-sdk.tsx exactly.
		// message.part.updated IS coalesced (same part ID replaces earlier entry).
		// This is safe because the server sends the FULL part state each time,
		// not deltas. The sync store's upsertPart replaces the whole part.
		function getCoalesceKey(event: OpenCodeEvent): string | undefined {
			if (event.type === "session.status") {
				return `session.status:${(event.properties as any).sessionID}`;
			}
			if (event.type === "lsp.updated") return "lsp.updated";
			if (event.type === "message.part.updated") {
				const part = (event.properties as any).part;
				return `message.part.updated:${part?.messageID}:${part?.id}`;
			}
			return undefined;
		}

		const flush = () => {
			if (flushTimer) clearTimeout(flushTimer);
			flushTimer = undefined;
			if (queue.length === 0) return;

			const events = queue;
			queue = [];
			coalesced.clear();
			lastFlush = Date.now();

			for (const item of events) {
				if (!item) continue;
				handleEvent(item.event);
			}
		};

		const schedule = () => {
			if (flushTimer) return;
			const elapsed = Date.now() - lastFlush;
			flushTimer = setTimeout(flush, Math.max(0, 16 - elapsed));
		};

		// Consume the stream in the background with automatic retry
		(async () => {
			let retryCount = 0;
			while (!abortController.signal.aborted) {
				try {
					const result = await client.global.event({
						signal: abortController.signal,
						sseDefaultRetryDelay: 3000,
						sseMaxRetryDelay: 30000,
					} as any);
					const { stream } = result;

					// On reconnect, refresh non-message data (sessions list, config, etc).
					// Do NOT refetch messages — sync store is the source of truth and
					// stale refetch data can overwrite live streaming state.
					// SSE events will bring the sync store up to date.
					if (retryCount > 0) {
						queryClient.refetchQueries({
							queryKey: opcodeKeys.sessions(),
						});
						// Re-hydrate pending permissions & questions on reconnect.
						// If the SSE connection dropped, we may have missed question.asked
						// or permission.asked events, leaving the session stuck in "busy"
						// with no prompt visible. Fetching the current list fixes that.
						client.permission
							.list()
							.then((res) => {
								if (res.data) (res.data as any[]).forEach(addPermission);
							})
							.catch(() => {});
						client.question
							.list()
							.then((res) => {
								if (res.data) (res.data as any[]).forEach(addQuestion);
							})
							.catch(() => {});
						client.session
							.status()
							.then((res) => {
								if (res.data) {
									const statuses = res.data as Record<string, any>;
									for (const [sessionID, status] of Object.entries(statuses)) {
										applySyncEvent({
											type: "session.status",
											properties: { sessionID, status },
										} as any);
									}
								}
							})
							.catch(() => {});
					}
					retryCount = 0;

					// Consume stream exactly like OpenCode global-sdk.tsx:
					// queue + coalesce + 16ms flush + yield every 8ms
					let yieldedAt = Date.now();
					for await (const event of stream) {
						if (abortController.signal.aborted) break;
						const raw = event as any;
						const e = (
							raw && typeof raw === "object" && "payload" in raw
								? raw.payload
								: raw
						) as OpenCodeEvent;
						if (!e?.type) continue;

						const ck = getCoalesceKey(e);
						if (ck) {
							const existing = coalesced.get(ck);
							if (existing !== undefined) {
								queue[existing] = undefined;
							}
							coalesced.set(ck, queue.length);
						}
						queue.push({ type: (e as any).type, event: e });
						schedule();

						if (Date.now() - yieldedAt < 8) continue;
						yieldedAt = Date.now();
						await new Promise<void>((resolve) => setTimeout(resolve, 0));
					}
				} catch (err) {
					if (abortController.signal.aborted) break;
					const errStr = String(err);
					const isAuthError =
						errStr.includes("401") ||
						errStr.includes("403") ||
						errStr.includes("Unauthorized") ||
						errStr.includes("Token refresh failed");
					logger.error("SSE event stream error", {
						error: errStr,
						retryCount,
						isAuthError,
					});

					// On auth errors, invalidate the token cache and fetch a fresh token.
					// This ensures all callers (SSE, health check, SDK) immediately use
					// the refreshed token instead of serving stale cached ones for 30s.
					if (isAuthError) {
						try {
							invalidateTokenCache();
							await getSupabaseAccessToken();
							logger.info("SSE: refreshed auth token after auth error");
						} catch (refreshErr) {
							logger.error("SSE: failed to refresh auth token", {
								error: String(refreshErr),
							});
						}
					}
				} finally {
					flush();
				}

				// Stream ended or errored — reconnect immediately on first attempt,
				// then use exponential backoff. ERR_INCOMPLETE_CHUNKED_ENCODING is normal
				// when the server closes the SSE connection between response cycles.
				if (abortController.signal.aborted) break;
				retryCount++;
				if (retryCount > 1) {
					logger.warn("SSE event stream reconnecting", { retryCount });
				}
				const delay =
					retryCount <= 1
						? 100
						: Math.min(1000 * 2 ** Math.min(retryCount - 1, 5), 30000);
				await new Promise<void>((resolve) => {
					const timer = setTimeout(resolve, delay);
					const onAbort = () => {
						clearTimeout(timer);
						resolve();
					};
					abortController.signal.addEventListener("abort", onAbort, {
						once: true,
					});
				});
			}
		})();

		// Helper: look up a session title from the React Query cache for notifications
		function getSessionTitle(sessionID: string): string | undefined {
			const sessions = queryClient.getQueryData<any[]>(opencodeKeys.sessions());
			if (sessions) {
				const s = sessions.find((s: any) => s.id === sessionID);
				if (s?.title) return s.title;
			}
			const session = queryClient.getQueryData<any>(
				opencodeKeys.session(sessionID),
			);
			return session?.title || undefined;
		}

		function handleEvent(event: OpenCodeEvent) {
			// Sync store is the SINGLE source of truth for messages & parts.
			// This matches OpenCode's architecture where the SolidJS store is
			// the only place message/part data lives.
			applySyncEvent(event);

			switch (event.type) {
				// ---- Message events — handled by sync store only ----
				case "message.updated":
				case "message.removed":
					break;

				case "message.part.updated": {
					// Extract diagnostics from tool part metadata if present
					const part = (event.properties as any).part as Part;
					const partMeta = (part as any)?.metadata;
					if (
						partMeta?.diagnostics &&
						typeof partMeta.diagnostics === "object"
					) {
						const diagsByFile = partMeta.diagnostics as Record<string, any[]>;
						const validEntries: Record<string, any[]> = {};
						let hasValid = false;
						for (const [file, diags] of Object.entries(diagsByFile)) {
							if (Array.isArray(diags) && diags.length > 0) {
								validEntries[file] = diags;
								hasValid = true;
							}
						}
						if (hasValid) {
							useDiagnosticsStore.getState().setFromLspEvent(validEntries);
						}
					}
					break;
				}

				case "message.part.removed":
					break;

				// ---- Session lifecycle ----
				case "session.created":
				case "session.updated":
				case "session.deleted": {
					// For sessions, just invalidate — the list is small and needs sorting
					queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
					const sessionID = (event.properties as any)?.info?.id;
					if (sessionID) {
						queryClient.invalidateQueries({
							queryKey: opencodeKeys.session(sessionID),
						});
					}
					break;
				}

				case "session.compacted": {
					const sessionID = (event.properties as any).sessionID;
					if (sessionID) {
						// Full refetch after compaction since messages changed significantly.
						// Rehydrate the sync store (the single source of truth for messages).
						getClient()
							.session.messages({ sessionID })
							.then((res) => {
								if (res.data)
									useSyncStore.getState().hydrate(sessionID, res.data as any);
							})
							.catch(() => {});
						// Also invalidate session to clear time.compacting
						queryClient.invalidateQueries({
							queryKey: opencodeKeys.session(sessionID),
						});
					}
					break;
				}

				// ---- Session status ----
				case "session.status": {
					const { sessionID, status } = event.properties as any;
					if (sessionID && status) {
						// Detect busy/retry → idle transition BEFORE updating the store
						// (coalescing can drop intermediate busy events, so we check here)
						const prevStatus =
							useOpenCodeSessionStatusStore.getState().statuses[sessionID];
						setStatus(sessionID, status);
						if (
							status.type === "idle" &&
							prevStatus &&
							prevStatus.type !== "idle"
						) {
							notifyTaskComplete(sessionID, getSessionTitle(sessionID));
						}
					}
					break;
				}

				case "session.idle": {
					const sessionID = (event.properties as any).sessionID;
					if (sessionID) {
						const prevStatus =
							useOpenCodeSessionStatusStore.getState().statuses[sessionID];
						setStatus(sessionID, { type: "idle" });
						if (prevStatus && prevStatus.type !== "idle") {
							notifyTaskComplete(sessionID, getSessionTitle(sessionID));
						}
					}
					break;
				}

				// ---- Session errors ----
				case "session.error": {
					const props = event.properties as { sessionID?: string; error?: any };
					if (props.sessionID && props.error) {
						// Fire browser notification
						const errorTitle =
							props.error?.name ||
							props.error?.data?.message ||
							"An error occurred";
						notifySessionError(
							props.sessionID,
							errorTitle,
							getSessionTitle(props.sessionID),
						);

						// Patch the error onto the last assistant message in cache.
						// This is critical because:
						// 1. session.error arrives BEFORE message.updated with .error
						// 2. Some error paths (model-not-found, agent-not-found) never
						//    emit message.updated with .error at all
						// 3. Polling can race and overwrite the error from message.updated
						const key = opencodeKeys.messages(props.sessionID);
						queryClient.cancelQueries({ queryKey: key });
						queryClient.setQueryData<MessageWithParts[]>(key, (old) => {
							if (!old || old.length === 0) return old;
							// Find the last assistant message and patch error onto it
							for (let i = old.length - 1; i >= 0; i--) {
								if (old[i].info.role === "assistant") {
									if ((old[i].info as any).error) return old; // already has error
									const updated = [...old];
									updated[i] = {
										...old[i],
										info: { ...old[i].info, error: props.error } as any,
									};
									return updated;
								}
							}
							return old;
						});
					}
					break;
				}

				// ---- Permissions ----
				case "permission.asked": {
					const props = event.properties as any;
					if (props.id && props.sessionID) {
						addPermission(props);
						// Fire browser notification for permission requests
						const toolName = props.tool || props.type || "a tool";
						notifyPermissionRequest(
							props.sessionID,
							toolName,
							getSessionTitle(props.sessionID),
						);
					}
					break;
				}
				case "permission.replied": {
					const requestID = (event.properties as any).requestID;
					if (requestID) removePermission(requestID);
					break;
				}

				// ---- Questions ----
				case "question.asked": {
					const props = event.properties as any;
					if (props.id && props.sessionID) {
						addQuestion(props);
						// Fire browser notification for questions needing user input
						const questionText =
							props.questions?.[0]?.question ||
							props.questions?.[0]?.header ||
							"Kortix needs your input";
						notifyQuestion(
							props.sessionID,
							questionText,
							getSessionTitle(props.sessionID),
						);
					}
					break;
				}
				case "question.replied":
				case "question.rejected": {
					const requestID = (event.properties as any).requestID;
					if (requestID) removeQuestion(requestID);
					break;
				}

				// ---- Session diff ----
				case "session.diff": {
					const props = event.properties as { sessionID: string; diff: any[] };
					if (props.sessionID) {
						queryClient.setQueryData(
							["opencode", "session-diff", props.sessionID],
							props.diff,
						);
					}
					break;
				}

				// ---- Todo updated ----
				case "todo.updated": {
					const props = event.properties as { sessionID: string; todos: any[] };
					if (props.sessionID) {
						queryClient.setQueryData(
							["opencode", "session-todo", props.sessionID],
							props.todos,
						);
					}
					break;
				}

				// ---- VCS branch ----
				case "vcs.branch.updated": {
					const props = event.properties as { branch: string };
					queryClient.setQueryData(["opencode", "vcs"], {
						branch: props.branch,
					});
					break;
				}

				// ---- Server disposed ----
				case "server.instance.disposed": {
					// Full refresh of all data
					queryClient.invalidateQueries({ queryKey: opcodeKeys.all });
					break;
				}

				// ---- LSP updated ----
				case "lsp.updated": {
					queryClient.invalidateQueries({ queryKey: ["opencode", "lsp"] });
					// Push diagnostics data into the diagnostics store if the event
					// contains file-keyed diagnostic arrays.
					const lspProps = event.properties as Record<string, unknown>;
					if (lspProps) {
						// The lsp.updated event may carry diagnostics as
						// { [filePath]: Diagnostic[] } in its properties.
						const diagEntries: Record<string, any[]> = {};
						let hasDiags = false;
						for (const [key, value] of Object.entries(lspProps)) {
							if (Array.isArray(value)) {
								diagEntries[key] = value;
								hasDiags = true;
							}
						}
						if (hasDiags) {
							useDiagnosticsStore.getState().setFromLspEvent(diagEntries);
						}
					}
					break;
				}

				// ---- LSP client diagnostics (per-file notification) ----
				case "lsp.client.diagnostics": {
					// This event signals diagnostics changed for a specific file.
					// The properties contain { serverID, path } and potentially
					// inline diagnostic data.
					const diagProps = event.properties as Record<string, unknown>;
					const diagPath = diagProps?.path as string | undefined;
					if (diagPath) {
						const diagnostics = diagProps?.diagnostics;
						if (Array.isArray(diagnostics)) {
							useDiagnosticsStore.getState().setFromLspEvent({
								[diagPath]: diagnostics,
							});
						}
					}
					break;
				}

				// ---- MCP tools changed ----
				case "mcp.tools.changed": {
					// MCP server tools were added/removed/changed — refresh status + tool lists
					queryClient.invalidateQueries({ queryKey: opencodeKeys.mcpStatus() });
					queryClient.invalidateQueries({ queryKey: opencodeKeys.toolIds() });
					break;
				}

				// ---- PTY events ----
				case "pty.created":
				case "pty.updated":
				case "pty.exited":
				case "pty.deleted": {
					queryClient.invalidateQueries({ queryKey: ptyKeys.listPrefix() });
					break;
				}

				// ---- Worktree events — disabled for now ----
				case "worktree.ready": {
					queryClient.invalidateQueries({ queryKey: opencodeKeys.worktrees() });
					queryClient.invalidateQueries({ queryKey: opencodeKeys.projects() });
					break;
				}

				case "worktree.failed": {
					queryClient.invalidateQueries({ queryKey: opencodeKeys.worktrees() });
					break;
				}

				// ---- Project updated ----
				case "project.updated": {
					queryClient.invalidateQueries({ queryKey: opencodeKeys.projects() });
					queryClient.invalidateQueries({
						queryKey: opencodeKeys.currentProject(),
					});
					break;
				}

				// ---- File edited (outside agent, e.g. user edits in editor) ----
				case "file.edited": {
					const fileProps = event.properties as { file?: string };
					queryClient.invalidateQueries({ queryKey: fileListKeys.all });
					queryClient.invalidateQueries({ queryKey: gitStatusKeys.all });
					if (fileProps.file) {
						queryClient.invalidateQueries({ queryKey: fileContentKeys.all });
					}
					break;
				}

				// ---- Installation events ----
				case "installation.updated": {
					const installProps = event.properties as { version?: string };
					const versionStr = installProps.version
						? ` (v${installProps.version})`
						: "";
					toast.info(
						`Installation updated${versionStr}. Restart to apply changes.`,
						{
							duration: 10_000,
						},
					);
					break;
				}

				case "installation.update-available": {
					const updateProps = event.properties as { version?: string };
					const versionLabel = updateProps.version
						? `v${updateProps.version}`
						: "A new version";
					toast.info(
						`${versionLabel} is available. Update when you're ready.`,
						{
							duration: 15_000,
						},
					);
					break;
				}

				default:
					break;
			}
		}

		return () => {
			abortController.abort();
			abortRef.current = null;
			if (flushTimer) clearTimeout(flushTimer);
		};
		// NOTE: urlVersion is intentionally excluded from deps. URL/port updates
		// (via updateServerSilent) don't change the SSE endpoint — only the
		// connection health monitor needs to re-verify on urlVersion changes.
		// Including urlVersion here caused unnecessary SSE disconnection →
		// reconnection → cache invalidation cascades (the "random loading" bug).
		// The SDK's getClient() auto-detects URL changes via URL comparison,
		// so it handles URL updates lazily on next API call.
	}, [
		queryClient,
		setStatus,
		clearStatuses,
		addPermission,
		removePermission,
		addQuestion,
		removeQuestion,
		clearPending,
		serverVersion,
		applySyncEvent,
	]);
}

// Use the correct key reference
const opcodeKeys = opencodeKeys;
