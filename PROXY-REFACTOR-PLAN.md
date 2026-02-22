# Preview Proxy Refactor Plan

## The Problem

The current preview proxy chain is broken:

```
Browser → kortix-api:8008 (/v1/preview/{id}/{port}/) → kortix-master:8000 (/proxy/{port}/) → localhost:{port}
              auth + body mangling                          SW injection + body mangling
```

**What breaks:**
1. **Double decompression** — each hop auto-decompresses gzip/brotli, re-transmits raw, but leaves `Content-Encoding` header → next hop tries to decompress again → ZlibError
2. **Auth doesn't propagate** — `?token=` only on initial request, sub-resources (CSS/JS/images) get 401
3. **Absolute paths break** — app at `/v1/preview/{id}/{port}/` thinks it's at `/`, so `<script src="/main.js">` → 404
4. **Service Worker scope mismatch** — SW injected by Kortix Master has scope `/proxy/{port}/`, but browser sees `/v1/preview/.../proxy/{port}/` → SW never activates
5. **Two proxy hops** — each mangling headers, buffering bodies, adding latency

**What we need:**
- Works like ngrok — app thinks it's at `/`, zero path prefix
- True passthrough — bytes in, bytes out
- Auth via session cookie — set once, works for all sub-resources automatically

---

## The Solution: Subdomain-Based Routing

### URL scheme

**Local mode:**
```
http://p{port}-{sandboxId}.localhost:8008/
```
Examples:
- `http://p3210-kortix-sandbox.localhost:8008/` → sandbox port 3210
- `http://p5173-kortix-sandbox.localhost:8008/` → Vite dev server

**Cloud mode (Daytona):**
Already handled — Daytona gives per-port preview URLs via `getPreviewLink()`.

### How it works

```
Browser requests:  http://p3210-kortix-sandbox.localhost:8008/src/main.tsx
                   ↓
kortix-api:        Host header = "p3210-kortix-sandbox.localhost:8008"
                   → parse: port=3210, sandboxId=kortix-sandbox
                   → auth: check __preview_session cookie
                   → proxy to: http://kortix-sandbox:8000/proxy/3210/src/main.tsx
                   → decompress: false, stream body 1:1
                   ↓
Kortix Master:     /proxy/3210/src/main.tsx
                   → proxy to: http://localhost:3210/src/main.tsx
                   → decompress: false, stream body 1:1
                   ↓
App:               receives GET /src/main.tsx — thinks it's at root!
```

**No path prefix.** The app is at `/` from its own perspective. Absolute paths like `/src/main.tsx` resolve correctly because the browser requests them from the same subdomain origin.

**No Service Worker needed.** Since there's no path prefix to rewrite, all URLs work natively. Delete the SW injection code entirely from Kortix Master's proxy.ts.

### Browser compatibility

| Browser | `*.localhost` resolves? |
|---------|----------------------|
| Chrome/Edge | Yes (native, RFC 6761) |
| Firefox | Yes (since ~FF 84) |
| Safari | **No** — needs fallback |

**Safari fallback:** Keep the existing path-based route (`/v1/preview/{id}/{port}/`) working as a fallback. The frontend detects Safari and uses the old URL scheme. For Safari users in local dev, `/etc/hosts` or a real wildcard domain would also work.

---

## Architecture

### Layer 1: kortix-api (external proxy)

**Two routing modes on the same server (port 8008):**

1. **Subdomain route** (new, primary): `Host: p{port}-{sandboxId}.localhost:8008`
   - Middleware intercepts at the Bun server level (before Hono routing)
   - Parses port + sandboxId from Host header
   - Auth: `__preview_session` cookie (set by `/v1/preview/auth` endpoint)
   - Proxy: `fetch(sandboxBaseUrl + "/proxy/{port}" + path, { decompress: false })` → stream 1:1
   - Only touches: Host header, Authorization (service key), CORS headers
   - WebSocket: same subdomain routing, same auth (cookie sent automatically)

2. **Path-based route** (existing, Safari fallback): `/v1/preview/{sandboxId}/{port}/*`
   - Kept as-is but simplified to use `decompress: false` and stream passthrough
   - Same auth: cookie-based

### Layer 2: Kortix Master (internal proxy)

**Simplified to pure dumb pipe:**

```
/proxy/{port}/{path} → fetch("http://localhost:{port}/{path}", { decompress: false }) → stream 1:1
```

- **Delete** all Service Worker injection code (~100 lines)
- **Delete** all HTML parsing/body reading
- Only touch: Host header, Location header (redirect rewriting)
- Everything else (headers, body, compression) passes through untouched

### Layer 3: Auth

**Cookie-based session, set once:**

1. Frontend calls `POST /v1/preview/auth` with JWT in `Authorization` header
2. Backend validates JWT, responds with:
   ```
   Set-Cookie: __preview_session={JWT}; Domain=localhost; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600
   ```
   `Domain=localhost` means the cookie is sent to ALL `*.localhost` subdomains automatically.
3. All subsequent requests (iframe loads, sub-resources, WebSocket upgrades) include the cookie
4. `previewProxyAuth` middleware checks: `Authorization` header → cookie. **No more `?token=` query param.**

### Layer 4: Frontend

**URL generation changes:**

```typescript
// OLD: path-based
const previewUrl = `${backendUrl}/preview/${sandboxId}/8000/proxy/${port}/`;

// NEW: subdomain-based
const previewUrl = `http://p${port}-${sandboxId}.localhost:${backendPort}/`;
```

**Preview tab iframe:** just sets `src` to the subdomain URL. Cookie handles auth.

**Link interception:** when agent output contains `http://localhost:3210`, rewrite to `http://p3210-{sandboxId}.localhost:8008/`.

---

## Files to Change

### Backend (kortix-api)

| File | Change |
|------|--------|
| `src/index.ts` | Add subdomain detection in `fetch()` handler — before Hono routing, parse Host header. If it's a preview subdomain, proxy directly (skip Hono). Also handle WS upgrades for subdomains. |
| `src/daytona-proxy/index.ts` | Add `POST /auth` route that validates JWT and sets `__preview_session` cookie with `Domain=localhost`. |
| `src/daytona-proxy/routes/local-preview.ts` | Simplify: `decompress: false`, stream body, no header mangling. This is only used for the path-based fallback now. |
| `src/daytona-proxy/routes/preview.ts` | Same simplification for cloud mode. Add `decompress: false`. |
| `src/middleware/auth.ts` | Already done — `previewProxyAuth` reads cookie. Remove `?token=` query param support (or keep as legacy fallback). |

### Sandbox (Kortix Master)

| File | Change |
|------|--------|
| `src/routes/proxy.ts` | **Rewrite to ~50 lines.** Delete Service Worker code. Pure dumb pipe: parse port from path, `fetch("http://localhost:{port}/{path}", { decompress: false })`, stream response 1:1. Only special handling: redirect Location header rewrite. |

### Frontend

| File | Change |
|------|--------|
| `src/lib/utils/sandbox-url.ts` | `rewriteLocalhostUrl()` returns `http://p{port}-{sandboxId}.localhost:{backendPort}/{path}` instead of `{serverUrl}/proxy/{port}/{path}`. Need to pass sandboxId + backendPort. |
| `src/hooks/use-authenticated-preview-url.ts` | **Delete or simplify.** No more `?token=` injection. On mount, call `POST /v1/preview/auth` once to set cookie. Return the clean subdomain URL. |
| `src/components/tabs/preview-tab-content.tsx` | Update: iframe `src` uses subdomain URL directly. No token in URL. |
| `src/components/localhost-link-interceptor.tsx` | Update: rewrite localhost links to subdomain URLs instead of path-based proxy URLs. |
| `src/stores/server-store.ts` | `DEFAULT_SANDBOX_URL` and `getActiveOpenCodeUrl()` may need to expose sandboxId and backend port separately for subdomain URL construction. |
| `src/components/session/tool-renderers.tsx` | Update proxy URL generation to use subdomain scheme. |
| `src/components/thread/tool-views/opencode/OcShowUserToolView.tsx` | Same. |
| `src/components/thread/tool-views/opencode/OcPresentationGenToolView.tsx` | Same. |
| `src/components/sidebar/sidebar-right.tsx` | Preview tabs use subdomain URLs. |

---

## Implementation Order

### Phase 1: Backend proxy (make it work)
1. Add `POST /v1/preview/auth` cookie-setting endpoint
2. Add subdomain routing in `src/index.ts` fetch handler (HTTP + WebSocket)
3. Simplify Kortix Master `proxy.ts` to dumb pipe
4. Simplify `local-preview.ts` to dumb pipe (path-based fallback)

### Phase 2: Frontend (use the new URLs)
5. Update `sandbox-url.ts` — subdomain URL generation
6. Update `use-authenticated-preview-url.ts` — call `/auth` endpoint, return clean URL
7. Update `preview-tab-content.tsx` — use subdomain URLs
8. Update `localhost-link-interceptor.tsx` — rewrite to subdomain URLs
9. Update tool renderers — subdomain URL generation

### Phase 3: Cleanup
10. Remove Service Worker code from Kortix Master
11. Remove `?token=` query param support from auth middleware
12. Remove all `Accept-Encoding` / `Content-Encoding` stripping hacks
13. Remove response body buffering (`arrayBuffer()`, `response.text()`)

---

## What We Delete

- ~100 lines of Service Worker generation/injection (proxy.ts)
- `?token=` query param flow (auth.ts, use-authenticated-preview-url.ts)
- `Accept-Encoding` stripping hacks (local-preview.ts, preview.ts, proxy.ts)
- `Content-Encoding` stripping hacks (same files)
- Response body buffering (`arrayBuffer()`, `response.text()`) in proxy paths
- `isAlreadyProxied()` double-proxy detection (no longer needed — no path prefix)
- `extractFromProxiedUrl()` in localhost-link-interceptor (no longer needed)

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Safari doesn't support `*.localhost` | Keep path-based route as fallback. Frontend detects Safari via user agent and falls back. |
| Cookie `Domain=localhost` leaks across sandbox subdomains | Acceptable — all subdomains belong to the same user's sandbox session. Each sandbox has its own sandboxId in the subdomain. |
| Cloud mode (Daytona) has different URL scheme | Daytona already provides per-port preview URLs. Cloud mode bypasses subdomain routing entirely — `preview.ts` proxies directly to Daytona's preview URL. Only local mode uses our subdomain routing. |
| WebSocket auth via cookie | Browsers send cookies on WebSocket upgrade requests to the same origin. Cookie with `Domain=localhost` covers all `*.localhost` subdomains. |
