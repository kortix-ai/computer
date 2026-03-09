---
description: "Start an ultrawork loop — autonomous execution with mandatory self-verification. Max 500 iterations. Emit <promise>DONE</promise> then <promise>VERIFIED</promise>."
agent: kortix
---

# Ultrawork Loop

<!-- KORTIX_LOOP:ulw -->

You are now entering an **ultrawork loop**. This is autonomous execution with a mandatory self-verification phase before completion. Higher iteration limit, higher expectations.

## Protocol

1. **Initialize the loop** by writing the loop state file:
   ```bash
   mkdir -p /workspace/.kortix && echo '{"active":true,"mode":"ulw","taskPrompt":"TASK_HERE","iteration":0,"sessionId":null,"startedAt":0,"inVerification":false}' > /workspace/.kortix/loop-state.json
   ```
   Replace `TASK_HERE` with the user's actual task description. Escape any quotes.

2. **Create a detailed todo list** breaking the task into specific, actionable steps.

3. **Execute the work.** Explore → plan → build → verify. Be thorough. Go deep.

4. **When ALL work is complete**, emit exactly:
   ```
   <promise>DONE</promise>
   ```

5. **The system will then enter verification mode.** You must perform a full self-review:
   - Re-read all changed files
   - Run all applicable tests, builds, and linters
   - Verify every requirement from the original task is met
   - Check for regressions

6. **If verification passes**, emit exactly:
   ```
   <promise>VERIFIED</promise>
   ```
   If verification fails, fix the issues and emit `<promise>DONE</promise>` again to re-enter verification.

## Rules

- You have up to **500 iterations** before the system force-stops you.
- Self-verification is **mandatory** — the loop does not end until `<promise>VERIFIED</promise>` is emitted.
- Each pause without the appropriate promise auto-continues you.
- Track progress via the todo list at all times.
- If truly stuck on something requiring human input, document the blocker and emit both promises.
- This is ultrawork mode: depth over speed, correctness over velocity.
