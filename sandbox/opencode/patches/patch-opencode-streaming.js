#!/usr/bin/env node
/**
 * Binary patch: enable tool-input streaming in OpenCode's compiled Bun binary.
 *
 * ROOT CAUSE: The processor (processor.ts) has no-op handlers for
 * tool-input-delta and tool-input-end events — they just `break`.
 * The AI SDK pipeline already correctly generates and forwards these
 * events all the way to fullStream, but the processor ignores them.
 *
 * This patch replaces the no-op tool-input-delta handler with code that:
 *   1. Retrieves the pending tool part from the toolcalls map
 *   2. Accumulates the streaming JSON delta into state.raw
 *   3. Calls Session.updatePart() to push the updated part to the frontend
 *
 * The frontend's parsePartialJSON() and partStreamingInput() helpers
 * (in tool-renderers.tsx) read state.raw and display streaming arguments.
 *
 * Binary patching strategy: find-and-replace with exact same byte length,
 * padded with trailing spaces. The Bun binary stores JS source as plain text.
 *
 * There are 2 copies of the processor code in the binary — both are patched.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Locate all opencode binaries ───────────────────────────────────────────

function findBinaries() {
  const npmGlobalRoot = execSync("npm root -g").toString().trim();
  const pkgNames = [
    "opencode-linux-arm64-musl",
    "opencode-linux-x64-musl",
    "opencode-linux-arm64",
    "opencode-linux-x64",
    "opencode-darwin-arm64",
    "opencode-darwin-x64",
  ];

  const paths = new Set();

  // Direct global installs: <root>/<pkg>/bin/opencode
  for (const pkg of pkgNames) {
    const p = path.join(npmGlobalRoot, pkg, "bin", "opencode");
    if (fs.existsSync(p) && fs.statSync(p).size > 1_000_000) paths.add(p);
  }

  // Nested inside opencode-ai: <root>/opencode-ai/node_modules/<pkg>/bin/opencode
  for (const pkg of pkgNames) {
    const p = path.join(npmGlobalRoot, "opencode-ai", "node_modules", pkg, "bin", "opencode");
    if (fs.existsSync(p) && fs.statSync(p).size > 1_000_000) paths.add(p);
  }

  return [...paths];
}

const binaryPaths = findBinaries();

if (binaryPaths.length === 0) {
  console.log("[patch-streaming] No opencode binaries found — skipping");
  process.exit(0);
}

console.log(`[patch-streaming] Found ${binaryPaths.length} binary(ies)`);

// ── Define search and replacement ──────────────────────────────────────────

// ORIGINAL code in the processor's switch(value.type) statement.
// Covers the end of tool-input-start (assignment + break) through
// tool-input-delta (no-op break) and tool-input-end (no-op break).
// 192 bytes, appears at 2 offsets in the binary.
const SEARCH =
  'toolcalls[value.id] = part;\n' +
  '                    break;\n' +
  '                  case "tool-input-delta":\n' +
  '                    break;\n' +
  '                  case "tool-input-end":\n' +
  '                    break;';

// REPLACEMENT — same 192 bytes (padded with trailing spaces).
// - Compresses whitespace from the toolcalls assignment
// - Adds actual logic to tool-input-delta:
//   1. Looks up the pending tool part via toolcalls[value.id]
//   2. Appends value.delta to part.state.raw (accumulates streaming JSON)
//   3. Calls Session.updatePart(p) to push PartUpdated event
// - tool-input-end remains a no-op break (nothing to do on end)
const REPLACE_BASE =
  'toolcalls[value.id]=part;break;' +
  'case"tool-input-delta":' +
  '{let p=toolcalls[value.id];' +
  'if(p){p.state.raw+=value.delta;' +
  'await Session.updatePart(p)}break}' +
  'case"tool-input-end":break;';

// Pad to exact byte length
const searchBytes = Buffer.byteLength(SEARCH, "utf8");
const replaceBytes = Buffer.byteLength(REPLACE_BASE, "utf8");

if (replaceBytes > searchBytes) {
  console.error(
    `[patch-streaming] FATAL: replacement (${replaceBytes}B) exceeds target (${searchBytes}B)`
  );
  process.exit(1);
}

const REPLACE = REPLACE_BASE + " ".repeat(searchBytes - replaceBytes);

// Verify exact byte match
const searchBuf = Buffer.from(SEARCH, "utf8");
const replaceBuf = Buffer.from(REPLACE, "utf8");

if (searchBuf.length !== replaceBuf.length) {
  console.error(
    `[patch-streaming] FATAL: length mismatch — search=${searchBuf.length}, replace=${replaceBuf.length}`
  );
  process.exit(1);
}

console.log(`[patch-streaming] Pattern: ${searchBuf.length} bytes`);

// ── Read binary and patch ──────────────────────────────────────────────────

for (const binaryPath of binaryPaths) {
  const binary = fs.readFileSync(binaryPath);

  // Check if already patched
  if (binary.indexOf(replaceBuf) !== -1) {
    console.log("[patch-streaming] Already patched — skipping");
    continue;
  }

  // Find and replace all occurrences
  let count = 0;
  let offset = 0;
  while (true) {
    const idx = binary.indexOf(searchBuf, offset);
    if (idx === -1) break;
    replaceBuf.copy(binary, idx);
    count++;
    offset = idx + searchBuf.length;
  }

  if (count === 0) {
    console.error("[patch-streaming] SEARCH pattern not found in binary");
    console.error("[patch-streaming] The opencode version may have changed — update the patch");
    continue;
  }

  fs.writeFileSync(binaryPath, binary);
  console.log(`[patch-streaming] OK — patched ${count} occurrence(s) in ${binaryPath}`);
}
