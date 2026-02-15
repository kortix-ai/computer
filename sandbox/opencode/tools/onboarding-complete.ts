import { tool } from "@opencode-ai/plugin";

/**
 * Onboarding completion tool — called by the onboarding agent when the user
 * has been welcomed, their context collected, and Kortix explained.
 *
 * Sets the ONBOARDING_COMPLETE flag via the kortix-master ENV API so the
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

    // Write the flag via kortix-master's ENV API (localhost:8000 inside the sandbox)
    const masterUrl = process.env.KORTIX_MASTER_URL || "http://localhost:8000";

    try {
      const res = await fetch(`${masterUrl}/env/ONBOARDING_COMPLETE`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "true" }),
      });

      if (!res.ok) {
        // Fallback: try writing directly to a file the frontend can check
        const { writeFileSync, mkdirSync } = await import("fs");
        const { join } = await import("path");
        const home = process.env.HOME || "/workspace";
        const flagDir = join(home, ".kortix");
        mkdirSync(flagDir, { recursive: true });
        writeFileSync(join(flagDir, ".onboarding-complete"), "true");
      }
    } catch {
      // Fallback: write file flag
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const home = process.env.HOME || "/workspace";
      const flagDir = join(home, ".kortix");
      mkdirSync(flagDir, { recursive: true });
      writeFileSync(join(flagDir, ".onboarding-complete"), "true");
    }

    return `Onboarding complete! Welcome aboard, ${user_name}. ${user_summary}\n\nThe dashboard is now unlocked. The user will be redirected automatically.`;
  },
});
