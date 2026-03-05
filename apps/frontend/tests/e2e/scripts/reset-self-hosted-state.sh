#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${SUPABASE_DB_CONTAINER:-supabase-db}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Container '$CONTAINER_NAME' is not running."
  echo "Start the local stack first (for example via scripts/get-kortix.sh)."
  exit 1
fi

echo "Resetting auth users in $CONTAINER_NAME ..."
docker exec "$CONTAINER_NAME" psql -U postgres -d postgres -c "delete from auth.users;"
echo "Done. install-status should now report installed=false."
