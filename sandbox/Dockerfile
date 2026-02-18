# ── Stage 1: Build musl-compatible bun-pty Rust library ─────────────────────
# bun-pty ships glibc-linked .so files, but our sandbox runs Alpine (musl).
# Rust's musl target doesn't support cdylib directly, so we:
#   1. Build a staticlib (.a) on Alpine with Rust
#   2. Wrap it into a shared library (.so) using gcc
FROM rust:alpine AS rust-pty-builder
RUN apk add --no-cache musl-dev gcc git
RUN git clone --depth 1 https://github.com/sursaone/bun-pty.git /build/bun-pty
WORKDIR /build/bun-pty/rust-pty
# Change crate-type from cdylib to staticlib for musl compatibility
RUN sed -i 's/crate-type = \["cdylib"\]/crate-type = ["staticlib"]/' Cargo.toml
RUN cargo build --release
# Wrap the static lib into a shared .so using gcc
RUN gcc -shared -o /build/librust_pty.so \
    -Wl,--whole-archive target/release/librust_pty.a -Wl,--no-whole-archive \
    -lpthread -ldl -lutil -lm

# ── Stage 2: Main image ─────────────────────────────────────────────────────
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
        gcompat \
    && rm -rf /var/cache/apk/*

# Install bun to /opt/bun (NOT /workspace which is a volume mount at runtime)
ENV BUN_INSTALL=/opt/bun
RUN for i in 1 2 3; do curl -fsSL https://bun.sh/install | bash && break || sleep 5; done \
    && test -x /opt/bun/bin/bun \
    && ln -sf /opt/bun/bin/bun /usr/local/bin/bun

# pip packages — versions read from sandbox/package.json (single source of truth)
# COPY is done later for agent-browser; we need it now for pip versions too.
COPY sandbox/package.json /tmp/sandbox-pkg-versions.json
RUN PIP_ARGS=$(node -e " \
      const p=require('/tmp/sandbox-pkg-versions.json'); \
      const deps=p.kortix?.pythonDependencies||{}; \
      const args=[]; \
      for(const[pkg,ver] of Object.entries(deps)){ \
        if(pkg==='playwright') continue; \
        args.push(ver==='latest'?pkg:pkg+'=='+ver); \
      } \
      console.log(args.join(' '));" 2>/dev/null) \
    && pip3 install --break-system-packages --timeout=120 --retries=3 $PIP_ARGS \
    && PW_VERSION=$(node -e "const p=require('/tmp/sandbox-pkg-versions.json');console.log(p.kortix?.pythonDependencies?.playwright||'1.58.0')" 2>/dev/null) \
    && SITE=$(python3 -c "import site; print(site.getsitepackages()[0])") \
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then PW_PLAT=manylinux1_x86_64; \
       else PW_PLAT=manylinux_2_17_aarch64; fi \
    && pip3 install --platform "$PW_PLAT" --only-binary :all: \
        --no-deps --target /tmp/pw "playwright==$PW_VERSION" \
    && cp -r /tmp/pw/playwright* "$SITE/" \
    && rm -rf /tmp/pw \
    && python3 -c "from playwright.sync_api import sync_playwright; print('playwright OK')"

# Install uv (Python package runner) — used by presentation-gen tool scripts
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# Remove build-only deps to save space (keep runtime libs)
RUN apk del gcc g++ musl-dev linux-headers python3-dev libffi-dev \
        libxml2-dev libxslt-dev \
    && rm -rf /var/cache/apk/*

# Skip `playwright install` — we use the system chromium at /usr/bin/chromium-browser

# ── Agent Browser (headless browser automation for AI agents) ────────────────
# Initial install for Docker image; postinstall.sh handles version updates.
# /tmp/sandbox-pkg-versions.json already COPY'd above for pip versions.
RUN AB_VERSION=$(node -e "const p=require('/tmp/sandbox-pkg-versions.json');console.log(p.dependencies['agent-browser']||'latest')" 2>/dev/null || echo "latest") \
    && npm install -g "agent-browser@$AB_VERSION"
COPY sandbox/patch-agent-browser.js /tmp/patch-agent-browser.js
RUN node /tmp/patch-agent-browser.js && rm /tmp/patch-agent-browser.js
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV AGENT_BROWSER_PRIMARY_SESSION=kortix
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_PROFILE=/workspace/.browser-profile
ENV AGENT_BROWSER_SOCKET_DIR=/workspace/.agent-browser
ENV AGENT_BROWSER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-gpu,--disable-dev-shm-usage,--disable-blink-features=AutomationControlled,--disable-features=VizDisplayCompositor"
ENV AGENT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# ── Agent Browser Viewer (watch the browser session from your Mac) ───────────
COPY sandbox/browser-viewer/ /opt/agent-browser-viewer/

# ── OpenCode CLI ────────────────────────────────────────────────────────────
# Initial install for Docker image; postinstall.sh handles version updates.
# npm installs the glibc binary by default; force-install the musl variant
# and symlink it over the glibc one so the wrapper script finds it.
# Falls back to "latest" if the pinned version isn't on npm yet (e.g. Docker
# build runs before or without CLI publish).
RUN CLI_VERSION=$(node -e "const p=require('/tmp/sandbox-pkg-versions.json');console.log(p.dependencies['@kortix/opencode-ai']||'latest')" 2>/dev/null || echo "latest") \
    && echo "Attempting CLI install @kortix/opencode-ai@$CLI_VERSION..." \
    && if ! npm view "@kortix/opencode-ai@$CLI_VERSION" version >/dev/null 2>&1; then \
         echo "Version $CLI_VERSION not on npm — falling back to latest"; \
         CLI_VERSION="latest"; \
       fi \
    && npm install -g "@kortix/opencode-ai@$CLI_VERSION" \
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then \
         npm install -g "@kortix/opencode-ai-linux-x64-musl@$CLI_VERSION" --force \
         && MUSL_BIN=$(npm root -g)/@kortix/opencode-ai-linux-x64-musl/bin/opencode \
         && GLIBC_BIN=$(npm root -g)/@kortix/opencode-ai/node_modules/@kortix/opencode-ai-linux-x64/bin/opencode \
         && ln -sf "$MUSL_BIN" "$GLIBC_BIN"; \
       else \
         npm install -g "@kortix/opencode-ai-linux-arm64-musl@$CLI_VERSION" --force \
         && MUSL_BIN=$(npm root -g)/@kortix/opencode-ai-linux-arm64-musl/bin/opencode \
         && GLIBC_BIN=$(npm root -g)/@kortix/opencode-ai/node_modules/@kortix/opencode-ai-linux-arm64/bin/opencode \
         && ln -sf "$MUSL_BIN" "$GLIBC_BIN"; \
       fi \
    && rm /tmp/sandbox-pkg-versions.json \
    && opencode --version

# ── OpenCode (agents, tools, skills) ────────────────────────────────────────
# Use --chown on COPY to avoid a separate chown layer (saves ~320MB duplication).
# UID 1000 matches PUID=1000 set in docker-compose (init-adduser remaps abc to this).
COPY --chown=1000:1000 sandbox/opencode/ /opt/opencode/
RUN cd /opt/opencode && bun install

# Replace glibc-linked bun-pty .so with musl-compiled version from builder stage.
# bun-pty ships .so files compiled against glibc, but Alpine uses musl.
# We must replace the .so in ALL locations where bun-pty exists:
#   1. /opt/opencode/node_modules/bun-pty/          (installed by bun install)
#   2. /opt/bun/install/cache/bun-pty@*/             (Bun's global cache)
# The workspace copy (/workspace/.cache/opencode/) lives on a Docker volume
# and is patched at startup by the 96-fix-bun-pty script below.
COPY --from=rust-pty-builder /build/librust_pty.so /opt/bun-pty-musl/librust_pty.so
RUN ARCH=$(uname -m) \
    && for PTY_DIR in \
         /opt/opencode/node_modules/bun-pty/rust-pty/target/release \
         /opt/bun/install/cache/bun-pty@*/rust-pty/target/release; do \
         [ -d "$PTY_DIR" ] || continue; \
         if [ "$ARCH" = "x86_64" ]; then \
           cp /opt/bun-pty-musl/librust_pty.so "$PTY_DIR/librust_pty.so"; \
         else \
           cp /opt/bun-pty-musl/librust_pty.so "$PTY_DIR/librust_pty_arm64.so"; \
         fi; \
       done \
    && chmod 644 /opt/bun-pty-musl/librust_pty.so

ENV OPENCODE_CONFIG_DIR=/opt/opencode
# Tell bun-pty to load our musl-compiled .so directly, bypassing its path resolution.
# This ENV is inherited by ALL processes in the container — including the Go binary's
# Bun subprocess that actually loads bun-pty at runtime.
ENV BUN_PTY_LIB=/opt/bun-pty-musl/librust_pty.so

# Make bun cache writable by any user (abc UID changes at runtime via PUID)
RUN chmod -R 777 /opt/bun/install

# ── Kortix Master (proxy to OpenCode + secret store) ────────────────────────
COPY sandbox/kortix-master/package.json /opt/kortix-master/package.json
RUN cd /opt/kortix-master && bun install
COPY sandbox/kortix-master/ /opt/kortix-master/

# ── Version & Changelog (for live update system) ────────────────────────────
# Read version from sandbox/package.json (single source of truth) and write .version
COPY sandbox/package.json /tmp/sandbox-pkg.json
COPY sandbox/CHANGELOG.json /opt/kortix/CHANGELOG.json
RUN mkdir -p /opt/kortix \
    && PKG_VERSION=$(node -e "console.log(require('/tmp/sandbox-pkg.json').version)") \
    && echo "{\"version\":\"$PKG_VERSION\",\"updatedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /opt/kortix/.version \
    && rm /tmp/sandbox-pkg.json \
    && chown -R 1000:1000 /opt/kortix

# Create secrets directory (init-adduser will chown /app to abc at runtime)
RUN mkdir -p /app/secrets && chmod 700 /app/secrets

# ── Workspace ───────────────────────────────────────────────────────────────
RUN mkdir -p /workspace/.kortix /workspace/.kortix/mem /workspace/.agent-browser /workspace/.browser-profile \
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
COPY sandbox/config/96-fix-bun-pty.sh /custom-cont-init.d/96-fix-bun-pty
RUN chmod +x /custom-cont-init.d/96-fix-bun-pty
COPY sandbox/config/97-secrets-to-s6-env.sh /custom-cont-init.d/97-secrets-to-s6-env
RUN chmod +x /custom-cont-init.d/97-secrets-to-s6-env
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
