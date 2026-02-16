import { tool } from "@opencode-ai/plugin";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from "fs";
import { resolve, dirname, join, extname } from "path";
import { homedir } from "os";

const SHOW_DIR = join(process.env.HOME || homedir(), ".show-user");
const QUEUE_FILE = `${SHOW_DIR}/queue.jsonl`;
const KORTIX_API_URL = process.env.KORTIX_API_URL || "";
const SANDBOX_ID = process.env.SANDBOX_ID || "";

interface ShowEntry {
  id: string;
  timestamp: string;
  type: "file" | "url" | "image" | "text" | "error";
  title?: string;
  description?: string;
  path?: string;
  url?: string;
  publicUrl?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

async function uploadFileToStorage(
  filePath: string,
): Promise<string | null> {
  if (!KORTIX_API_URL || !SANDBOX_ID) {
    return null;
  }

  try {
    const fileContent = readFileSync(filePath);
    const contentBase64 = fileContent.toString("base64");
    const fileName = filePath.split("/").pop() || "file";

    let apiBase = KORTIX_API_URL;
    const routerIdx = apiBase.indexOf("/v1/router");
    if (routerIdx !== -1) {
      apiBase = apiBase.slice(0, routerIdx);
    }
    apiBase = apiBase.replace(/\/$/, "");
    const uploadUrl = `${apiBase}/v1/files/upload`;

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandboxId: SANDBOX_ID,
        fileName,
        contentBase64,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[show-user] File upload failed: ${res.status} ${errText}`,
      );
      return null;
    }

    const data = (await res.json()) as { publicUrl?: string };
    return data.publicUrl || null;
  } catch (err) {
    console.error(`[show-user] File upload error:`, err);
    return null;
  }
}

function ensureShowDir(): void {
  mkdirSync(SHOW_DIR, { recursive: true });
}

function generateId(): string {
  return `show_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function appendToQueue(entry: ShowEntry): void {
  ensureShowDir();
  appendFileSync(QUEUE_FILE, JSON.stringify(entry) + "\n");
}

function readQueue(): ShowEntry[] {
  if (!existsSync(QUEUE_FILE)) return [];
  const content = readFileSync(QUEUE_FILE, "utf-8").trim();
  if (!content) return [];
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ShowEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is ShowEntry => e !== null);
}

function clearQueue(): void {
  ensureShowDir();
  writeFileSync(QUEUE_FILE, "");
}

export default tool({
  description:
    "Show outputs and attachments to the human user. Use this tool to present files, images, URLs, " +
    "text content, or error messages to the user. Items are appended to a queue that the user's UI " +
    "reads from. Actions: 'show' (add item to queue), 'list' (list queued items), 'clear' (clear queue). " +
    "Always use this after generating a deliverable (image, document, video, presentation, etc.) " +
    "so the human can see and access it.",
  args: {
    action: tool.schema
      .string()
      .describe(
        "Action to perform: 'show' (add item to queue), 'list' (list queued items), 'clear' (clear the queue)",
      ),
    type: tool.schema
      .string()
      .optional()
      .describe(
        "Type of item to show. Required for 'show' action. " +
          "Options: 'file' (any file on disk), 'image' (image file), 'url' (web link), " +
          "'text' (inline text content), 'error' (error message for user)",
      ),
    title: tool.schema
      .string()
      .optional()
      .describe(
        "Short title for the item (displayed as heading). E.g. 'Generated Logo', 'Research Report'",
      ),
    description: tool.schema
      .string()
      .optional()
      .describe(
        "Optional longer description of the item. E.g. 'A 1024x1024 logo based on your brand colors'",
      ),
    path: tool.schema
      .string()
      .optional()
      .describe(
        "Absolute path to a file on disk. Required when type is 'file' or 'image'. " +
          "E.g. '/workspace/output/logo.png'",
      ),
    url: tool.schema
      .string()
      .optional()
      .describe(
        "URL to show the user. Required when type is 'url'. " +
          "E.g. 'https://example.com/report'",
      ),
    content: tool.schema
      .string()
      .optional()
      .describe(
        "Inline text content to show. Required when type is 'text' or 'error'. " +
          "Supports markdown formatting.",
      ),
    metadata: tool.schema
      .string()
      .optional()
      .describe(
        "Optional JSON string of extra metadata. E.g. '{\"width\":1024,\"format\":\"png\"}'",
      ),
  },
  async execute(args, _context) {
    const action = args.action;

    if (!["show", "list", "clear"].includes(action)) {
      return `Error: Invalid action '${action}'. Use 'show', 'list', or 'clear'.`;
    }

    if (action === "list") {
      const entries = readQueue();
      if (entries.length === 0) {
        return JSON.stringify(
          { success: true, action: "list", count: 0, items: [] },
          null,
          2,
        );
      }
      return JSON.stringify(
        { success: true, action: "list", count: entries.length, items: entries },
        null,
        2,
      );
    }

    if (action === "clear") {
      clearQueue();
      return JSON.stringify(
        { success: true, action: "clear", message: "Queue cleared." },
        null,
        2,
      );
    }

    const type = args.type as ShowEntry["type"] | undefined;
    if (!type || !["file", "image", "url", "text", "error"].includes(type)) {
      return `Error: 'type' is required for 'show' action. Use 'file', 'image', 'url', 'text', or 'error'.`;
    }

    if ((type === "file" || type === "image") && !args.path) {
      return `Error: 'path' is required when type is '${type}'.`;
    }
    if (type === "url" && !args.url) {
      return `Error: 'url' is required when type is 'url'.`;
    }
    if ((type === "text" || type === "error") && !args.content) {
      return `Error: 'content' is required when type is '${type}'.`;
    }

    if ((type === "file" || type === "image") && args.path) {
      const absPath = resolve(args.path);
      if (!existsSync(absPath)) {
        return `Error: File not found: ${absPath}`;
      }
    }

    let metadata: Record<string, unknown> | undefined;
    if (args.metadata) {
      try {
        metadata = JSON.parse(args.metadata);
      } catch {
        return `Error: Invalid JSON in 'metadata' parameter.`;
      }
    }

    let publicUrl: string | undefined;
    if ((type === "file" || type === "image") && args.path) {
      const absPath = resolve(args.path);
      publicUrl = (await uploadFileToStorage(absPath)) || undefined;
      if (publicUrl) {
        console.log(`[show-user] Uploaded to storage: ${publicUrl}`);
      }
    }

    const entry: ShowEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      type,
      ...(args.title && { title: args.title }),
      ...(args.description && { description: args.description }),
      ...(args.path && { path: resolve(args.path) }),
      ...(args.url && { url: args.url }),
      ...(publicUrl && { publicUrl }),
      ...(args.content && { content: args.content }),
      ...(metadata && { metadata }),
    };

    appendToQueue(entry);

    return JSON.stringify(
      {
        success: true,
        action: "show",
        entry,
        message: `Item '${args.title || type}' added to show queue.`,
      },
      null,
      2,
    );
  },
});
