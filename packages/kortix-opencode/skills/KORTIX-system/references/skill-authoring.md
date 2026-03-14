# Skill Authoring

Use this file when creating or refactoring skills inside the Kortix or OpenCode config.

## Recommended Layout

```text
skill-name/
|- SKILL.md
|- scripts/
|- references/
`- assets/
```

## `SKILL.md` format

```markdown
---
name: my-skill
description: "Comprehensive trigger description. This is what discovery sees."
---

# Instructions loaded when the skill is used
```

## Authoring Principles

1. keep `SKILL.md` concise; move long docs into `references/`
2. treat `name` and `description` as the trigger surface
3. prefer examples over long explanation blocks
4. keep progressive disclosure in mind; only load what is needed
5. use `scripts/` only when a repeatable helper is genuinely useful

## Practical Guidance

- if a skill becomes a long reference manual, split it into topical reference files
- if the skill needs executable helpers, keep them close to the skill in `scripts/`
- if the skill answers product or architecture questions, make the source-of-truth files explicit inside `SKILL.md`
