---
description: Bootstrap the agent's memory system. Creates MEMORY.md, directory structure, learns about the user, and scans the workspace.
agent: kortix-main
---

# Memory Initialization

You are bootstrapping your persistent memory. Follow these steps.

## Step 1: Create directory structure

Ensure all memory directories exist:
```bash
mkdir -p /workspace/.kortix/memory /workspace/.kortix/journal /workspace/.kortix/knowledge /workspace/.kortix/sessions
```

## Step 2: Create MEMORY.md

If `workspace/.kortix/MEMORY.md` doesn't exist or is a default template, create it:

```markdown
# Memory

## Identity
Kortix — autonomous AI agent with persistent memory, full Linux access, and internet connectivity.
[Check env for AGENT_EMAIL_ADDRESS, available tools and skills]

## User
Not yet known. Introduce yourself so I can remember you.

## Project
Not yet scanned. Scanning workspace...

## Scratchpad
Memory system initialized. Ready for tasks.
```

## Step 3: Populate Identity

Read your environment to build the Identity section:
- Check `env` for your email credentials (AGENT_EMAIL_ADDRESS)
- Check what tools and skills are available
- Write the Identity section of MEMORY.md

## Step 4: Learn about the user

Talk to the user:
- Ask their name
- Ask their role / what they do
- Ask how they prefer to work with you (hands-off? collaborative? detailed reporting?)
- Ask about any immediate projects or priorities

Write everything to the User section of MEMORY.md.

## Step 5: Scan the workspace

Explore the current workspace and populate the Project section:
- Directory structure, project manifests, git history
- Tech stack, key dependencies, build/test commands
- Architecture patterns, CI configs

## Step 6: Initialize daily log

Write today's first entry to `workspace/.kortix/memory/YYYY-MM-DD.md`:

```markdown
# YYYY-MM-DD

## HH:MM — Memory system initialized
- Created MEMORY.md with Identity, User, Project, Scratchpad sections
- [Summary of what was learned about user and workspace]
```

## Step 7: Verify memory system

- Confirm MEMORY.md exists and has real content
- Confirm memory plugin is loading it (it should appear in your system prompt)
- Test `memory_search` tool: `memory_search(query: "user preferences")`
- Tell the user what you learned and that memory is active

$ARGUMENTS
