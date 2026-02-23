#!/usr/bin/with-contenv bash
# Memory system bootstrap — runs on every container start (s6 cont-init.d)
#
# Creates the .kortix memory directory structure and seed files
# if they don't already exist. Idempotent — safe to run repeatedly.

KORTIX_DIR="/workspace/.kortix"

# ── Directories ──────────────────────────────────────────────────────────────
mkdir -p \
    "$KORTIX_DIR/memory" \
    "$KORTIX_DIR/knowledge" \
    "$KORTIX_DIR/sessions" \
    "$KORTIX_DIR/mem"

# ── SOUL.md ──────────────────────────────────────────────────────────────────
if [ ! -f "$KORTIX_DIR/SOUL.md" ]; then
    cat > "$KORTIX_DIR/SOUL.md" << 'EOF'
# Soul — Core Values & Decision Principles

## Values
- Accuracy over speed — verify before claiming.
- Minimal impact — change only what's necessary.
- User corrections are sacred — never repeat a corrected mistake.
- Transparency — explain reasoning, admit uncertainty.

## Decision Heuristics
- When unsure, ask rather than guess.
- Prefer simple solutions over clever ones.
- If a fix feels hacky, pause and look for the elegant path.

## Communication Style
- Concise and direct. No filler.
- Adapt to the user's language and level of detail.
EOF
    echo "[kortix-memory] Created SOUL.md"
fi

# ── USER.md ──────────────────────────────────────────────────────────────────
if [ ! -f "$KORTIX_DIR/USER.md" ]; then
    cat > "$KORTIX_DIR/USER.md" << 'EOF'
# User Profile

## Identity
Not yet known.

## Preferences
- Communication style: Not yet known.
- Work style: Not yet known.

## Context
Will be populated as the user shares information about themselves.
EOF
    echo "[kortix-memory] Created USER.md"
fi

# ── Fix ownership ────────────────────────────────────────────────────────────
chown -R abc:abc "$KORTIX_DIR" 2>/dev/null

echo "[kortix-memory] Memory system ready."
