---
name: kortix-plan
description: "Structured planning mode for complex tasks. Use when a task involves architectural decisions, multi-file changes, unfamiliar codebases, multi-phase implementations, or when the user explicitly asks to plan before executing. Provides a 5-phase workflow (Understand, Investigate, Design, Write Plan, Execute) with persistent plan files and structured todo management. Triggers on: 'plan this', 'let me think', 'how should we approach', any task requiring 3+ steps across multiple domains, or when you feel uncertain about the right approach."
---

# Plan Mode

Structured planning methodology for complex tasks. Produces a persistent plan file and a phased todo list before execution begins.

## When to Plan

**Enter plan mode when:**
- The task spans 3+ steps across multiple files, systems, or domains
- Architectural or design decisions are required (new systems, major refactors, integration work)
- The codebase or domain is unfamiliar — you need investigation before action
- The task has dependencies between steps (order matters, one wrong move cascades)
- The user explicitly asks to plan first ("think about this", "plan this out", "how should we approach")
- You feel uncertain about the right approach — planning resolves uncertainty before committing

**Skip planning when:**
- The task is a single, clear operation (fix a typo, add a field, run a command)
- You've done this exact kind of task before and the approach is obvious
- The task has fewer than 3 steps with no ambiguity
- The user says "just do it" or "quick fix"

## The 5 Phases

### Phase 1: Understand

Parse intent and establish scope before touching anything.

1. **Restate the goal** in one sentence. If you can't, the request is ambiguous — ask clarifying questions.
2. **Check memory** — search `workspace/.kortix/MEMORY.md` and `workspace/.kortix/memory/` for prior context, decisions, preferences, or past work that relates.
3. **Check for existing plans** — `glob("workspace/.kortix/plans/*.md")` to see if a related plan already exists from a prior session.
4. **Identify constraints** — deadlines, tech stack requirements, backwards compatibility, user preferences from memory.
5. **Define success criteria** — what does "done" look like? Be specific. Write these down.
6. **Create initial todo list** — high-level phases only at this stage:

```
TodoWrite([
  { id: "plan-1", content: "Phase 1: Understand requirements and context", status: "in_progress", priority: "high" },
  { id: "plan-2", content: "Phase 2: Investigate codebase and gather information", status: "pending", priority: "high" },
  { id: "plan-3", content: "Phase 3: Design approach and make decisions", status: "pending", priority: "high" },
  { id: "plan-4", content: "Phase 4: Write plan file", status: "pending", priority: "high" },
  { id: "plan-5", content: "Phase 5: Execute plan", status: "pending", priority: "high" }
])
```

### Phase 2: Investigate

Gather all information needed to make design decisions. This phase is **read-only** — do not edit project files.

1. **Launch parallel investigations** — use the Task tool to dispatch explore agents or `@kortix-research` for independent questions:
   - Codebase exploration: "Find all files related to X, understand the current architecture"
   - Dependency analysis: "What would be affected by changing Y?"
   - Research: "What's the best practice for Z? What libraries exist?"
2. **Read critical files** directly — don't delegate when you need deep understanding of specific files.
3. **Search the web** if the task involves unfamiliar tech, APIs, or patterns.
4. **Semantic search** for related past work: `lss "relevant query" -p /config/workspace/.kortix/ --json -k 5`
5. **Document findings** — note key discoveries as you go. These feed into the design phase.
6. **Update todos** — mark Phase 2 complete, note any blockers or open questions discovered.

**Key rule:** Do not start writing code or editing files during investigation. Resist the urge. Premature implementation is the enemy of good planning.

### Phase 3: Design

Synthesize findings into decisions. This is where you think.

1. **List approaches** — for each major decision, identify 2-3 options with tradeoffs.
2. **Decide** — pick the best approach for each. Document why. Don't present a menu to the user unless the tradeoffs are genuinely user-facing (cost, UX, timeline).
3. **Map dependencies** — which tasks depend on others? What's the critical path? What can be parallelized?
4. **Break down into tasks** — decompose the implementation into specific, atomic tasks. Each task should be:
   - Independently verifiable (you can check if it worked)
   - Small enough to complete in one focused pass
   - Clear about what files it touches
5. **Identify risks** — what could go wrong? What's the rollback plan?
6. **Expand the todo list** — replace the Phase 5 placeholder with the actual task breakdown:

```
TodoWrite([
  { id: "plan-1", content: "Phase 1: Understand requirements", status: "completed", priority: "high" },
  { id: "plan-2", content: "Phase 2: Investigate codebase", status: "completed", priority: "high" },
  { id: "plan-3", content: "Phase 3: Design approach", status: "completed", priority: "high" },
  { id: "plan-4", content: "Phase 4: Write plan file", status: "in_progress", priority: "high" },
  { id: "exec-1", content: "Create database schema for user metrics", status: "pending", priority: "high" },
  { id: "exec-2", content: "Implement metrics collection service (depends: exec-1)", status: "pending", priority: "high" },
  { id: "exec-3", content: "Add API endpoints for metrics retrieval (depends: exec-2)", status: "pending", priority: "medium" },
  { id: "exec-4", content: "Build export functionality (CSV, JSON, PDF) (depends: exec-3)", status: "pending", priority: "medium" },
  { id: "exec-5", content: "Write tests and verify end-to-end", status: "pending", priority: "high" }
])
```

Note: use `(depends: <id>)` in the content field to express dependencies. Execute tasks in dependency order.

### Phase 4: Write Plan

Persist the plan as a markdown file for cross-session reference.

1. **Create the plan file** at `workspace/.kortix/plans/{YYYY-MM-DD}-{slug}.md`
   - `{slug}` = 2-4 word kebab-case summary (e.g., `user-metrics-export`, `auth-refactor`, `api-v2-migration`)
2. **Use the standard format** (see Plan File Format below).
3. **Present the plan** to the user with a concise summary. Wait for confirmation before executing unless the user already said "just do it."

### Phase 5: Execute

Work through the plan systematically.

1. **Follow the todo list** — work through tasks in dependency order.
2. **One task at a time** — mark `in_progress`, complete it, mark `completed`, then move to the next.
3. **Verify each task** — run tests, check output, read files back. Don't mark complete until verified.
4. **Update the plan file** if the approach changes during execution — plans are living documents, not contracts.
5. **Update todos in real-time** — the todo list is the single source of truth for progress.
6. **Handle blockers** — if a task can't be completed as planned:
   - Try alternative approaches (Failure Protocol from kortix-main applies)
   - Update the plan file with what changed and why
   - Adjust dependent tasks as needed
7. **Final verification** — after all tasks complete, verify the overall success criteria from Phase 1.
8. **Update memory** — persist any learnings, decisions, or patterns worth remembering.

## Plan File Format

```markdown
# Plan: {Title}

**Created:** {YYYY-MM-DD}
**Status:** draft | in-progress | completed | abandoned
**Goal:** {One-sentence goal}

## Context

{What prompted this plan. Prior work, user request, relevant memory.}

## Success Criteria

- [ ] {Criterion 1}
- [ ] {Criterion 2}
- [ ] {Criterion 3}

## Approach

{High-level approach. Key architectural decisions and why.}

### Alternatives Considered

- **{Alternative A}:** {Why rejected}
- **{Alternative B}:** {Why rejected}

## Task Breakdown

### Phase: {Phase Name}
- [ ] {Task 1} — {brief description}
- [ ] {Task 2} — {brief description, depends on Task 1}

### Phase: {Phase Name}
- [ ] {Task 3} — {brief description}

## Risks

- **{Risk 1}:** {Mitigation}
- **{Risk 2}:** {Mitigation}

## Notes

{Anything discovered during execution. Updated as work progresses.}
```

## Todo List Patterns

### Naming Convention

Use prefixed IDs to group related tasks:
- `plan-{n}` — planning phase tasks
- `exec-{n}` — execution tasks
- `verify-{n}` — verification tasks
- `fix-{n}` — fix/adjustment tasks added during execution

### Dependency Tracking

Express dependencies in the task content: `"Implement X (depends: exec-1, exec-2)"`

Execute tasks in dependency order. Never start a task whose dependencies aren't completed.

### Progress Updates

- Mark `in_progress` when you START a task (not before)
- Mark `completed` IMMEDIATELY when done (don't batch completions)
- Only ONE task should be `in_progress` at a time
- Add new tasks as discovered — plans evolve during execution
- Cancel tasks that become unnecessary with `cancelled` status

### Handling Plan Changes

If execution reveals the plan needs adjustment:
1. Update the relevant task in the todo list
2. Add new tasks if scope expanded
3. Cancel tasks that are no longer needed
4. Update the plan file's Notes section with what changed and why
5. Continue execution — don't restart planning unless the fundamental approach is wrong

## Managing Existing Plans

### List Plans
```
glob("workspace/.kortix/plans/*.md")
```

### Resume a Plan
Read the plan file, check which tasks are incomplete, rebuild the todo list from the remaining tasks, and continue execution from where it left off.

### Archive a Plan
Update the plan file status to `completed` or `abandoned`. No need to delete — plans serve as historical reference for future similar tasks.

## Integration with Subagents

During Phase 2 (Investigate), dispatch parallel investigations:

```
Task(@kortix-research, "Research best practices for X. Return: key findings, recommended libraries, common pitfalls.")
Task(explore, "Find all files in the codebase related to Y. Return: file paths, key functions, architecture overview.")
```

During Phase 5 (Execute), delegate specialist subtasks:

```
Task(@kortix-web-dev, "Build the frontend component for X. Here is the plan: {paste relevant section}. Here is the context: {paste findings from Phase 2}.")
```

Always include full context when delegating — subagents start with zero context.
