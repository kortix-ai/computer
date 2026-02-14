#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  E2E Test: Fresh Kortix CLI Setup                                          ║
// ║                                                                            ║
// ║  Simulates a fresh install in /tmp:                                       ║
// ║    1. Copies project files to a clean temp dir                            ║
// ║    2. Runs install.sh --env-file with test keys                           ║
// ║    3. Verifies .env files are generated correctly                         ║
// ║    4. Verifies setup-env.sh produces per-service .env files               ║
// ║    5. Verifies the CLI status command works                               ║
// ║    6. Verifies docker compose config is valid                             ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = resolve(__dirname, "..");
const ROOT = resolve(SCRIPTS_DIR, "..");
const TEST_DIR = "/tmp/kortix-e2e-" + Date.now();

// ─── Test framework ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let tests = [];

function test(name, fn) { tests.push({ name, fn }); }

async function runTests() {
  console.log("\n\x1b[1m\x1b[36m  E2E CLI Setup Tests\x1b[0m\n");
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${t.name}`);
      console.log(`    \x1b[31m${e.message}\x1b[0m`);
    }
  }
  console.log(`\n  \x1b[1m${passed + failed} tests, \x1b[32m${passed} passed\x1b[0m, \x1b[${failed ? "31" : "2"}m${failed} failed\x1b[0m\n`);
  return failed;
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertContains(str, sub, msg) { if (!str.includes(sub)) throw new Error(msg || `Expected "${str.slice(0,100)}..." to contain "${sub}"`); }
function assertNotContains(str, sub, msg) { if (str.includes(sub)) throw new Error(msg || `Expected string NOT to contain "${sub}"`); }

// ─── Setup ──────────────────────────────────────────────────────────────────

function setupTestProject() {
  console.log("  Creating test project at:", TEST_DIR);
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });

  // Copy essential project files
  const filesToCopy = [
    "docker-compose.local.yml",
    ".env.example",
  ];
  for (const f of filesToCopy) {
    const src = resolve(ROOT, f);
    if (existsSync(src)) cpSync(src, resolve(TEST_DIR, f));
  }

  // Copy directories
  const dirsToCopy = ["scripts"];
  for (const d of dirsToCopy) {
    const src = resolve(ROOT, d);
    if (existsSync(src)) cpSync(src, resolve(TEST_DIR, d), { recursive: true });
  }

  // Create required subdirectories
  mkdirSync(resolve(TEST_DIR, "sandbox"), { recursive: true });
  mkdirSync(resolve(TEST_DIR, "services/kortix-api"), { recursive: true });
  mkdirSync(resolve(TEST_DIR, "apps/frontend"), { recursive: true });

  // Copy sandbox/.env.example
  const sandboxExample = resolve(ROOT, "sandbox/.env.example");
  if (existsSync(sandboxExample)) {
    cpSync(sandboxExample, resolve(TEST_DIR, "sandbox/.env.example"));
  } else {
    writeFileSync(resolve(TEST_DIR, "sandbox/.env.example"),
      "ANTHROPIC_API_KEY=\nOPENCODE_SERVER_USERNAME=admin\nOPENCODE_SERVER_PASSWORD=changeme\nENV_MODE=local\n");
  }

  // Ensure NO .env exists (simulating fresh install)
  rmSync(resolve(TEST_DIR, ".env"), { force: true });
  rmSync(resolve(TEST_DIR, "sandbox/.env"), { force: true });
  rmSync(resolve(TEST_DIR, "services/kortix-api/.env"), { force: true });
  rmSync(resolve(TEST_DIR, "apps/frontend/.env"), { force: true });
}

function cleanup() { rmSync(TEST_DIR, { recursive: true, force: true }); }

// ─── Create test .env file ─────────────────────────────────────────────────

const TEST_ENV_FILE = resolve(TEST_DIR, "test-input.env");

const TEST_KEYS = {
  ANTHROPIC_API_KEY: "sk-ant-e2e-test-anthropic-key-123",
  OPENAI_API_KEY: "sk-proj-e2e-test-openai-key-456",
  TAVILY_API_KEY: "tvly-e2e-test-tavily-key-789",
  SERPER_API_KEY: "e2e-serper-key-abc",
  REPLICATE_API_TOKEN: "r8_e2e-replicate-token-def",
  OPENCODE_SERVER_USERNAME: "testadmin",
  OPENCODE_SERVER_PASSWORD: "testpassword123",
};

function createTestEnvFile() {
  let content = "# Test env file\n";
  for (const [key, val] of Object.entries(TEST_KEYS)) {
    content += `${key}=${val}\n`;
  }
  writeFileSync(TEST_ENV_FILE, content);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

// Phase 1: Initial state (fresh install, no .env)

test("1.1 — Fresh install: no .env files exist", async () => {
  assert(!existsSync(resolve(TEST_DIR, ".env")), ".env should not exist");
  assert(!existsSync(resolve(TEST_DIR, "sandbox/.env")), "sandbox/.env should not exist");
  assert(!existsSync(resolve(TEST_DIR, "services/kortix-api/.env")), "services/kortix-api/.env should not exist");
  assert(!existsSync(resolve(TEST_DIR, "apps/frontend/.env")), "apps/frontend/.env should not exist");
});

// Phase 2: Run install.sh --env-file with test keys

test("2.1 — install.sh --env-file creates .env files", async () => {
  createTestEnvFile();
  execSync(
    `bash scripts/install.sh --setup-only --env-file "${TEST_ENV_FILE}"`,
    { cwd: TEST_DIR, timeout: 30000, stdio: "pipe" }
  );
  assert(existsSync(resolve(TEST_DIR, ".env")), ".env should exist now");
});

// Phase 3: Verify .env files created correctly

test("3.1 — Root .env contains all submitted LLM keys", async () => {
  const content = readFileSync(resolve(TEST_DIR, ".env"), "utf-8");
  assertContains(content, "ANTHROPIC_API_KEY=sk-ant-e2e-test-anthropic-key-123");
  assertContains(content, "OPENAI_API_KEY=sk-proj-e2e-test-openai-key-456");
});

test("3.2 — Root .env contains tool keys", async () => {
  const content = readFileSync(resolve(TEST_DIR, ".env"), "utf-8");
  assertContains(content, "TAVILY_API_KEY=tvly-e2e-test-tavily-key-789");
  assertContains(content, "SERPER_API_KEY=e2e-serper-key-abc");
  assertContains(content, "REPLICATE_API_TOKEN=r8_e2e-replicate-token-def");
});

test("3.3 — Root .env has fixed local-mode values", async () => {
  const content = readFileSync(resolve(TEST_DIR, ".env"), "utf-8");
  assertContains(content, "ENV_MODE=local");
  assertContains(content, "SANDBOX_PROVIDER=local_docker");
  assertContains(content, "NEXT_PUBLIC_ENV_MODE=local");
  assertContains(content, "NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1");
});

test("3.4 — Sandbox .env created", async () => {
  assert(existsSync(resolve(TEST_DIR, "sandbox/.env")), "sandbox/.env should exist now");
});

test("3.5 — Sandbox .env contains LLM keys", async () => {
  const content = readFileSync(resolve(TEST_DIR, "sandbox/.env"), "utf-8");
  assertContains(content, "ANTHROPIC_API_KEY=sk-ant-e2e-test-anthropic-key-123");
  assertContains(content, "OPENAI_API_KEY=sk-proj-e2e-test-openai-key-456");
});

test("3.6 — Sandbox .env contains tool keys", async () => {
  const content = readFileSync(resolve(TEST_DIR, "sandbox/.env"), "utf-8");
  assertContains(content, "TAVILY_API_KEY=tvly-e2e-test-tavily-key-789");
  assertContains(content, "SERPER_API_KEY=e2e-serper-key-abc");
});

test("3.7 — Sandbox .env contains sandbox credentials", async () => {
  const content = readFileSync(resolve(TEST_DIR, "sandbox/.env"), "utf-8");
  assertContains(content, "OPENCODE_SERVER_USERNAME=testadmin");
  assertContains(content, "OPENCODE_SERVER_PASSWORD=testpassword123");
});

test("3.8 — Sandbox .env has fixed sandbox values", async () => {
  const content = readFileSync(resolve(TEST_DIR, "sandbox/.env"), "utf-8");
  assertContains(content, "SANDBOX_ID=kortix-sandbox");
  assertContains(content, "KORTIX_API_URL=http://kortix-api:8008/v1/router");
});

// Phase 4: Verify setup-env.sh generated per-service .env files

test("4.1 — services/kortix-api/.env generated", async () => {
  assert(existsSync(resolve(TEST_DIR, "services/kortix-api/.env")), "kortix-api .env should be generated");
});

test("4.2 — kortix-api .env has auto-generated header", async () => {
  const content = readFileSync(resolve(TEST_DIR, "services/kortix-api/.env"), "utf-8");
  assertContains(content, "Auto-generated by scripts/setup-env.sh");
});

test("4.3 — kortix-api .env has LLM keys from root", async () => {
  const content = readFileSync(resolve(TEST_DIR, "services/kortix-api/.env"), "utf-8");
  assertContains(content, "ANTHROPIC_API_KEY=sk-ant-e2e-test-anthropic-key-123");
  assertContains(content, "OPENAI_API_KEY=sk-proj-e2e-test-openai-key-456");
});

test("4.4 — kortix-api .env has tool keys from root", async () => {
  const content = readFileSync(resolve(TEST_DIR, "services/kortix-api/.env"), "utf-8");
  assertContains(content, "TAVILY_API_KEY=tvly-e2e-test-tavily-key-789");
  assertContains(content, "SERPER_API_KEY=e2e-serper-key-abc");
});

test("4.5 — apps/frontend/.env generated", async () => {
  assert(existsSync(resolve(TEST_DIR, "apps/frontend/.env")), "frontend .env should be generated");
});

test("4.6 — frontend .env has local mode config", async () => {
  const content = readFileSync(resolve(TEST_DIR, "apps/frontend/.env"), "utf-8");
  assertContains(content, "NEXT_PUBLIC_ENV_MODE=local");
  assertContains(content, "NEXT_PUBLIC_BACKEND_URL=http://localhost:8008/v1");
});

// Phase 5: Re-run with updated key (overwrite test)

test("5.1 — Updating a key via --env-file preserves other keys", async () => {
  // Create a new env file with just one updated key + the others
  let content = "";
  for (const [key, val] of Object.entries(TEST_KEYS)) {
    if (key === "ANTHROPIC_API_KEY") {
      content += `${key}=sk-ant-UPDATED-KEY\n`;
    } else {
      content += `${key}=${val}\n`;
    }
  }
  const updateFile = resolve(TEST_DIR, "test-update.env");
  writeFileSync(updateFile, content);

  execSync(
    `bash scripts/install.sh --setup-only --env-file "${updateFile}"`,
    { cwd: TEST_DIR, timeout: 30000, stdio: "pipe" }
  );

  const rootContent = readFileSync(resolve(TEST_DIR, ".env"), "utf-8");
  assertContains(rootContent, "ANTHROPIC_API_KEY=sk-ant-UPDATED-KEY");
  // Others should still be there
  assertContains(rootContent, "OPENAI_API_KEY=sk-proj-e2e-test-openai-key-456");
  assertContains(rootContent, "TAVILY_API_KEY=tvly-e2e-test-tavily-key-789");
});

// Phase 6: CLI status from test dir

test("6.1 — CLI status works from test directory", async () => {
  try {
    const output = execSync("bash scripts/kortix.sh status", {
      cwd: TEST_DIR,
      timeout: 10000,
      stdio: "pipe",
    }).toString();
    assertContains(output, "Service Status");
    assertContains(output, ".env file exists");
  } catch (e) {
    throw new Error("CLI status failed: " + e.message);
  }
});

test("6.2 — CLI status counts configured LLM providers", async () => {
  const output = execSync("bash scripts/kortix.sh status", {
    cwd: TEST_DIR,
    timeout: 10000,
    stdio: "pipe",
  }).toString();
  assertContains(output, "LLM provider");
});

// Phase 7: Docker compose validation (if docker is available)

test("7.1 — docker-compose.local.yml is valid", async () => {
  try {
    execSync("docker compose -f docker-compose.local.yml config --quiet", {
      cwd: TEST_DIR,
      timeout: 15000,
      stdio: "pipe",
    });
  } catch (e) {
    throw new Error("Docker compose config validation failed: " + (e.stderr?.toString?.() || e.message));
  }
});

// Phase 8: install.sh --help works

test("8.1 — install.sh --help shows usage", async () => {
  const output = execSync("bash scripts/install.sh --help", {
    cwd: TEST_DIR,
    timeout: 5000,
    stdio: "pipe",
  }).toString();
  assertContains(output, "--env-file");
  assertContains(output, "--setup-only");
});

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    setupTestProject();
    console.log("  Test project created.\n");

    const failures = await runTests();
    cleanup();
    process.exit(failures > 0 ? 1 : 0);
  } catch (e) {
    console.error("\n  \x1b[31mFATAL:\x1b[0m", e.message);
    cleanup();
    process.exit(1);
  }
}

main();
