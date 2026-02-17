# Plan: Unified Versioning & Release System for Kortix Computer

**Created:** 2026-02-17
**Status:** draft
**Goal:** One version number, one changelog, one release process across the entire Kortix Computer platform — sandbox, CLI, SDK, Docker image, GitHub releases, and the Kortix CLI.

---

## Context & Current State

### What We Have Today

The Kortix Computer platform has **multiple independently versioned artifacts** with no unified versioning:

| Artifact | Current Version | Where Published | Versioned In |
|---|---|---|---|
| `@kortix/sandbox` | `0.4.16` | npm | `sandbox/package.json` |
| `@kortix/opencode-ai` (CLI) | `0.3.0` | npm (11 platform binaries) | `services/opencode/` build scripts |
| `@kortix/opencode-sdk` | `0.4.0` | npm | `services/opencode/packages/sdk/` |
| `@opencode-ai/plugin` | `1.2.6` | npm (upstream) | upstream |
| Docker image | `kortix-sandbox:0.4.16` | Daytona snapshots | `sandbox/package.json` → `push.sh` |
| Frontend | `0.1.0` | Vercel | `apps/frontend/package.json` |
| Kortix API | `1.0.0` | Docker / hosted | `services/kortix-api/package.json` |
| GitHub Releases | none | GitHub | doesn't exist yet |
| Kortix CLI | ? | ? | separate repo? |

**Problems:**
1. **Version sprawl** — 3 different version numbers (0.4.16, 0.3.0, 0.4.0) for what is conceptually one release
2. **No changelog** — updates show "Update to v0.4.17" with zero context on what changed
3. **No GitHub releases** — no tagged releases, no release notes, no release history
4. **Manual version bumping** — easy to forget updating one of the many places
5. **No enforcement** — you can publish without a changelog, without tagging, without consistency
6. **Frontend/API unversioned** — deployed but not part of any release process

### What We Built This Session

1. **`sandbox/package.json` as single source of truth** — Dockerfile and postinstall.sh both read ALL versions from it (npm deps, pip packages)
2. **Live update system** — `@kortix/sandbox` published to npm → sandbox detects → user clicks update → postinstall.sh deploys everything (CLI, agent-browser, pip packages, configs, agents, skills, etc.)
3. **Zero hardcoded versions** — Dockerfile reads from package.json, postinstall.sh reads from package.json
4. **Full documentation** — `docs/sandbox-update-system.md`

### What We Want

**One version number** (e.g., `0.5.0`) that represents a release of the entire platform:
- All npm packages publish with that version
- Docker image tagged with that version
- GitHub release created with that version
- Changelog entry required for that version
- Frontend and API can reference that version
- Kortix CLI can reference that version

---

## All Artifacts & Release Surfaces

### 1. `@kortix/sandbox` (npm)
- **What:** The master update package. Contains agents, skills, tools, commands, plugin, kortix-master, configs, browser-viewer, postinstall.sh
- **Published by:** `npm publish` from `sandbox/`
- **Consumed by:** Running sandboxes (live update), Docker image (initial build)
- **Version:** Must match the unified version

### 2. `@kortix/opencode-ai` (npm)
- **What:** The OpenCode CLI binary (Go binary compiled via Bun, 11 platform variants)
- **Published by:** `bun ./script/publish-kortix.ts` from `services/opencode/packages/opencode/`
- **Consumed by:** Sandbox (globally installed), developers (local install)
- **Version:** Must match the unified version
- **Note:** Requires building from the opencode fork. Can't just bump a version — needs actual compilation

### 3. `@kortix/opencode-sdk` (npm)
- **What:** TypeScript SDK for the OpenCode REST API
- **Published by:** `bun ./script/publish-kortix.ts` from `services/opencode/packages/sdk/js/`
- **Consumed by:** Frontend (`apps/frontend`), sandbox opencode config (`sandbox/opencode/`)
- **Version:** Must match the unified version
- **Note:** Only needs republishing when the API surface changes

### 4. Docker Image (`kortix-sandbox:X.Y.Z`)
- **What:** Full sandbox image — Alpine + webtop + all runtimes + initial install of everything
- **Published by:** `sandbox/push.sh` → builds + pushes to Daytona as snapshot
- **Consumed by:** New sandbox deployments via Daytona
- **Version:** Read from `sandbox/package.json` at build time → baked into `/opt/kortix/.version`

### 5. GitHub Release (`v0.5.0`)
- **What:** Tagged release on `kortix-ai/computer` repo with release notes
- **Published by:** `gh release create` or GitHub UI
- **Consumed by:** Developers, changelog display, public record
- **Version:** Must match the unified version

### 6. Kortix API (`services/kortix-api`)
- **What:** The platform API — billing, routing, provider management, sandbox version checking
- **Deployed:** Hosted / Docker
- **Version:** Currently `1.0.0` in package.json, not part of any release process
- **Note:** Doesn't need to version-match the sandbox, but should know about it

### 7. Frontend (`apps/frontend`)
- **What:** Next.js web app — dashboard, sandbox management, session UI
- **Deployed:** Vercel
- **Version:** Currently `0.1.0`, not part of any release process
- **Note:** Deployed independently. Could reference the platform version.

### 8. Kortix CLI
- **What:** CLI tool for Kortix platform (separate from opencode CLI)
- **Status:** Unclear — may be a separate repo or not yet built
- **Note:** Should be able to query versions, trigger updates, view changelogs

---

## Design: Unified Release System

### The Version

One version: **`MAJOR.MINOR.PATCH`** (semver)

- **MAJOR:** Breaking changes (API, config format, data migration required)
- **MINOR:** New features, significant updates (new agents, new tools, new API endpoints)
- **PATCH:** Bug fixes, dependency bumps, config tweaks

Current: `0.4.16` → next release: `0.5.0` (minor, since we're adding a lot)

### The Changelog

**File:** `sandbox/CHANGELOG.json` (structured, machine-readable, bundled in npm package)

```json
[
  {
    "version": "0.5.0",
    "date": "2026-02-17",
    "title": "Unified versioning & upstream sync",
    "description": "Synced with OpenCode upstream v1.2.6, added project settings UI, unified all dependency versioning into sandbox/package.json.",
    "changes": [
      { "type": "feature", "text": "Project settings UI in sidebar" },
      { "type": "feature", "text": "Live update now also updates CLI binary and agent-browser" },
      { "type": "improvement", "text": "All versions read from sandbox/package.json (single source of truth)" },
      { "type": "fix", "text": "Fixed s6 service path in postinstall (s6-rc.d not services.d)" },
      { "type": "upstream", "text": "Synced with OpenCode v1.2.6 (Database/Drizzle migration)" }
    ],
    "dependencies": {
      "@kortix/opencode-ai": "0.5.0",
      "@kortix/opencode-sdk": "0.5.0",
      "agent-browser": "^0.10.0",
      "playwright": "1.58.0"
    }
  }
]
```

**Change types:** `feature`, `fix`, `improvement`, `breaking`, `upstream`, `security`, `deprecation`

### The Release Process

**Script:** `sandbox/release.sh` — the ONE command that does everything

```
./sandbox/release.sh 0.5.0
```

What it does:
1. **Validates** — checks CHANGELOG.json has an entry for `0.5.0`
2. **Updates versions** — sets `0.5.0` in `sandbox/package.json`
3. **Builds CLI** (if opencode source changed) — `KORTIX_BUILD=true OPENCODE_VERSION=0.5.0 bun run build`
4. **Publishes CLI** — `KORTIX_VERSION=0.5.0 bun ./script/publish-kortix.ts latest`
5. **Publishes SDK** (if SDK changed) — `KORTIX_SDK_VERSION=0.5.0 bun ./script/publish-kortix.ts latest`
6. **Publishes sandbox** — `cd sandbox && npm publish`
7. **Creates GitHub release** — `gh release create v0.5.0 --title "v0.5.0" --notes-file <generated>`
8. **Optionally builds Docker** — `./sandbox/push.sh` (for new deployments)
9. **Reports** — prints summary of what was published

### The API

**Platform API endpoint:** `GET /v1/platform/sandbox/version`

Currently returns just `{ version, package }`. Extend to return changelog:

```json
{
  "version": "0.5.0",
  "package": "@kortix/sandbox",
  "changelog": {
    "title": "Unified versioning & upstream sync",
    "description": "Synced with OpenCode upstream v1.2.6...",
    "date": "2026-02-17",
    "changes": [
      { "type": "feature", "text": "Project settings UI in sidebar" },
      ...
    ]
  }
}
```

The changelog is fetched from the npm package metadata (or from a separate API endpoint that reads CHANGELOG.json from the published package).

**Sandbox endpoint:** `GET /kortix/health`

Already returns version. Add changelog for current version:

```json
{
  "status": "ok",
  "version": "0.4.16",
  "changelog": { ... }
}
```

CHANGELOG.json is bundled in the sandbox package → deployed to `/opt/kortix/CHANGELOG.json` by postinstall → read by kortix-master.

### Frontend Integration

The "Update available" UI currently shows just "Update to v0.5.0". With the changelog:

1. **Before update:** Show version + title + change list ("What's new in v0.5.0")
2. **After update:** Show "Updated to v0.5.0" with the changelog
3. **Version history:** A settings page showing full changelog history

---

## Task Breakdown

### Phase A: Foundation (changelog + version infrastructure)
- [ ] Create `sandbox/CHANGELOG.json` with history of all releases so far
- [ ] Add `CHANGELOG.json` to `sandbox/package.json` files list (bundled in npm)
- [ ] Update `postinstall.sh` to deploy CHANGELOG.json to `/opt/kortix/CHANGELOG.json`
- [ ] Update `kortix-master` health endpoint to serve changelog for current version
- [ ] Update `Dockerfile` version section to also deploy CHANGELOG.json

### Phase B: Platform API (serve changelog to frontend)
- [ ] Extend `GET /v1/platform/sandbox/version` to include changelog for latest version
- [ ] Add `GET /v1/platform/sandbox/changelog` — returns full changelog history
- [ ] Add `GET /v1/platform/sandbox/changelog/:version` — returns changelog for specific version

### Phase C: Release script (enforce + automate)
- [ ] Create `sandbox/release.sh` — validates changelog, bumps versions, publishes npm, creates GitHub release
- [ ] Add pre-publish validation — refuse to publish if CHANGELOG.json doesn't have entry for target version
- [ ] Add GitHub release creation with auto-generated release notes from CHANGELOG.json
- [ ] Add `--dry-run` flag for testing

### Phase D: Frontend (show changelog in UI)
- [ ] Update `use-sandbox-update.ts` to fetch changelog with version info
- [ ] Update server-selector update button to show changelog preview on hover/click
- [ ] Add "What's new" modal/panel when update completes

### Phase E: Unified version alignment
- [ ] Align all npm packages to same version (0.5.0) — CLI, SDK, sandbox
- [ ] Add version to frontend's about/settings page
- [ ] Create first GitHub release with full release notes

---

## Risks

- **CLI/SDK may not always change** — sometimes only agents/skills change. Still needs a version bump for the sandbox to publish. Solution: the unified version represents the platform release, not individual component changes. If CLI didn't change, it just gets republished with the same binary under a new version.
- **Breaking the publish script** — one bad release.sh run could publish inconsistent versions. Solution: dry-run mode, validation checks, atomic operations where possible.
- **Changelog discipline** — humans forget to write changelog entries. Solution: release.sh refuses to publish without one. CI can also check.

---

## Open Questions

1. **What is the "Kortix CLI"?** Is this a separate tool from `@kortix/opencode-ai`? A platform management CLI (`kortix login`, `kortix sandbox list`, `kortix update`)? Or is it the opencode CLI itself? Need clarity on this.
2. **Should CLI/SDK always re-publish even if unchanged?** Simplest approach: yes, just re-publish with new version. Saves complexity. Wastes a bit of npm bandwidth.
3. **Should we use a monorepo version tool (like changesets, lerna)?** Probably overkill — we have a simple structure. A single `release.sh` script is simpler and more transparent.
4. **Docker image publishing cadence** — not every release needs a new Docker image (since live update handles most changes). Should `release.sh` always build Docker, or only when flagged?

---

## Files That Need Changes

| File | Change |
|---|---|
| `sandbox/CHANGELOG.json` | **NEW** — structured changelog |
| `sandbox/package.json` | Add CHANGELOG.json to files list |
| `sandbox/postinstall.sh` | Deploy CHANGELOG.json to /opt/kortix/ |
| `sandbox/Dockerfile` | Deploy CHANGELOG.json to /opt/kortix/ |
| `sandbox/release.sh` | **NEW** — unified release script |
| `sandbox/kortix-master/src/index.ts` | Serve changelog in health endpoint |
| `sandbox/kortix-master/src/routes/update.ts` | Include changelog in update response |
| `services/kortix-api/src/platform/routes/version.ts` | Serve changelog with version |
| `apps/frontend/src/hooks/platform/use-sandbox-update.ts` | Fetch + expose changelog |
| `apps/frontend/src/components/sidebar/server-selector.tsx` | Show changelog in update UI |
| `apps/frontend/src/lib/platform-client.ts` | Add changelog types + fetch |
| `docs/sandbox-update-system.md` | Update with versioning system |
| `docs/opencode-publishing.md` | Update with unified release process |

---

## Version History (reconstructed)

For the initial CHANGELOG.json, we need to backfill known releases:

| Version | Date | What Changed |
|---|---|---|
| `0.1.0` | ~2026-01 | Initial sandbox release |
| `0.2.0` | 2026-02-01 | Project.scan(), auto git repo discovery |
| `0.3.0` | 2026-02-05 | Sandbox update system, kortix-master |
| `0.4.0` - `0.4.16` | 2026-02-05 to 2026-02-16 | Incremental: env management, browser automation, skills, agents, tools, secret store, s6 services, branding, pip packages, LSS, etc. |
| `0.5.0` (next) | 2026-02-17 | Upstream sync v1.2.6, unified versioning, CLI 0.3.0, SDK 0.4.0, single source of truth for all deps |

---

## Summary

**The vision:** `./sandbox/release.sh 0.5.0` is the ONE command. It validates, builds, publishes everything, creates the GitHub release, and every running sandbox in the world sees "Update available — v0.5.0: Unified versioning & upstream sync" with a full changelog. One version. One source of truth. One command.
