#!/usr/bin/with-contenv bash
# Kortix environment setup — minimal version
# Just sets up the Kortix token for passthrough billing, no URL rewriting

# ── Dev server crash protection ─────────────────────────────────────────────
GUARD_PATH="/opt/kortix-master/econnreset-guard.cjs"
if [ -f "$GUARD_PATH" ]; then
    EXISTING_NODE_OPTIONS="${NODE_OPTIONS:-}"
    if echo "$EXISTING_NODE_OPTIONS" | grep -q "$GUARD_PATH" 2>/dev/null; then
        echo "[Kortix] NODE_OPTIONS ECONNRESET guard already present"
    else
        printf '%s' "${EXISTING_NODE_OPTIONS:+$EXISTING_NODE_OPTIONS }--require=$GUARD_PATH" > /run/s6/container_environment/NODE_OPTIONS
        echo "[Kortix] NODE_OPTIONS ECONNRESET guard enabled"
    fi
fi

echo "[Kortix] Environment setup complete"
