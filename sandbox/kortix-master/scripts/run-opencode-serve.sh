#!/bin/bash
# Core supervisor wrapper for OpenCode API server (port 4096)
# Called by kortix-master core supervisor — NOT by s6 directly.

export HOME=/workspace
export XDG_DATA_HOME=/workspace/.local/share
export OPENCODE_CONFIG_DIR=/opt/opencode
export OPENCODE_FILE_ROOT=/
export BUN_PTY_LIB=/opt/bun-pty-musl/librust_pty.so
export PATH="/opt/bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Drop empty *_BASE_URL vars — empty string causes @ai-sdk to fetch("") → ERR_INVALID_URL
[ -z "$ANTHROPIC_BASE_URL" ] && unset ANTHROPIC_BASE_URL
[ -z "$OPENAI_BASE_URL" ] && unset OPENAI_BASE_URL

# Pick up vars written by kortix-api after container start
[ -f /run/s6/container_environment/KORTIX_TOKEN ] && \
  export KORTIX_TOKEN="$(cat /run/s6/container_environment/KORTIX_TOKEN)"
[ -f /run/s6/container_environment/KORTIX_API_URL ] && \
  export KORTIX_API_URL="$(cat /run/s6/container_environment/KORTIX_API_URL)"

cd /workspace

# Wait for any previous opencode instance to fully release the SQLite database.
# Rapid restarts leave the DB locked ("unable to open database file") until the
# old process exits and the kernel releases its file descriptors.
DB_PATH="/workspace/.local/share/opencode/opencode.db"
for i in $(seq 1 10); do
  # Only check WAL/SHM — these only exist (and stay locked) during or after a crash.
  # The main .db file is held by the running instance which is fine to ignore here.
  if ! fuser "${DB_PATH}-wal" "${DB_PATH}-shm" >/dev/null 2>&1; then
    break
  fi
  echo "[opencode-serve] DB still locked by previous process, waiting (${i}/10)..."
  sleep 1
done

exec /usr/local/bin/opencode serve --port 4096 --hostname 0.0.0.0
