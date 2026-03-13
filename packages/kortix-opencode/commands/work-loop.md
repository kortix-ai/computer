---
description: "Start a bounded work loop — work autonomously until done or iteration limit (100). Emit <promise>DONE</promise> when complete."
agent: kortix
---

# Work Loop

<!-- KORTIX_LOOP:work -->

You are now entering a **work loop**. This is an autonomous execution mode where you work continuously until the task is complete.

## Protocol

1. **Initialize the loop** by writing the loop state file:
   ```bash
   mkdir -p /workspace/.kortix && echo '{"active":true,"mode":"work","taskPrompt":"TASK_HERE","iteration":0,"sessionId":null,"startedAt":0,"inVerification":false}' > /workspace/.kortix/loop-state.json
   ```
   Replace `TASK_HERE` with the user's actual task description from their message. Escape any quotes.

2. **Create a detailed todo list** breaking the task into specific, actionable steps.

3. **Execute the work.** Follow your normal workflow: explore → plan → build → verify. Track every step via the todo list.

4. **When ALL work is complete and verified**, emit exactly on its own line:
   ```
   <promise>DONE</promise>
   ```

## Rules

- You have up to **100 iterations** before the system force-stops you.
- Each time you pause without the completion promise, the system auto-continues you.
- Do NOT emit `<promise>DONE</promise>` until all todos are complete and all changes are verified.
- If you get stuck on something that requires human input, document the blocker clearly and emit `<promise>DONE</promise>` with a summary.
- Track progress obsessively via the todo list — it's your lifeline.
- Work like a senior engineer: explore, plan, build, verify. No shortcuts.
