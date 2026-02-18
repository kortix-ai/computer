# KORTIX Presentation Viewer

A polished slide viewer and preview server for HTML presentations (1920x1080).

## Architecture

The viewer consists of two parts:

1. **`viewer.html`** — a self-contained HTML template that renders slides in scaled iframes with keyboard navigation, fullscreen, and a thumbnail strip.
2. **`serve.ts`** — a lightweight Bun HTTP server that serves the presentation folder and injects the viewer at `/`.

## Why a server (not just a static HTML file)?

Standalone 1920x1080 HTML slides opened directly in a browser are an unscaled, scrollable mess. The viewer fixes this by loading slides into iframes and CSS-scaling them to fit any viewport.

The problem: **loading `<iframe src="slide_XX.html">` does not work reliably over `file://`**. Browsers enforce CORS/sandboxing restrictions on `file://` origins — Chrome blocks cross-file iframe access, Safari has different restrictions, Firefox another set. There is no consistent way to make iframe-based viewers work from the filesystem.

An HTTP server on `localhost` eliminates all of this. Iframes load cleanly, images resolve correctly, and it works identically across every browser.

## In the sandbox (container)

**The viewer is already running as a service inside the sandbox container.** It starts automatically on boot via s6-overlay and listens on **port 3210**.

- The service watches `/workspace/presentations/` for any presentation with a `metadata.json`
- It serves the most recently created/updated presentation at `http://localhost:3210`
- Port 3210 is exposed in docker-compose and mapped to the host

**The agent does not need to start the server manually.** It is already available. After creating slides, the agent can simply tell the user to open `http://localhost:3210` (or the equivalent sandbox URL) to preview.

If the service is not running for some reason (e.g. no presentations exist yet), it will auto-start once the first presentation's `metadata.json` appears. The agent can also restart it manually:

```bash
bun run /opt/KORTIX-presentation-viewer/serve.ts /workspace/presentations/<name>
```

### Container details

| Item | Value |
|------|-------|
| Service location | `/etc/services.d/KORTIX-presentation-viewer/run` |
| Viewer files | `/opt/KORTIX-presentation-viewer/` |
| Port | `3210` (mapped to host) |
| Presentations dir | `/workspace/presentations/` |
| Managed by | s6-overlay (auto-restart on crash) |

## Local development (outside container)

```bash
bun run .opencode/skills/KORTIX-presentation-viewer/serve.ts presentations/my-deck
```

Or via the `presentation-gen` tool:

```
presentation-gen(action: "preview", presentation_name: "my-deck")
```

This starts the server at `http://localhost:3210` and auto-opens the browser.

## Viewer controls

| Key | Action |
|-----|--------|
| `→` / `Space` / `↓` | Next slide |
| `←` / `↑` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `F` | Toggle fullscreen |
| `T` | Toggle thumbnail strip |
| `?` | Toggle keyboard shortcuts |
| `Esc` | Exit fullscreen / close panels |
| Swipe left/right | Navigate (touch) |

## How scaling works

Each slide is a 1920x1080 iframe. The viewer:

1. Measures the actual stage area via `getBoundingClientRect()`
2. Computes a scale factor: `min(availWidth / 1920, availHeight / 1080)`
3. Sets the wrapper to the **displayed pixel size** (`1920 * scale` x `1080 * scale`)
4. Applies `transform: scale(factor)` with `transform-origin: 0 0` to each iframe

This means the wrapper's DOM size matches its visual size, so flexbox centering works perfectly. The 16:9 aspect ratio is maintained at any viewport size. A 3% proportional padding keeps space around the slide.

## Integration with presentation-gen

The `presentation-gen` tool auto-generates a `viewer.html` in each presentation folder on every `create_slide` or `delete_slide` action. This is a static fallback for quick local file:// viewing (works in some browsers), but the server is always the recommended way to preview.
