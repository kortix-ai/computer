import { tool } from "@opencode-ai/plugin";

/**
 * Onboarding completion tool — called by the onboarding agent when the user
 * has been welcomed, their context collected, and Kortix explained.
 *
 * Sets ONBOARDING_COMPLETE + metadata via the kortix-master ENV API so the
 * frontend can detect completion and unlock the dashboard.
 */
export default tool({
  description:
    "Mark onboarding as complete. Call this ONLY after you've welcomed the user, learned about them (name, role, goals), explained Kortix's capabilities, and written their profile to MEMORY.md. This unlocks the full Kortix dashboard.",
  args: {
    user_name: tool.schema
      .string()
      .describe("The user's name as they told you."),
    user_summary: tool.schema
      .string()
      .describe(
        "Brief 1-2 sentence summary of who they are and what they want to use Kortix for."
      ),
  },
  async execute(args) {
    const { user_name, user_summary } = args;
    const masterUrl = process.env.KORTIX_MASTER_URL || "http://localhost:8000";

    // All the keys we want to persist
    const entries: Record<string, string> = {
      ONBOARDING_COMPLETE: "true",
      ONBOARDING_USER_NAME: user_name,
      ONBOARDING_USER_SUMMARY: user_summary,
      ONBOARDING_COMPLETED_AT: new Date().toISOString(),
    };

    // Try to capture the current session ID from environment (OpenCode sets this)
    const sessionId = process.env.OPENCODE_SESSION_ID || "";
    if (sessionId) {
      entries.ONBOARDING_SESSION_ID = sessionId;
    }

    let allOk = true;
    for (const [key, value] of Object.entries(entries)) {
      try {
        const res = await fetch(`${masterUrl}/env/${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
        if (!res.ok) allOk = false;
      } catch {
        allOk = false;
      }
    }

    // Fallback: if we couldn't reach kortix-master at all, write a file flag
    // so the frontend can still detect completion
    if (!allOk) {
      try {
        const { writeFileSync, mkdirSync } = await import("fs");
        const { join } = await import("path");
        const home = process.env.HOME || "/workspace";
        const flagDir = join(home, ".kortix");
        mkdirSync(flagDir, { recursive: true });
        writeFileSync(join(flagDir, ".onboarding-complete"), "true");
      } catch {
        // Best effort
      }
    }

    return `Onboarding complete! Welcome aboard, ${user_name}. ${user_summary}\n\nThe dashboard is now unlocked. The user will be redirected automatically.`;
  },
});
