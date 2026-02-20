# Local OpenCode Development

Run the opencode server from local source inside the sandbox container,
without publishing to npm. Changes to `services/opencode/` are picked up
on container restart.

## Quick Start

```bash
# From the computer/ root (full stack):
docker compose -f docker-compose.local.yml -f docker-compose.dev.yml up

# Or from sandbox/ only (standalone sandbox):
cd sandbox
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## How It Works

The `docker-compose.dev.yml` override:

1. **Volume-mounts** `services/opencode/` into the container at `/opt/opencode-src/`
2. **Mounts minimal TypeScript entry points** (`serve-entry.ts`, `web-entry.ts`) that
   import only the `Server` module directly — avoiding the full CLI entry point which
   requires React for the TUI and can't resolve inside the container
3. **Overrides the s6 run scripts** so the opencode API and web server start via
   `bun run --conditions=browser` from source instead of the globally-installed npm binary
4. **Runs `bun install`** inside the container on init to ensure dependencies are available

The s6 scripts fall back to the global `opencode` binary if the source mount is missing,
so the override is safe to leave in place.

## Iterating on Changes

```bash
# Edit any file in services/opencode, e.g.:
#   services/opencode/packages/opencode/src/session/processor.ts

# Restart just the sandbox to pick up changes:
docker compose -f docker-compose.local.yml -f docker-compose.dev.yml restart sandbox

# Or restart only the opencode service inside the running container:
docker exec kortix-sandbox s6-svc -r /run/service/svc-opencode-serve
```

## Verifying It's Running from Source

Check the container logs for:
```
[opencode-serve] Starting from LOCAL SOURCE (/opt/opencode-src)
[opencode-serve] Listening on http://0.0.0.0:4096
```

If you see this instead, the mount is not working:
```
[opencode-serve] No local source found, using global binary.
```

## Stopping Dev Mode

Just drop the `-f docker-compose.dev.yml` flag:

```bash
docker compose -f docker-compose.local.yml up
```

## Publishing a Dev Prerelease

When you're ready to test in a real sandbox image (without volume mounts):

1. Push your changes to a branch in `kortix-ai/opencode`
2. Go to [Actions > Publish @kortix/opencode-ai](https://github.com/kortix-ai/opencode/actions/workflows/publish-kortix.yml)
3. Click **Run workflow**, select your branch, and set:
   - **version:** `0.5.x-dev.N` (e.g., `0.5.8-dev.1`)
   - **tag:** `dev`
4. Update `sandbox/package.json` to use the dev version:
   ```json
   "@kortix/opencode-ai": "0.5.8-dev.1"
   ```
5. Rebuild the sandbox image:
   ```bash
   cd sandbox && docker compose build
   ```

## Troubleshooting

### `Cannot find module 'react/jsx-dev-runtime'`
The entry points in `sandbox/dev/` bypass the CLI to avoid this. If you see this,
the s6 run script override isn't being mounted. Check that `docker-compose.dev.yml`
is being applied.

### `getProjectId: Resolved gitdir ... is not a directory`
The `services/opencode` directory is a git submodule. The `.git` file inside it
references a path that doesn't exist in the container. The run scripts set `GIT_DIR=`
(empty) to prevent git discovery from following the submodule reference.

### `No package.json found`
The `--cwd` flag in the run scripts must point to the package directory
(`/opt/opencode-src/packages/opencode`) where `package.json` and `node_modules` live.

## File Structure

```
sandbox/dev/
  README.md                    # This file
  opencode-dev-init.sh         # Container init: runs bun install on mounted source
  serve-entry.ts               # Minimal server entry point (port 4096)
  web-entry.ts                 # Minimal web entry point (port 3111)
  svc-opencode-serve-run       # s6 run script override for the API server
  svc-opencode-web-run         # s6 run script override for the web UI

sandbox/docker-compose.dev.yml # Compose override (standalone sandbox)
docker-compose.dev.yml         # Compose override (full stack from computer/)
```
