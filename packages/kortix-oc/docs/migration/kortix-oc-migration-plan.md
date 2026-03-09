## Goal

Make `computer/packages/kortix-oc` the single source of truth for the OpenCode-facing Kortix stack.

Status: this package now also absorbs the former `computer/packages/kortix-sys-oc-plugin` package. Its runtime lives under `runtime/plugin/kortix-sys`, with supporting docs/tests/infra in this package.

The package must own the runtime tree currently authored under `computer/sandbox/opencode/` and provide a materializer so OpenCode can consume that tree from one centrally maintained package.

## Current State

- `computer/sandbox/opencode/` currently contains the authored OpenCode runtime: `agents/`, `commands/`, `skills/`, `tools/`, `plugin/`, `patches/`, and config files.
- `computer/packages/kortix-sys-oc-plugin/` already contains the main memory/continuation plugin runtime, but it is not a full standalone OpenCode package.
- OpenCode plugins can provide hooks and tools directly, but agents, commands, and skills still need filesystem-backed config assets.
- `computer/sandbox/opencode/opencode.jsonc` currently loads local plugin paths and local skills paths.

## Success Criteria

- [ ] `computer/packages/kortix-oc/` exists with package metadata, source helpers, and a `runtime/` tree.
- [ ] `computer/packages/kortix-oc/runtime/` contains the authored OpenCode assets now maintained from one place.
- [ ] A materializer can stage `runtime/` into a target OpenCode config directory.
- [ ] The sandbox can consume the generated runtime instead of treating `computer/sandbox/opencode/` as the source of truth.
- [ ] Manual QA proves the materialized runtime contains the expected commands, agent, skills, tools, and plugin files.

## Plan

### Step 1: Scaffold `computer/packages/kortix-oc`
- Files to change: `computer/packages/kortix-oc/package.json`, `computer/packages/kortix-oc/tsconfig.json`, `computer/packages/kortix-oc/src/*`, `computer/packages/kortix-oc/README.md`
- What to do: create a real package with a materializer, runtime verifier, and package scripts.
- Acceptance criteria: package layout exists and typechecks structurally.

### Step 2: Mirror the current OpenCode runtime into `runtime/`
- Files to change: `computer/packages/kortix-oc/runtime/**`
- What to do: copy the authored runtime assets from `computer/sandbox/opencode/` and the plugin source from `computer/packages/kortix-sys-oc-plugin/` into the new package while preserving relative subtree layout.
- Acceptance criteria: the new runtime tree contains the same authored assets, excluding junk like `node_modules/`, `.git/`, locks, deleted placeholders, and backups.

### Step 3: Point runtime internals at in-package paths
- Files to change: moved plugin/runtime files that currently import across package boundaries
- What to do: fix imports like `../../../tools/lib/get-env` so the runtime is self-contained under `computer/packages/kortix-oc/`.
- Acceptance criteria: no moved runtime file depends on `computer/sandbox/opencode/` or `computer/packages/kortix-sys-oc-plugin/`.

### Step 4: Switch sandbox to consume the standalone package output
- Files to change: sandbox staging/build scripts and generated runtime location
- What to do: stop treating `computer/sandbox/opencode/` as hand-authored source; instead materialize from `computer/packages/kortix-oc/runtime/`.
- Acceptance criteria: the sandbox runtime can be refreshed from the package without manual copying.

### Step 5: Verify parity and identify the remaining true limitation
- Files to change: docs and package README as needed
- What to do: verify runtime parity, then document the remaining OpenCode limitation clearly: one npm plugin line can load hooks/tools, but agents/commands/skills still require staged config assets.
- Acceptance criteria: docs are truthful and the migration result is maintainable.

## Anti-Patterns

- Do not pretend one npm plugin line can auto-register markdown commands, agents, and skills when OpenCode does not support that directly.
- Do not rewrite the runtime tree unnecessarily during migration; preserve subtree shape first.
- Do not keep `computer/sandbox/opencode/` as a second hand-maintained source after the move.
- Do not copy `node_modules/`, `.git/`, backup files, or deleted placeholders into the new package.

## Risks

- Hardcoded imports and runtime paths may still point back to old locations.
- Some tools and skills depend on external services or scripts and may fail if companion assets are missed.
- Sandbox scripts may still assume `computer/sandbox/opencode/` is authored source.
- The “single plugin line” goal is only partially achievable under current OpenCode semantics.

## Verification

- Materialize `computer/packages/kortix-oc/runtime/` into a temp directory and verify expected files exist.
- Read the materialized `opencode.jsonc` and confirm plugin/skills paths are coherent.
- Verify the runtime includes `agents/kortix.md`, all command files, and the expected plugin files.
- Run targeted type/runtime checks on the package helpers.
- Confirm the package is the only authored source of truth after the sandbox is switched.
