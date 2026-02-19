---
name: deploy
description: "Deploy any web app, API, or static site via Kortix Deployments API. Supports Next.js, Vite, static sites, Express/Hono APIs, raw code snippets, Git repos, local files, and tar URLs. Auto-detects frameworks, builds, and deploys with instant SSL on *.style.dev subdomains. Triggers on: 'deploy this', 'deploy my app', 'make this live', 'publish this', 'host this', 'get me a preview URL', 'ship this', 'deploy to production', '1-click deploy', 'preview URL', 'put this online', any request to deploy, host, or publish a web application, site, or API to the internet."
---

# Kortix Deployments

Deploy apps to live URLs via the Kortix Deployments API (`POST /v1/deployments`). The API handles everything server-side — no SDK, no API keys, no deploy scripts needed.

## How It Works

The agent calls the Kortix API directly using `KORTIX_TOKEN`. Kortix forwards to Freestyle.sh behind the scenes, tracks deployments per-user, and returns a live `*.style.dev` URL.

**No user-facing API keys. No SDK installs. No `.mjs` scripts. Just one API call.**

## Capabilities

- **4 source types**: Git repo, inline code, local files, tar URL
- **Auto-detects** Next.js, Vite, Expo — TypeScript works out of the box
- **Free `*.style.dev` subdomains** with instant SSL
- **Sub-second deploys** for non-build deployments
- **WebSocket support** (timeout is per last TCP packet)
- **Cached modules** — include your lockfile, never upload `node_modules`

## Limitations (Node.js only)

- No Python, Ruby, Go — only Node.js/TypeScript
- No SSH, systemd, filesystem persistence
- No browser automation
- No Sharp (use `images.unoptimized` for Next.js)
- Port 3000 — all servers must listen on port 3000

## Prerequisites

The sandbox has `KORTIX_API_URL` and `KORTIX_TOKEN` set automatically. No additional setup needed.

## Workflow

1. **Detect** project type (see Detection below)
2. **Build** the request body (pick the right source type + config)
3. **Call** `POST /v1/deployments` with `KORTIX_TOKEN`
4. **Report** the live URL to the user

### Domain Naming

Generate a descriptive `*.style.dev` subdomain:
- Use project name as base, append short random suffix: `my-app-x7k2.style.dev`
- Lowercase, alphanumeric + hyphens only
- Generate with: `` `${slug}-${crypto.randomUUID().slice(0, 4)}.style.dev` ``

## API Call Pattern

```bash
# Strip /router from KORTIX_API_URL to get base (same pattern as cron triggers)
BASE_URL="${KORTIX_API_URL%/router}"

curl -X POST "$BASE_URL/deployments" \
  -H "Authorization: Bearer $KORTIX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

Or in JavaScript/TypeScript:

```typescript
const baseUrl = process.env.KORTIX_API_URL!.replace(/\/router$/, '');

const response = await fetch(`${baseUrl}/deployments`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.KORTIX_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    source_type: 'git',
    source_ref: 'https://github.com/user/repo',
    domains: ['my-app-x7k2.style.dev'],
    build: true,
  }),
});

const result = await response.json();
// result.data.live_url → "https://my-app-x7k2.style.dev"
// result.data.deployment_id → UUID
```

## Project Detection

Check these files to determine the framework:

| File present | Framework | Deploy strategy |
|---|---|---|
| `next.config.{js,mjs,ts}` | Next.js | `source_type: 'git'` + `build: true` |
| `vite.config.{js,ts,mjs}` | Vite | `source_type: 'git'` + `build: true` |
| Only `.html`/`.css`/`.js` | Static | `source_type: 'files'` + Express server + `static_only: true` |
| `package.json` with Express/Hono | Node.js API | `source_type: 'git'` or `'files'`, no build |
| `.git` with GitHub remote | Any | Prefer `source_type: 'git'` with repo URL |
| User provides code snippet | Code | `source_type: 'code'` + `node_modules` |
| User provides `.tar.gz` URL | Tar | `source_type: 'tar'` |

### Next.js Pre-Flight

Before deploying Next.js, verify `next.config` has:
```javascript
output: "standalone"
images: { unoptimized: true }
```
If missing, add them automatically and inform the user.

## Deploy Examples

### 1. Git Repo (any framework)

```json
{
  "source_type": "git",
  "source_ref": "https://github.com/user/repo",
  "domains": ["my-app-x7k2.style.dev"],
  "build": true
}
```

With branch and monorepo path:
```json
{
  "source_type": "git",
  "source_ref": "https://github.com/user/monorepo",
  "branch": "main",
  "root_path": "./apps/web",
  "domains": ["my-app-x7k2.style.dev"],
  "build": true
}
```

### 2. Next.js (from git)

```json
{
  "source_type": "git",
  "source_ref": "https://github.com/user/nextjs-app",
  "domains": ["nextjs-app-a1b2.style.dev"],
  "build": true,
  "framework": "nextjs",
  "env_vars": {
    "DATABASE_URL": "postgres://..."
  }
}
```

With build-time env vars:
```json
{
  "source_type": "git",
  "source_ref": "https://github.com/user/nextjs-app",
  "domains": ["nextjs-app-a1b2.style.dev"],
  "build": {
    "command": "npm run build",
    "envVars": {
      "NEXT_PUBLIC_API_URL": "https://api.example.com"
    }
  }
}
```

### 3. Vite / React / Vue / Svelte (from git)

```json
{
  "source_type": "git",
  "source_ref": "https://github.com/user/vite-app",
  "domains": ["vite-app-c3d4.style.dev"],
  "build": true
}
```

### 4. Inline Code (Express API)

```json
{
  "source_type": "code",
  "code": "import express from 'express';\nconst app = express();\napp.get('/', (req, res) => res.json({ status: 'ok' }));\napp.listen(3000);",
  "node_modules": { "express": "^4.18.2" },
  "domains": ["api-e5f6.style.dev"]
}
```

Hono variant (must use `@hono/node-server`):
```json
{
  "source_type": "code",
  "code": "import { Hono } from 'hono';\nimport { serve } from '@hono/node-server';\nconst app = new Hono();\napp.get('/', (c) => c.json({ status: 'ok' }));\nserve({ fetch: app.fetch, port: 3000 });",
  "node_modules": { "hono": "^4", "@hono/node-server": "^1" },
  "domains": ["api-g7h8.style.dev"]
}
```

**WARNING**: Do NOT use `Deno.serve()` or `app.fire()`. Runtime is Node.js. Always use `app.listen(3000)` or `serve({ fetch: app.fetch, port: 3000 })`.

### 5. Local Files (pre-built static/SPA)

Read files with Node.js `fs`, send as array:

```typescript
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

function readFilesRecursive(dir: string, base?: string): Array<{path: string, content: string, encoding: string}> {
  const result: Array<{path: string, content: string, encoding: string}> = [];
  base = base ?? dir;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...readFilesRecursive(full, base));
    } else {
      result.push({
        path: relative(base, full),
        content: readFileSync(full).toString('base64'),
        encoding: 'base64',
      });
    }
  }
  return result;
}

const files = readFilesRecursive('./dist');

// Then POST to /v1/deployments:
{
  "source_type": "files",
  "files": files,
  "entrypoint": "server.js",
  "domains": ["my-site-i9j0.style.dev"]
}
```

**Important**: For static sites, you MUST include a Node.js server entrypoint (Express/Hono). Or use `static_only: true` with `public_dir`.

### 6. Static Site (no server needed)

```json
{
  "source_type": "git",
  "source_ref": "https://github.com/user/static-site",
  "domains": ["site-k1l2.style.dev"],
  "static_only": true,
  "public_dir": "public",
  "clean_urls": true
}
```

### 7. Tar URL

```json
{
  "source_type": "tar",
  "tar_url": "https://s3.example.com/signed-url/app.tar.gz",
  "domains": ["app-m3n4.style.dev"],
  "build": true
}
```

## Other API Endpoints

```bash
BASE_URL="${KORTIX_API_URL%/router}"

# List all deployments
curl "$BASE_URL/deployments" \
  -H "Authorization: Bearer $KORTIX_TOKEN"

# Get deployment details
curl "$BASE_URL/deployments/{deployment_id}" \
  -H "Authorization: Bearer $KORTIX_TOKEN"

# Get deployment logs
curl "$BASE_URL/deployments/{deployment_id}/logs" \
  -H "Authorization: Bearer $KORTIX_TOKEN"

# Stop a deployment
curl -X POST "$BASE_URL/deployments/{deployment_id}/stop" \
  -H "Authorization: Bearer $KORTIX_TOKEN"

# Redeploy (same config, new version)
curl -X POST "$BASE_URL/deployments/{deployment_id}/redeploy" \
  -H "Authorization: Bearer $KORTIX_TOKEN"

# Delete deployment record
curl -X DELETE "$BASE_URL/deployments/{deployment_id}" \
  -H "Authorization: Bearer $KORTIX_TOKEN"
```

## Response Format

### Create (POST /v1/deployments)

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
    "domains": ["my-app-x7k2.style.dev"],
    "liveUrl": "https://my-app-x7k2.style.dev",
    "envVars": {},
    "buildConfig": { "auto": true },
    "entrypoint": null,
    "error": null,
    "version": 1,
    "createdAt": "2026-02-19T...",
    "updatedAt": "2026-02-19T..."
  }
}
```

### List (GET /v1/deployments)

```json
{
  "success": true,
  "data": [ /* array of deployment objects */ ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

## Hard-Won Lessons

1. **Runtime is Node.js**: `Deno.serve()` and `app.fire()` do NOT work. Use `app.listen(3000)`.
2. **Port 3000**: All servers must listen on port 3000.
3. **Static sites need a server OR `static_only: true`**: Setting `entrypoint` to an HTML file won't serve sub-assets. Either bundle an Express server or use `static_only` mode.
4. **`env_vars` are runtime-only**: NOT available at build time. Use `build.envVars` for build-time variables.
5. **Include your lockfile**: For git/file deploys, include `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`. Never include `node_modules`.
6. **`node_modules` field**: Only needed for `code` deploys.
7. **Cold starts**: First request may take 10-15 seconds. Subsequent requests are instant.
8. **Next.js requires `output: "standalone"`** and `images: { unoptimized: true }`.

## Post-Deploy

After a successful deployment:

1. **Show the live URL** prominently: `https://SLUG.style.dev`
2. **Show the deployment ID** for reference
3. **Open in browser** if available:
   ```bash
   agent-browser --session preview-deploy open https://SLUG.style.dev
   ```

## Troubleshooting

| Problem | Fix |
|---|---|
| Deploy returns `status: 'failed'` | Check `data.error` field for details from Freestyle |
| Build fails for Next.js | Ensure `output: "standalone"` and `images: { unoptimized: true }` |
| Module not found | Include lockfile in source. Never upload `node_modules`. |
| 404 on SPA routes | Use Express server with SPA fallback, or set `static_only: true` + `clean_urls: true` |
| 503 on first request | Cold start — wait 10-15 seconds |
| Subdomain taken | Pick a different `*.style.dev` slug |

## Full API Reference

See `references/freestyle-api.md` for complete request/response schema documentation.
