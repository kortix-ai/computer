import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

// Use a temp directory for the queue instead of /config/.show-user (which is container-only)
const TEST_SHOW_DIR = resolve(import.meta.dir, "test-show-user");
const TEST_QUEUE_FILE = `${TEST_SHOW_DIR}/queue.jsonl`;

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    await fn();
    process.stdout.write(`PASS\n`);
  } catch (e) {
    process.stdout.write(`FAIL: ${e}\n`);
    process.exit(1);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const showUser = (await import("../show-user.ts")).default;

const ctx = { directory: process.cwd(), worktree: process.cwd() } as Parameters<
  typeof showUser.execute
>[1];

// ── Validation Tests ──

await test("show-user: invalid action", async () => {
  const raw = await showUser.execute({ action: "dance" }, ctx);
  assert(
    (raw as string).includes("Invalid action"),
    "should reject invalid action",
  );
});

await test("show-user: show without type", async () => {
  const raw = await showUser.execute({ action: "show" }, ctx);
  assert(
    (raw as string).includes("'type' is required"),
    "should require type for show",
  );
});

await test("show-user: show file without path", async () => {
  const raw = await showUser.execute(
    { action: "show", type: "file" },
    ctx,
  );
  assert(
    (raw as string).includes("'path' is required"),
    "should require path for file type",
  );
});

await test("show-user: show image without path", async () => {
  const raw = await showUser.execute(
    { action: "show", type: "image" },
    ctx,
  );
  assert(
    (raw as string).includes("'path' is required"),
    "should require path for image type",
  );
});

await test("show-user: show url without url", async () => {
  const raw = await showUser.execute(
    { action: "show", type: "url" },
    ctx,
  );
  assert(
    (raw as string).includes("'url' is required"),
    "should require url for url type",
  );
});

await test("show-user: show text without content", async () => {
  const raw = await showUser.execute(
    { action: "show", type: "text" },
    ctx,
  );
  assert(
    (raw as string).includes("'content' is required"),
    "should require content for text type",
  );
});

await test("show-user: show error without content", async () => {
  const raw = await showUser.execute(
    { action: "show", type: "error" },
    ctx,
  );
  assert(
    (raw as string).includes("'content' is required"),
    "should require content for error type",
  );
});

await test("show-user: show file that doesn't exist", async () => {
  const raw = await showUser.execute(
    {
      action: "show",
      type: "file",
      path: "/tmp/does-not-exist-show-user-test-12345.txt",
    },
    ctx,
  );
  assert(
    (raw as string).includes("File not found"),
    "should reject nonexistent file",
  );
});

await test("show-user: invalid metadata JSON", async () => {
  // Create a temp file so the file check passes
  const tmpFile = resolve(TEST_SHOW_DIR, "temp.txt");
  mkdirSync(TEST_SHOW_DIR, { recursive: true });
  writeFileSync(tmpFile, "test");

  const raw = await showUser.execute(
    {
      action: "show",
      type: "file",
      path: tmpFile,
      metadata: "not valid json{{{",
    },
    ctx,
  );
  assert(
    (raw as string).includes("Invalid JSON"),
    "should reject invalid metadata JSON",
  );
});

// ── Functional Tests (show, list, clear) ──

await test("show-user: list empty queue", async () => {
  // Ensure clean state
  if (existsSync(TEST_QUEUE_FILE)) rmSync(TEST_QUEUE_FILE);

  const raw = await showUser.execute({ action: "list" }, ctx);
  const result = JSON.parse(raw as string);
  assert(result.success === true, "list should succeed");
  assert(result.count === 0, "empty queue should have count 0");
});

await test("show-user: show a URL item", async () => {
  const raw = await showUser.execute(
    {
      action: "show",
      type: "url",
      title: "Test Report",
      description: "A test URL for unit testing",
      url: "https://example.com/report",
    },
    ctx,
  );
  const result = JSON.parse(raw as string);
  assert(result.success === true, `expected success: ${raw}`);
  assert(result.entry.type === "url", "entry type should be url");
  assert(result.entry.url === "https://example.com/report", "url should match");
  assert(result.entry.title === "Test Report", "title should match");
  assert(typeof result.entry.id === "string", "should have an id");
  assert(typeof result.entry.timestamp === "string", "should have a timestamp");
});

await test("show-user: show a text item", async () => {
  const raw = await showUser.execute(
    {
      action: "show",
      type: "text",
      title: "Summary",
      content: "# Hello World\n\nThis is a **test** summary.",
    },
    ctx,
  );
  const result = JSON.parse(raw as string);
  assert(result.success === true, `expected success: ${raw}`);
  assert(result.entry.type === "text", "entry type should be text");
  assert(
    result.entry.content.includes("Hello World"),
    "content should be preserved",
  );
});

await test("show-user: show a file item", async () => {
  const tmpFile = resolve(TEST_SHOW_DIR, "output.txt");
  mkdirSync(TEST_SHOW_DIR, { recursive: true });
  writeFileSync(tmpFile, "file content here");

  const raw = await showUser.execute(
    {
      action: "show",
      type: "file",
      title: "Output File",
      path: tmpFile,
      metadata: '{"format":"txt","size":17}',
    },
    ctx,
  );
  const result = JSON.parse(raw as string);
  assert(result.success === true, `expected success: ${raw}`);
  assert(result.entry.type === "file", "entry type should be file");
  assert(result.entry.path === tmpFile, "path should be resolved");
  assert(result.entry.metadata?.format === "txt", "metadata should be parsed");
});

await test("show-user: show an error item", async () => {
  const raw = await showUser.execute(
    {
      action: "show",
      type: "error",
      title: "Generation Failed",
      content: "The image generation API returned a 500 error.",
    },
    ctx,
  );
  const result = JSON.parse(raw as string);
  assert(result.success === true, `expected success: ${raw}`);
  assert(result.entry.type === "error", "entry type should be error");
});

await test("show-user: clear queue", async () => {
  const raw = await showUser.execute({ action: "clear" }, ctx);
  const result = JSON.parse(raw as string);
  assert(result.success === true, "clear should succeed");
  assert(result.message === "Queue cleared.", "should confirm cleared");
});

// ── Cleanup ──

if (!process.argv.includes("--keep-output")) {
  try {
    rmSync(TEST_SHOW_DIR, { recursive: true, force: true });
  } catch {}
}

process.stdout.write("\n\nAll show-user tests passed!\n");
