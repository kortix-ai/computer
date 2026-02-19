# Kortix Deployments API Reference

All deployment operations go through the Kortix API. Freestyle is used as the deployment backend, but is completely abstracted away — you never interact with it directly.

## Base URL

```bash
# Strip /router from KORTIX_API_URL
BASE_URL="${KORTIX_API_URL%/router}"
# e.g. https://api.kortix.ai/v1  or  http://kortix-api:8008/v1
```

## Authentication

All requests require `Authorization: Bearer $KORTIX_TOKEN` (sandbox token, set automatically).

---

## POST /v1/deployments — Create Deployment

### Request Body

```typescript
{
  // ─── Source (exactly one type required) ────────────────────────
  source_type: 'git' | 'code' | 'files' | 'tar',

  // Git source (when source_type = 'git')
  source_ref?: string,     // Git repo URL (required for git)
  branch?: string,         // Branch name (optional, defaults to default branch)
  root_path?: string,      // Monorepo sub-path (optional)

  // Code source (when source_type = 'code')
  code?: string,           // Inline JS/TS code (required for code)

  // Files source (when source_type = 'files')
  files?: Array<{          // File array (required for files)
    path: string,          // Relative file path
    content: string,       // File content (plain text or base64)
    encoding?: string,     // 'base64' if content is base64-encoded
  }>,

  // Tar source (when source_type = 'tar')
  tar_url?: string,        // URL to .tar.gz archive (required for tar)

  // ─── Config ───────────────────────────────────────────────────
  domains: string[],       // Required, min 1. Use "slug.style.dev" for free subdomains

  build?: boolean | {      // Build config (default: false)
    command?: string,      // Custom build command (e.g. "npm run build")
    outDir?: string,       // Build output directory
    envVars?: Record<string, string>,  // Build-time env vars (NOT runtime)
  },

  env_vars?: Record<string, string>,  // Runtime env vars (NOT build-time)

  node_modules?: Record<string, string>,  // Only for 'code' deploys
                           // e.g. { "express": "^4.18.2" }

  entrypoint?: string,     // Main file (auto-detected for Next.js/Vite)

  timeout_ms?: number,     // Idle timeout in ms before scale-down

  static_only?: boolean,   // Serve files directly, no server entrypoint
  public_dir?: string,     // Directory with static files (for static_only)
  clean_urls?: boolean,    // /about.html → /about

  headers?: Array<{        // Custom response headers
    source: string,        // Regex matching URL path
    headers: Array<{ key: string, value: string }>,
  }>,

  redirects?: Array<{      // URL redirects
    source: string,        // Regex matching URL path
    destination: string,   // Redirect target
    permanent?: boolean,   // true = 308, false = 307
  }>,

  network_permissions?: Array<{  // Outbound network ACL
    action: 'allow' | 'deny',
    domain: string,
    behavior: 'exact' | 'regex',
  }>,

  framework?: string,      // Optional hint: 'nextjs', 'vite', 'static', etc.
}
```

### Response (201)

```json
{
  "success": true,
  "data": {
    "deploymentId": "uuid",
    "accountId": "uuid",
    "freestyleId": "freestyle-deployment-id",
    "status": "active",
    "sourceType": "git",
    "sourceRef": "https://github.com/user/repo",
    "framework": "nextjs",
    "domains": ["my-app.style.dev"],
    "liveUrl": "https://my-app.style.dev",
    "envVars": {},
    "buildConfig": { "auto": true },
    "entrypoint": null,
    "error": null,
    "version": 1,
    "metadata": {},
    "createdAt": "2026-02-19T12:00:00.000Z",
    "updatedAt": "2026-02-19T12:00:00.000Z"
  }
}
```

**Status values**: `pending` → `active` (success) or `failed` (error in `error` field).

---

## GET /v1/deployments — List Deployments

### Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | string | — | Filter by status (pending, active, failed, stopped) |
| `limit` | number | 50 | Max results (capped at 100) |
| `offset` | number | 0 | Pagination offset |

### Response (200)

```json
{
  "success": true,
  "data": [ /* deployment objects */ ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

---

## GET /v1/deployments/:id — Get Deployment

### Response (200)

```json
{
  "success": true,
  "data": { /* single deployment object */ }
}
```

Returns 404 if deployment doesn't exist or belongs to another user.

---

## POST /v1/deployments/:id/stop — Stop Deployment

Updates the deployment status to `stopped`.

### Response (200)

```json
{
  "success": true,
  "data": { /* deployment object with status: "stopped" */ }
}
```

---

## POST /v1/deployments/:id/redeploy — Redeploy

Creates a new deployment with the same config and incremented version.

### Response (201)

```json
{
  "success": true,
  "data": { /* new deployment object with version: N+1 */ }
}
```

---

## DELETE /v1/deployments/:id — Delete Deployment

Removes the deployment record from the database.

### Response (200)

```json
{
  "success": true,
  "message": "Deployment deleted"
}
```

---

## GET /v1/deployments/:id/logs — Get Logs

Returns deployment logs from Freestyle.

### Response (200)

```json
{
  "success": true,
  "data": { /* log entries from Freestyle */ }
}
```

Returns 502 if Freestyle is unreachable.
