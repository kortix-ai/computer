---
description: Check inbox, read, send, or manage email. Uses curl with IMAP/SMTP.
agent: kortix-main
---

# Email

The user wants to interact with email (by default the agent's own inbox).

## Setup

1. Load the `kortix-email` skill first
2. Set up credential variables from env vars as shown in the skill

## Parse the request

Interpret what the user wants from their arguments:
- No args or "check" or "inbox" → show recent inbox messages
- "send [to] [subject]" → compose and send an email
- "read [id]" → read a specific message
- "reply [id]" → reply to a message
- "search [query]" → search inbox
- "count" → show unread count
- Anything else → interpret intent and act

## Execute

Use `curl` directly against IMAP/SMTP as documented in the skill. No scripts needed.

## Report

Show results concisely. For inbox listings, show sender, subject, date, and read status. For sent mail, confirm delivery.

## User request

$ARGUMENTS
