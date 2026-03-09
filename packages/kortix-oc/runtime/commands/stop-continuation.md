---
description: "Stop all active continuation mechanisms — work loops, ultrawork loops, and passive todo continuation."
agent: kortix
---

# Stop Continuation

<!-- KORTIX_LOOP_STOP -->

**All continuation mechanisms are being stopped.**

Reset the loop state by running:
```bash
mkdir -p /workspace/.kortix && echo '{"active":false,"mode":null,"taskPrompt":null,"iteration":0,"sessionId":null,"startedAt":0,"inVerification":false}' > /workspace/.kortix/loop-state.json
```

Then acknowledge to the user:
1. What loop was active (if any) and how many iterations it ran
2. Current state of the work (what's done, what's pending)
3. Confirmation that all continuation has stopped

Do NOT continue any pending work after this command. Wait for the user's next instruction.
