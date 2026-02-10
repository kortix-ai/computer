#!/bin/bash
set -e

# Ensure SDK URL env vars exist (supervisord requires them for %(ENV_...)s expansion)
export TAVILY_API_URL="${TAVILY_API_URL:-}"
export SERPER_API_URL="${SERPER_API_URL:-}"
export FIRECRAWL_API_URL="${FIRECRAWL_API_URL:-}"
export REPLICATE_API_URL="${REPLICATE_API_URL:-}"
export CONTEXT7_API_URL="${CONTEXT7_API_URL:-}"

if [ "$ENV_MODE" = "cloud" ] || [ "$ENV_MODE" = "production" ]; then
    echo "[Kortix] Cloud mode — enabling API proxy routing"

    if [ -z "$KORTIX_API_URL" ]; then
        echo "[Kortix] ERROR: KORTIX_API_URL is required in cloud mode"
        exit 1
    fi

    # Override SDK base URLs to route through Kortix router proxy
    # These env vars are picked up by the SDKs inside the sandbox
    export TAVILY_API_URL="${KORTIX_API_URL}/tavily"
    export SERPER_API_URL="${KORTIX_API_URL}/serper"
    export FIRECRAWL_API_URL="${KORTIX_API_URL}/firecrawl"
    export REPLICATE_API_URL="${KORTIX_API_URL}/replicate"
    export CONTEXT7_API_URL="${KORTIX_API_URL}/context7"
    echo "[Kortix] SDK URLs routed through ${KORTIX_API_URL}"
else
    echo "[Kortix] Local mode — proxy routing disabled"
fi

# Start supervisord (manages kortix-master, opencode)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
