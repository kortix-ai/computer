FROM lscr.io/linuxserver/webtop:ubuntu-kde

# ── Branding ────────────────────────────────────────────────────────────────
COPY sandbox/assets/wallpaper.png       /usr/share/wallpapers/heyagi/wallpaper.png
COPY sandbox/assets/kortix-symbol.svg   /usr/share/icons/heyagi/kortix-symbol.svg
COPY sandbox/assets/kortix-symbol-white.svg /usr/share/icons/heyagi/kortix-symbol-white.svg

# ── Runtimes ────────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv curl unzip nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install bun to /opt/bun (NOT /config which is a volume mount at runtime)
ENV BUN_INSTALL=/opt/bun
RUN for i in 1 2 3; do curl -fsSL https://bun.sh/install | bash && break || sleep 5; done \
    && test -x /opt/bun/bin/bun \
    && ln -sf /opt/bun/bin/bun /usr/local/bin/bun

# Split pip + playwright into separate layers for better caching on retries
RUN pip3 install --break-system-packages --timeout=120 --retries=3 \
        playwright==1.58.0 pypdf2==3.0.1 python-pptx==1.0.2 pillow==12.1.0

# Install uv (Python package runner) — used by presentation-gen tool scripts
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# ── LSS (Local Semantic Search + file-watcher sync) ─────────────────────────
# Install from PyPI. Provides: `lss` (search CLI), `lss-sync` (file-watcher daemon)
# https://pypi.org/project/local-semantic-search/
RUN pip3 install --break-system-packages local-semantic-search

# Skip `playwright install` — we use the system chromium at /usr/bin/chromium
# (scripts pass executable_path="/usr/bin/chromium" to playwright.launch)

# ── Agent Browser (headless browser automation for AI agents) ────────────────
# Install globally, skip `agent-browser install` (which downloads a second
# Chromium). Point at the system chromium via AGENT_BROWSER_EXECUTABLE_PATH.
# Patch: the Rust CLI sends a launch command to the Node.js daemon but doesn't
# include executablePath in the JSON — we patch handleLaunch to read the env var.
RUN npm install -g agent-browser
COPY sandbox/patch-agent-browser.js /tmp/patch-agent-browser.js
RUN node /tmp/patch-agent-browser.js && rm /tmp/patch-agent-browser.js
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
# No fixed AGENT_BROWSER_SESSION — agents must always set --session with a
# unique name. AGENT_BROWSER_PROFILE is only applied when the session name
# matches AGENT_BROWSER_PRIMARY_SESSION (checked in our patches).
ENV AGENT_BROWSER_PRIMARY_SESSION=kortix
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_PROFILE=/config/.browser-profile
ENV AGENT_BROWSER_SOCKET_DIR=/config/.agent-browser
# Browser args: required flags + stealth flags to reduce bot fingerprinting
ENV AGENT_BROWSER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-gpu,--disable-dev-shm-usage,--disable-blink-features=AutomationControlled,--disable-features=VizDisplayCompositor,--window-size=1920,1080"
# Default User-Agent — looks like a real desktop Chrome on Windows
ENV AGENT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# ── Agent Browser Viewer (watch the browser session from your Mac) ───────────
COPY sandbox/assets/browser-viewer/ /opt/agent-browser-viewer/

# ── OpenCode CLI ────────────────────────────────────────────────────────────
# Install via npm (simplest, works for all users out of the box)
RUN npm install -g opencode-ai

# ── OpenCode (agents, tools, skills) ────────────────────────────────────────
COPY sandbox/opencode/ /opt/opencode/
RUN cd /opt/opencode && bun install
ENV OPENCODE_CONFIG_DIR=/opt/opencode

# Make opencode config dir + bun cache writable by abc (UID 1000)
# so plugins can install/update at runtime
RUN chown -R 1000:1000 /opt/opencode \
    && chmod -R 777 /opt/bun/install

# ── Kortix Master (proxy to OpenCode + secret store) ────────────────────────
COPY sandbox/kortix-master/package.json /opt/kortix-master/package.json
RUN cd /opt/kortix-master && bun install
COPY sandbox/kortix-master/ /opt/kortix-master/

# Create secrets directory with proper permissions
RUN mkdir -p /app/secrets && chmod 700 /app/secrets

# ── Workspace ───────────────────────────────────────────────────────────────
# Give abc (UID 1000) full ownership of /config so opencode can create any
# directories it needs (presentations, output, etc.) without permission errors.
RUN mkdir -p /config/workspace /config/Desktop /config/.agent-browser /config/.browser-profile \
    /config/.lss \
    && chown -R 1000:1000 /config
WORKDIR /config/Desktop

# ── Services (s6-overlay) ───────────────────────────────────────────────────
# All background services: opencode-web, opencode-serve, kortix-master,
# lss-sync, agent-browser-viewer, presentation-viewer
COPY sandbox/services/ /etc/services.d/
RUN chmod +x /etc/services.d/*/run

# ── Container init scripts (s6 cont-init.d) ─────────────────────────────────
# 98-kortix-env: cloud-mode SDK URL routing (must run before services start)
COPY sandbox/config/kortix-env-setup.sh /custom-cont-init.d/98-kortix-env
RUN chmod +x /custom-cont-init.d/98-kortix-env

# 99-customize: Desktop customization (KDE wallpaper, icons, etc.)
COPY sandbox/config/customize.sh /custom-cont-init.d/99-customize
RUN chmod +x /custom-cont-init.d/99-customize

# ── Daytona entrypoint ───────────────────────────────────────────────────────
# Daytona runs its own agent as PID 1, so s6-overlay can't run (requires PID 1).
# startup.sh uses `unshare --pid --fork /init` to run s6 in a PID namespace.
COPY sandbox/startup.sh /opt/startup.sh
RUN chmod +x /opt/startup.sh

# ── Desktop config ───────────────────────────────────────────────────────────
# Move noVNC/desktop from default 3000/3001 to 6080/6081 so it matches
# our docker-compose and doesn't clash with app ports.
ENV CUSTOM_PORT=6080
ENV CUSTOM_HTTPS_PORT=6081
# Default screen resolution (1920x1080) and window title
ENV SELKIES_MANUAL_WIDTH=1920
ENV SELKIES_MANUAL_HEIGHT=1080
ENV TITLE="HeyAGI Sandbox"

# Expose ports: Desktop (6080/6081), OpenCode Web (3111), Kortix Master (8000),
# Presentation Viewer (3210), Agent Browser (9223/9224)
EXPOSE 6080 6081 3111 3210 8000 9223 9224
