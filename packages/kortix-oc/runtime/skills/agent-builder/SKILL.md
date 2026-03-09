---
name: agent-builder
description: "Agent building router skill. Use for requests like 'build me an ai agent'. Clarifies two targets: (1) internal OpenCode/Kortix agent building, or (2) external standalone agent service using SDKs/APIs (Vercel AI SDK, Anthropic/OpenAI, LiteLLM, etc.)."
---

# Agent Builder

Default assumption: the user most likely means building an **internal Kortix/OpenCode agent** (an agent like this one that is available to customize).

For agent-building requests, clarify target quickly:

1. **Internal OpenCode/Kortix agent (default, most likely)**
   - Build/customize agents, skills, tools, commands, and supporting software behavior inside OpenCode.
   - **Load and follow the `opencode` skill** for implementation details.

2. **External standalone agent service/app**
   - Build an external service directly with SDKs/APIs (Vercel AI SDK, Anthropic/OpenAI, LiteLLM, etc.).

Design philosophy must be deliberate:
- The primitives are the key design units: **agents**, **code**, and **skills**.
- Not every "agent" needs a full multi-service architecture.
- Sometimes the correct implementation is simply code that performs the agent behavior.
- Sometimes the correct implementation is mainly a skill (behavior + workflow) or code (capability), not new runtime infra.
- Choose the smallest primitive set that matches the user's real goal.

If target is unclear, ask one short question and recommend internal OpenCode/Kortix by default.
