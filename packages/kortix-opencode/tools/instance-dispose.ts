import { tool } from "@opencode-ai/plugin";

/**
 * instance-dispose — Agent tool to manually trigger OpenCode instance dispose.
 *
 * When called, this sends POST /instance/dispose to the OpenCode server,
 * causing it to rescan skills, agents, plugins, tools, and config from disk.
 *
 * WHY: The hot-reload watcher in kortix-master auto-triggers dispose whenever
 * any file in .opencode/ changes. This kills in-flight operations ("The operation
 * was aborted."). By giving the agent a manual dispose tool, the agent can:
 *   1. Edit config files (opencode.jsonc, etc.)
 *   2. Finish its current work
 *   3. THEN call this tool to apply changes safely
 *
 * NUCLEAR WARNING: Calling this tears down ALL MCP connections, tool registries,
 * and internal state. EVERY active agent session across ALL sessions will be
 * aborted with "The operation was aborted." — not just the current one.
 * This is a server-wide operation. There is no way to scope it to one session.
 */

const OPENCODE_HOST = process.env.OPENCODE_HOST || "localhost";
const OPENCODE_PORT = process.env.OPENCODE_PORT || "4096";

export default tool({
  description: [
    "NUCLEAR: Trigger OpenCode instance dispose — forces the server to tear down",
    "ALL MCP connections, tool registries, and internal state, then rescan and reload",
    "all skills, agents, plugins, tools, commands, and config from disk.",
    "",
    "CONSEQUENCES (read carefully before calling):",
    "- ALL active agent sessions across ALL sessions will be KILLED immediately",
    "- ALL in-flight LLM calls, tool executions, and streaming responses will ABORT",
    "- ALL MCP server connections (memory, context7, etc.) will be torn down and reconnected",
    "- The error 'The operation was aborted.' will appear in every active session",
    "- This is a SERVER-WIDE operation — it is NOT scoped to the current session",
    "- Subagent tasks spawned via Task tool will also be killed mid-execution",
    "- After dispose, users must send a new message to resume in each session",
    "",
    "WHEN TO USE:",
    "- ONLY after editing .opencode/ config files (opencode.jsonc, agents, skills, etc.)",
    "- ONLY as the absolute LAST action — after ALL other work is 100% complete",
    "- ONLY when no other sessions are actively running important work",
    "- NEVER call this mid-task, mid-conversation, or while other tools are executing",
    "- NEVER call this 'just to refresh' — only when config changes REQUIRE a reload",
    "",
    "If you just edited opencode.jsonc or agent/skill files and need changes to take",
    "effect, warn the user first that all sessions will be interrupted, then call this.",
  ].join("\n"),
  args: {
    reason: tool.schema
      .string()
      .describe(
        "Brief reason for the dispose (e.g. 'updated opencode.jsonc model config'). Required for audit trail.",
      ),
  },
  async execute(args, _context) {
    const reason = args.reason || "manual agent trigger";

    try {
      const url = `http://${OPENCODE_HOST}:${OPENCODE_PORT}/instance/dispose`;
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });

      if (res.ok) {
        // Drain response body
        await res.arrayBuffer().catch(() => {});
        return [
          "INSTANCE DISPOSE TRIGGERED — ALL SESSIONS WILL BE INTERRUPTED",
          "",
          `Reason: ${reason}`,
          "",
          "What is happening RIGHT NOW:",
          "  1. All MCP connections are being torn down",
          "  2. All active agent sessions are being aborted",
          "  3. Tool registries, skills, agents, and config are being rescanned from disk",
          "  4. MCP connections are being re-established",
          "",
          "This session will abort momentarily.",
          "The user must send a new message to continue with the updated configuration.",
        ].join("\n");
      } else {
        const body = await res.text().catch(() => "");
        return `Instance dispose failed: HTTP ${res.status}${body ? ` — ${body}` : ""}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Instance dispose failed: ${msg}`;
    }
  },
});
