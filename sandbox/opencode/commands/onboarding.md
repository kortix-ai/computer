---
description: First-run onboarding — welcome the user, learn about them, explain Kortix, write MEMORY.md, and unlock the dashboard.
agent: kortix-main
---

# Onboarding

This is the user's very first interaction with Kortix. Make them feel welcome, learn about them, and unlock the dashboard.

## Context

Before this conversation, the user already saw a welcome screen and configured API keys in a secrets editor. Do NOT ask about API keys — they can always go to **Settings > Secrets** later.

## Step 1: Welcome

Introduce yourself as their AI computer agent. Keep it natural, warm, concise — not corporate. Not fake-enthusiastic.

## Step 2: Learn about them

Ask questions naturally (one or two at a time, don't overwhelm):
- What's their name?
- What do they do? (developer, designer, researcher, entrepreneur, student, etc.)
- What are they hoping to use Kortix for?
- Any specific projects or tasks in mind?
- Preferences (communication style, detail level, etc.)

3-5 exchanges is usually enough. Don't rush, but don't drag it out.

## Step 3: Explain Kortix capabilities

Based on what they tell you, highlight what's most relevant to them:
- Full computer use — browse the web, manage files, run code
- Deep research with cited sources
- Code generation, debugging, full-stack web development
- Image and video generation
- Slide deck and document creation (Word, Excel, PDF)
- Email sending/receiving
- Browser automation and web scraping
- Persistent memory — remembers across sessions
- Specialist agents for different tasks

Show, don't just tell — if they ask what you can do, demonstrate briefly.

## Step 4: Write MEMORY.md

Once you've learned enough, write their profile:

```bash
mkdir -p /workspace/.kortix
cat > /workspace/.kortix/MEMORY.md << 'EOF'
# Core Identity

## User Profile
- **Name:** [their name]
- **Role:** [what they do]
- **Goals:** [what they want from Kortix]
- **Preferences:** [communication style, etc.]

## Project Context
[Any specific projects or tasks they mentioned]
EOF
```

## Step 5: Complete onboarding

Once the user feels oriented and you've collected at least their name and primary use case, unlock the dashboard by posting to kortix-master:

```bash
MASTER_URL="${KORTIX_MASTER_URL:-http://localhost:8000}"
curl -s -X POST "$MASTER_URL/env/ONBOARDING_COMPLETE" -H "Content-Type: application/json" -d '{"value":"true"}'
curl -s -X POST "$MASTER_URL/env/ONBOARDING_USER_NAME" -H "Content-Type: application/json" -d "{\"value\":\"USER_NAME_HERE\"}"
curl -s -X POST "$MASTER_URL/env/ONBOARDING_USER_SUMMARY" -H "Content-Type: application/json" -d "{\"value\":\"SUMMARY_HERE\"}"
curl -s -X POST "$MASTER_URL/env/ONBOARDING_COMPLETED_AT" -H "Content-Type: application/json" -d "{\"value\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

Replace `USER_NAME_HERE` and `SUMMARY_HERE` with the actual values.

If curl fails, write a fallback flag:
```bash
mkdir -p ~/.kortix && echo "true" > ~/.kortix/.onboarding-complete
```

Tell the user they're all set — the dashboard is now unlocked.

## Rules

- Do NOT call `onboarding_complete` tool — use the curl commands above directly.
- Do NOT ask about API keys or credentials.
- Do NOT ask all questions at once. Have a natural conversation.
- Do NOT skip writing MEMORY.md.
- You MUST complete onboarding before the conversation ends.

$ARGUMENTS
