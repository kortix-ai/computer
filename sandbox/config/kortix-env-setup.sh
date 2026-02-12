#!/usr/bin/with-contenv bash
# Kortix environment setup — runs once on container start (s6 cont-init.d)
#
# In cloud/production mode, overrides SDK base URLs to route through
# the Kortix router proxy. In local mode, does nothing.

if [ "$ENV_MODE" = "cloud" ] || [ "$ENV_MODE" = "production" ]; then
    echo "[Kortix] Cloud mode — enabling API proxy routing"

    if [ -z "$KORTIX_API_URL" ]; then
        echo "[Kortix] WARNING: KORTIX_API_URL is empty — LLM calls will fail until it is set via /env API"
        echo "[Kortix] Services will still start; set KORTIX_API_URL later to enable model routing"
    else
        # Write env overrides that s6 services will inherit via with-contenv
        printf '%s' "${KORTIX_API_URL}/tavily"    > /var/run/s6/container_environment/TAVILY_API_URL
        printf '%s' "${KORTIX_API_URL}/serper"    > /var/run/s6/container_environment/SERPER_API_URL
        printf '%s' "${KORTIX_API_URL}/firecrawl" > /var/run/s6/container_environment/FIRECRAWL_API_URL
        printf '%s' "${KORTIX_API_URL}/replicate" > /var/run/s6/container_environment/REPLICATE_API_URL
        printf '%s' "${KORTIX_API_URL}/context7"  > /var/run/s6/container_environment/CONTEXT7_API_URL

        echo "[Kortix] SDK URLs routed through ${KORTIX_API_URL}"
    fi
else
    echo "[Kortix] Local mode — proxy routing disabled"
fi
