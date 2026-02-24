#!/usr/bin/env node
/**
 * Binary patch: enable fine-grained tool-input streaming in the OpenCode
 * compiled Bun binary.
 *
 * The upstream opencode binary has no-op handlers for tool-input-delta /
 * tool-input-end events in processor.ts.  This patch replaces those no-ops
 * with actual logic that:
 *   1. Fixes tool-input-start to resolve toolCallId (value.toolCallId ?? value.id)
 *   2. Accumulates streaming deltas into state.raw and publishes PartUpdated
 *
 * Because the binary is a Bun compiled executable, the JS source is embedded
 * as plain text.  We do a byte-exact find-and-replace (same length) so the
 * binary metadata stays valid.
 *
 * Works on both x86_64 and arm64 musl/glibc variants.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Locate the binary ──────────────────────────────────────────────────────

const npmGlobalRoot = execSync("npm root -g").toString().trim();

// Try platform-specific paths (arm64-musl, x64-musl, arm64, x64)
const candidates = [
  "opencode-linux-arm64-musl",
  "opencode-linux-x64-musl",
  "opencode-linux-arm64",
  "opencode-linux-x64",
  "opencode-darwin-arm64",
  "opencode-darwin-x64",
];

let binaryPath = null;
for (const pkg of candidates) {
  const p = path.join(npmGlobalRoot, pkg, "bin", "opencode");
  if (fs.existsSync(p)) {
    binaryPath = p;
    break;
  }
}

if (!binaryPath) {
  console.log("[patch-streaming] No opencode binary found — skipping");
  process.exit(0);
}

console.log("[patch-streaming] Binary:", binaryPath);

// ── Define the search and replacement patterns ─────────────────────────────

// ORIGINAL (unpatched) code in the compiled binary — 834 bytes exactly.
// tool-input-start uses value.id directly (bug), delta/end are no-ops.
const SEARCH = [
  '                  case "tool-input-start":',
  "                    const part = await Session.updatePart({",
  '                      id: toolcalls[value.id]?.id ?? Identifier.ascending("part"),',
  "                      messageID: input.assistantMessage.id,",
  "                      sessionID: input.assistantMessage.sessionID,",
  '                      type: "tool",',
  "                      tool: value.toolName,",
  "                      callID: value.id,",
  "                      state: {",
  '                        status: "pending",',
  "                        input: {},",
  '                        raw: ""',
  "                      }",
  "                    });",
  "                    toolcalls[value.id] = part;",
  "                    break;",
  '                  case "tool-input-delta":',
  "                    break;",
  '                  case "tool-input-end":',
  "                    break;",
].join("\n");

// REPLACEMENT — same 834 bytes.  Minified to fit, padded with trailing spaces.
// - tool-input-start: resolves toolCallId via value.toolCallId ?? value.id
// - tool-input-delta: accumulates raw text & publishes PartUpdated events
// - tool-input-end:   no-op (unchanged)
// The trailing spaces on the "tool-input-end" line pad to exact byte count.
const REPLACE = [
  '                  case "tool-input-start":var _c=value.toolCallId??value.id;const part=await Session.updatePart({id:toolcalls[_c]?.id??Identifier.ascending("part"),messageID:input.assistantMessage.id,sessionID:input.assistantMessage.sessionID,type:"tool",tool:value.toolName,callID:_c,state:{status:"pending",input:{},raw:""}});toolcalls[_c]=part;break;',
  '                  case "tool-input-delta":var _d=value.toolCallId??value.id,_t=value.inputTextDelta??value.delta??"",_m=toolcalls[_d];if(_m&&_m.state.status==="pending"){_m.state.raw+=_t;await Session.updatePart({part:_m,delta:_t})}break;',
  '                  case "tool-input-end":                                                                                                                                                                              ',
  "                    break;",
].join("\n");

// ── Sanity check: both must be same byte length ────────────────────────────

const searchBuf = Buffer.from(SEARCH, "utf8");
const replaceBuf = Buffer.from(REPLACE, "utf8");

if (searchBuf.length !== replaceBuf.length) {
  console.error(
    `[patch-streaming] FATAL: length mismatch — search=${searchBuf.length}, replace=${replaceBuf.length}`
  );
  process.exit(1);
}

console.log(`[patch-streaming] Pattern length: ${searchBuf.length} bytes`);

// ── Read binary and patch ──────────────────────────────────────────────────

const binary = fs.readFileSync(binaryPath);

// Find ALL occurrences (the binary may contain duplicates)
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
  // Check if already patched
  if (binary.indexOf(replaceBuf) !== -1) {
    console.log("[patch-streaming] Already patched — skipping");
    process.exit(0);
  }
  console.error("[patch-streaming] SEARCH pattern not found in binary");
  console.error("[patch-streaming] The opencode version may have changed — update the patch");
  process.exit(1);
}

fs.writeFileSync(binaryPath, binary);
console.log(`[patch-streaming] OK — patched ${count} occurrence(s)`);
