import { Server } from "/opt/opencode-src/packages/opencode/src/server/server.ts"
const server = Server.listen({ port: 4096, hostname: "0.0.0.0" })
console.log("[opencode-serve] Listening on http://" + server.hostname + ":" + server.port)
await new Promise(() => {})
