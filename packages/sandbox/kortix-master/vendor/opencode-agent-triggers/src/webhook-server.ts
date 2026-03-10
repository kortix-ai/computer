import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { WebhookTriggerConfig } from "./types.js"

export interface WebhookRoute {
  agentName: string
  trigger: WebhookTriggerConfig
}

type DispatchHandler = (route: WebhookRoute, payload: { body: string; headers: Record<string, string>; method: string; path: string }) => Promise<{ sessionId: string }>

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

export class WebhookTriggerServer {
  private server: Server | null = null
  private routes = new Map<string, WebhookRoute>()

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly dispatch: DispatchHandler,
  ) {}

  private routeKey(method: string, path: string): string {
    return `${method.toUpperCase()} ${path}`
  }

  setRoutes(routes: WebhookRoute[]): void {
    this.routes.clear()
    for (const route of routes) {
      this.routes.set(this.routeKey(route.trigger.source.method ?? "POST", route.trigger.source.path), route)
    }
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const method = (req.method ?? "GET").toUpperCase()
      const pathname = new URL(req.url ?? "/", `http://${this.host}:${this.port}`).pathname
      if (pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true, service: "opencode-agent-triggers", routes: this.routes.size }))
        return
      }

      const route = this.routes.get(this.routeKey(method, pathname))
      if (!route) {
        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: false, error: "not_found" }))
        return
      }

      const body = await readBody(req)
      const headers = Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value ?? ""]),
      )

      if (route.trigger.source.secret) {
        const supplied = headers["x-kortix-opencode-trigger-secret"] ?? headers["x-kortix-trigger-secret"] ?? ""
        if (supplied !== route.trigger.source.secret) {
          res.writeHead(401, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: false, error: "invalid_secret" }))
          return
        }
      }

      const result = await this.dispatch(route, { body, headers, method, path: pathname })
      res.writeHead(202, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, sessionId: result.sessionId }))
    })

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject)
      this.server?.listen(this.port, this.host, () => resolve())
    })
  }

  async stop(): Promise<void> {
    if (!this.server) return
    const current = this.server
    this.server = null
    await new Promise<void>((resolve, reject) => current.close((error) => (error ? reject(error) : resolve())))
  }
}
