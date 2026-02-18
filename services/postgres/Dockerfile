# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Kortix PostgreSQL — pg_cron + pg_net                                      ║
# ║                                                                            ║
# ║  Custom PostgreSQL image with extensions required for local deployment:    ║
# ║    - pg_cron  — database-native cron scheduling                            ║
# ║    - pg_net   — async HTTP requests from SQL (used by pg_cron callbacks)   ║
# ║                                                                            ║
# ║  Build:  docker build -t kortix/postgres services/postgres                 ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ── Stage 1: Build pg_net from source ────────────────────────────────────────
FROM postgres:16-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    ca-certificates \
    postgresql-server-dev-16 \
    libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Clone and build pg_net (Supabase async HTTP extension)
RUN git clone --depth 1 https://github.com/supabase/pg_net.git /tmp/pg_net \
    && cd /tmp/pg_net \
    && make \
    && make install

# ── Stage 2: Final image ────────────────────────────────────────────────────
FROM postgres:16-bookworm

# Install pg_cron (available as Debian package) + libcurl runtime for pg_net
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-16-cron \
    libcurl4 \
    && rm -rf /var/lib/apt/lists/*

# Copy pg_net artifacts from builder
COPY --from=builder /usr/lib/postgresql/16/lib/pg_net.so /usr/lib/postgresql/16/lib/
COPY --from=builder /usr/share/postgresql/16/extension/pg_net* /usr/share/postgresql/16/extension/
