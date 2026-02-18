import { tool } from "@opencode-ai/plugin";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

/**
 * Execute code that calls an authenticated third-party API.
 * The OAuth token is injected as an environment variable — never printed or logged.
 *
 * Security:
 * - Token is ONLY in the subprocess env vars — never in tool output
 * - Temp code files are deleted immediately after execution
 * - Subprocess has a 30s timeout
 */
export default tool({
  description:
    "Execute code that calls an authenticated third-party API. " +
    "The OAuth token is securely injected as an environment variable — never printed or logged in the conversation. " +
    "Write standard Node.js code that reads the token from process.env.INTEGRATION_TOKEN. " +
    "For Python, use os.environ['INTEGRATION_TOKEN']. " +
    "IMPORTANT: Never console.log or print the token itself.",
  args: {
    app: tool.schema
      .string()
      .describe(
        "The integration app slug (e.g. 'google_sheets', 'slack', 'github')",
      ),
    language: tool.schema
      .string()
      .optional()
      .describe("'node' (default) or 'python'"),
    code: tool.schema
      .string()
      .describe(
        "Code to execute. Access token via process.env.INTEGRATION_TOKEN (Node) or os.environ['INTEGRATION_TOKEN'] (Python). " +
        "The token type is in INTEGRATION_TOKEN_TYPE (usually 'Bearer').",
      ),
  },
  async execute(args) {
    const masterUrl = process.env.KORTIX_MASTER_URL || "http://localhost:8000";
    const language = args.language || "node";

    // 1. Fetch token from kortix-master → kortix-api
    let accessToken: string;
    let tokenType: string;

    try {
      const tokenRes = await fetch(`${masterUrl}/api/integrations/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: args.app }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return JSON.stringify(
          {
            success: false,
            error: `Integration "${args.app}" not available (${tokenRes.status}): ${err}`,
            hint: "Ask the user to connect this integration from the Kortix dashboard and link it to this sandbox.",
          },
          null,
          2,
        );
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        token_type: string;
        app: string;
      };
      accessToken = tokenData.access_token;
      tokenType = tokenData.token_type || "Bearer";
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `Failed to fetch token for "${args.app}": ${err}`,
        },
        null,
        2,
      );
    }

    // 2. Write code to temp file
    const tmpDir = "/tmp";
    const ext = language === "python" ? ".py" : ".mjs";
    const tmpFile = join(tmpDir, `.integration_exec_${Date.now()}${ext}`);

    try {
      writeFileSync(tmpFile, args.code, "utf-8");
    } catch (err) {
      return JSON.stringify(
        { success: false, error: `Failed to write temp file: ${err}` },
        null,
        2,
      );
    }

    // 3. Execute with token as env var (NOT in args/output)
    try {
      const runtime = language === "python" ? "python3" : "node";
      const result = spawnSync(runtime, [tmpFile], {
        env: {
          ...process.env,
          INTEGRATION_TOKEN: accessToken,
          INTEGRATION_TOKEN_TYPE: tokenType,
        },
        timeout: 30_000,
        maxBuffer: 1024 * 1024, // 1MB
        encoding: "utf-8",
      });

      const stdout = result.stdout || "";
      const stderr = result.stderr || "";
      const exitCode = result.status ?? -1;

      // Filter out any accidental token leaks from output
      const sanitize = (text: string) =>
        text.replace(new RegExp(accessToken.slice(0, 20), "g"), "[REDACTED]");

      return JSON.stringify(
        {
          success: exitCode === 0,
          exit_code: exitCode,
          stdout: sanitize(stdout).slice(0, 10_000),
          stderr: sanitize(stderr).slice(0, 5_000),
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        { success: false, error: `Execution failed: ${err}` },
        null,
        2,
      );
    } finally {
      // 4. Clean up temp file
      try {
        unlinkSync(tmpFile);
      } catch {
        // Best effort
      }
    }
  },
});
