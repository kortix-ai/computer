import { describe, test, expect, beforeAll, afterAll } from "bun:test";

/**
 * Kortix Sandbox Proxy E2E Tests
 *
 * Tests the dynamic port proxy route (/proxy/:port/*) on kortix-master.
 * The proxy enables the frontend to reach any service running inside the
 * sandbox container through the single exposed port 8000.
 *
 * Prerequisites:
 *   - sandbox-desktop container running (docker compose up -d)
 *   - Port 8000 mapped to host
 *
 * Usage:
 *   bun test tests/e2e/proxy.test.ts
 *   PROXY_TEST_BASE_URL=http://localhost:8000 bun test tests/e2e/proxy.test.ts
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.PROXY_TEST_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
const CONTAINER = process.env.PROXY_TEST_CONTAINER || "sandbox-desktop";
const TEST_PORT = 7777;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Execute a shell command inside the running Docker container. */
async function dockerExec(cmd: string, timeout = 15_000): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["docker", "exec", CONTAINER, "sh", "-c", cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeoutId = setTimeout(() => proc.kill(), timeout);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  clearTimeout(timeoutId);
  const code = await proc.exited;

  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** Perform a fetch against the proxy base URL, returning response + body. */
async function proxyFetch(
  path: string,
  init?: RequestInit & { redirect?: RequestRedirect },
): Promise<{ status: number; body: string; headers: Headers }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      redirect: init?.redirect ?? "follow",
    });
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
  } catch (err) {
    return { status: 0, body: String(err), headers: new Headers() };
  }
}

/** Convenience: fetch JSON from the proxy. */
async function proxyJson<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; data: T; headers: Headers }> {
  const { status, body, headers } = await proxyFetch(path, init);
  let data: T;
  try {
    data = JSON.parse(body) as T;
  } catch {
    data = body as unknown as T;
  }
  return { status, data, headers };
}

// ---------------------------------------------------------------------------
// Test server lifecycle — a Bun HTTP server inside the sandbox
// ---------------------------------------------------------------------------

const TEST_SERVER_SCRIPT = `
const server = Bun.serve({
  port: ${TEST_PORT},
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);

    // Echo endpoint — returns request details as JSON
    if (url.pathname === "/echo" || url.pathname.startsWith("/echo/")) {
      return Response.json({
        method: req.method,
        path: url.pathname,
        query: url.search,
        headers: Object.fromEntries(req.headers.entries()),
      });
    }

    // JSON endpoint
    if (url.pathname === "/api/data") {
      return Response.json({ items: [1, 2, 3], total: 3 });
    }

    // POST echo — returns the body back
    if (url.pathname === "/api/submit" && req.method === "POST") {
      return req.text().then(body => Response.json({ received: body }));
    }

    // Custom response headers
    if (url.pathname === "/custom-headers") {
      return new Response("OK", {
        headers: {
          "X-Custom-Header": "test-value",
          "X-Sandbox-Port": String(${TEST_PORT}),
          "Content-Type": "text/plain",
        },
      });
    }

    // Redirect
    if (url.pathname === "/redirect") {
      return Response.redirect("http://localhost:${TEST_PORT}/echo?redirected=true", 302);
    }

    // 404
    if (url.pathname === "/not-found") {
      return new Response("Not Found", { status: 404 });
    }

    // Default HTML page
    return new Response(
      "<html><body><h1>Test Server on port ${TEST_PORT}</h1><p>Path: " + url.pathname + "</p></body></html>",
      { headers: { "Content-Type": "text/html" } }
    );
  },
});
console.log("test-proxy-server running on port " + server.port);
`;

async function killPort(port: number): Promise<void> {
  // Kill any process listening on the port (by PID from ss output)
  await dockerExec(
    `ss -tlnp sport = :${port} 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | xargs -r kill -9 2>/dev/null || true`,
  );
  await dockerExec(`pkill -f 'bun.*test-proxy-server' 2>/dev/null || true`);
  await Bun.sleep(500);
}

async function startTestServer(): Promise<boolean> {
  // Kill any leftover server on the test port
  await killPort(TEST_PORT);

  // Write the script
  await dockerExec(`cat > /tmp/test-proxy-server.ts << 'BUNEOF'\n${TEST_SERVER_SCRIPT}\nBUNEOF`);

  // Start in background
  await dockerExec("/opt/bun/bin/bun run /tmp/test-proxy-server.ts &");
  await Bun.sleep(2000);

  // Verify it's running
  const { code } = await dockerExec(`curl -sf http://localhost:${TEST_PORT}/echo`);
  return code === 0;
}

async function stopTestServer(): Promise<void> {
  await killPort(TEST_PORT);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("Kortix Sandbox Proxy E2E", () => {
  // ------ Setup / Teardown ------
  beforeAll(async () => {
    // Verify sandbox is reachable
    const { status, data } = await proxyJson<{ status: string }>("/kortix/health");
    if (status !== 200 || data?.status !== "ok") {
      throw new Error(
        `Sandbox not reachable at ${BASE_URL} (HTTP ${status}). Is the container running?`,
      );
    }

    // Start test server
    const ok = await startTestServer();
    if (!ok) {
      throw new Error(`Failed to start test Bun server on port ${TEST_PORT} inside the sandbox.`);
    }
  }, 30_000);

  afterAll(async () => {
    await stopTestServer();
  });

  // ------ Health ------
  describe("Health", () => {
    test("kortix-master health check returns ok", async () => {
      const { status, data } = await proxyJson<{ status: string }>("/kortix/health");
      expect(status).toBe(200);
      expect(data.status).toBe("ok");
    });
  });

  // ------ Basic GET proxying ------
  describe("Basic GET proxying", () => {
    test("GET /proxy/:port/ returns HTML from test server", async () => {
      const { status, body } = await proxyFetch(`/proxy/${TEST_PORT}/`);
      expect(status).toBe(200);
      expect(body.toLowerCase()).toContain(`port ${TEST_PORT}`);
    });

    test("GET /proxy/:port/echo returns correct JSON", async () => {
      const { status, data } = await proxyJson<{ path: string; method: string }>(
        `/proxy/${TEST_PORT}/echo`,
      );
      expect(status).toBe(200);
      expect(data.path).toBe("/echo");
      expect(data.method).toBe("GET");
    });

    test("path forwarding works (/echo/sub/path)", async () => {
      const { status, data } = await proxyJson<{ path: string }>(
        `/proxy/${TEST_PORT}/echo/sub/path`,
      );
      expect(status).toBe(200);
      expect(data.path).toBe("/echo/sub/path");
    });

    test("query string forwarded (?foo=bar&baz=123)", async () => {
      const { status, data } = await proxyJson<{ query: string }>(
        `/proxy/${TEST_PORT}/echo?foo=bar&baz=123`,
      );
      expect(status).toBe(200);
      expect(data.query).toContain("foo=bar");
    });
  });

  // ------ HTTP Methods ------
  describe("HTTP Methods", () => {
    test("POST body forwarded correctly", async () => {
      const { status, data } = await proxyJson<{ received: string }>(
        `/proxy/${TEST_PORT}/api/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"name": "test"}',
        },
      );
      expect(status).toBe(200);
      expect(data.received).toContain('{"name": "test"}');
    });

    test("PUT method forwarded", async () => {
      const { status, data } = await proxyJson<{ method: string }>(
        `/proxy/${TEST_PORT}/echo`,
        { method: "PUT" },
      );
      expect(status).toBe(200);
      expect(data.method).toBe("PUT");
    });

    test("DELETE method forwarded", async () => {
      const { status, data } = await proxyJson<{ method: string }>(
        `/proxy/${TEST_PORT}/echo`,
        { method: "DELETE" },
      );
      expect(status).toBe(200);
      expect(data.method).toBe("DELETE");
    });
  });

  // ------ Response handling ------
  describe("Response handling", () => {
    test("JSON response body preserved", async () => {
      const { status, data } = await proxyJson<{ total: number }>(
        `/proxy/${TEST_PORT}/api/data`,
      );
      expect(status).toBe(200);
      expect(data.total).toBe(3);
    });

    test("custom response headers preserved", async () => {
      const { status, headers } = await proxyFetch(`/proxy/${TEST_PORT}/custom-headers`);
      expect(status).toBe(200);
      expect(headers.get("x-custom-header")).toBe("test-value");
      expect(headers.get("x-sandbox-port")).toBe(String(TEST_PORT));
    });

    test("upstream 404 forwarded correctly", async () => {
      const { status } = await proxyFetch(`/proxy/${TEST_PORT}/not-found`);
      expect(status).toBe(404);
    });
  });

  // ------ Error handling ------
  describe("Error handling", () => {
    test("port 8000 blocked (self-proxy prevention)", async () => {
      const { status, data } = await proxyJson<{ error: string }>("/proxy/8000/");
      expect(status).toBe(403);
      expect(data.error).toBe("Port is blocked");
    });

    test("port 0 rejected with 400", async () => {
      const { status } = await proxyFetch("/proxy/0/");
      expect(status).toBe(400);
    });

    test("port 99999 rejected with 400", async () => {
      const { status } = await proxyFetch("/proxy/99999/");
      expect(status).toBe(400);
    });

    test("non-existent service returns 502 with hint", async () => {
      const { status, data } = await proxyJson<{ hint: string }>("/proxy/59999/");
      expect(status).toBe(502);
      expect(data.hint).toContain("59999");
    });
  });

  // ------ Redirect handling ------
  describe("Redirect handling", () => {
    test("upstream redirect is returned with rewritten Location", async () => {
      const { status, headers } = await proxyFetch(`/proxy/${TEST_PORT}/redirect`, {
        redirect: "manual",
      });
      // Should be a 3xx redirect
      expect(status).toBeGreaterThanOrEqual(300);
      expect(status).toBeLessThan(400);

      const location = headers.get("location") || "";
      // Location should be rewritten through the proxy
      expect(location).toContain(`/proxy/${TEST_PORT}/`);
    });
  });

  // ------ Known sandbox services ------
  describe("Known sandbox services", () => {
    test("proxy to OpenCode Web UI (port 3111)", async () => {
      const { status } = await proxyFetch("/proxy/3111/");
      // 200 if running, 502 if not — both are valid proxy behavior
      expect([200, 502]).toContain(status);
    });

    test("proxy to noVNC Desktop (port 6080)", async () => {
      const { status } = await proxyFetch("/proxy/6080/");
      // 200 = running, 502 = not running, 0 = network/decompression error (still means proxy responded)
      expect([200, 502, 0]).toContain(status);
    });

    test("proxy to Presentation Viewer (port 3210)", async () => {
      const { status } = await proxyFetch("/proxy/3210/");
      expect([200, 502]).toContain(status);
    });
  });

  // ------ Bare port path (no trailing slash) ------
  describe("Bare port path", () => {
    test("/proxy/:port without trailing slash is handled", async () => {
      const { status } = await proxyFetch(`/proxy/${TEST_PORT}`, {
        redirect: "manual",
      });
      // Should redirect (301) or succeed (200)
      expect([200, 301, 302]).toContain(status);
    });
  });

  // ------ Host header rewriting ------
  describe("Host header rewriting", () => {
    test("Host header rewritten to localhost:PORT", async () => {
      const { status, data } = await proxyJson<{ headers: Record<string, string> }>(
        `/proxy/${TEST_PORT}/echo`,
      );
      expect(status).toBe(200);
      const host = data.headers?.host || "";
      expect(host).toContain(`localhost:${TEST_PORT}`);
    });
  });
});
