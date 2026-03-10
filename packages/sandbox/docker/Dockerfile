# syntax=docker/dockerfile:1.7
#
# kortix/computer — stable OS base image
#
# This image contains ONLY the OS-level dependencies that change infrequently:
#   - Alpine apk packages (runtimes, build tools)
#   - Bun runtime
#   - uv (Python package runner)
#   - Rust/musl build of librust_pty.so (bun-pty compatibility on Alpine)
#   - Branding assets, workspace dirs, s6 service registration
#
# ALL Kortix-specific code (kortix-master, opencode, kortix-oc, agent-browser,
# portless, opencode-channels, python packages, CHANGELOG, version file) is
# installed at container boot time by @kortix/sandbox postinstall.sh.
#
# Release flow:
#   Code change  →  npm publish @kortix/sandbox  →  done (no Docker rebuild needed)
#   OS dep change →  rebuild + push this image    →  then npm publish
#

# ── Stage 1: Build musl-compatible bun-pty Rust library ─────────────────────
# bun-pty ships glibc-linked .so files, but our sandbox runs Alpine (musl).
# Rust's musl target doesn't support cdylib directly, so we:
#   1. Build a staticlib (.a) on Alpine with Rust
#   2. Wrap it into a shared library (.so) using gcc
FROM rust:alpine AS rust-pty-builder
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache musl-dev gcc git
RUN git clone --depth 1 https://github.com/sursaone/bun-pty.git /build/bun-pty
WORKDIR /build/bun-pty/rust-pty
# Change crate-type from cdylib to staticlib for musl compatibility
RUN sed -i 's/crate-type = \["cdylib"\]/crate-type = ["staticlib"]/' Cargo.toml
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release
# Wrap the static lib into a shared .so using gcc
RUN gcc -shared -o /build/librust_pty.so \
    -Wl,--whole-archive target/release/librust_pty.a -Wl,--no-whole-archive \
    -lpthread -ldl -lutil -lm

# ── Stage 2: Main image ─────────────────────────────────────────────────────
FROM lscr.io/linuxserver/webtop:latest

# ── License ──────────────────────────────────────────────────────────────────
COPY LICENSE /LICENSE

# ── Branding ─────────────────────────────────────────────────────────────────
COPY packages/sandbox/assets/wallpaper.png             /usr/share/wallpapers/heyagi/wallpaper.png
COPY packages/sandbox/assets/kortix-symbol.svg         /usr/share/icons/heyagi/kortix-symbol.svg
COPY packages/sandbox/assets/kortix-symbol-white.svg   /usr/share/icons/heyagi/kortix-symbol-white.svg

# ── OS packages ──────────────────────────────────────────────────────────────
# Alpine XFCE base includes: chromium, xfce4-terminal, python3, git, bash, pillow.
# Install Node.js + npm from Alpine repos, plus build dependencies needed
# for pip packages with C extensions (numpy, lxml, greenlet).
RUN --mount=type=cache,target=/var/cache/apk \
    apk update \
    && apk add --no-cache \
        nodejs npm \
        python3-dev py3-pip py3-virtualenv \
        curl unzip ca-certificates \
        gcc g++ musl-dev linux-headers \
        libffi-dev libxml2-dev libxslt-dev \
        gcompat \
        openssh-server openssh-sftp-server \
        bash-completion \
    && rm -rf /var/cache/apk/*

# ── Bun runtime ───────────────────────────────────────────────────────────────
# Install bun to /opt/bun (NOT /workspace which is a volume mount at runtime)
ENV BUN_INSTALL=/opt/bun
RUN for i in 1 2 3; do curl -fsSL https://bun.sh/install | bash && break || sleep 5; done \
    && test -x /opt/bun/bin/bun \
    && ln -sf /opt/bun/bin/bun /usr/local/bin/bun

# Make bun install dir/cache writable by any user (abc UID changes at runtime via PUID)
RUN mkdir -p /opt/bun/install/cache && chmod -R 777 /opt/bun

# ── uv (Python package runner — 10-100x faster than pip) ─────────────────────
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# ── bun-pty musl .so ──────────────────────────────────────────────────────────
# Replace glibc-linked bun-pty .so with musl-compiled version from builder stage.
# Stored at /opt/bun-pty-musl/ — postinstall.sh and 96-fix-bun-pty.sh patch
# the actual opencode node_modules at boot time.
COPY --from=rust-pty-builder /build/librust_pty.so /opt/bun-pty-musl/librust_pty.so
RUN chmod 644 /opt/bun-pty-musl/librust_pty.so

# Tell bun-pty to load our musl-compiled .so directly, bypassing its path resolution.
# This ENV is inherited by ALL processes in the container — including the Go binary's
# Bun subprocess that actually loads bun-pty at runtime.
ENV BUN_PTY_LIB=/opt/bun-pty-musl/librust_pty.so

# ── Workspace ───────────────────────────────────────────────────────────────
RUN mkdir -p /workspace/.agent-browser /workspace/.browser-profile \
    /workspace/.lss /workspace/.cache/opencode /workspace/presentations \
    /workspace/.local/share/opencode /workspace/.local/share/opencode/log \
    /workspace/.local/share/opencode/storage /workspace/.local/share/opencode/snapshot \
    /workspace/.XDG /workspace/.config \
    /workspace/.kortix \
    /workspace/.secrets \
    && chmod 700 /workspace/.secrets \
    && chown -R 1000:1000 /workspace \
    && rm -rf /config \
    && ln -s /workspace /config \
    && git config --system --add safe.directory '*'
WORKDIR /workspace
ENV KORTIX_WORKSPACE=/workspace

# ── Services (s6-rc.d longrun) ──────────────────────────────────────────────
# Alpine webtop uses s6-overlay v3 with s6-rc.d instead of services.d.
# Each service is a directory with: run, type (longrun), dependencies.d/init-services
COPY packages/sandbox/s6-services/ /etc/s6-overlay/s6-rc.d/
# Register all custom services in the user bundle so s6 starts them
RUN for svc in svc-kortix-master svc-sshd; do \
        touch "/etc/s6-overlay/s6-rc.d/user/contents.d/${svc}"; \
    done \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-*/run

# ── Silence spammy base-image desktop finish script ──────────────────────────
# The webtop base image's svc-de service crashes in a loop because its run
# script uses `exec ... &` (backgrounding after exec). On each restart the
# finish script prints "No desktop processes found to terminate." endlessly.
RUN printf '#!/bin/bash\nPID_FILE="/de-pid"\n\
if [ ! -r "$PID_FILE" ]; then exit 0; fi\n\
PARENT_PID=$(cat "$PID_FILE")\n\
if [ -z "$PARENT_PID" ]; then rm -f "$PID_FILE"; exit 0; fi\n\
PIDS=$(pstree -p "$PARENT_PID" 2>/dev/null | grep -o "([0-9]\\+)" | grep -o "[0-9]\\+" | grep -v "^${PARENT_PID}$")\n\
[ -n "$PIDS" ] && echo "$PIDS" | xargs kill -TERM -- 2>/dev/null && sleep 1\n\
rm -f "$PID_FILE"\nexit 0\n' > /etc/s6-overlay/s6-rc.d/svc-de/finish \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-de/finish

# ── Container init scripts (s6 cont-init.d) ─────────────────────────────────
RUN mkdir -p /custom-cont-init.d
COPY packages/sandbox/config/95-setup-sshd.sh /custom-cont-init.d/95-setup-sshd
RUN chmod +x /custom-cont-init.d/95-setup-sshd
COPY packages/sandbox/config/96-fix-bun-pty.sh /custom-cont-init.d/96-fix-bun-pty
RUN chmod +x /custom-cont-init.d/96-fix-bun-pty
COPY packages/sandbox/config/97-secrets-to-s6-env.sh /custom-cont-init.d/97-secrets-to-s6-env
RUN chmod +x /custom-cont-init.d/97-secrets-to-s6-env
COPY packages/sandbox/config/kortix-env-setup.sh /custom-cont-init.d/98-kortix-env
RUN chmod +x /custom-cont-init.d/98-kortix-env
COPY packages/sandbox/config/customize.sh /custom-cont-init.d/99-customize
RUN chmod +x /custom-cont-init.d/99-customize

# ── Daytona / startup entrypoint ──────────────────────────────────────────────
COPY packages/sandbox/startup.sh /opt/startup.sh
RUN chmod +x /opt/startup.sh

# ── agent-browser ENV (browser path set by agent-browser install at boot) ─────
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV AGENT_BROWSER_PRIMARY_SESSION=default
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_HEADED=1
ENV AGENT_BROWSER_PROFILE=/workspace/.browser-profile
ENV AGENT_BROWSER_SOCKET_DIR=/workspace/.agent-browser
ENV AGENT_BROWSER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-gpu,--disable-dev-shm-usage,--disable-blink-features=AutomationControlled,--disable-features=VizDisplayCompositor"
ENV AGENT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# ── OpenCode config dir ───────────────────────────────────────────────────────
ENV OPENCODE_CONFIG_DIR=/opt/opencode

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
