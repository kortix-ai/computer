---
description: Bootstrap the agent's memory system. Creates MEMORY.md, learns about the user, and scans the workspace.
agent: kortix-main
---

# Memory Initialization

You are bootstrapping your persistent memory. Follow these steps.

## Step 1: Create MEMORY.md

If `workspace/.kortix/MEMORY.md` doesn't exist or is a default template, create it. Ensure `workspace/.kortix/memory/` directory exists.

## Step 2: Populate Identity

Read your environment to build the Identity section:
- Check `env` for your email credentials (AGENT_EMAIL_ADDRESS)
- Check what tools and skills are available
- Write the Identity section of MEMORY.md

## Step 3: Learn about the user

Talk to the user:
- Ask their name
- Ask their role / what they do
- Ask how they prefer to work with you (hands-off? collaborative? detailed reporting?)
- Ask about any immediate projects or priorities

Write everything to the User section of MEMORY.md.

## Step 4: Scan the workspace

Explore the current workspace and populate the Project section:
- Directory structure, project manifests, git history
- Tech stack, key dependencies, build/test commands
- Architecture patterns, CI configs

## Step 5: Initialize Scratchpad

Write the Scratchpad section:
- Current Focus: "Memory system initialized. Ready for tasks."
- Any tasks the user mentioned in Step 3

## Step 6: Confirm

Tell the user what you learned and that memory is active. Show a brief summary.

$ARGUMENTS
