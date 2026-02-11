---
description: Create a presentation / slide deck. Delegates to the slides subagent.
agent: kortix-main
---

# Create Presentation

The user wants a slide deck. Delegate to `@kortix-slides`.

## Before delegating

1. Check `workspace/.kortix/MEMORY.md` User section for brand/style preferences
2. Check `workspace/.kortix/memory/` for relevant research that could inform the content
3. Ask the user for any details not provided: topic, audience, tone, slide count, style

## Delegation prompt

Send `@kortix-slides` a detailed prompt including:
- The presentation topic and requirements
- User style preferences from memory
- Any relevant research content
- Instruction to load the `kortix-presentations` skill first
- Where to save the output

## After completion

1. Update MEMORY.md Scratchpad to note presentation was created
2. Tell the user where to find the slides and how to view them (presentation viewer at port 3210)

## Presentation request

$ARGUMENTS
