---
name: kortix-deploy
description: "Deploy any web app, API, or static site to Freestyle.sh with a live preview URL. Supports Next.js, Vite, static sites, Express/Hono APIs, raw code snippets, Git repos, local files, and tar URLs. Auto-detects frameworks, builds, and deploys with instant SSL on *.style.dev subdomains or custom domains. Triggers on: 'deploy this', 'deploy my app', 'make this live', 'publish this', 'host this', 'get me a preview URL', 'deploy to freestyle', 'ship this', 'deploy to production', '1-click deploy', 'preview URL', 'put this online', any request to deploy, host, or publish a web application, site, or API to the internet."
---

# Deploy to Freestyle.sh

One-command deploys to live preview URLs via [Freestyle Serverless Deployments](https://docs.freestyle.sh/v2/serverless/deployments). Write a small deploy script, run it, hand back the URL.

## About Freestyle Serverless Deployments

Freestyle is an API-first serverless platform built for **programmatic deployment at scale** (not dashboard-clicking like Vercel/Netlify). Deployments run **Node.js only** with automatic scaling, wildcard subdomains, and framework detection.

**Key capabilities:**
- **Sub-second deploys** for non-build deployments (no containers, cached deps)
- **4 source types**: Git repo, inline code, local files (`readFiles`), tar URL
- **Auto-detects** Next.js, Vite, Expo — TypeScript works out of the box
- **Free `*.style.dev` subdomains** with instant SSL, custom domains with wildcard certs
- **WebSocket support** — timeout is per last TCP packet, not HTTP request
- **Cached modules** — never upload `node_modules`, just your lockfile

**When NOT to use Deployments (use Freestyle VMs instead):**
- Non-Node workloads (Python, Ruby, Go) — VMs are full Linux environments
- One-shot code execution (no HTTP server needed) — use Serverless Runs
- Low-level system access (SSH, systemd, filesystem persistence)
- Browser automation (scraping, testing)

## Hard-Won Deployment Lessons

These are critical gotchas discovered through real e2e testing:

1. **SDK version**: Use `freestyle-sandboxes@latest` (NOT `@beta`). The `@beta` tag (0.1.3) has a different API path (`freestyle.edge.deployments`) that doesn't match current docs. Latest uses `freestyle.serverless.deployments`.
2. **`readFiles` import**: `import { readFiles } from "freestyle-sandboxes"` — it is exported from the main package. NOT from `freestyle-sandboxes/utils` (that subpath doesn't exist).
3. **Runtime is Node.js, NOT Deno**: `Deno.serve()` and Hono's `app.fire()` do NOT work. Always use Express `app.listen(3000)` or Hono with `@hono/node-server` and `serve({ fetch: app.fetch, port: 3000 })`.
4. **Static sites MUST have a Node.js server entrypoint**: Setting `entrypointPath` to an HTML file (e.g., `index.html`) will serve that page but CSS/JS/image sub-assets will NOT load. You MUST bundle an Express static file server.
5. **Deploy scripts must be `.mjs`**: The SDK uses ESM exports. Write `.mjs` files and run with `node`, not `.ts` with `npx tsx`.
6. **Cold starts**: First request may 503 for ~10-15 seconds after deploy completes. This is normal. Subsequent requests are instant.
7. **Port 3000**: All servers must listen on port 3000. This is the port Freestyle routes to.
8. **`nodeModules` field**: Only needed for `code` deploys. For `files`/`git` deploys, include your lockfile and Freestyle installs deps automatically.
9. **`envVars` are runtime-only**: NOT available at build time. Use `build.envVars` for build-time env vars.
10. **Never upload `node_modules`**: `readFiles` auto-excludes it. Freestyle installs from your lockfile.

## Prerequisites

1. **API Key**: `FREESTYLE_API_KEY` must be set. Check with `env | grep FREESTYLE_API_KEY`. If missing, set via kortix-secrets or ask the user for their key from [admin.freestyle.sh](https://admin.freestyle.sh).

2. **SDK**: `freestyle-sandboxes` must be installed (already pre-installed in sandbox). If missing:
   ```bash
   npm i freestyle-sandboxes
   ```

## Workflow

1. **Detect** project type (see Detection below)
2. **Pick** the right starter template
3. **Customize** — fill in project-specific values (repo URL, domain slug, env vars, etc.)
4. **Write** the deploy script as `.mjs` file (e.g., `/tmp/deploy-freestyle.mjs`)
5. **Run** it: `FREESTYLE_API_KEY=... node /tmp/deploy-freestyle.mjs`
6. **Report** the live URL to the user and show it

**CRITICAL**: Deploy scripts must be `.mjs` files (ESM). The SDK uses ES module exports. Run with `node`, NOT `npx tsx`.

### Domain Naming

Generate a descriptive `*.style.dev` subdomain:
- Use project name or directory name as base
- Append short random suffix to avoid collisions: `my-app-x7k2.style.dev`
- Keep it lowercase, alphanumeric + hyphens only
- Generate with: `` `${slug}-${crypto.randomUUID().slice(0, 4)}.style.dev` ``

## Project Detection

Check these files to determine the framework. If ambiguous, ask the user.

| File present | Framework | Deploy strategy |
|---|---|---|
| `next.config.{js,mjs,ts}` | Next.js | Git + `build: true` or local files via readFiles |
| `vite.config.{js,ts,mjs}` | Vite | Git + `build: true` or local files via readFiles |
| Only `.html`/`.css`/`.js` files | Static | Express static server + readFiles |
| `package.json` with `express`/`hono`/`fastify` dep | Node.js API | Git or local files, no build |
| `.git` with GitHub remote | Any | Prefer git deploy with repo URL |
| User provides a code snippet | Code snippet | Inline `code` + `nodeModules` |
| User provides a URL to `.tar.gz` | Tar | `tarUrl` source |

### Next.js Pre-Flight

Before deploying Next.js, verify `next.config` has:
```javascript
output: "standalone"
images: { unoptimized: true }
```
If missing, add them automatically and inform the user.

## Starter Templates

Each template is a complete, runnable `.mjs` deploy script. Copy the appropriate one, fill in the `CUSTOMIZE` values, write to `/tmp/deploy-freestyle.mjs`, and run with `FREESTYLE_API_KEY=... node /tmp/deploy-freestyle.mjs`.

**Import pattern** (same for all templates):
```javascript
import { freestyle, readFiles } from "freestyle-sandboxes";  // readFiles only when deploying local files
```

> **NOTE**: `readFiles` is exported from `freestyle-sandboxes` directly. NOT from `freestyle-sandboxes/utils`.

---

### 1. Git Repo Deploy (any framework)

The most common path. Works for any project with a Git remote. Freestyle auto-detects Next.js, Vite, Expo.

```javascript
import { freestyle } from "freestyle-sandboxes";

const { deployment, domains } = await freestyle.serverless.deployments.create({
  repo: "https://github.com/USER/REPO",     // CUSTOMIZE: repo URL
  // branch: "main",                         // CUSTOMIZE: optional
  // rootPath: "./apps/web",                 // CUSTOMIZE: optional, for monorepos
  domains: ["SLUG.style.dev"],               // CUSTOMIZE: unique subdomain
  build: true,                               // set false if no build needed
  // envVars: { KEY: "value" },              // CUSTOMIZE: optional runtime env vars
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

---

### 2. Next.js (from Git)

```javascript
import { freestyle } from "freestyle-sandboxes";

const { deployment, domains } = await freestyle.serverless.deployments.create({
  repo: "https://github.com/USER/REPO",     // CUSTOMIZE
  domains: ["SLUG.style.dev"],               // CUSTOMIZE
  build: true,                               // auto-detects Next.js
  // envVars: { DATABASE_URL: "..." },       // CUSTOMIZE: optional runtime env vars
  // build: {                                // use this form for build-time env vars
  //   command: "npm run build",
  //   envVars: { NEXT_PUBLIC_API_URL: "https://api.example.com" },
  // },
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

---

### 3. Next.js (from local files)

Build locally, copy standalone artifacts, upload with `readFiles`.

```javascript
import { freestyle, readFiles } from "freestyle-sandboxes";
import { execSync } from "child_process";
import { cpSync } from "fs";

// Build
execSync("npm run build", { stdio: "inherit", cwd: "PROJECT_DIR" }); // CUSTOMIZE

// Prepare standalone artifacts
cpSync("PROJECT_DIR/public", "PROJECT_DIR/.next/standalone/public", { recursive: true });
cpSync("PROJECT_DIR/.next/static", "PROJECT_DIR/.next/standalone/.next/static", { recursive: true });
cpSync("PROJECT_DIR/package-lock.json", "PROJECT_DIR/.next/standalone/package-lock.json"); // CUSTOMIZE: use your lockfile

const files = await readFiles("PROJECT_DIR/.next/standalone"); // CUSTOMIZE

const { deployment, domains } = await freestyle.serverless.deployments.create({
  files,
  entrypointPath: "server.js",
  domains: ["SLUG.style.dev"],              // CUSTOMIZE
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

---

### 4. Vite (from Git)

```javascript
import { freestyle } from "freestyle-sandboxes";

const { deployment, domains } = await freestyle.serverless.deployments.create({
  repo: "https://github.com/USER/REPO",     // CUSTOMIZE
  domains: ["SLUG.style.dev"],               // CUSTOMIZE
  build: true,                               // auto-detects Vite
  // envVars: { VITE_API_URL: "..." },       // CUSTOMIZE: optional
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

---

### 5. Vite / Static SPA (from local files)

Build locally, add an Express static server, deploy the dist. **This pattern works for any pre-built SPA (React, Vue, Svelte, etc.) or static site.**

```javascript
import { freestyle, readFiles } from "freestyle-sandboxes";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

// Build (skip if already built or pure static)
execSync("npm run build", { stdio: "inherit", cwd: "PROJECT_DIR" }); // CUSTOMIZE

const distDir = "PROJECT_DIR/dist"; // CUSTOMIZE: build output directory

// Write Express static server into dist
writeFileSync(`${distDir}/server.js`, `
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'index.html')));

app.listen(3000, () => console.log('Server running on port 3000'));
`);

writeFileSync(`${distDir}/package.json`, JSON.stringify({
  name: "deploy", type: "module", dependencies: { express: "^4.18.2" }
}));

const files = await readFiles(distDir);

const { deployment, domains } = await freestyle.serverless.deployments.create({
  files,
  entrypointPath: "server.js",
  nodeModules: { express: "^4.18.2" },
  domains: ["SLUG.style.dev"],               // CUSTOMIZE
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

---

### 6. Static Site (HTML/CSS/JS files)

For plain HTML/CSS/JS with no build step. **Must include an Express server** — Freestyle needs a Node.js entrypoint.

```javascript
import { freestyle, readFiles } from "freestyle-sandboxes";
import { writeFileSync } from "fs";

const siteDir = "PROJECT_DIR"; // CUSTOMIZE: directory with HTML/CSS/JS

// Write Express static server
writeFileSync(`${siteDir}/server.js`, `
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'index.html')));

app.listen(3000, () => console.log('Static server on port 3000'));
`);

const files = await readFiles(siteDir);

const { deployment, domains } = await freestyle.serverless.deployments.create({
  files,
  entrypointPath: "server.js",
  nodeModules: { express: "^4.18.2" },
  domains: ["SLUG.style.dev"],                          // CUSTOMIZE
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

---

### 7. Code Snippet Deploy (Express)

For quick API servers or demos. **Use Express with `app.listen(3000)`** — this is the proven pattern.

```javascript
import { freestyle } from "freestyle-sandboxes";

const { deployment, domains } = await freestyle.serverless.deployments.create({
  code: `
    import express from 'express';
    const app = express();

    app.get('/', (req, res) => {
      res.json({ status: 'ok', time: new Date().toISOString() });
    });

    app.listen(3000, () => console.log('Running on port 3000'));
  `,
  nodeModules: {
    express: "^4.18.2",                       // CUSTOMIZE: dependencies
  },
  domains: ["SLUG.style.dev"],                // CUSTOMIZE
  // envVars: { KEY: "value" },               // CUSTOMIZE: optional
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

**Hono variant** (also works — must use `@hono/node-server`):
```javascript
code: `
  import { Hono } from "hono";
  import { serve } from "@hono/node-server";
  const app = new Hono();
  app.get("/", (c) => c.json({ status: "ok" }));
  serve({ fetch: app.fetch, port: 3000 });
`,
nodeModules: { hono: "4.11.1", "@hono/node-server": "^1.13.8" },
```

> **WARNING**: Do NOT use `app.fire()` or `Deno.serve()` — these do not work in the Freestyle runtime. Always use `app.listen(3000)` (Express) or `serve({ fetch: app.fetch, port: 3000 })` (Hono).

---

### 8. Tar URL Deploy

For deploying from a remote archive (S3, GCS signed URL, etc).

```javascript
import { freestyle } from "freestyle-sandboxes";

const { deployment, domains } = await freestyle.serverless.deployments.create({
  tarUrl: "https://s3.example.com/signed-url/app.tar.gz", // CUSTOMIZE
  domains: ["SLUG.style.dev"],                              // CUSTOMIZE
  build: true,                                              // CUSTOMIZE: set false if pre-built
  // entrypointPath: "server.js",                           // CUSTOMIZE: if needed
  // envVars: { KEY: "value" },                             // CUSTOMIZE: optional
});

console.log("Live at:", domains.map(d => `https://${d}`).join(", "));
console.log("Deployment ID:", deployment.deploymentId);
```

## Custom Domains

If the user wants to deploy to their own domain instead of `*.style.dev`:

### 1. Verify domain ownership

```javascript
const { record, instructions } = await freestyle.domains.verifications.create({
  domain: "example.com",
});
// Tell user: Add TXT record _freestyle_custom_hostname.example.com → record.value
```

### 2. Complete verification (after user adds DNS record)

```javascript
await freestyle.domains.verifications.complete({ domain: "example.com" });
```

### 3. Configure DNS

Tell the user to add an A record pointing to `35.235.84.134`:
- **APEX** (`example.com`): `A @ 35.235.84.134`
- **Subdomain** (`app.example.com`): `A app 35.235.84.134`
- **Wildcard** (`*.example.com`): `A * 35.235.84.134`

### 4. Deploy

```javascript
domains: ["example.com"]  // use the verified domain in the deploy call
```

## API Reference (Quick)

Full details in `references/freestyle-api.md`. Key options for `freestyle.serverless.deployments.create()`:

**Sources** (exactly one required):
- `repo: "https://github.com/user/repo"` + optional `branch`, `rootPath`
- `code: "..."` + `nodeModules: { pkg: "version" }`
- `files` (from `readFiles(dir)`) + `entrypointPath: "server.js"`
- `tarUrl: "https://..."` 

**Options:**
- `domains: ["slug.style.dev"]` — required, free `*.style.dev` or verified custom domain
- `build: true` or `build: { command, outDir, envVars }` — triggers framework build
- `entrypointPath: "server.js"` — main file (auto-detected for Next.js/Vite)
- `envVars: { KEY: "value" }` — runtime env vars (NOT build-time)
- `nodeModules: { express: "^4.18.2" }` — only for `code` deploys
- `timeoutMs: 60000` — idle timeout before scale-down (per last TCP packet)
- `networkPermissions: [{ action, domain, behavior }]` — outbound network ACL
- `headers: [{ source, headers: [{ key, value }] }]` — custom response headers
- `redirects: [{ source, destination, permanent }]` — URL redirects
- `waitForRollout: true` — wait until fully serving traffic

**Return value:**
```javascript
const { deployment, domains } = await freestyle.serverless.deployments.create({...});
// deployment.deploymentId — unique ID
// domains — string[] of live URLs
```

## Post-Deploy

After a successful deployment:

1. **Show the live URL** prominently — `https://SLUG.style.dev`
2. **Show deployment ID** — for reference and debugging
3. **Open in browser** if the kortix-browser skill is available:
   ```bash
   agent-browser --session preview-deploy open https://SLUG.style.dev
   ```
4. **Clean up** — remove `/tmp/deploy-freestyle.mjs`

## Troubleshooting

| Problem | Fix |
|---|---|
| `FREESTYLE_API_KEY` not set | Set via kortix-secrets or `export FREESTYLE_API_KEY=...` |
| `Cannot find package` | Run deploy script from project root where `freestyle-sandboxes` is installed, or use absolute path to node_modules |
| Build fails for Next.js | Ensure `output: "standalone"` and `images: { unoptimized: true }` in next.config |
| Module not found on Freestyle | Include lockfile in source. Freestyle installs deps from it. Never upload `node_modules`. |
| 404 on SPA routes / static assets not loading | You MUST use an Express static server entrypoint. Setting `entrypointPath` to an HTML file does NOT work for sub-assets. |
| `app.fire()` / `Deno.serve()` fails | Freestyle runs Node.js, not Deno. Use `app.listen(3000)` or `@hono/node-server` `serve()`. |
| 503 on first request | Cold start — wait 10-15 seconds after deploy for the instance to warm up. |
| Domain not working | Check DNS: `dig yourdomain.com` should show `35.235.84.134` |
| Deploy takes too long | Use `await: false` to return immediately, then poll with `freestyle.serverless.deployments.get()` |
| Subdomain taken | Pick a different `*.style.dev` slug — add more random chars |
