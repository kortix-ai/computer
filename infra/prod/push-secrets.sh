#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_ENV="$SCRIPT_DIR/../../.env"
SECRET_ID="kortix/prod/api-config"

if [ ! -f "$ROOT_ENV" ]; then
  echo "Error: .env not found at $ROOT_ENV"
  exit 1
fi

JSON=$(python3 -c "
import json, re, sys

result = {}
with open('$ROOT_ENV') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        value = value.strip()
        if not key or not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', key):
            continue
        result[key] = value

print(json.dumps(result, indent=2))
")

echo "Found $(echo "$JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))") keys in .env"
echo ""

echo "$JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for k, v in data.items():
    if v:
        print(f'  ✓ {k}')
    else:
        print(f'  ✗ {k} (empty)')
"

echo ""
read -p "Push to AWS Secrets Manager ($SECRET_ID)? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  TMPFILE=$(mktemp)
  echo "$JSON" > "$TMPFILE"
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_ID" \
    --secret-string file://"$TMPFILE"
  rm -f "$TMPFILE"
  echo "Done! Secrets pushed to $SECRET_ID"
  echo "External Secrets Operator will sync to k8s within 5 minutes."
  echo "To force immediate sync:"
  echo "  kubectl annotate externalsecret kortix-api-secrets -n kortix force-sync=\$(date +%s) --overwrite"
else
  echo "Aborted."
fi
