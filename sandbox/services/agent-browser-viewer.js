const fs = require("fs");
const path = require("path");

const html = fs.readFileSync("/opt/agent-browser-viewer/index.html");
const socketDirs = Array.from(new Set([
  process.env.AGENT_BROWSER_SOCKET_DIR || "/dev/shm/agent-browser",
  "/dev/shm/agent-browser",
  "/tmp/agent-browser",
  "/workspace/.agent-browser",
]));

// Known sessions that are configured at the system level.
// These are always shown if their stream port is responding.
const KNOWN_SESSIONS = [
  {
    name: process.env.AGENT_BROWSER_PRIMARY_SESSION || "kortix",
    port: parseInt(process.env.AGENT_BROWSER_STREAM_PORT || "9223", 10),
  },
];

function getSessions() {
  const sessionsByName = new Map();

  // 1. Try filesystem-based discovery (works on real tmpfs, not Docker overlay)
  for (const socketDir of socketDirs) {
    try {
      const files = fs.readdirSync(socketDir);
      for (const f of files) {
        if (!f.endsWith(".stream")) continue;
        const name = f.replace(".stream", "");
        const port = parseInt(fs.readFileSync(path.join(socketDir, f), "utf8").trim(), 10);
        const hasSock = files.includes(name + ".sock");
        const pidPath = path.join(socketDir, name + ".pid");
        let pidAlive = false;
        try {
          if (fs.existsSync(pidPath)) {
            const pid = parseInt(fs.readFileSync(pidPath, "utf8").trim(), 10);
            if (pid > 0) {
              pidAlive = fs.existsSync(`/proc/${pid}`);
            }
          }
        } catch (e) {
          pidAlive = false;
        }
        if (port > 0 && hasSock && pidAlive) {
          sessionsByName.set(name, { name, port });
        }
      }
    } catch (e) {
      // ignore missing directory
    }
  }

  // 2. Fallback: check known sessions via /proc/net/unix socket discovery.
  //    On Docker overlay, readdir() can't see socket files even though they exist.
  //    We parse /proc/net/unix to find sockets matching our dirs, and for the
  //    stream port we use the known configuration.
  if (sessionsByName.size === 0) {
    try {
      const unixSockets = fs.readFileSync("/proc/net/unix", "utf8");
      for (const known of KNOWN_SESSIONS) {
        const socketPattern = known.name + ".sock";
        if (unixSockets.includes(socketPattern)) {
          let daemonAlive = false;
          try {
            const { execSync } = require("child_process");
            execSync("pgrep -f 'node.*dist/daemon.js'", { stdio: "pipe" });
            daemonAlive = true;
          } catch (e) {
            daemonAlive = false;
          }
          if (daemonAlive && known.port > 0) {
            sessionsByName.set(known.name, { name: known.name, port: known.port });
          }
        }
      }
    } catch (e) {
      // /proc/net/unix not available
    }
  }

  return Array.from(sessionsByName.values());
}

// ── SSE-to-WS Bridge ────────────────────────────────────────────────────────
// Each bridge keeps a persistent WS connection to the daemon's stream server
// and caches the last frame so new SSE clients get an immediate image.
const bridges = new Map();

function removeClient(port, client) {
  const bridge = bridges.get(port);
  if (!bridge) return;
  bridge.clients.delete(client);
}

function scheduleReconnect(port, bridge, delayMs) {
  if (bridge.retryTimer) return;
  bridge.retryTimer = setTimeout(() => {
    bridge.retryTimer = null;
    connectBridge(port, bridge);
  }, delayMs);
}

function connectBridge(port, bridge) {
  if (bridge.connecting || bridge.ws) return;
  bridge.connecting = true;
  try {
    const ws = new WebSocket("ws://127.0.0.1:" + port);

    ws.addEventListener("open", () => {
      bridge.ws = ws;
      bridge.connecting = false;
      if (bridge.pendingInputs && bridge.pendingInputs.length > 0) {
        for (const payload of bridge.pendingInputs.splice(0)) {
          try { ws.send(payload); } catch {}
        }
      }
      for (const client of bridge.clients) {
        try { client.enqueue("event: status\ndata: {\"connected\":true}\n\n"); } catch {}
      }
    });

    ws.addEventListener("message", (event) => {
      const msg = typeof event.data === "string" ? event.data : event.data.toString();

      try {
        const parsed = JSON.parse(msg);

        // Cache frames for replay to new clients
        if (parsed.type === "frame" && parsed.data) {
          bridge.lastFrame = msg;
          bridge.lastFrameTime = Date.now();
        }
      } catch {}

      // Forward all messages to SSE clients
      for (const client of bridge.clients) {
        try { client.enqueue("data: " + msg + "\n\n"); } catch {}
      }
    });

    ws.addEventListener("close", () => {
      bridge.ws = null;
      bridge.connecting = false;
      for (const client of bridge.clients) {
        try { client.enqueue("event: status\ndata: {\"connected\":false}\n\n"); } catch {}
      }
      scheduleReconnect(port, bridge, 900);
    });

    ws.addEventListener("error", () => {
      bridge.ws = null;
      bridge.connecting = false;
      scheduleReconnect(port, bridge, 1200);
    });
  } catch (e) {
    bridge.connecting = false;
    scheduleReconnect(port, bridge, 1200);
  }
}

function getOrCreateBridge(port) {
  if (bridges.has(port)) {
    const existing = bridges.get(port);
    connectBridge(port, existing);
    return existing;
  }

  const bridge = {
    ws: null,
    clients: new Set(),
    connecting: false,
    retryTimer: null,
    pendingInputs: [],
    lastFrame: null,
    lastFrameTime: 0,
  };
  bridges.set(port, bridge);
  return bridge;
}

// Pre-connect known session bridges so we start caching frames immediately.
setTimeout(() => {
  for (const known of KNOWN_SESSIONS) {
    const bridge = getOrCreateBridge(known.port);
    connectBridge(known.port, bridge);
  }
}, 5000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-cache",
};

Bun.serve({
  port: 9224,
  hostname: "0.0.0.0",
  idleTimeout: 0, // SSE connections are long-lived

  fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === "/sessions") {
      return new Response(JSON.stringify(getSessions()), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (pathname === "/stream") {
      const port = parseInt(url.searchParams.get("port"), 10);
      if (!port || port < 1 || port > 65535) {
        return new Response("Bad port", { status: 400 });
      }

      const bridge = getOrCreateBridge(port);

      let streamClient = null;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = {
            enqueue: (s) => controller.enqueue(new TextEncoder().encode(s)),
            close: () => controller.close(),
          };
          const heartbeat = setInterval(() => {
            try { encoder.enqueue(":hb\n\n"); } catch {}
          }, 5000);

          encoder._heartbeat = heartbeat;
          streamClient = encoder;
          bridge.clients.add(encoder);
          controller.enqueue(new TextEncoder().encode(":ok\n\n"));

          // Immediate bridge status so viewer doesn't sit on "connecting..."
          if (bridge.ws) {
            try { encoder.enqueue("data: {\"type\":\"status\",\"connected\":true}\n\n"); } catch {}
          }

          // Replay cached frame (< 2 min old) for instant visual feedback
          if (bridge.lastFrame && (Date.now() - bridge.lastFrameTime) < 120000) {
            try { encoder.enqueue("data: " + bridge.lastFrame + "\n\n"); } catch {}
          }

          connectBridge(port, bridge);
        },
        cancel() {
          if (streamClient && streamClient._heartbeat) {
            clearInterval(streamClient._heartbeat);
            streamClient._heartbeat = null;
          }
          if (streamClient) removeClient(port, streamClient);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          ...corsHeaders,
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    if (pathname === "/input" && req.method === "POST") {
      const port = parseInt(url.searchParams.get("port"), 10);
      if (!port || port < 1 || port > 65535) {
        return new Response("Bad port", { status: 400 });
      }

      return req.text().then((body) => {
        const bridge = getOrCreateBridge(port);
        connectBridge(port, bridge);
        if (bridge && bridge.ws && bridge.ws.readyState === 1) {
          bridge.ws.send(body);
          return new Response("ok");
        }
        if (bridge.pendingInputs.length > 200) {
          bridge.pendingInputs.shift();
        }
        bridge.pendingInputs.push(body);
        return new Response("queued", { status: 202 });
      });
    }

    // Default: serve the viewer HTML
    return new Response(html, {
      headers: { "Content-Type": "text/html", ...corsHeaders },
    });
  },
});

console.log("[agent-browser-viewer] Ready at http://0.0.0.0:9224");
