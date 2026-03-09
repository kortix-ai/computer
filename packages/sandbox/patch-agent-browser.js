const fs = require('fs');
const { execSync } = require('child_process');

// Auto-detect npm global modules directory
const npmGlobalRoot = execSync('npm root -g').toString().trim();
console.log('npm global root:', npmGlobalRoot);

const agentBrowserDir = npmGlobalRoot + '/agent-browser/dist';

// ── Patch 1: handleLaunch env var fallbacks ─────────────────────────────────
// The Rust CLI sends a launch command to the Node.js daemon but doesn't
// include executablePath/args/profile in the JSON. We inject env var fallbacks.
const actionsFile = agentBrowserDir + '/actions.js';
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
const daemonFile = agentBrowserDir + '/daemon.js';
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

// ── Patch 4b: default socket dir to /tmp/agent-browser ─────────────────────
// Keep agent-browser state out of /workspace by default. AGENT_BROWSER_SOCKET_DIR
// still overrides this when explicitly provided.
const oldAppDir = [
  'export function getAppDir() {',
  '    // 1. XDG_RUNTIME_DIR (Linux standard)',
  '    if (process.env.XDG_RUNTIME_DIR) {',
  "        return path.join(process.env.XDG_RUNTIME_DIR, 'agent-browser');",
  '    }',
  "    // 2. Home directory fallback (like Docker Desktop's ~/.docker/run/)",
  '    const homeDir = os.homedir();',
  '    if (homeDir) {',
  "        return path.join(homeDir, '.agent-browser');",
  '    }',
  '    // 3. Last resort: temp dir',
  "    return path.join(os.tmpdir(), 'agent-browser');",
  '}',
].join('\n');

const newAppDir = [
  'export function getAppDir() {',
  '    // Keep sockets and pid files out of /workspace by default.',
  "    return path.join(os.tmpdir(), 'agent-browser');",
  '}',
].join('\n');

if (!daemon.includes(oldAppDir)) {
  console.error('PATCH 4b FAILED - getAppDir pattern not found in daemon.js');
  process.exit(1);
}
daemon = daemon.replace(oldAppDir, newAppDir);
fs.writeFileSync(daemonFile, daemon);
console.log('PATCH 4b OK - default socket dir moved to /tmp/agent-browser');

// ── Patch 5: fix newTab/newWindow with persistent contexts ──────────────────
// When using launchPersistentContext (profile mode), this.browser is null.
// newTab() checks `!this.browser` and throws "Browser not launched".
// Fix: also check this.contexts.length > 0 as an alternative.
const browserFile = agentBrowserDir + '/browser.js';
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


// ── Patch 6: always start screencast on client connect ──────────────────────
// The stream-server only starts screencasting when clients.size === 1, but
// stale client references can prevent this from ever being true after a
// reconnect cycle. Fix: start screencast on any connect if not already active.
const streamFile = agentBrowserDir + '/stream-server.js';
let stream = fs.readFileSync(streamFile, 'utf8');

const oldScreencastGuard = 'if (this.clients.size === 1 && !this.isScreencasting) {';
const newScreencastGuard = 'if (!this.isScreencasting) {';

if (!stream.includes(oldScreencastGuard)) {
  console.error('PATCH 6 FAILED - screencast guard pattern not found in stream-server.js');
  process.exit(1);
}
stream = stream.replace(oldScreencastGuard, newScreencastGuard);
fs.writeFileSync(streamFile, stream);
console.log('PATCH 6 OK - screencast starts on any client connect');

// ── Patch 7: never stop screencast when clients disconnect ──────────────────
// The stream-server stops screencasting when all WS clients disconnect.
// But restarting the CDP screencast is unreliable (stale CDP sessions).
// Keep it running forever once started — the overhead is negligible.
const oldStopGuard = '// Stop screencasting if no more clients\n' +
  '            if (this.clients.size === 0 && this.isScreencasting) {\n' +
  '                this.stopScreencast().catch((error) => {\n' +
  "                    console.error('[StreamServer] Failed to stop screencast:', error);\n" +
  '                });\n' +
  '            }';
const newStopGuard = '// Keep screencasting even with no clients — restarting it is unreliable.';

if (!stream.includes(oldStopGuard)) {
  console.error('PATCH 7 FAILED - stop-screencast guard pattern not found in stream-server.js');
  process.exit(1);
}
stream = stream.replace(oldStopGuard, newStopGuard);
fs.writeFileSync(streamFile, stream);
console.log('PATCH 7 OK - screencast stays active when clients disconnect');

// ── Patch 8: use Playwright-native input injection in stream server ─────────
// CDP Input.dispatch* can be flaky in our environment while screencast is
// active. Use page.mouse/page.keyboard directly for viewer interactivity.
const oldMouseCase = [
  "                case 'input_mouse':",
  '                    await this.browser.injectMouseEvent({',
  '                        type: message.eventType,',
  '                        x: message.x,',
  '                        y: message.y,',
  '                        button: message.button,',
  '                        clickCount: message.clickCount,',
  '                        deltaX: message.deltaX,',
  '                        deltaY: message.deltaY,',
  '                        modifiers: message.modifiers,',
  '                    });',
  '                    break;',
].join('\n');

const newMouseCase = [
  "                case 'input_mouse': {",
  '                    const page = this.browser.getPage();',
  "                    const button = message.button || 'left';",
  '                    switch (message.eventType) {',
  "                        case 'mouseMoved':",
  '                            await page.mouse.move(message.x ?? 0, message.y ?? 0);',
  '                            break;',
  "                        case 'mousePressed':",
  '                            await page.mouse.move(message.x ?? 0, message.y ?? 0);',
  '                            await page.mouse.down({ button, clickCount: message.clickCount ?? 1 });',
  '                            break;',
  "                        case 'mouseReleased':",
  '                            await page.mouse.move(message.x ?? 0, message.y ?? 0);',
  '                            await page.mouse.up({ button, clickCount: message.clickCount ?? 1 });',
  '                            break;',
  "                        case 'mouseWheel':",
  '                            await page.mouse.move(message.x ?? 0, message.y ?? 0);',
  '                            await page.mouse.wheel(message.deltaX ?? 0, message.deltaY ?? 0);',
  '                            break;',
  '                    }',
  '                    break;',
  '                }',
].join('\n');

const oldKeyboardCase = [
  "                case 'input_keyboard':",
  '                    await this.browser.injectKeyboardEvent({',
  '                        type: message.eventType,',
  '                        key: message.key,',
  '                        code: message.code,',
  '                        text: message.text,',
  '                        modifiers: message.modifiers,',
  '                    });',
  '                    break;',
].join('\n');

const newKeyboardCase = [
  "                case 'input_keyboard': {",
  '                    const page = this.browser.getPage();',
  "                    if (message.eventType === 'keyDown') {",
  '                        if (message.key) {',
  '                            await page.keyboard.down(message.key);',
  '                        }',
  '                    }',
  "                    else if (message.eventType === 'keyUp') {",
  '                        if (message.key) {',
  '                            await page.keyboard.up(message.key);',
  '                        }',
  '                    }',
  '                    break;',
  '                }',
].join('\n');

if (!stream.includes(oldMouseCase)) {
  console.error('PATCH 8 FAILED - input_mouse case not found in stream-server.js');
  process.exit(1);
}
if (!stream.includes(oldKeyboardCase)) {
  console.error('PATCH 8 FAILED - input_keyboard case not found in stream-server.js');
  process.exit(1);
}
stream = stream.replace(oldMouseCase, newMouseCase);
stream = stream.replace(oldKeyboardCase, newKeyboardCase);
fs.writeFileSync(streamFile, stream);
console.log('PATCH 8 OK - stream input uses Playwright mouse/keyboard');

// ── Patch 10: force screencast restart on each client connect ───────────────
// Some sessions get stuck in a state where screencast reports active but emits
// no frames. Restarting screencast when a viewer connects recovers frame flow.
const oldConnScreencast = [
  '        // Start screencasting if this is the first client',
  '        if (!this.isScreencasting) {',
  '            this.startScreencast().catch((error) => {',
  "                console.error('[StreamServer] Failed to start screencast:', error);",
  '                this.sendError(ws, error.message);',
  '            });',
  '        }',
].join('\n');

const newConnScreencast = [
  '        // Always (re)start screencast when a client connects.',
  '        // This recovers sessions where CDP reports active but emits no frames.',
  '        this.startScreencast().catch((error) => {',
  "            console.error('[StreamServer] Failed to start screencast:', error);",
  '            this.sendError(ws, error.message);',
  '        });',
].join('\n');

const oldStartGuard = [
  '    async startScreencast() {',
  '        // Set flag immediately to prevent race conditions with concurrent calls',
  '        if (this.isScreencasting)',
  '            return;',
  '        this.isScreencasting = true;',
].join('\n');

const newStartGuard = [
  '    async startScreencast() {',
  '        // Force a fresh screencast session on each start request.',
  '        if (this.isScreencasting) {',
  '            try {',
  '                await this.browser.stopScreencast();',
  '            }',
  '            catch {',
  '                // ignore stop failures and continue with a fresh start attempt',
  '            }',
  '            this.isScreencasting = false;',
  '        }',
  '        this.isScreencasting = true;',
].join('\n');

if (stream.includes(oldConnScreencast)) {
  stream = stream.replace(oldConnScreencast, newConnScreencast);
} else if (!stream.includes(newConnScreencast)) {
  console.error('PATCH 10 FAILED - connect screencast block not found in stream-server.js');
  process.exit(1);
}

if (stream.includes(oldStartGuard)) {
  stream = stream.replace(oldStartGuard, newStartGuard);
} else if (!stream.includes(newStartGuard)) {
  console.error('PATCH 10 FAILED - startScreencast guard block not found in stream-server.js');
  process.exit(1);
}

fs.writeFileSync(streamFile, stream);
console.log('PATCH 10 OK - screencast restarts per client connect');

// ── Patch 9: add browser navigation controls over stream input ──────────────
// Allow viewer to request page history navigation via input channel.
const statusCase = "                case 'status':\n                    // Client is requesting status\n                    this.sendStatus(ws);\n                    break;";
const navCases = [
  "                case 'nav_back': {",
  '                    const page = this.browser.getPage();',
  '                    await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);',
  '                    this.sendStatus(ws);',
  '                    break;',
  '                }',
  "                case 'nav_forward': {",
  '                    const page = this.browser.getPage();',
  '                    await page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);',
  '                    this.sendStatus(ws);',
  '                    break;',
  '                }',
  statusCase,
].join('\n');

if (!stream.includes("case 'nav_back':") && stream.includes(statusCase)) {
  stream = stream.replace(statusCase, navCases);
  fs.writeFileSync(streamFile, stream);
  console.log('PATCH 9 OK - added nav_back/nav_forward stream controls');
} else if (stream.includes("case 'nav_back':")) {
  console.log('PATCH 9 SKIPPED - navigation controls already present');
} else {
  console.error('PATCH 9 FAILED - status case not found in stream-server.js');
  process.exit(1);
}
