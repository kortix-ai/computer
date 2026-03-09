#!/usr/bin/with-contenv bash
# Kortix environment setup — runs once on container start (s6 cont-init.d)
#
# In cloud mode, rewrites tool and LLM provider URLs to route through
# the Kortix API proxy for managed billing and key injection.

if [ "$ENV_MODE" = "cloud" ]; then
    echo "[Kortix] Cloud mode — enabling API proxy routing"

    if [ -z "$KORTIX_API_URL" ]; then
        echo "[Kortix] WARNING: KORTIX_API_URL is empty — LLM calls will fail until it is set via /env API"
        echo "[Kortix] Services will still start; set KORTIX_API_URL later to enable model routing"
    else
        ROUTER_URL="${KORTIX_API_URL%/}/v1/router"

        # ── Tool providers ─────────────────────────────────────────────
        printf '%s' "${ROUTER_URL}/tavily"    > /run/s6/container_environment/TAVILY_API_URL
        printf '%s' "${ROUTER_URL}/serper"    > /run/s6/container_environment/SERPER_API_URL
        printf '%s' "${ROUTER_URL}/firecrawl" > /run/s6/container_environment/FIRECRAWL_API_URL
        printf '%s' "${ROUTER_URL}/replicate" > /run/s6/container_environment/REPLICATE_API_URL
        printf '%s' "${ROUTER_URL}/context7"  > /run/s6/container_environment/CONTEXT7_API_URL

        echo "[Kortix] Tool provider URLs routed through ${ROUTER_URL}"

        # ── LLM provider routing ──────────────────────────────────
        # Route LLM SDK traffic through the Kortix router for
        # Kortix-managed billing.
        #
        # API keys: Set to KORTIX_TOKEN so the router recognizes
        # Mode 1 (Kortix-managed). If a user connects their own key
        # it is preserved for Mode 2 (passthrough billing).
        #
        # Base URLs: Anthropic/OpenAI SDKs auto-detect *_BASE_URL
        # env vars. For xAI/Gemini/Groq we patch opencode.jsonc.

        KORTIX_TOKEN_VAL="${KORTIX_TOKEN:-}"

        if [ -n "$KORTIX_TOKEN_VAL" ]; then
            # Set API keys to Kortix token (only if user hasn't set their own)
            for var in ANTHROPIC_API_KEY OPENAI_API_KEY XAI_API_KEY GOOGLE_GENERATIVE_AI_API_KEY GROQ_API_KEY; do
                eval "val=\${$var:-}"
                if [ -z "$val" ]; then
                    printf '%s' "$KORTIX_TOKEN_VAL" > "/run/s6/container_environment/$var"
                fi
            done

            # Set base URLs for SDKs that auto-detect env vars
            printf '%s' "${ROUTER_URL}/anthropic" > /run/s6/container_environment/ANTHROPIC_BASE_URL
            printf '%s' "${ROUTER_URL}/openai"    > /run/s6/container_environment/OPENAI_BASE_URL

            # Patch opencode.jsonc for providers without env var base URL support
            OPENCODE_CONFIG="/opt/opencode/opencode.jsonc"
            if [ -f "$OPENCODE_CONFIG" ]; then
                ROUTER_URL="$ROUTER_URL" OPENCODE_CONFIG="$OPENCODE_CONFIG" node -e '
                  const fs = require("fs");
                  const routerUrl = process.env.ROUTER_URL;
                  const configPath = process.env.OPENCODE_CONFIG;
                  const config = fs.readFileSync(configPath, "utf8");
                  const patches = { xai: "/xai", google: "/gemini", groq: "/groq" };
                  let patched = config;
                  for (const [provider, suffix] of Object.entries(patches)) {
                    const re = new RegExp("\"" + provider + "\":\\\\s*\\\\{\\\\s*\"options\":\\\\s*\\\\{");
                    patched = patched.replace(re, "\"" + provider + "\": { \"options\": { \"baseURL\": \"" + routerUrl + suffix + "\",");
                  }
                  fs.writeFileSync(configPath, patched);
                '
                echo "[Kortix] LLM base URLs patched in opencode.jsonc"
            fi

            echo "[Kortix] LLM provider keys set to Kortix token, base URLs routed through ${ROUTER_URL}"
        else
            echo "[Kortix] WARNING: KORTIX_TOKEN is empty — LLM routing disabled"
            # Still set placeholder keys so SDKs don't reject at construction
            for var in ANTHROPIC_API_KEY OPENAI_API_KEY XAI_API_KEY GOOGLE_GENERATIVE_AI_API_KEY GROQ_API_KEY; do
                eval "val=\${$var:-}"
                if [ -z "$val" ]; then
                    printf '%s' "sk-kortix-placeholder" > "/run/s6/container_environment/$var"
                fi
            done
        fi
    fi
else
    echo "[Kortix] Local mode — tool proxy routing disabled"
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
