#!/usr/bin/with-contenv bash
set -euo pipefail

# kortix-master runs as user abc (via s6-setuidgid).
# Ensure secrets dir and /run/s6/container_environment are writable by abc.

# Derive secrets directory from SECRET_FILE_PATH (set in docker-compose.yml).
# Falls back to /workspace/.secrets/.secrets.json if not set.
_SECRET_FILE="${SECRET_FILE_PATH:-/workspace/.secrets/.secrets.json}"
SECRETS_DIR="$(dirname "$_SECRET_FILE")"
S6_ENV_DIR="/run/s6/container_environment"
SECRETS_FILE="$_SECRET_FILE"
SEED_FILE="/opt/kortix-master/seed-env.json"

# Secrets directory (Docker volume, default owner is root).
# chown -R to fix ownership of any pre-existing files (.salt, .secrets.json).
mkdir -p "$SECRETS_DIR"
chown -R abc:users "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# s6 container environment directory (used by with-contenv)
if [ -d "$S6_ENV_DIR" ]; then
  chown -R abc:users "$S6_ENV_DIR"
  chmod 755 "$S6_ENV_DIR"
fi

# First run: seed template keys into SecretStore from seed-env.json.
# Only runs if .secrets.json doesn't exist yet (fresh install).
if [ ! -f "$SECRETS_FILE" ] && [ -f "$SEED_FILE" ]; then
  echo "[Kortix] First run — seeding template keys into SecretStore"
  bun -e "
    const { SecretStore } = require('/opt/kortix-master/src/services/secret-store.ts');
    const seed = require('$SEED_FILE');
    const store = new SecretStore();
    let n = 0;
    for (const [k, v] of Object.entries(seed)) {
      if (k.startsWith('_')) continue;
      await store.set(k, String(v));
      n++;
    }
    console.log('[Kortix] Seeded ' + n + ' template keys');
  " || echo "[Kortix] WARN: template key seed failed"
fi

# Fix ownership of any files created by the seed step (e.g. .salt created as root)
chown -R abc:users "$SECRETS_DIR"

# Sync secrets into s6 container environment.
if [ -f "$SECRETS_FILE" ]; then
  echo "[Kortix] Syncing secrets into s6 container environment"
  bun "/opt/kortix-master/src/scripts/sync-s6-env.ts" || echo "[Kortix] WARN: secret sync failed"
else
  echo "[Kortix] No secrets file yet — skipping secret sync"
fi

# Fix ownership of s6 env files AFTER sync (sync runs as root, writes root-owned files).
# kortix-master (abc) needs write access to update these at runtime via /env API.
if [ -d "$S6_ENV_DIR" ]; then
  chown -R abc:users "$S6_ENV_DIR"
fi
