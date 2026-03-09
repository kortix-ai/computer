## Goal
Raise the React Doctor score for `apps/frontend` as high as possible by iteratively fixing real React issues without breaking the app.

## Current State
- The frontend app lives in `apps/frontend` inside the `computer` monorepo.
- The repo uses Next.js 15 + React 18 as defined in `apps/frontend/package.json:184` and `apps/frontend/package.json:196`.
- Repo rules require frontend edits to stay inside `apps/frontend`, prefer lint for routine verification, and only run builds with explicit approval.
- The user approved an isolated worktree and approved milestone/final builds for this optimization run.

## Success Criteria
- [ ] Establish a React Doctor baseline score for `apps/frontend`
- [ ] Fix high-impact findings first, then medium/low impact findings where safe
- [ ] Re-run React Doctor after each meaningful batch and keep improving until progress stalls
- [ ] Keep `pnpm lint` passing after each batch of changes
- [ ] Run `pnpm build` at milestones and final verification to confirm the app still works
- [ ] Finish with the best score achievable in this session and document any remaining blockers

## Plan

### Step 1: Capture baseline diagnostics
- Files to change: none
- What to do: run React Doctor with `--verbose` in `apps/frontend`, capture the score, categories, and most concentrated files.
- Acceptance criteria: baseline score and top rule offenders are recorded.

### Step 2: Fix highest-impact React Doctor findings in batches
- Files to change: only files under `apps/frontend`
- What to do: address the most severe and repeated issues first, preserving existing product behavior and current design patterns.
- Acceptance criteria: each batch reduces the React Doctor issue count or improves the score.

### Step 3: Verify every batch
- Files to change: none unless fixes are needed
- What to do: run `pnpm lint` after each batch; run `pnpm build` at major milestones or after broader refactors.
- Acceptance criteria: lint passes continuously; milestone builds pass before continuing.

### Step 4: Push toward best attainable score
- Files to change: only files under `apps/frontend`
- What to do: continue iterating until React Doctor reaches 100 or remaining findings require tradeoffs that would add risk or change scope.
- Acceptance criteria: final score is maximized with remaining issues explained.

## Anti-Patterns
- Do not change files outside `apps/frontend`.
- Do not suppress React Doctor warnings via ignore config unless an issue is clearly a false positive and documented.
- Do not refactor unrelated code just to satisfy the tool.
- Do not commit changes unless the user asks.

## Risks
- Large UI refactors can change behavior while improving static analysis results.
- Dead-code findings may point at files used dynamically, so removals need extra care.
- Build-only regressions may slip past lint, so milestone builds are required.

## Verification
- `npx -y react-doctor@latest . --verbose`
- `pnpm lint`
- `pnpm build` at milestones/final
