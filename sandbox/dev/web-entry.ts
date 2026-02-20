import { Server } from "/opt/opencode-src/packages/opencode/src/server/server.ts"
const server = Server.listen({ port: 3111, hostname: "0.0.0.0" })
console.log("[opencode-web] Listening on http://" + server.hostname + ":" + server.port)
await new Promise(() => {})
