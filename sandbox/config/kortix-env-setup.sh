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
        # ── Tool providers ─────────────────────────────────────────────
        printf '%s' "${KORTIX_API_URL}/tavily"    > /run/s6/container_environment/TAVILY_API_URL
        printf '%s' "${KORTIX_API_URL}/serper"    > /run/s6/container_environment/SERPER_API_URL
        printf '%s' "${KORTIX_API_URL}/firecrawl" > /run/s6/container_environment/FIRECRAWL_API_URL
        printf '%s' "${KORTIX_API_URL}/replicate" > /run/s6/container_environment/REPLICATE_API_URL
        printf '%s' "${KORTIX_API_URL}/context7"  > /run/s6/container_environment/CONTEXT7_API_URL

        # ── LLM providers ──────────────────────────────────────────────
        # Route LLM traffic through the Kortix proxy for usage metering
        # (billed at platform fee 0.1× for user-owned keys).
        #
        # SDK-native env vars (read directly by the AI SDK):
        #   @ai-sdk/anthropic → ANTHROPIC_BASE_URL
        #   @ai-sdk/openai    → OPENAI_BASE_URL
        #
        # Custom env vars (read via {env:...} in opencode.jsonc options.baseURL):
        #   XAI_BASE_URL, GOOGLE_BASE_URL, GROQ_BASE_URL
        #   These SDKs have no native env var for base URL, so opencode.jsonc
        #   references these env vars explicitly.
        printf '%s' "${KORTIX_API_URL}/anthropic" > /run/s6/container_environment/ANTHROPIC_BASE_URL
        printf '%s' "${KORTIX_API_URL}/openai"    > /run/s6/container_environment/OPENAI_BASE_URL
        printf '%s' "${KORTIX_API_URL}/xai"       > /run/s6/container_environment/XAI_BASE_URL
        printf '%s' "${KORTIX_API_URL}/gemini"    > /run/s6/container_environment/GOOGLE_BASE_URL
        printf '%s' "${KORTIX_API_URL}/groq"      > /run/s6/container_environment/GROQ_BASE_URL

        echo "[Kortix] All provider URLs routed through ${KORTIX_API_URL}"
    fi
else
    echo "[Kortix] Local mode — proxy routing disabled"
fi
