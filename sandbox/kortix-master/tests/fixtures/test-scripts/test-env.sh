#!/bin/bash
if [ $# -eq 0 ]; then
    echo '{"error": "Key argument required"}'
    exit 1
fi

KEY=$1
VALUE=${!KEY}
FOUND=false

if [ -n "${!KEY+x}" ]; then
    FOUND=true
fi

echo "{\"language\":\"bash\",\"key\":\"$KEY\",\"value\":\"$VALUE\",\"found\":$FOUND}"