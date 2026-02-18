import { tool } from "@opencode-ai/plugin";

/**
 * List connected integrations available in this sandbox.
 * Queries kortix-master → kortix-api to get linked integrations.
 */
export default tool({
  description:
    "List connected third-party integrations (OAuth) available in this sandbox. " +
    "Returns the apps that have been connected and linked to this sandbox (e.g. google_sheets, slack, github). " +
    "Use this to check what integrations are available before using integration_exec.",
  args: {},
  async execute() {
    const masterUrl = process.env.KORTIX_MASTER_URL || "http://localhost:8000";

    try {
      const res = await fetch(`${masterUrl}/api/integrations/list`, {
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.text();
        return JSON.stringify(
          {
            success: false,
            error: `Failed to list integrations (${res.status}): ${err}`,
            hint: "The user may need to connect integrations from the dashboard first.",
          },
          null,
          2,
        );
      }

      const data = (await res.json()) as {
        integrations: Array<{ app: string; appName: string; status: string }>;
      };

      if (!data.integrations || data.integrations.length === 0) {
        return JSON.stringify(
          {
            success: true,
            integrations: [],
            message:
              "No integrations connected to this sandbox. " +
              "Ask the user to connect integrations from the Kortix dashboard.",
          },
          null,
          2,
        );
      }

      return JSON.stringify(
        {
          success: true,
          integrations: data.integrations,
          message: `${data.integrations.length} integration(s) available.`,
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `Failed to reach integration service: ${err}`,
        },
        null,
        2,
      );
    }
  },
});
