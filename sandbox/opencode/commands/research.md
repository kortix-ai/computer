---
description: Kick off a deep research task on any topic. Delegates to the research subagent.
agent: kortix-main
---

# Deep Research

The user wants deep, comprehensive research on a topic. This is Tier 3 -- a full investigation with cited sources and a structured report. For quick lookups or moderate exploration, handle it yourself (see Web Information Needs tiers).

Delegate this to `@kortix-research`.

## Before delegating

1. Check `workspace/.kortix/memory/` and `research/` — has this topic been researched before? If so, read the existing report and ask the user if they want a fresh investigation or an update.

2. Check `workspace/.kortix/MEMORY.md` User section — are there any preferences about research format, depth, or style?

## Delegation prompt

Send `@kortix-research` a detailed, self-contained prompt that includes:
- The research topic/question from the user
- Any existing knowledge you found (summarized)
- User preferences if relevant
- Instruction to create a research working directory at `research/{topic-slug}/`
- Instruction to save the final report to `workspace/.kortix/memory/research-{topic-slug}.md`
- Instruction to load the `kortix-deep-research` skill first

## After research completes

1. Read the report from `research/{topic-slug}/report.md`
2. Present a concise summary to the user with the full report path
3. Update MEMORY.md Scratchpad to note research was completed

## Research topic

$ARGUMENTS
