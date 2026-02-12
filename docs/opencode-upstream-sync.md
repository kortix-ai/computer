# Syncing Upstream OpenCode into the Kortix Fork

How to merge new changes from `anomalyco/opencode:dev` into our fork at `kortix-ai/opencode:kortix`.

## Overview

```
anomalyco/opencode (upstream)      kortix-ai/opencode (fork)
        dev ──────────────────────────► kortix
                   merge
```

The fork lives as a git submodule at `computer/services/opencode`. The `kortix` branch is the default branch of the fork and contains all Kortix-specific additions (file endpoints, background tasks, SDK publishing, etc.). Upstream development happens on `anomalyco/opencode:dev`.

## Prerequisites

Inside the submodule directory, add the upstream remote (only needed once):

```bash
cd computer/services/opencode
git remote add upstream https://github.com/anomalyco/opencode.git
```

## Manual Sync Process

### 1. Fetch upstream

```bash
git fetch upstream dev --no-tags
```

### 2. Check how far behind we are

```bash
git rev-list --count kortix..upstream/dev
```

### 3. Create a sync branch and merge

```bash
git checkout kortix
git checkout -b sync/upstream-$(date +%Y%m%d)-merge
git merge upstream/dev --no-edit
```

### 4. Resolve any conflicts

Typical conflict areas (files modified by both sides):

| File | What Kortix changes | Conflict likelihood |
|------|-------------------|-------------------|
| `packages/opencode/src/server/server.ts` | Added agent PATCH route, file routes import | Low - additive in different spots |
| `packages/opencode/src/installation/index.ts` | Configurable `NPM_PACKAGE` / `GITHUB_REPO` | Low-Medium |
| `packages/opencode/src/session/compaction.ts` | BackgroundTask context injection | Medium - upstream refactors this area |
| `packages/sdk/js/src/v2/gen/sdk.gen.ts` | Auto-generated, file mutation methods | Low - regenerate after merge |
| `packages/sdk/js/src/v2/gen/types.gen.ts` | Auto-generated, file mutation types | Low - regenerate after merge |

General rule: keep Kortix additions and accept upstream refactors. For auto-generated SDK files, accept either side then regenerate.

### 5. Regenerate the SDK (if SDK files were touched)

```bash
./packages/sdk/js/script/build.ts
```

### 6. Verify

```bash
bun run typecheck    # should pass all packages
bun test             # run test suite
```

### 7. Push and create a PR

```bash
git push origin sync/upstream-YYYYMMDD-merge
gh pr create --base kortix --head sync/upstream-YYYYMMDD-merge \
  --title "Sync upstream $(date +%Y-%m-%d)" \
  --body "Merge N commits from anomalyco/opencode:dev into kortix."
```

## Automated Sync

A GitHub Actions workflow (`.github/workflows/sync-upstream.yml`) runs daily at 06:00 UTC. It fetches upstream, attempts the merge, and either opens a PR or creates an issue if there are conflicts.

Note: the workflow requires full git history to find the merge base. If it fails silently, it's likely because the fetch depth was insufficient.

## Kortix-Only Files (safe from conflicts)

These files exist only in the fork and will never conflict with upstream:

- `.github/workflows/publish-kortix.yml`
- `.github/workflows/sync-upstream.yml`
- `packages/opencode/script/publish-kortix.ts`
- `packages/opencode/src/file/index.ts`
- `packages/opencode/src/server/routes/file.ts`
- `packages/opencode/src/session/background.ts`
- `packages/opencode/src/project/project.ts`
- `packages/opencode/src/tool/task.ts` / `task.txt`
- `packages/sdk/js/script/publish-kortix.ts`
- `packages/sdk/js/src/v2/file.ts`
- All Kortix test files (`test/file/`, `test/session/background.test.ts`, `test/project/`)
