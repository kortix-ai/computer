---
name: kortix-deployments-legacy
description: "Legacy reference for the original Kortix Deployments system (cloud /v1/deployments and local /kortix/deploy), including API shapes, examples, and operational notes."
---

# Kortix Deployments (Legacy)

This is the original deployment reference moved out of the main system skill.

## Deployments

The sandbox has **two deployment systems** depending on the mode:

### Cloud Deployments — Kortix Deployments API (*.style.dev)

In cloud mode, deploy to live URLs via the Kortix Deployments API. The API handles everything server-side — no SDK, no user-facing API keys.

**Capabilities:**
- **4 source types**: Git repo, inline code, local files, tar URL
- **Auto-detects** Next.js, Vite, Expo — TypeScript works out of the box
- **Free `*.style.dev` subdomains** with instant SSL
- **Node.js only** — no Python, Ruby, Go
- **Port 3000** — all servers must listen on port 3000

#### API Call Pattern

```bash
curl -X POST "$KORTIX_API_URL/v1/deployments" \
  -H "Authorization: Bearer $KORTIX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

#### Deploy Examples

**Git repo:**
```json
{
  "source_type": "git",
  "source_ref": "https://github.com/user/repo",
  "domains": ["my-app-x7k2.style.dev"],
  "build": true
}
```

**Inline code (Express API):**
```json
{
  "source_type": "code",
  "code": "import express from 'express';\nconst app = express();\napp.get('/', (req, res) => res.json({ status: 'ok' }));\napp.listen(3000);",
  "node_modules": { "express": "^4.18.2" },
  "domains": ["api-e5f6.style.dev"]
}
```

**Local files (pre-built):**
```typescript
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

function readFilesRecursive(dir: string, base?: string): Array<{path: string, content: string, encoding: string}> {
  const result: Array<{path: string, content: string, encoding: string}> = [];
  base = base ?? dir;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) result.push(...readFilesRecursive(full, base));
    else result.push({ path: relative(base, full), content: readFileSync(full).toString('base64'), encoding: 'base64' });
  }
  return result;
}
// POST body: { source_type: 'files', files: readFilesRecursive('./dist'), entrypoint: 'server.js', domains: ['my-site.style.dev'] }
```

#### Cloud Deployments API Request Schema

```typescript
{
  source_type: 'git' | 'code' | 'files' | 'tar',
  source_ref?: string,       // Git repo URL (git)
  branch?: string,           // Git branch (git)
  root_path?: string,        // Monorepo sub-path (git)
  code?: string,             // Inline JS/TS (code)
  files?: Array<{ path: string, content: string, encoding?: string }>,  // (files)
  tar_url?: string,          // Archive URL (tar)
  domains: string[],         // Required. Use "slug.style.dev"
  build?: boolean | { command?: string, outDir?: string, envVars?: Record<string, string> },
  env_vars?: Record<string, string>,     // Runtime env vars
  node_modules?: Record<string, string>, // Only for 'code' deploys
  entrypoint?: string,
  static_only?: boolean,
  public_dir?: string,
  clean_urls?: boolean,
  framework?: string,        // Hint: 'nextjs', 'vite', 'static'
}
```

#### Other Cloud API Endpoints

```bash
# List / Get / Logs / Stop / Redeploy / Delete
curl "$KORTIX_API_URL/v1/deployments" -H "Authorization: Bearer $KORTIX_TOKEN"
curl "$KORTIX_API_URL/v1/deployments/{id}" -H "Authorization: Bearer $KORTIX_TOKEN"
curl "$KORTIX_API_URL/v1/deployments/{id}/logs" -H "Authorization: Bearer $KORTIX_TOKEN"
curl -X POST "$KORTIX_API_URL/v1/deployments/{id}/stop" -H "Authorization: Bearer $KORTIX_TOKEN"
curl -X POST "$KORTIX_API_URL/v1/deployments/{id}/redeploy" -H "Authorization: Bearer $KORTIX_TOKEN"
curl -X DELETE "$KORTIX_API_URL/v1/deployments/{id}" -H "Authorization: Bearer $KORTIX_TOKEN"
```

#### Cloud Deploy Hard-Won Lessons

1. **Runtime is Node.js**: `Deno.serve()` and `app.fire()` do NOT work.
2. **Port 3000**: All servers must listen on port 3000.
3. **Static sites need a server OR `static_only: true`**.
4. **`env_vars` are runtime-only**: Use `build.envVars` for build-time variables.
5. **Include your lockfile**: Never include `node_modules`.
6. **Cold starts**: First request may take 10-15 seconds.
7. **Next.js requires `output: "standalone"`** and `images: { unoptimized: true }`.

### Local Deployments — Kortix Master Deployer

In local mode (or for preview), the Kortix Master has a built-in deployer at `/kortix/deploy`. It runs apps as local processes on random ports (10000-60000) inside the container, accessible via the dynamic port proxy.

**Capabilities:**
- **Auto-detects** Next.js, Vite, CRA, Node.js, Python, static HTML
- **Runs locally** — no external infrastructure needed
- **Random ports** — each deployment gets an available port
- **Accessible via** `http://localhost:8000/proxy/{port}/`

#### Local Deploy API (no auth needed from inside sandbox)

```bash
MASTER_URL="http://localhost:8000"

# Deploy an app (auto-detects framework)
curl -X POST "$MASTER_URL/kortix/deploy" \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentId": "my-app",
    "sourceType": "files",
    "sourcePath": "/workspace/my-app"
  }'
# Returns: { success, port, pid, framework, logs }

# With git source
curl -X POST "$MASTER_URL/kortix/deploy" \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentId": "my-app",
    "sourceType": "git",
    "sourceRef": "https://github.com/user/repo",
    "sourcePath": "/workspace/my-app"
  }'

# List running deployments
curl "$MASTER_URL/kortix/deploy"

# Get status / logs
curl "$MASTER_URL/kortix/deploy/my-app/status"
curl "$MASTER_URL/kortix/deploy/my-app/logs"

# Stop
curl -X POST "$MASTER_URL/kortix/deploy/my-app/stop"
```

#### Local Deploy Config

```typescript
{
  deploymentId: string,      // Required — unique identifier
  sourceType: 'git' | 'code' | 'files' | 'tar',
  sourceRef?: string,        // Git URL (for sourceType: 'git')
  sourcePath: string,        // Path on filesystem (default: /workspace)
  framework?: string,        // Auto-detected if not provided
  envVarKeys?: string[],     // Env var names to pass to the app
  buildConfig?: Record<string, unknown>,
  entrypoint?: string,       // Custom start command
}
```

#### Framework Detection (Local)

| Detected | Install | Build | Start | Default Port |
|---|---|---|---|---|
| `nextjs` | `npm install` | `npm run build` | `npm start` | 3000 |
| `vite` | `npm install` | `npm run build` | `npx vite preview --host 0.0.0.0 --port {PORT}` | 4173 |
| `cra` | `npm install` | `npm run build` | `npx serve -s build -l {PORT}` | 3000 |
| `node` | `npm install` | — | `npm start` | 3000 |
| `python` | `pip install -r requirements.txt` | — | `python app.py` | 8080 |
| `static` | — | — | `npx serve -s . -l {PORT}` | 3000 |

After deploy, the app is accessible at `http://localhost:8000/proxy/{port}/` which Kortix Master proxies to the local port.
