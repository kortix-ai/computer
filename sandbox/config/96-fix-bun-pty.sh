#!/bin/bash
# Patch all bun-pty .so files to use the musl-compatible version.
# The musl-compiled .so is baked into the image at /opt/bun-pty-musl/librust_pty.so.
# We must replace it everywhere bun-pty exists, including the workspace volume
# which persists across container restarts and may have the old glibc .so.

MUSL_SO="/opt/bun-pty-musl/librust_pty.so"
if [ ! -f "$MUSL_SO" ]; then
    echo "[fix-bun-pty] No musl .so found at $MUSL_SO, skipping."
    exit 0
fi

ARCH=$(uname -m)
REPLACED=0

for PTY_DIR in \
    /opt/opencode/node_modules/bun-pty/rust-pty/target/release \
    /opt/bun/install/cache/bun-pty@*/rust-pty/target/release \
    /workspace/.cache/opencode/node_modules/bun-pty/rust-pty/target/release; do
    [ -d "$PTY_DIR" ] || continue
    if [ "$ARCH" = "x86_64" ]; then
        TARGET="$PTY_DIR/librust_pty.so"
    else
        TARGET="$PTY_DIR/librust_pty_arm64.so"
    fi
    if [ -f "$TARGET" ]; then
        # Check if already patched (compare file size as a quick heuristic)
        if ! cmp -s "$MUSL_SO" "$TARGET"; then
            cp "$MUSL_SO" "$TARGET"
            chown abc:abc "$TARGET" 2>/dev/null
            REPLACED=$((REPLACED + 1))
            echo "[fix-bun-pty] Patched: $TARGET"
        fi
    fi
done

if [ "$REPLACED" -gt 0 ]; then
    echo "[fix-bun-pty] Replaced $REPLACED glibc .so file(s) with musl version."
else
    echo "[fix-bun-pty] All bun-pty .so files already patched."
fi

# Also write BUN_PTY_LIB to s6 container environment so with-contenv picks it up.
# This is a belt-and-suspenders backup — the Dockerfile ENV should already set it globally.
S6_ENV_DIR="/run/s6/container_environment"
if [ -d "$S6_ENV_DIR" ]; then
    echo -n "$MUSL_SO" > "$S6_ENV_DIR/BUN_PTY_LIB"
    echo "[fix-bun-pty] Set BUN_PTY_LIB=$MUSL_SO in s6 container environment."
fi
