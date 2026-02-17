# Freestyle Serverless Deployments - Full API Reference

Complete reference for `freestyle.serverless.deployments.create()`.

## Import

```javascript
import { freestyle, readFiles } from "freestyle-sandboxes"; // readFiles for local file deploys
```

Requires `FREESTYLE_API_KEY` environment variable.

## Source Types (exactly one required)

### Git Repository

```typescript
{
  repo: "https://github.com/user/repo",  // public URL, authenticated URL, or freestyle repo ID
  branch: "main",                         // optional, defaults to default branch
  rootPath: "./apps/web",                 // optional, for monorepos
}
```

Private repos: use `https://user:token@github.com/user/repo.git` or a Freestyle Git repo ID.

### Inline Code

```typescript
{
  code: `
    import express from 'express';
    const app = express();
    app.get('/', (req, res) => res.send('Hello'));
    app.listen(3000);
  `,
  nodeModules: {                          // required with code deploys
    express: "^4.18.2",
  },
}
```

### Local Files (readFiles)

```javascript
import { readFiles } from "freestyle-sandboxes"; // NOT from /utils

const files = await readFiles("./dist");  // reads dir, excludes node_modules, base64-encodes
{
  files,
  entrypointPath: "server.js",           // required for file deploys - MUST be a Node.js server, not an HTML file
}
```

`readFiles` automatically excludes `node_modules/` and handles binary files. The `entrypointPath` MUST point to a Node.js server file (e.g., Express/Hono) — pointing it at an HTML file will not serve sub-assets.

### Tar URL

```typescript
{
  tarUrl: "https://s3.example.com/signed-url/app.tar.gz",
}
```

Useful when source is hosted externally (S3, GCS, etc).

## Options

### domains (required)

```typescript
domains: ["my-app.style.dev"]                    // free *.style.dev subdomain
domains: ["app.style.dev", "app.yourdomain.com"] // multiple domains
```

Any unclaimed `*.style.dev` subdomain works instantly with SSL. Custom domains need verification first.

### build

```typescript
build: true                              // auto-detect framework, run build
build: {
  command: "npm run build",              // custom build command
  outDir: "dist",                        // build output directory
  envVars: {                             // build-time env vars (NOT available at runtime)
    NEXT_PUBLIC_API_URL: "https://api.example.com",
    NODE_ENV: "production",
  },
}
```

Default: `false` (deploy files as-is). Set `true` for Next.js, Vite, and other frameworks requiring a build step. Freestyle auto-detects Next.js, Vite, and Expo.

### entrypoint

```typescript
entrypoint: "server.js"                  // main file of your application
```

Auto-detected for Next.js, Vite, Expo. Specify manually for custom setups.

### envVars

```typescript
envVars: {
  API_KEY: "secret-value",               // available at RUNTIME only
  DATABASE_URL: "postgres://...",
}
```

NOT available at build time. For build-time vars, use `build.envVars`. Env vars are tied to deployments; to change them, create a new deployment.

### nodeModules

```typescript
nodeModules: {
  express: "^4.18.2",
  cors: "^2.8.5",
}
```

Only needed for `code` deploys. For git/file deploys, include your lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, or `bun.lock`) and Freestyle installs from it.

### timeoutMs

```typescript
timeoutMs: 60000                         // milliseconds, idle timeout before scale-down
```

Timeout is from last TCP packet (not HTTP request), so WebSockets stay alive as long as you ping faster than the timeout.

### networkPermissions

```typescript
networkPermissions: [
  { action: "allow", domain: "api.stripe.com", behavior: "exact" },
  { action: "allow", domain: ".*\\.amazonaws\\.com", behavior: "regex" },
]
```

### await

```typescript
await: false                             // return immediately with deploymentId for polling
```

Default: `true` (waits for deployment to build and propagate). Set `false` to return immediately.

```typescript
// Polling pattern
const { deploymentId } = await freestyle.serverless.deployments.create({
  ...,
  await: false,
});
const status = await freestyle.serverless.deployments.get({ deploymentId });
```

### waitForRollout

```typescript
waitForRollout: true                     // wait until deployment is fully serving traffic
```

### staticOnly

```typescript
staticOnly: true,
publicDir: "dist",                       // directory with static files
cleanUrls: true,                         // /about.html becomes /about
```

Serves files directly without a server entrypoint. For pure static sites.

### headers

```typescript
headers: [
  {
    source: "^/assets/.*$",
    headers: [{ key: "Cache-Control", value: "max-age=31536000, immutable" }],
  },
]
```

### redirects

```typescript
redirects: [
  { source: "^/old-page$", destination: "/new-page", permanent: true },
]
```

## Return Value

```typescript
const { deployment, domains } = await freestyle.serverless.deployments.create({...});

deployment.deploymentId  // string - unique deployment ID
domains                  // string[] - live URLs

// With await: false
const { deploymentId } = await freestyle.serverless.deployments.create({..., await: false});
```

## Custom Domains

### Step 1: Verify ownership

```typescript
const { record, instructions } = await freestyle.domains.verifications.create({
  domain: "example.com",
});
// Add TXT record: _freestyle_custom_hostname.example.com → <verification-code>
```

### Step 2: Complete verification

```typescript
await freestyle.domains.verifications.complete({ domain: "example.com" });
```

### Step 3: Configure DNS

Point domain to Freestyle:
- **APEX** (`example.com`): A record → `35.235.84.134`
- **Subdomain** (`app.example.com`): A record for `app` → `35.235.84.134`
- **Wildcard** (`*.example.com`): A record for `*` → `35.235.84.134`

### Step 4: Deploy

```typescript
await freestyle.serverless.deployments.create({
  ...,
  domains: ["example.com"],
});
```

## Framework Notes

### Next.js

Requires in `next.config.mjs`:
```javascript
const nextConfig = {
  output: "standalone",        // required
  images: { unoptimized: true }, // required (no Sharp on Freestyle)
};
export default nextConfig;
```

For local file deploys, after `npm run build`:
```bash
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp package-lock.json .next/standalone/package-lock.json
```
Then `readFiles(".next/standalone")` with `entrypointPath: "server.js"`.

### Vite

Auto-detected when deploying from git with `build: true`. For local file deploys, use an Express static server:

```javascript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'index.html'))); // SPA fallback
app.listen(3000);
```

> **WARNING**: Do NOT use `Deno.serve()` or Hono's `app.fire()`. Freestyle runs Node.js. Use `app.listen(3000)` (Express) or `serve({ fetch: app.fetch, port: 3000 })` from `@hono/node-server`.

### Static Sites

Static sites MUST have an Express/Hono Node.js server entrypoint. Use the same Express pattern as Vite above.
