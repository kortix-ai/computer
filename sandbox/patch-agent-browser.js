const fs = require('fs');

// ── Patch 1: handleLaunch env var fallbacks ─────────────────────────────────
// The Rust CLI sends a launch command to the Node.js daemon but doesn't
// include executablePath/args/profile in the JSON. We inject env var fallbacks.
const actionsFile = '/usr/lib/node_modules/agent-browser/dist/actions.js';
let actions = fs.readFileSync(actionsFile, 'utf8');

const oldLaunch = [
  'async function handleLaunch(command, browser) {',
  '    await browser.launch(command);',
  '    return successResponse(command.id, { launched: true });',
  '}',
].join('\n');

const newLaunch = [
  'async function handleLaunch(command, browser) {',
  '    if (!command.executablePath && process.env.AGENT_BROWSER_EXECUTABLE_PATH) command.executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;',
  '    var _isPrimary = (process.env.AGENT_BROWSER_SESSION || "default") === (process.env.AGENT_BROWSER_PRIMARY_SESSION || process.env.AGENT_BROWSER_SESSION || "default");',
  '    if (!_isPrimary) { delete command.profile; } else if (!command.profile && process.env.AGENT_BROWSER_PROFILE) { command.profile = process.env.AGENT_BROWSER_PROFILE; }',
  '    if (!command.args && process.env.AGENT_BROWSER_ARGS) command.args = process.env.AGENT_BROWSER_ARGS.split(/[,]/).map(function(a){return a.trim()}).filter(Boolean);',
  '    if (command.headless === undefined && process.env.AGENT_BROWSER_HEADED === "1") command.headless = false;',
  '    if (!command.userAgent && process.env.AGENT_BROWSER_USER_AGENT) command.userAgent = process.env.AGENT_BROWSER_USER_AGENT;',
  '    if (!command.proxy && process.env.AGENT_BROWSER_PROXY) command.proxy = { server: process.env.AGENT_BROWSER_PROXY };',
  '    if (!command.viewport) command.viewport = { width: 1920, height: 1080 };',
  '    await browser.launch(command);',
  '    return successResponse(command.id, { launched: true });',
  '}',
].join('\n');

if (!actions.includes(oldLaunch)) {
  console.error('PATCH 1 FAILED - handleLaunch pattern not found in actions.js');
  process.exit(1);
}
actions = actions.replace(oldLaunch, newLaunch);
fs.writeFileSync(actionsFile, actions);
console.log('PATCH 1 OK - handleLaunch env var fallbacks');

// ── Patch 2: REMOVED — upstream agent-browser now allows localhost origins
// via isAllowedOrigin() in stream-server.js. No patch needed.
console.log('PATCH 2 SKIPPED - upstream already allows localhost origins');

// ── Patch 3: stream port per session ────────────────────────────────────────
// When AGENT_BROWSER_STREAM_PORT is set globally, ALL sessions try to bind
// that port. Named sessions crash with EADDRINUSE. Fix: only the default
// session uses the env var port; named sessions use the hash-based port.
const daemonFile = '/usr/lib/node_modules/agent-browser/dist/daemon.js';
let daemon = fs.readFileSync(daemonFile, 'utf8');

const oldStreamPort = `const streamPort = options?.streamPort ??
        (process.env.AGENT_BROWSER_STREAM_PORT
            ? parseInt(process.env.AGENT_BROWSER_STREAM_PORT, 10)
            : 0);`;

const newStreamPort = `const isPrimarySession = (process.env.AGENT_BROWSER_SESSION || 'default') === (process.env.AGENT_BROWSER_PRIMARY_SESSION || process.env.AGENT_BROWSER_SESSION || 'default');
    const streamPort = options?.streamPort ??
        (isPrimarySession && process.env.AGENT_BROWSER_STREAM_PORT
            ? parseInt(process.env.AGENT_BROWSER_STREAM_PORT, 10)
            : (!isPrimarySession ? getPortForSession(currentSession) : 0));`;

if (!daemon.includes(oldStreamPort)) {
  console.error('PATCH 3 FAILED - streamPort pattern not found in daemon.js');
  process.exit(1);
}
daemon = daemon.replace(oldStreamPort, newStreamPort);
fs.writeFileSync(daemonFile, daemon);
console.log('PATCH 3 OK - named sessions use hash-based stream ports');

// ── Patch 4: auto-launch profile only for default session ───────────────────
// The daemon's auto-launch path (line ~282) reads AGENT_BROWSER_PROFILE
// unconditionally. Named sessions must NOT use the persistent profile or
// Chromium will fail with "profile already in use".
const oldAutoProfile = "profile: process.env.AGENT_BROWSER_PROFILE,";
const newAutoProfile = 'profile: (process.env.AGENT_BROWSER_SESSION || "default") === (process.env.AGENT_BROWSER_PRIMARY_SESSION || process.env.AGENT_BROWSER_SESSION || "default") ? process.env.AGENT_BROWSER_PROFILE : undefined,';

if (!daemon.includes(oldAutoProfile)) {
  console.error('PATCH 4 FAILED - auto-launch profile pattern not found in daemon.js');
  process.exit(1);
}
daemon = daemon.replace(oldAutoProfile, newAutoProfile);
fs.writeFileSync(daemonFile, daemon);
console.log('PATCH 4 OK - auto-launch profile only for default session');

// ── Patch 5: fix newTab/newWindow with persistent contexts ──────────────────
// When using launchPersistentContext (profile mode), this.browser is null.
// newTab() checks `!this.browser` and throws "Browser not launched".
// Fix: also check this.contexts.length > 0 as an alternative.
const browserFile = '/usr/lib/node_modules/agent-browser/dist/browser.js';
let browser = fs.readFileSync(browserFile, 'utf8');

const oldNewTabCheck = "if (!this.browser || this.contexts.length === 0) {\n            throw new Error('Browser not launched');\n        }\n        // Invalidate CDP session since we're switching to a new page";
const newNewTabCheck = "if ((!this.browser && this.contexts.length === 0) || this.contexts.length === 0) {\n            throw new Error('Browser not launched');\n        }\n        // Invalidate CDP session since we're switching to a new page";

if (!browser.includes(oldNewTabCheck)) {
  console.error('PATCH 5 FAILED - newTab check pattern not found in browser.js');
  process.exit(1);
}
browser = browser.replace(oldNewTabCheck, newNewTabCheck);
fs.writeFileSync(browserFile, browser);
console.log('PATCH 5 OK - newTab works with persistent contexts');
