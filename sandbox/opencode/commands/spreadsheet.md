---
description: Create or edit a spreadsheet. Delegates to the sheets subagent.
agent: kortix-main
---

# Spreadsheet

The user wants to create or edit a spreadsheet. Delegate to `@kortix-sheets`.

## Before delegating

1. Check `workspace/.kortix/MEMORY.md` User section for formatting preferences
2. Check `workspace/.kortix/memory/` for relevant data or research

## Delegation prompt

Send `@kortix-sheets` a detailed prompt including:
- What spreadsheet to create/edit and the requirements
- User formatting preferences from memory
- Any relevant data sources
- Instruction to load the `kortix-xlsx` skill first

## After completion

1. Update MEMORY.md Scratchpad
2. Tell the user where the file is

## Spreadsheet request

$ARGUMENTS
