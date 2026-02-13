# Plan: Merge feature/frontend into main (NEWKORTIX/computer)

## Context
- The `main` and `feature/frontend` branches have **no common ancestor** (separate root commits)
- `main` has 7 commits: sandbox/docker setup, services (kortix-router), monorepo config
- `feature/frontend` has 17 commits: Next.js frontend app, shared packages, UI components
- They deal with completely different parts of the codebase, but share 5 root-level config files

## Overlapping Files (5 conflicts to resolve)

### 1. `.gitignore`
**Resolution:** Combine both - main has Python/sandbox ignores, feature/frontend has Node.js/Next.js ignores. Deduplicate entries and organize by category.

### 2. `package.json`
**Resolution:** Keep name as `"kortix"`, merge scripts from both:
- From main: `dev`, `dev:frontend`, `dev:mobile`, `dev:router`, `dev:auth`, `build`, `build:frontend`, `typecheck`, `graph`
- From feature/frontend: `dev:computer-frontend`
- Keep `nx` in devDependencies (from main)
- Shared `pnpm.overrides`, `dependencies` are identical

### 3. `pnpm-workspace.yaml`
**Resolution:** Include all workspace paths:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

### 4. `README.md`
**Resolution:** Keep main's minimal `# Kortix` (per user preference)

### 5. `pnpm-lock.yaml`
**Resolution:** Accept main's version (services have more deps). May need `pnpm install` afterwards to reconcile.

## Execution Steps
1. `git merge origin/feature/frontend --allow-unrelated-histories --no-commit`
2. Resolve all 5 conflicted files as described above
3. `git add` all resolved files
4. `git commit -m "merge: integrate feature/frontend into main (unrelated histories)"`
5. Verify with `git log --oneline --graph` that both histories are combined
