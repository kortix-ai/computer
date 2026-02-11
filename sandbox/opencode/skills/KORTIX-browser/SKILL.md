---
name: kortix-browser
description: "Browser automation skill using agent-browser CLI. Use when the agent needs to interact with web pages — navigating, clicking, filling forms, extracting data, taking screenshots, testing web UIs, scraping dynamic content, or performing any end-to-end browser automation. Triggers on: 'open this page', 'click the button', 'fill the form', 'test the login flow', 'scrape this site', 'take a screenshot', 'check if the page works', 'automate the browser', 'e2e test', any task requiring a real browser with JavaScript execution."
---

# Browser Automation

Full browser control via the `agent-browser` CLI. This gives you a real Chromium instance you can drive end-to-end — navigate, click, type, screenshot, extract data, wait for elements, handle tabs, cookies, network interception, and more.

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

## Command Reference

### Navigation

```bash
agent-browser open <url>              # Navigate to URL
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
| `-C, --cursor` | Include cursor-interactive elements (cursor:pointer, onclick) |
| `-c, --compact` | Remove empty structural elements |
| `-d, --depth <n>` | Limit tree depth |
| `-s, --selector <sel>` | Scope to CSS selector |

The `-C` flag is essential for modern web apps that use custom clickable divs/spans instead of semantic buttons/links.

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
```

### JavaScript Evaluation

```bash
agent-browser eval "<js>"             # Run JavaScript in page
agent-browser eval "<js>" -b          # Base64-encode the JS
agent-browser eval --stdin            # Read JS from stdin
```

### Semantic Locators (Alternative to Refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "test@test.com"
agent-browser find placeholder "Search..." fill "query"
agent-browser find testid "submit-btn" click
agent-browser find first ".item" click
agent-browser find nth 2 "a" text
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
agent-browser console                 # View console messages
agent-browser console --clear         # Clear console
agent-browser errors                  # View page errors (uncaught exceptions)
agent-browser errors --clear          # Clear errors
agent-browser highlight <sel>         # Highlight element visually
```

### Sessions & Parallel Browsing

**Every `--session` name must be unique across concurrent runs.** This prevents Chromium profile lock conflicts.

**Two types of sessions:**

| Session | Name | Profile | Stream Port | Human Visible | Use For |
|---------|------|---------|-------------|---------------|---------|
| Primary | `kortix` | Persistent (`/config/.browser-profile`) | 9223 | Yes (viewer) | Authenticated work, human-shared browsing |
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

### Authentication & Login

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
agent-browser --session kortix state save /config/.browser-auth.json

# Load it into an ephemeral session
agent-browser --session worker-$(date +%s) state load /config/.browser-auth.json
agent-browser --session worker-1234 open https://app.example.com/dashboard
```

**API token auth (no login needed):**

```bash
# Set auth headers scoped to origin (not leaked to other domains)
agent-browser --session kortix open api.example.com --headers '{"Authorization": "Bearer <token>"}'

# Works with ephemeral sessions too
agent-browser --session api-task-$(date +%s) open api.example.com --headers '{"Authorization": "Bearer <token>"}'
```

### JSON Output (Machine-Readable)

```bash
agent-browser snapshot --json         # JSON accessibility tree
agent-browser get text @e1 --json     # JSON text content
agent-browser is visible @e2 --json   # JSON boolean
```

## Selector Types

In order of preference:

1. **Refs** (best) — `@e1`, `@e2` from snapshot output. Deterministic, fast.
2. **CSS selectors** — `"#id"`, `".class"`, `"div > button"`
3. **Text selectors** — `"text=Submit"`
4. **XPath** — `"xpath=//button[@type='submit']"`
5. **Semantic locators** — `find role button click --name "Submit"`

Always prefer refs from snapshot. Fall back to CSS/text only when refs are unavailable.

## Common Patterns

### Login Flow

```bash
agent-browser open https://app.example.com/login
agent-browser snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Sign In" [ref=e3]
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i
```

### Form Submission

```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
agent-browser fill @e1 "John Doe"
agent-browser fill @e2 "john@example.com"
agent-browser select @e3 "premium"
agent-browser check @e4
agent-browser click @e5
agent-browser wait --text "Thank you"
agent-browser screenshot confirmation.png
```

### Data Extraction / Scraping

```bash
agent-browser open https://example.com/products
agent-browser snapshot -c
agent-browser eval "JSON.stringify([...document.querySelectorAll('.product')].map(p => ({name: p.querySelector('h2').textContent, price: p.querySelector('.price').textContent})))"
```

### E2E Testing

```bash
agent-browser open http://localhost:3000
agent-browser snapshot -i
agent-browser click @e1                    # Click nav link
agent-browser wait --load networkidle
agent-browser get url                      # Verify URL changed
agent-browser get text @e2                 # Verify content
agent-browser screenshot test-result.png
agent-browser close
```

### Screenshot for Visual Verification

```bash
agent-browser open https://example.com
agent-browser wait --load networkidle
agent-browser screenshot page.png
agent-browser screenshot --full full-page.png
```

### Working with SPAs (Single Page Apps)

```bash
agent-browser open https://spa-app.com
agent-browser wait --load networkidle
agent-browser snapshot -i -C              # -C catches onclick divs
agent-browser click @e5
agent-browser wait --fn "document.querySelector('.loaded') !== null"
agent-browser snapshot -i -C
```

### Network Monitoring

```bash
agent-browser open https://example.com
agent-browser network requests --filter api
# See all API calls the page made
```

### Mobile Device Emulation

```bash
agent-browser set device "iPhone 14"
agent-browser open https://example.com
agent-browser screenshot mobile.png
```

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

**WebSocket protocol** (for programmatic access):
- Default session stream: `ws://localhost:9223`
- Named session streams: auto-assigned ports (check `/config/.agent-browser/<session>.stream`)
- Frame format: `{"type": "frame", "data": "<base64-jpeg>", "metadata": {...}}`
- Input format: `{"type": "input_mouse", "eventType": "mousePressed", "x": 100, "y": 200, ...}`

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
