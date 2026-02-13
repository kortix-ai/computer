FROM lscr.io/linuxserver/webtop:latest

# ── Branding ─────────────────────────────────────────────────────────────────
COPY sandbox/assets/wallpaper.png       /usr/share/wallpapers/heyagi/wallpaper.png
COPY sandbox/assets/kortix-symbol.svg   /usr/share/icons/heyagi/kortix-symbol.svg
COPY sandbox/assets/kortix-symbol-white.svg /usr/share/icons/heyagi/kortix-symbol-white.svg

# ── Runtimes ────────────────────────────────────────────────────────────────
# Alpine XFCE base includes: chromium, xfce4-terminal, python3, git, bash, pillow.
# Install Node.js + npm from Alpine repos, plus build dependencies needed
# for pip packages with C extensions (numpy, lxml, greenlet).
RUN apk update \
    && apk add --no-cache \
        nodejs npm \
        python3-dev py3-pip py3-virtualenv \
        curl unzip ca-certificates gnupg \
        gcc g++ musl-dev linux-headers \
        libffi-dev libxml2-dev libxslt-dev \
    && rm -rf /var/cache/apk/*

# Install bun to /opt/bun (NOT /workspace which is a volume mount at runtime)
ENV BUN_INSTALL=/opt/bun
RUN for i in 1 2 3; do curl -fsSL https://bun.sh/install | bash && break || sleep 5; done \
    && test -x /opt/bun/bin/bun \
    && ln -sf /opt/bun/bin/bun /usr/local/bin/bun

# pip packages:
#   - greenlet, pyee, typing-extensions: native musl builds (playwright deps)
#   - pypdf2, python-pptx: pure Python, install normally
#   - playwright: no musl wheels exist — force-install manylinux wheel via --target,
#     then copy to site-packages (the Python API is pure Python + greenlet)
#   - pillow: already in base image
RUN pip3 install --break-system-packages --timeout=120 --retries=3 \
        greenlet pyee typing-extensions \
        pypdf2==3.0.1 python-pptx==1.0.2 \
    && SITE=$(python3 -c "import site; print(site.getsitepackages()[0])") \
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then PW_PLAT=manylinux1_x86_64; \
       else PW_PLAT=manylinux_2_17_aarch64; fi \
    && pip3 install --platform "$PW_PLAT" --only-binary :all: \
        --no-deps --target /tmp/pw playwright==1.58.0 \
    && cp -r /tmp/pw/playwright* "$SITE/" \
    && rm -rf /tmp/pw \
    && python3 -c "from playwright.sync_api import sync_playwright; print('playwright OK')"

# Install uv (Python package runner) — used by presentation-gen tool scripts
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# ── LSS (Local Semantic Search + file-watcher sync) ─────────────────────────
RUN pip3 install --break-system-packages local-semantic-search

# Remove build-only deps to save space (keep runtime libs)
RUN apk del gcc g++ musl-dev linux-headers python3-dev libffi-dev \
        libxml2-dev libxslt-dev \
    && rm -rf /var/cache/apk/*

# Skip `playwright install` — we use the system chromium at /usr/bin/chromium-browser

# ── Agent Browser (headless browser automation for AI agents) ────────────────
RUN npm install -g agent-browser
COPY sandbox/patch-agent-browser.js /tmp/patch-agent-browser.js
RUN node /tmp/patch-agent-browser.js && rm /tmp/patch-agent-browser.js
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV AGENT_BROWSER_PRIMARY_SESSION=kortix
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_PROFILE=/workspace/.browser-profile
ENV AGENT_BROWSER_SOCKET_DIR=/workspace/.agent-browser
ENV AGENT_BROWSER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-gpu,--disable-dev-shm-usage,--disable-blink-features=AutomationControlled,--disable-features=VizDisplayCompositor,--window-size=1920,1080"
ENV AGENT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# ── Agent Browser Viewer (watch the browser session from your Mac) ───────────
COPY sandbox/assets/browser-viewer/ /opt/agent-browser-viewer/

# ── OpenCode CLI ────────────────────────────────────────────────────────────
# npm installs the glibc binary by default; force-install the musl variant
# and symlink it over the glibc one so the wrapper script finds it.
RUN npm install -g @kortix/opencode-ai@0.2.0 \
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then \
         npm install -g @kortix/opencode-ai-linux-x64-musl@0.2.0 --force \
         && MUSL_BIN=$(npm root -g)/@kortix/opencode-ai-linux-x64-musl/bin/opencode \
         && GLIBC_BIN=$(npm root -g)/@kortix/opencode-ai/node_modules/@kortix/opencode-ai-linux-x64/bin/opencode \
         && ln -sf "$MUSL_BIN" "$GLIBC_BIN"; \
       else \
         npm install -g @kortix/opencode-ai-linux-arm64-musl@0.2.0 --force \
         && MUSL_BIN=$(npm root -g)/@kortix/opencode-ai-linux-arm64-musl/bin/opencode \
         && GLIBC_BIN=$(npm root -g)/@kortix/opencode-ai/node_modules/@kortix/opencode-ai-linux-arm64/bin/opencode \
         && ln -sf "$MUSL_BIN" "$GLIBC_BIN"; \
       fi \
    && opencode --version

# ── OpenCode (agents, tools, skills) ────────────────────────────────────────
# Use --chown on COPY to avoid a separate chown layer (saves ~320MB duplication).
# UID 1000 matches PUID=1000 set in docker-compose (init-adduser remaps abc to this).
COPY --chown=1000:1000 sandbox/opencode/ /opt/opencode/
RUN cd /opt/opencode && bun install
ENV OPENCODE_CONFIG_DIR=/opt/opencode

# Make bun cache writable by any user (abc UID changes at runtime via PUID)
RUN chmod -R 777 /opt/bun/install

# ── Kortix Master (proxy to OpenCode + secret store) ────────────────────────
COPY sandbox/kortix-master/package.json /opt/kortix-master/package.json
RUN cd /opt/kortix-master && bun install
COPY sandbox/kortix-master/ /opt/kortix-master/

# ── Version (for live update system) ─────────────────────────────────────────
# Read version from sandbox/package.json (single source of truth) and write .version
COPY sandbox/package.json /tmp/sandbox-pkg.json
RUN mkdir -p /opt/kortix \
    && PKG_VERSION=$(node -e "console.log(require('/tmp/sandbox-pkg.json').version)") \
    && echo "{\"version\":\"$PKG_VERSION\",\"updatedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /opt/kortix/.version \
    && rm /tmp/sandbox-pkg.json \
    && chown -R 1000:1000 /opt/kortix

# Create secrets directory (init-adduser will chown /app to abc at runtime)
RUN mkdir -p /app/secrets && chmod 700 /app/secrets

# ── Workspace ───────────────────────────────────────────────────────────────
RUN mkdir -p /workspace/.kortix /workspace/.agent-browser /workspace/.browser-profile \
    /workspace/.lss /workspace/.cache/opencode /workspace/presentations \
    /workspace/.local/share/opencode /workspace/.local/share/opencode/log \
    /workspace/.local/share/opencode/storage /workspace/.local/share/opencode/snapshot \
    /workspace/.XDG /workspace/.config /workspace/ssl \
    && chown -R 1000:1000 /workspace \
    && rm -rf /config \
    && ln -s /workspace /config \
    && git config --system --add safe.directory '*'
WORKDIR /workspace
ENV KORTIX_WORKSPACE=/workspace

# ── Services (s6-rc.d longrun) ──────────────────────────────────────────────
# Alpine webtop uses s6-overlay v3 with s6-rc.d instead of services.d.
# Each service is a directory with: run, type (longrun), dependencies.d/init-services
COPY sandbox/s6-services/ /etc/s6-overlay/s6-rc.d/
# Register all custom services in the user bundle so s6 starts them
RUN for svc in svc-opencode-web svc-opencode-serve svc-kortix-master svc-lss-sync svc-agent-browser-viewer svc-presentation-viewer; do \
        touch "/etc/s6-overlay/s6-rc.d/user/contents.d/${svc}"; \
    done \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-*/run

# ── Container init scripts (s6 cont-init.d) ─────────────────────────────────
RUN mkdir -p /custom-cont-init.d
COPY sandbox/config/kortix-env-setup.sh /custom-cont-init.d/98-kortix-env
RUN chmod +x /custom-cont-init.d/98-kortix-env
COPY sandbox/config/customize.sh /custom-cont-init.d/99-customize
RUN chmod +x /custom-cont-init.d/99-customize

# ── Daytona entrypoint ───────────────────────────────────────────────────────
COPY sandbox/startup.sh /opt/startup.sh
RUN chmod +x /opt/startup.sh

# ── Desktop config ───────────────────────────────────────────────────────────
ENV CUSTOM_PORT=6080
ENV CUSTOM_HTTPS_PORT=6081
ENV SELKIES_IS_MANUAL_RESOLUTION_MODE=true
ENV SELKIES_MANUAL_WIDTH=1920
ENV SELKIES_MANUAL_HEIGHT=1080
ENV SELKIES_USE_CSS_SCALING=true
ENV TITLE="Kortix Computer"

EXPOSE 6080 6081 3111 3210 8000 9223 9224

ENTRYPOINT ["/opt/startup.sh"]
