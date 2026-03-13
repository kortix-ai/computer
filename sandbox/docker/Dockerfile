# syntax=docker/dockerfile:1.7
#
# kortix/computer — sandbox image
#
# ONE image. Everything baked at build time. No OTA, no npm, no symlinks.
# Updates = pull new image + recreate container. User data in /workspace volume.
#
# Container layout:
#   /opt/opencode/               OpenCode config dir — agents, tools, skills, plugins, deps
#   /opt/kortix-master/          Hono proxy server + deps
#   /opt/opencode-channels/      Chat SDK + deps
#   /opt/opencode-agent-triggers/ Trigger definitions
#   /opt/agent-browser-viewer/   Browser viewer HTML
#   /opt/kortix/                 Version metadata, service spec, changelog
#
# Source layout (sandbox/):
#   kortix-master/               Hono proxy + service-spec.json
#   s6-services/                 s6-rc.d longrun services (+ browser viewer HTML)
#   init-scripts/                /custom-cont-init.d boot scripts (95-98)
#   docker/                      Dockerfile, compose files, .env
#   startup.sh                   Container entrypoint
#

# ── Stage 1: Build musl-compatible bun-pty Rust library ─────────────────────
FROM rust:alpine AS rust-pty-builder
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache musl-dev gcc git
RUN git clone --depth 1 https://github.com/sursaone/bun-pty.git /build/bun-pty
WORKDIR /build/bun-pty/rust-pty
RUN sed -i 's/crate-type = \["cdylib"\]/crate-type = ["staticlib"]/' Cargo.toml
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release
RUN gcc -shared -o /build/librust_pty.so \
    -Wl,--whole-archive target/release/librust_pty.a -Wl,--no-whole-archive \
    -lpthread -ldl -lutil -lm

# ── Stage 2: Main image ─────────────────────────────────────────────────────
FROM lscr.io/linuxserver/webtop:latest

ARG SANDBOX_VERSION=0.0.0-dev

# ── License ──────────────────────────────────────────────────────────────────
COPY LICENSE /LICENSE

# ── OS packages ──────────────────────────────────────────────────────────────
RUN --mount=type=cache,target=/var/cache/apk \
    apk update \
    && apk add --no-cache \
        nodejs npm rsync \
        python3-dev py3-pip py3-virtualenv \
        curl unzip ca-certificates \
        gcc g++ musl-dev linux-headers \
        libffi-dev libxml2-dev libxslt-dev \
        gcompat \
        openssh-server openssh-sftp-server \
        bash-completion \
    && rm -rf /var/cache/apk/*

# ── Bun runtime ───────────────────────────────────────────────────────────────
ENV BUN_INSTALL=/opt/bun
RUN for i in 1 2 3; do curl -fsSL https://bun.sh/install | bash && break || sleep 5; done \
    && test -x /opt/bun/bin/bun \
    && ln -sf /opt/bun/bin/bun /usr/local/bin/bun
RUN mkdir -p /opt/bun/install/cache && chmod -R 777 /opt/bun

# ── uv (Python package runner) ───────────────────────────────────────────────
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# ── bun-pty musl .so ──────────────────────────────────────────────────────────
COPY --from=rust-pty-builder /build/librust_pty.so /opt/bun-pty-musl/librust_pty.so
RUN chmod 644 /opt/bun-pty-musl/librust_pty.so
ENV BUN_PTY_LIB=/opt/bun-pty-musl/librust_pty.so

# ── Workspace ───────────────────────────────────────────────────────────────
RUN mkdir -p /workspace/.agent-browser /workspace/.browser-profile \
    /workspace/.lss /workspace/.cache/opencode /workspace/presentations \
    /workspace/.local/share/opencode /workspace/.local/share/opencode/log \
    /workspace/.local/share/opencode/storage /workspace/.local/share/opencode/snapshot \
    /workspace/.XDG /workspace/.config \
    /workspace/.kortix \
    /workspace/.secrets \
    /workspace/.opencode /workspace/.opencode/skills \
    && chmod 700 /workspace/.secrets \
    && chown -R 1000:1000 /workspace \
    && rm -rf /config \
    && ln -s /workspace /config \
    && git config --system --add safe.directory '*'
WORKDIR /workspace
ENV KORTIX_WORKSPACE=/workspace

# ── Services (s6-rc.d longrun) ──────────────────────────────────────────────
COPY sandbox/s6-services/ /etc/s6-overlay/s6-rc.d/
RUN for svc in svc-kortix-master svc-sshd; do \
        touch "/etc/s6-overlay/s6-rc.d/user/contents.d/${svc}"; \
    done \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-*/run

# Silence spammy base-image desktop finish script
RUN printf '#!/bin/bash\nPID_FILE="/de-pid"\nif [ ! -r "$PID_FILE" ]; then exit 0; fi\nPARENT_PID=$(cat "$PID_FILE")\nif [ -z "$PARENT_PID" ]; then rm -f "$PID_FILE"; exit 0; fi\nPIDS=$(pstree -p "$PARENT_PID" 2>/dev/null | grep -o "([0-9]\\+)" | grep -o "[0-9]\\+" | grep -v "^${PARENT_PID}$")\n[ -n "$PIDS" ] && echo "$PIDS" | xargs kill -TERM -- 2>/dev/null && sleep 1\nrm -f "$PID_FILE"\nexit 0\n' > /etc/s6-overlay/s6-rc.d/svc-de/finish \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-de/finish

# ── Container init scripts ───────────────────────────────────────────────────
RUN mkdir -p /custom-cont-init.d
COPY sandbox/init-scripts/95-setup-sshd.sh /custom-cont-init.d/95-setup-sshd
COPY sandbox/init-scripts/96-fix-bun-pty.sh /custom-cont-init.d/96-fix-bun-pty
COPY sandbox/init-scripts/97-secrets-to-s6-env.sh /custom-cont-init.d/97-secrets-to-s6-env
COPY sandbox/init-scripts/kortix-env-setup.sh /custom-cont-init.d/98-kortix-env
RUN chmod +x /custom-cont-init.d/*

# ── Copy source packages to build staging area ──────────────────────────────
COPY sandbox/kortix-master  /opt/build/kortix-master
COPY sandbox/s6-services/svc-agent-browser-viewer/index.html /opt/build/browser-viewer/index.html
COPY sandbox/package.json   /opt/build/package.json
COPY sandbox/CHANGELOG.json /opt/build/CHANGELOG.json
COPY packages/kortix-opencode         /opt/build/kortix-opencode
COPY packages/opencode-channels      /opt/build/opencode-channels
COPY packages/opencode-agent-triggers /opt/build/opencode-agent-triggers

# ── Build sandbox runtime ────────────────────────────────────────────────────
RUN set -e && echo "[docker] Building sandbox runtime v${SANDBOX_VERSION}..." && \
    \
    # ── 1. Wire file: dependency for Docker layout ── \
    cd /opt/build/kortix-master && \
    sed -i 's|"@kortix/opencode-agent-triggers": "[^"]*"|"@kortix/opencode-agent-triggers": "file:../opencode-agent-triggers"|' package.json && \
    \
    # ── 2. kortix-master ── \
    mkdir -p /opt/kortix-master && \
    rsync -a --exclude=node_modules --exclude=bun.lock \
      /opt/build/kortix-master/ /opt/kortix-master/ && \
    cd /opt/kortix-master && bun install && \
    \
    # ── 3. opencode-channels ── \
    mkdir -p /opt/opencode-channels && \
    rsync -a --exclude=node_modules --exclude=bun.lock --exclude=.git \
      /opt/build/opencode-channels/ /opt/opencode-channels/ && \
    cd /opt/opencode-channels && bun install && \
    \
    # ── 4. opencode-agent-triggers ── \
    mkdir -p /opt/opencode-agent-triggers && \
    rsync -a --exclude=node_modules --exclude=bun.lock --exclude=.git \
      /opt/build/opencode-agent-triggers/ /opt/opencode-agent-triggers/ && \
    \
    # ── 5. opencode config (kortix-opencode IS the config dir) ── \
    mkdir -p /opt/opencode && \
    rsync -a --exclude=node_modules --exclude=bun.lock --exclude=.git \
      --exclude=tests --exclude=infra --exclude=docs --exclude=README.md \
      /opt/build/kortix-opencode/ /opt/opencode/ && \
    # Wire triggers dependency for container layout \
    sed -i 's|"@kortix/opencode-agent-triggers": "[^"]*"|"@kortix/opencode-agent-triggers": "file:../opencode-agent-triggers"|' /opt/opencode/package.json && \
    cd /opt/opencode && bun install && \
    bash /opt/opencode/patches/apply.sh /opt/opencode && \
    \
    # ── 6. Binary patches ── \
    if [ -f /opt/opencode/patches/patch-opencode-streaming.js ]; then \
      node /opt/opencode/patches/patch-opencode-streaming.js || true; \
    fi && \
    \
    # ── 7. bun-pty musl patches ── \
    ARCH=$(uname -m) && \
    for PTY_DIR in \
        /opt/opencode/node_modules/bun-pty/rust-pty/target/release \
        /opt/bun/install/cache/bun-pty@*/rust-pty/target/release; do \
      [ -d "$PTY_DIR" ] || continue; \
      if [ "$ARCH" = "x86_64" ]; then \
        cp /opt/bun-pty-musl/librust_pty.so "$PTY_DIR/librust_pty.so"; \
      else \
        cp /opt/bun-pty-musl/librust_pty.so "$PTY_DIR/librust_pty_arm64.so"; \
      fi; \
    done && \
    \
    # ── 8. Agent browser viewer ── \
    mkdir -p /opt/agent-browser-viewer && \
    rsync -a --delete /opt/build/browser-viewer/ /opt/agent-browser-viewer/ && \
    \
    # ── 9. Version metadata + core contract ── \
    mkdir -p /opt/kortix/core && \
    echo "{\"version\":\"${SANDBOX_VERSION}\",\"updatedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /opt/kortix/.version && \
    cp /opt/build/CHANGELOG.json /opt/kortix/CHANGELOG.json 2>/dev/null || true && \
    cp /opt/build/kortix-master/service-spec.json /opt/kortix/core/service-spec.json && \
    \
    # ── 10. Global binary symlinks ── \
    cd /opt/build && npm install --no-audit --no-fund . && \
    for bin in opencode agent-browser ocx; do \
      SRC="/opt/build/node_modules/.bin/$bin"; \
      [ -f "$SRC" ] && ln -sf "$SRC" "/usr/local/bin/$bin"; \
    done && \
    \
    # ── 11. Remove stale opencode-ai bun cache ── \
    rm -f /opt/build/node_modules/opencode-ai/bin/.opencode 2>/dev/null || true && \
    \
    # ── 12. Fix ownership ── \
    chown -R 1000:1000 /opt/kortix-master /opt/opencode /opt/kortix \
      /opt/opencode-agent-triggers /opt/agent-browser-viewer /opt/opencode-channels \
      2>/dev/null || true && \
    \
    # ── 13. Cleanup ── \
    rm -rf /root/.npm/_cacache /root/.npm/_logs 2>/dev/null || true && \
    echo "[docker] Build complete."

# ── Startup entrypoint ────────────────────────────────────────────────────────
COPY sandbox/startup.sh /opt/startup.sh
RUN chmod +x /opt/startup.sh

# ── Environment ───────────────────────────────────────────────────────────────
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV AGENT_BROWSER_PRIMARY_SESSION=default
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_HEADED=1
ENV AGENT_BROWSER_PROFILE=/workspace/.browser-profile
ENV AGENT_BROWSER_SOCKET_DIR=/workspace/.agent-browser
ENV AGENT_BROWSER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-gpu,--disable-dev-shm-usage,--disable-blink-features=AutomationControlled,--disable-features=VizDisplayCompositor"
ENV AGENT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
ENV OPENCODE_CONFIG_DIR=/opt/opencode
ENV SANDBOX_VERSION=${SANDBOX_VERSION}

# ── Desktop config ───────────────────────────────────────────────────────────
ENV CUSTOM_PORT=6080
ENV CUSTOM_HTTPS_PORT=6081
ENV SELKIES_IS_MANUAL_RESOLUTION_MODE=true
ENV SELKIES_MANUAL_WIDTH=1920
ENV SELKIES_MANUAL_HEIGHT=1080
ENV SELKIES_USE_CSS_SCALING=true
ENV TITLE="Kortix Computer"

EXPOSE 22 3456 6080 6081 3111 3210 8000 9223 9224

ENTRYPOINT ["/opt/startup.sh"]
