#!/usr/bin/with-contenv bash
# Kortix environment setup — runs once on container start (s6 cont-init.d)
#
# In cloud mode, overrides SDK base URLs to route ALL provider traffic
# through the Kortix router proxy for usage metering and billing.
# In local mode, does nothing.

if [ "$ENV_MODE" = "cloud" ]; then
    echo "[Kortix] Cloud mode — enabling API proxy routing"

    if [ -z "$KORTIX_API_URL" ]; then
        echo "[Kortix] WARNING: KORTIX_API_URL is empty — LLM calls will fail until it is set via /env API"
        echo "[Kortix] Services will still start; set KORTIX_API_URL later to enable model routing"
    else
        # KORTIX_API_URL is the base URL (e.g. http://localhost:8008).
        # The /v1/router prefix is where provider proxy services are mounted.
        ROUTER_URL="${KORTIX_API_URL%/}/v1/router"

        # ── Tool providers ─────────────────────────────────────────────
        printf '%s' "${ROUTER_URL}/tavily"    > /run/s6/container_environment/TAVILY_API_URL
        printf '%s' "${ROUTER_URL}/serper"    > /run/s6/container_environment/SERPER_API_URL
        printf '%s' "${ROUTER_URL}/firecrawl" > /run/s6/container_environment/FIRECRAWL_API_URL
        printf '%s' "${ROUTER_URL}/replicate" > /run/s6/container_environment/REPLICATE_API_URL
        printf '%s' "${ROUTER_URL}/context7"  > /run/s6/container_environment/CONTEXT7_API_URL

        # ── LLM providers ──────────────────────────────────────────────
        # Route LLM traffic through the Kortix proxy for usage metering
        # (billed at platform fee 0.1x for user-owned keys).
        #
        # SDK-native env vars (read directly by the AI SDK):
        #   @ai-sdk/anthropic -> ANTHROPIC_BASE_URL
        #   @ai-sdk/openai    -> OPENAI_BASE_URL
        #
        # Custom env vars (read via {env:...} in opencode.jsonc options.baseURL):
        #   XAI_BASE_URL, GOOGLE_BASE_URL, GROQ_BASE_URL
        #   These SDKs have no native env var for base URL, so opencode.jsonc
        #   references these env vars explicitly.
        printf '%s' "${ROUTER_URL}/anthropic" > /run/s6/container_environment/ANTHROPIC_BASE_URL
        printf '%s' "${ROUTER_URL}/openai"    > /run/s6/container_environment/OPENAI_BASE_URL
        printf '%s' "${ROUTER_URL}/xai"       > /run/s6/container_environment/XAI_BASE_URL
        printf '%s' "${ROUTER_URL}/gemini"    > /run/s6/container_environment/GOOGLE_BASE_URL
        printf '%s' "${ROUTER_URL}/groq"      > /run/s6/container_environment/GROQ_BASE_URL

        echo "[Kortix] All provider URLs routed through ${ROUTER_URL}"
    fi
else
    echo "[Kortix] Local mode — proxy routing disabled"
fi

# ── Dev server crash protection (all modes) ──────────────────────────────────
# Inject ECONNRESET guard into NODE_OPTIONS so all Node.js processes (dev servers,
# npm scripts, npx tools) are protected from socket errors that occur when clients
# disconnect through the Kortix reverse proxy.
#
# This prevents Vite 7, Astro, Next.js, and other dev servers from crashing on
# ECONNRESET/EPIPE errors during browser tab closes, page reloads, and proxy timeouts.
#
# Safe for all Node.js processes: the guard only swallows socket-level errors.
# Does NOT affect Bun, Go, or other runtimes (they ignore NODE_OPTIONS).
GUARD_PATH="/opt/kortix-master/econnreset-guard.cjs"
if [ -f "$GUARD_PATH" ]; then
    EXISTING_NODE_OPTIONS="${NODE_OPTIONS:-}"
    if echo "$EXISTING_NODE_OPTIONS" | grep -q "$GUARD_PATH" 2>/dev/null; then
        echo "[Kortix] NODE_OPTIONS ECONNRESET guard already present"
    else
        printf '%s' "${EXISTING_NODE_OPTIONS:+$EXISTING_NODE_OPTIONS }--require=$GUARD_PATH" > /run/s6/container_environment/NODE_OPTIONS
        echo "[Kortix] NODE_OPTIONS ECONNRESET guard enabled — dev servers protected"
    fi
else
    echo "[Kortix] WARN: ECONNRESET guard not found at $GUARD_PATH — dev servers unprotected"
fi
