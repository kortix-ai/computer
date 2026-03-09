FROM oven/bun:1.3

WORKDIR /app

# Copy package files first for layer caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source and tests
COPY tsconfig.json ./
COPY src/ ./src/
COPY test/ ./test/

# Ensure writable dirs for SQLite + LSS
RUN mkdir -p /root/.kortix/mem /tmp

# Default: run all tests
CMD ["bun", "test", "--verbose"]
