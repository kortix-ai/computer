---
name: browser
description: "Browser automation skill using agent-browser CLI. Use when the agent needs to interact with web pages — navigating, clicking, filling forms, extracting data, taking screenshots, testing web UIs, scraping dynamic content, or performing any end-to-end browser automation. Triggers on: 'open this page', 'click the button', 'fill the form', 'test the login flow', 'scrape this site', 'take a screenshot', 'check if the page works', 'automate the browser', 'e2e test', any task requiring a real browser with JavaScript execution."
---

# Browser Automation

Full browser control via the `agent-browser` CLI. This gives you a real Chromium instance you can drive end-to-end — navigate, click, type, screenshot, extract data, wait for elements, handle tabs, cookies, network interception, and more.

## What is agent-browser?

Browser automation CLI designed for AI agents. Compact text output minimizes context usage. Fast Rust CLI with Node.js fallback.

### Features

- **Agent-first** — Compact text output uses fewer tokens than JSON, designed for AI context efficiency
- **Ref-based** — Snapshot returns accessibility tree with refs for deterministic element selection
- **Fast** — Native Rust CLI for instant command parsing
- **Complete** — 50+ commands for navigation, forms, screenshots, network, storage
- **Sessions** — Multiple isolated browser instances with separate auth
- **Cross-platform** — macOS, Linux, Windows with native binaries

### Architecture

Client-daemon architecture for optimal performance:

1. **Rust CLI** — Parses commands, communicates with daemon
2. **Node.js Daemon** — Manages Playwright browser instance

Daemon starts automatically and persists between commands.

## Environment

The system Chromium is pre-configured. No setup needed.

**IMPORTANT: Always use `--session` with a unique name.** Never run bare `agent-browser` commands without a session. This prevents conflicts when multiple agents browse concurrently.

- **`--session kortix`** — The primary shared session. Has a persistent profile (cookies, logins survive restarts). Streams on port 9223. The human watches this via the Browser Viewer at `http://localhost:9224`.
- **`--session <any-other-name>`** — Ephemeral sessions. Fresh browser, no cookies, no profile lock conflicts. Each gets its own stream port. Use for parallel/throwaway work.

## Core Workflow

**ALWAYS use `--session` on every command:**

```bash
# 1. Navigate to page (primary session — persistent, human can see it)
agent-browser --session kortix open https://example.com

# 2. Get accessibility tree with element refs
agent-browser --session kortix snapshot -i

# 3. Interact using refs from snapshot
agent-browser --session kortix click @e2
agent-browser --session kortix fill @e3 "text"

# 4. Re-snapshot after page changes
agent-browser --session kortix snapshot -i

# 5. When done (only close if you're done with this task — the human might be using it)
agent-browser --session kortix close
```

**For throwaway/parallel work, use a descriptive session name:**

```bash
# Name sessions after what they DO — short, lowercase, hyphenated
agent-browser --session scrape-pricing open https://example.com/pricing
agent-browser --session scrape-pricing snapshot -i
agent-browser --session scrape-pricing close

agent-browser --session test-login open https://app.example.com/login
agent-browser --session check-docs open https://docs.example.com
```

**Session naming rules:**
- **Descriptive** — Name after the task: `scrape-pricing`, `login-github`, `test-checkout`, `read-docs`
- **Short** — 2-4 words max, hyphenated: `fill-survey`, `compare-plans`, NOT `task-1738900000`
- **Lowercase** — Always lowercase, no spaces: `search-flights` not `Search Flights`
- **No timestamps** — Never use `task-$(date +%s)` or random IDs. The human sees these in the Browser Viewer tabs and needs to know what each session is doing at a glance.
- **Unique per concurrent run** — If running two scrapers in parallel, differentiate: `scrape-site-a`, `scrape-site-b`

**Why refs?** The `snapshot` command returns an accessibility tree where every interactive element has a ref like `@e1`, `@e2`. Using refs is deterministic and fast — no fragile CSS selectors needed.

---

## Commands — Complete Reference

### Navigation

```bash
agent-browser open <url>              # Navigate (aliases: goto, navigate)
agent-browser back                    # Go back
agent-browser forward                 # Go forward
agent-browser reload                  # Reload page
```

### Interaction

```bash
agent-browser click <sel>             # Click element
agent-browser dblclick <sel>          # Double-click
agent-browser fill <sel> <text>       # Clear and fill input
agent-browser type <sel> <text>       # Type into element (appends)
agent-browser press <key>             # Press key (Enter, Tab, Control+a)
agent-browser hover <sel>             # Hover element
agent-browser select <sel> <val>      # Select dropdown option
agent-browser check <sel>             # Check checkbox
agent-browser uncheck <sel>           # Uncheck checkbox
agent-browser scroll <dir> [px]       # Scroll (up/down/left/right)
agent-browser upload <sel> <files>    # Upload files
agent-browser drag <src> <tgt>        # Drag and drop
```

### Snapshot (AI-Optimized)

```bash
agent-browser snapshot                # Full accessibility tree with refs
agent-browser snapshot -i             # Interactive elements only (recommended)
agent-browser snapshot -i -C          # Include cursor-interactive elements (onclick divs)
agent-browser snapshot -c             # Compact (remove empty structural nodes)
agent-browser snapshot -d 3           # Limit depth to 3 levels
agent-browser snapshot -s "#main"     # Scope to CSS selector
agent-browser snapshot -i -c -d 5    # Combine options
```

**Flags:**
| Flag | Description |
|------|-------------|
| `-i, --interactive` | Only interactive elements (buttons, links, inputs) |
| `-C, --cursor` | Include cursor-interactive elements (cursor:pointer, onclick, tabindex) |
| `-c, --compact` | Remove empty structural elements |
| `-d, --depth <n>` | Limit tree depth |
| `-s, --selector <sel>` | Scope to CSS selector |

The `-C` flag is essential for modern web apps that use custom clickable divs/spans instead of semantic buttons/links.

**Cursor-Interactive Elements:**

Many modern web apps use custom clickable elements (divs, spans) instead of standard buttons or links. The `-C` flag detects these by looking for:

- `cursor: pointer` CSS style
- `onclick` attribute or handler
- `tabindex` attribute (keyboard focusable)

```bash
agent-browser snapshot -i -C
# Output includes:
# @e1 [button] "Submit"
# @e2 [link] "Learn more"
# Cursor-interactive elements:
# @e3 [clickable] "Menu Item" [cursor:pointer, onclick]
# @e4 [clickable] "Card" [cursor:pointer]
```

**Output Format:**

The default text output is compact and AI-friendly:

```
@e1 [heading] "Example Domain" [level=1]
@e2 [button] "Submit"
@e3 [input type="email"] placeholder="Email"
@e4 [link] "Learn more"
```

**Ref Lifecycle:**

Refs are invalidated when the page changes. Always re-snapshot after navigation or DOM updates:

```bash
agent-browser click @e4      # Navigates to new page
agent-browser snapshot -i    # Get fresh refs
agent-browser click @e1      # Use new refs
```

**Snapshot Best Practices:**

1. Use `-i` to reduce output to actionable elements
2. Re-snapshot after page changes to get updated refs
3. Scope with `-s` for specific page sections
4. Use `-d` to limit depth on complex pages
5. Use `-C` for SPAs with non-semantic clickable elements

### Extract Information

```bash
agent-browser get text <sel>          # Get text content
agent-browser get html <sel>          # Get innerHTML
agent-browser get value <sel>         # Get input value
agent-browser get attr <sel> <attr>   # Get attribute
agent-browser get title               # Get page title
agent-browser get url                 # Get current URL
agent-browser get count <sel>         # Count matching elements
agent-browser get box <sel>           # Get bounding box
```

### Check State

```bash
agent-browser is visible <sel>        # Check if visible
agent-browser is enabled <sel>        # Check if enabled
agent-browser is checked <sel>        # Check if checked
```

### Screenshots & PDF

```bash
agent-browser screenshot [path]       # Take screenshot (temp dir if no path)
agent-browser screenshot --full       # Full page screenshot
agent-browser pdf <path>              # Save page as PDF
```

### Wait

```bash
agent-browser wait <selector>         # Wait for element visible
agent-browser wait <ms>               # Wait milliseconds
agent-browser wait --text "Welcome"   # Wait for text to appear
agent-browser wait --url "**/dash"    # Wait for URL pattern
agent-browser wait --load networkidle # Wait for network idle
agent-browser wait --fn "window.ready === true"  # Wait for JS condition
agent-browser wait --download [path]  # Wait for download to complete
```

### Downloads

```bash
agent-browser download <sel> <path>   # Click element to trigger download
agent-browser wait --download [path]  # Wait for any download to complete
```

### JavaScript Evaluation

```bash
agent-browser eval "<js>"             # Run JavaScript in page
agent-browser eval "<js>" -b          # Base64-encode the JS
agent-browser eval --stdin            # Read JS from stdin
```

### Find Elements (Semantic Locators)

Semantic locators with actions (`click`, `fill`, `check`, `hover`, `text`):

```bash
agent-browser find role <role> <action> [value]
agent-browser find text <text> <action>
agent-browser find label <label> <action> [value]
agent-browser find placeholder <ph> <action> [value]
agent-browser find testid <id> <action> [value]
agent-browser find first <sel> <action> [value]
agent-browser find nth <n> <sel> <action> [value]
```

Examples:

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "test@test.com"
agent-browser find placeholder "Search..." fill "query"
agent-browser find testid "submit-btn" click
agent-browser find first ".item" click
agent-browser find nth 2 "a" text
```

### Mouse

```bash
agent-browser mouse move <x> <y>      # Move mouse
agent-browser mouse down [button]     # Press button
agent-browser mouse up [button]       # Release button
agent-browser mouse wheel <dy> [dx]   # Scroll wheel
```

### Tabs & Frames

```bash
agent-browser tab                     # List tabs
agent-browser tab new [url]           # New tab
agent-browser tab <n>                 # Switch to tab n
agent-browser tab close [n]           # Close tab
agent-browser frame <sel>             # Switch to iframe
agent-browser frame main              # Back to main frame
```

### Cookies & Storage

```bash
agent-browser cookies                 # Get all cookies
agent-browser cookies set <name> <val> # Set cookie
agent-browser cookies clear           # Clear cookies
agent-browser storage local           # Get all localStorage
agent-browser storage local <key>     # Get specific key
agent-browser storage local set <k> <v> # Set value
agent-browser storage local clear     # Clear all
agent-browser storage session         # Same for sessionStorage
```

### Network Interception

```bash
agent-browser network route <url>              # Intercept requests
agent-browser network route <url> --abort      # Block requests
agent-browser network route <url> --body <json> # Mock response
agent-browser network unroute [url]            # Remove routes
agent-browser network requests                 # View tracked requests
agent-browser network requests --filter api    # Filter requests
```

### Browser Settings

```bash
agent-browser set viewport <w> <h>    # Set viewport size
agent-browser set device <name>       # Emulate device ("iPhone 14")
agent-browser set geo <lat> <lng>     # Set geolocation
agent-browser set offline [on|off]    # Toggle offline mode
agent-browser set headers <json>      # Extra HTTP headers
agent-browser set credentials <u> <p> # HTTP basic auth
agent-browser set media [dark|light]  # Emulate color scheme
```

### Dialogs

```bash
agent-browser dialog accept [text]    # Accept dialog (with optional prompt text)
agent-browser dialog dismiss          # Dismiss dialog
```

### Debug

```bash
agent-browser trace start [path]      # Start trace
agent-browser trace stop [path]       # Stop and save trace
agent-browser console                 # View console messages
agent-browser console --clear         # Clear console
agent-browser errors                  # View page errors (uncaught exceptions)
agent-browser errors --clear          # Clear errors
agent-browser highlight <sel>         # Highlight element visually
```

### State Management

```bash
agent-browser state save <path>       # Save auth state to file
agent-browser state load <path>       # Load auth state from file
agent-browser state list              # List saved state files
agent-browser state show <file>       # Show state summary
agent-browser state rename <old> <new> # Rename state file
agent-browser state clear [name]      # Clear states for session name
agent-browser state clear --all       # Clear all saved states
agent-browser state clean --older-than <days>  # Delete old states
```

### Local Files

Open local files (PDFs, HTML) using `file://` URLs:

```bash
agent-browser --allow-file-access open file:///path/to/document.pdf
agent-browser --allow-file-access open file:///path/to/page.html
agent-browser screenshot output.png
```

The `--allow-file-access` flag enables JavaScript to access other local files. Chromium only.

### Global Options

```
--session <name>         # Isolated browser session
--profile <path>         # Persistent browser profile directory
--headed                 # Show browser window (not headless)
--cdp <port|url>         # Connect via Chrome DevTools Protocol
--auto-connect           # Auto-discover and connect to running Chrome
--executable-path <path> # Custom browser executable
--args <args>            # Browser launch args (comma separated)
--user-agent <ua>        # Custom User-Agent string
--proxy <url>            # Proxy server URL
--headers <json>         # HTTP headers scoped to URL's origin
--ignore-https-errors    # Ignore HTTPS certificate errors
--allow-file-access      # Allow file:// URLs to access local files (Chromium only)
--json                   # JSON output (for scripts)
--debug                  # Debug output
```

### JSON Output (Machine-Readable)

```bash
agent-browser snapshot --json         # JSON accessibility tree
agent-browser get text @e1 --json     # JSON text content
agent-browser is visible @e2 --json   # JSON boolean
```

Note: The default text output is more compact and preferred for AI agents.

---

## Selectors

In order of preference:

### Refs (Best)

Refs provide deterministic element selection from snapshots. Best for AI agents.

```bash
# 1. Get snapshot with refs
agent-browser snapshot
# Output:
# - heading "Example Domain" [ref=e1] [level=1]
# - button "Submit" [ref=e2]
# - textbox "Email" [ref=e3]
# - link "Learn more" [ref=e4]

# 2. Use refs to interact
agent-browser click @e2                   # Click the button
agent-browser fill @e3 "test@example.com" # Fill the textbox
agent-browser get text @e1                # Get heading text
agent-browser hover @e4                   # Hover the link
```

**Why refs?**

- **Deterministic** — Ref points to exact element from snapshot
- **Fast** — No DOM re-query needed
- **AI-friendly** — LLMs can reliably parse and use refs

### CSS Selectors

```bash
agent-browser click "#id"
agent-browser click ".class"
agent-browser click "div > button"
agent-browser click "[data-testid='submit']"
```

### Text & XPath

```bash
agent-browser click "text=Submit"
agent-browser click "xpath=//button[@type='submit']"
```

### Semantic Locators

```bash
agent-browser find role button click --name "Submit"
agent-browser find label "Email" fill "test@test.com"
agent-browser find placeholder "Search..." fill "query"
agent-browser find testid "submit-btn" click
```

Always prefer refs from snapshot. Fall back to CSS/text only when refs are unavailable.

---

## Sessions & Parallel Browsing

**Every `--session` name must be unique across concurrent runs.** This prevents Chromium profile lock conflicts.

**Two types of sessions:**

| Session | Name | Profile | Stream Port | Human Visible | Use For |
|---------|------|---------|-------------|---------------|---------|
| Primary | `kortix` | Persistent (`/workspace/.browser-profile`) | 9223 | Yes (viewer) | Authenticated work, human-shared browsing |
| Ephemeral | Any other name | None (fresh) | Auto-assigned | Yes (viewer tabs) | Parallel scraping, testing, throwaway tasks |

```bash
# Primary session — persistent profile, human watches at localhost:9224
agent-browser --session kortix open https://example.com

# Ephemeral sessions — descriptive names, parallel-safe, no conflicts
agent-browser --session scrape-products open https://site-a.com/products
agent-browser --session test-signup open https://site-b.com/signup

# Each session is fully isolated — its own cookies, storage, history
agent-browser --session scrape-products snapshot -i
agent-browser --session test-signup click @e3

# List active sessions
agent-browser session list

# ALWAYS close ephemeral sessions when done — frees resources and declutters the viewer
agent-browser --session scrape-products close
agent-browser --session test-signup close
```

**Key rules:**
- **Always use `--session`** on every command — never run bare `agent-browser` without it
- **`--session kortix`** is the only session with persistent cookies/logins
- All other session names are ephemeral — fresh browser, no cookies
- **Name sessions descriptively** — the human sees these as tabs in the Browser Viewer. `scrape-pricing` is useful; `task-1738900000` is not.
- Each session gets its own stream port, visible in the Browser Viewer tabs
- Multiple ephemeral sessions can run in parallel without issues
- **Always close ephemeral sessions when done** — `agent-browser --session <name> close`. This frees memory and removes clutter from the viewer. Never leave sessions open after your task is complete.

### Session Isolation

Each session has its own:

- Browser instance
- Cookies and storage
- Navigation history
- Authentication state

### Persistent Profiles

By default, browser state is lost when the browser closes. Use `--profile` to persist state across restarts:

```bash
# Use a persistent profile directory
agent-browser --profile ~/.myapp-profile open myapp.com

# Login once, then reuse the authenticated session
agent-browser --profile ~/.myapp-profile open myapp.com/dashboard

# Or via environment variable
AGENT_BROWSER_PROFILE=~/.myapp-profile agent-browser open myapp.com
```

The profile directory stores: cookies, localStorage, IndexedDB data, service workers, browser cache, login sessions.

### Session Persistence

Use `--session-name` to automatically save and restore cookies and localStorage across browser restarts:

```bash
# Auto-save/load state for "twitter" session
agent-browser --session-name twitter open twitter.com

# Login once, then state persists automatically
agent-browser --session-name twitter click "#login"

# Or via environment variable
export AGENT_BROWSER_SESSION_NAME=twitter
agent-browser open twitter.com
```

State files are stored in `~/.agent-browser/sessions/` and automatically loaded on daemon start.

**Session name rules:** Must contain only alphanumeric characters, hyphens, and underscores. No path traversal, spaces, or slashes.

### State Encryption

Encrypt saved state files (cookies, localStorage) using AES-256-GCM:

```bash
# Generate a 256-bit key (64 hex characters)
openssl rand -hex 32

# Set the encryption key
export AGENT_BROWSER_ENCRYPTION_KEY=<your-64-char-hex-key>

# State files are now encrypted automatically
agent-browser --session-name secure-session open example.com
```

### State Auto-Expiration

```bash
# Set expiration (default: 30 days)
export AGENT_BROWSER_STATE_EXPIRE_DAYS=7

# Manually clean old states
agent-browser state clean --older-than 7
```

### Session Environment Variables

| Variable | Description |
|---|---|
| `AGENT_BROWSER_SESSION` | Browser session ID (default: "default") |
| `AGENT_BROWSER_SESSION_NAME` | Auto-save/load state persistence name |
| `AGENT_BROWSER_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM encryption |
| `AGENT_BROWSER_STATE_EXPIRE_DAYS` | Auto-delete states older than N days (default: 30) |

---

## Authentication & Login

**Primary session `kortix` (persistent — preferred for authenticated work):**

The `kortix` session persists all login state. Login once via the agent or have the human login via the Browser Viewer at `http://localhost:9224`. Cookies survive forever.

```bash
# Agent logs in (persists in profile)
agent-browser --session kortix open https://app.example.com/login
agent-browser --session kortix snapshot -i
agent-browser --session kortix fill @e1 "user@example.com"
agent-browser --session kortix fill @e2 "password123"
agent-browser --session kortix click @e3
agent-browser --session kortix wait --load networkidle
# Done — login persists across restarts
```

**Human-assisted login (for OAuth, 2FA, CAPTCHAs):**

When the agent can't handle a login flow (OAuth redirects, 2FA, CAPTCHA), instruct the human:

1. Tell the user: "Please open http://localhost:9224 and log into [service name]. I'll navigate to the login page for you."
2. Navigate: `agent-browser --session kortix open https://service.com/login`
3. The human completes the login in the Browser Viewer (clicking, typing, solving CAPTCHAs)
4. Once logged in, the agent continues: `agent-browser --session kortix snapshot -i` to verify
5. The login persists in the profile — the agent can use it from now on

**Sharing auth with ephemeral sessions:**

Ephemeral sessions don't have the persistent profile, but you can copy auth state:

```bash
# Save auth state from primary session
agent-browser --session kortix state save /workspace/.browser-auth.json

# Load it into an ephemeral session
agent-browser --session worker-1 state load /workspace/.browser-auth.json
agent-browser --session worker-1 open https://app.example.com/dashboard
```

**Authenticated headers (API token auth, no login needed):**

```bash
# Headers scoped to origin (not leaked to other domains)
agent-browser --session kortix open api.example.com --headers '{"Authorization": "Bearer <token>"}'
```

---

## Browser Viewer & Live Streaming

The human can watch and interact with the browser at **http://localhost:9224** (Browser Viewer).

**Features:**
- **Session tabs** — Switch between all active sessions (default + named). Each session streams on its own port.
- **Live viewport** — See exactly what the agent sees in real-time
- **Input injection** — Click, type, scroll directly in the viewer. Events are forwarded to the browser.
- **Pair browsing** — Human and agent work on the same page simultaneously

**When to direct the human to the viewer:**
- OAuth/SSO login flows the agent can't handle
- CAPTCHA solving
- 2FA verification
- Visual confirmation ("does this look right?")
- Any task requiring human judgment on visual layout

**Link directly to the right session** — use the `?session=` URL parameter:
```
http://localhost:9224?session=kortix          ← primary session
http://localhost:9224?session=login-github    ← specific ephemeral session
```
Always include the `?session=` parameter when telling the human to check the viewer, so they land on the correct tab immediately.

### Streaming / WebSocket Protocol

Enable streaming for programmatic access or live preview:

```bash
AGENT_BROWSER_STREAM_PORT=9223 agent-browser open example.com
```

The server streams viewport frames and accepts input events (mouse, keyboard, touch). Connect to `ws://localhost:9223` to receive frames and send input.

**Named session streams:** auto-assigned ports (check `/workspace/.agent-browser/<session>.stream`)

**Frame messages:**

```json
{
  "type": "frame",
  "data": "<base64-encoded-jpeg>",
  "metadata": {
    "deviceWidth": 1280,
    "deviceHeight": 720,
    "pageScaleFactor": 1,
    "offsetTop": 0,
    "scrollOffsetX": 0,
    "scrollOffsetY": 0
  }
}
```

**Status messages:**

```json
{
  "type": "status",
  "connected": true,
  "screencasting": true,
  "viewportWidth": 1280,
  "viewportHeight": 720
}
```

**Input injection — mouse events:**

```json
{ "type": "input_mouse", "eventType": "mousePressed", "x": 100, "y": 200, "button": "left", "clickCount": 1 }
{ "type": "input_mouse", "eventType": "mouseReleased", "x": 100, "y": 200, "button": "left" }
{ "type": "input_mouse", "eventType": "mouseMoved", "x": 150, "y": 250 }
{ "type": "input_mouse", "eventType": "mouseWheel", "x": 100, "y": 200, "deltaX": 0, "deltaY": 100 }
```

**Input injection — keyboard events:**

```json
{ "type": "input_keyboard", "eventType": "keyDown", "key": "Enter", "code": "Enter" }
{ "type": "input_keyboard", "eventType": "keyUp", "key": "Enter", "code": "Enter" }
{ "type": "input_keyboard", "eventType": "char", "text": "a" }
{ "type": "input_keyboard", "eventType": "keyDown", "key": "c", "code": "KeyC", "modifiers": 2 }
```

Modifier flags: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift.

**Input injection — touch events:**

```json
{ "type": "input_touch", "eventType": "touchStart", "touchPoints": [{ "x": 100, "y": 200 }] }
{ "type": "input_touch", "eventType": "touchMove", "touchPoints": [{ "x": 150, "y": 250 }] }
{ "type": "input_touch", "eventType": "touchEnd", "touchPoints": [] }
{ "type": "input_touch", "eventType": "touchStart", "touchPoints": [{ "x": 100, "y": 200, "id": 0 }, { "x": 200, "y": 200, "id": 1 }] }
```

**Streaming use cases:**
- Pair browsing — Human watches and assists AI agent in real-time
- Remote preview — View browser output in a separate UI
- Recording — Capture frames for video generation
- Mobile testing — Inject touch events for mobile emulation
- Accessibility testing — Manual interaction during automated tests

---

## CDP Mode

Connect to an existing browser via Chrome DevTools Protocol:

```bash
# Start Chrome with: google-chrome --remote-debugging-port=9222

# Connect once, then run commands without --cdp
agent-browser connect 9222
agent-browser snapshot
agent-browser tab
agent-browser close

# Or pass --cdp on each command
agent-browser --cdp 9222 snapshot
```

### Remote WebSocket URLs

Connect to remote browser services via WebSocket URL:

```bash
# Connect to remote browser service
agent-browser --cdp "wss://browser-service.com/cdp?token=..." snapshot

# Works with any CDP-compatible service
agent-browser --cdp "ws://localhost:9222/devtools/browser/abc123" open example.com
```

The `--cdp` flag accepts either:
- A port number (e.g., `9222`) for local connections via `http://localhost:{port}`
- A full WebSocket URL (e.g., `wss://...` or `ws://...`) for remote browser services

### Auto-Connect

Use `--auto-connect` to automatically discover and connect to a running Chrome instance without specifying a port:

```bash
# Auto-discover running Chrome with remote debugging
agent-browser --auto-connect open example.com
agent-browser --auto-connect snapshot

# Or via environment variable
AGENT_BROWSER_AUTO_CONNECT=1 agent-browser snapshot
```

Auto-connect discovers Chrome by:
1. Reading Chrome's `DevToolsActivePort` file from the default user data directory
2. Falling back to probing common debugging ports (9222, 9229)

### CDP Use Cases

Control of: Electron apps, Chrome/Chromium with remote debugging, WebView2 applications, remote browser services (via WebSocket URL), any browser exposing a CDP endpoint.

### Cloud Providers

Use cloud browser infrastructure when local browsers aren't available:

```bash
# Browserbase
export BROWSERBASE_API_KEY="your-api-key"
export BROWSERBASE_PROJECT_ID="your-project-id"
agent-browser -p browserbase open https://example.com

# Browser Use
export BROWSER_USE_API_KEY="your-api-key"
agent-browser -p browseruse open https://example.com

# Kernel
export KERNEL_API_KEY="your-api-key"
agent-browser -p kernel open https://example.com

# Or via environment variable
export AGENT_BROWSER_PROVIDER=browserbase
agent-browser open https://example.com
```

---

## iOS Simulator

Control real Mobile Safari in the iOS Simulator for authentic mobile web testing. Uses Appium with XCUITest for native automation.

### Requirements

- macOS with Xcode installed
- iOS Simulator runtimes (download via Xcode)
- Appium with XCUITest driver

### Setup

```bash
# Install Appium globally
npm install -g appium

# Install the XCUITest driver for iOS
appium driver install xcuitest
```

### List Available Devices

```bash
agent-browser device list
```

### Basic Usage

Use the `-p ios` flag to enable iOS mode. The workflow is identical to desktop:

```bash
# Launch Safari on iPhone 16 Pro
agent-browser -p ios --device "iPhone 16 Pro" open https://example.com

# Get snapshot with refs (same as desktop)
agent-browser -p ios snapshot -i

# Interact using refs
agent-browser -p ios tap @e1
agent-browser -p ios fill @e2 "text"

# Take screenshot
agent-browser -p ios screenshot mobile.png

# Close session (shuts down simulator)
agent-browser -p ios close
```

### Mobile-Specific Commands

```bash
# Swipe gestures
agent-browser -p ios swipe up
agent-browser -p ios swipe down
agent-browser -p ios swipe left
agent-browser -p ios swipe right

# Swipe with distance (pixels)
agent-browser -p ios swipe up 500

# Tap (alias for click, semantically clearer for touch)
agent-browser -p ios tap @e1
```

### iOS Environment Variables

```bash
export AGENT_BROWSER_PROVIDER=ios
export AGENT_BROWSER_IOS_DEVICE="iPhone 16 Pro"
```

| Variable | Description |
|---|---|
| `AGENT_BROWSER_PROVIDER` | Set to `ios` to enable iOS mode |
| `AGENT_BROWSER_IOS_DEVICE` | Device name (e.g., "iPhone 16 Pro") |
| `AGENT_BROWSER_IOS_UDID` | Device UDID (alternative to device name) |

### iOS vs Desktop Differences

| Feature | Desktop | iOS |
|---|---|---|
| Browser | Chromium/Firefox/WebKit | Safari only |
| Tabs | Supported | Single tab only |
| PDF export | Supported | Not supported |
| Screencast | Supported | Not supported |
| Swipe gestures | Not native | Native support |

### Real Device Support

Appium can control Safari on real iOS devices connected via USB:

```bash
# Get device UDID
xcrun xctrace list devices

# Use with agent-browser
agent-browser -p ios --device "<DEVICE_UDID>" open https://example.com
```

Requires signing WebDriverAgent with your Apple Developer certificate (one-time Xcode setup).

### iOS Performance Notes

- **First launch:** 30-60 seconds to boot the simulator and start Appium
- **Subsequent commands:** Fast (simulator stays running)
- **Close command:** Shuts down simulator and Appium server

---

## Common Patterns

### Login Flow

```bash
agent-browser --session kortix open https://app.example.com/login
agent-browser --session kortix snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Sign In" [ref=e3]
agent-browser --session kortix fill @e1 "user@example.com"
agent-browser --session kortix fill @e2 "password123"
agent-browser --session kortix click @e3
agent-browser --session kortix wait --load networkidle
agent-browser --session kortix snapshot -i
```

### Form Submission

```bash
agent-browser --session kortix open https://example.com/form
agent-browser --session kortix snapshot -i
agent-browser --session kortix fill @e1 "John Doe"
agent-browser --session kortix fill @e2 "john@example.com"
agent-browser --session kortix select @e3 "premium"
agent-browser --session kortix check @e4
agent-browser --session kortix click @e5
agent-browser --session kortix wait --text "Thank you"
agent-browser --session kortix screenshot confirmation.png
```

### Data Extraction / Scraping

```bash
agent-browser --session scrape-products open https://example.com/products
agent-browser --session scrape-products snapshot -c
agent-browser --session scrape-products eval "JSON.stringify([...document.querySelectorAll('.product')].map(p => ({name: p.querySelector('h2').textContent, price: p.querySelector('.price').textContent})))"
agent-browser --session scrape-products close
```

### E2E Testing

```bash
agent-browser --session test-app open http://localhost:3000
agent-browser --session test-app snapshot -i
agent-browser --session test-app click @e1                    # Click nav link
agent-browser --session test-app wait --load networkidle
agent-browser --session test-app get url                      # Verify URL changed
agent-browser --session test-app get text @e2                 # Verify content
agent-browser --session test-app screenshot test-result.png
agent-browser --session test-app close
```

### Working with SPAs (Single Page Apps)

```bash
agent-browser --session kortix open https://spa-app.com
agent-browser --session kortix wait --load networkidle
agent-browser --session kortix snapshot -i -C              # -C catches onclick divs
agent-browser --session kortix click @e5
agent-browser --session kortix wait --fn "document.querySelector('.loaded') !== null"
agent-browser --session kortix snapshot -i -C
```

### Network Monitoring

```bash
agent-browser --session kortix open https://example.com
agent-browser --session kortix network requests --filter api
# See all API calls the page made
```

### Mobile Device Emulation

```bash
agent-browser --session kortix set device "iPhone 14"
agent-browser --session kortix open https://example.com
agent-browser --session kortix screenshot mobile.png
```

### Structured Data via JS

```bash
agent-browser --session kortix eval "JSON.stringify([...document.querySelectorAll('tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent.trim())))"
```

---

## Error Handling

When something goes wrong:

1. **Element not found** — Re-snapshot. The page may have changed. Try `-C` flag. Try CSS selector fallback.
2. **Click intercepted** — A modal or overlay is blocking. Snapshot to see what's in the way. Dismiss it, scroll, or wait.
3. **Timeout** — Page is slow. Increase wait time. Check network: `agent-browser network requests`.
4. **Navigation failed** — Check URL. Try with `--ignore-https-errors` for self-signed certs.
5. **Captcha/bot detection** — Screenshot to show the user. Try setting a realistic user agent: `agent-browser --user-agent "Mozilla/5.0..."`.
6. **Page crash** — `agent-browser close` and start fresh.

---

## Tips

1. **Always snapshot after navigation or clicks** — The page state changes; refs become stale.
2. **Use `-i` flag on snapshots** — Reduces noise by showing only interactive elements.
3. **Use `-C` with modern apps** — Many apps use custom clickable elements that `-i` alone misses.
4. **Use `--json` for structured data** — When parsing output programmatically.
5. **Use `wait` before interacting** — Ensure elements are loaded before clicking.
6. **Use default session for authenticated work** — It has the persistent profile with all logins.
7. **Use named sessions for parallel work** — `--session scraper`, `--session tester` etc. Ephemeral, no profile conflicts.
8. **Direct human to viewer for complex logins** — OAuth, 2FA, CAPTCHAs → tell user to open `http://localhost:9224`.
9. **Save auth state for named sessions** — `state save` from default, `state load` into named sessions.
10. **Use `eval` for complex extraction** — When snapshot/get isn't enough, run JS directly.
11. **Close ephemeral sessions when done** — `agent-browser --session name close` frees resources and removes the tab from the viewer. The primary `kortix` session stays open.
12. **Check `errors` and `console`** — When debugging page issues.
13. **Never close the `kortix` session unless intentional** — It's the shared browser the human sees.
14. **Link to the right session** — When telling the human to check the viewer, always use `http://localhost:9224?session=<name>` so they land on the correct tab.
15. **Name sessions for the human** — The human sees session names as tabs. Use descriptive names like `login-stripe`, `debug-api`, `fill-form` — never random IDs or timestamps.
16. **Use headed mode for debugging** — `agent-browser open example.com --headed` shows the browser window.
17. **Use traces for complex debugging** — `agent-browser trace start` captures a Playwright trace you can replay.
18. **Full page as markdown** — For content-heavy pages, `scrape-webpage` may be faster than browser extraction. Use the browser only when you need JS-rendered content, interaction before extraction, or screenshots.
