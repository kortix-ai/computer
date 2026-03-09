import { readFileSync, readdirSync, readlinkSync } from 'fs'
import { join, basename } from 'path'
import { config } from '../config'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ListeningProcess {
  /** Port the process is listening on */
  port: number
  /** Process ID */
  pid: number
  /** Process command name (e.g. "node", "python3", "go") */
  command: string
  /** Full command line */
  cmdline: string
  /** Working directory of the process */
  cwd: string
}

// ─── Infrastructure ports to exclude ────────────────────────────────────────

const EXCLUDED_PORTS = new Set([
  config.PORT,                    // Kortix Master itself (8000)
  4096,                           // OpenCode API
  3111,                           // OpenCode UI
  6080,                           // Desktop VNC
  6081,                           // Desktop VNC HTTPS
  3210,                           // Presentation viewer
  8082,                           // Selkies WebRTC
  9222,                           // Chrome DevTools
  9223,                           // Browser stream
  9224,                           // Browser viewer
])

// ─── Infrastructure processes to exclude (by command name) ──────────────────
const EXCLUDED_COMMANDS = new Set([
  'selkies', 'Xorg', 'pulseaudio', 'nginx', 'dockerd', 'containerd',
  's6-svscan', 's6-supervise', 's6-ipcserverd',
])

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse /proc/net/tcp (or tcp6) to find listening sockets.
 * Returns a map of port → inode.
 *
 * Format of each line (after header):
 *   sl  local_address rem_address st tx_queue:rx_queue tr:when retrnsmt uid timeout inode
 *   0: 00000000:1F90 00000000:0000 0A ...
 *
 * State 0A = LISTEN
 * local_address is hex IP:PORT
 */
function parseListeningSockets(path: string): Map<number, number> {
  const portToInode = new Map<number, number>()
  try {
    const content = readFileSync(path, 'utf-8')
    const lines = content.trim().split('\n')
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/)
      if (parts.length < 10) continue

      const state = parts[3]
      if (state !== '0A') continue // Only LISTEN state

      const localAddr = parts[1]
      const colonIdx = localAddr.lastIndexOf(':')
      if (colonIdx === -1) continue

      const portHex = localAddr.slice(colonIdx + 1)
      const port = parseInt(portHex, 16)
      if (isNaN(port) || port < 1 || port > 65535) continue
      if (EXCLUDED_PORTS.has(port)) continue

      const inode = parseInt(parts[9], 10)
      if (!isNaN(inode) && inode > 0) {
        portToInode.set(port, inode)
      }
    }
  } catch {
    // File may not exist or be readable
  }
  return portToInode
}

/**
 * Build a map of socket inode → PID by scanning /proc/{pid}/fd/.
 * Each fd is a symlink; socket inodes look like "socket:[12345]".
 */
function buildInodeToPidMap(targetInodes: Set<number>): Map<number, number> {
  const inodeToPid = new Map<number, number>()
  if (targetInodes.size === 0) return inodeToPid

  try {
    const procEntries = readdirSync('/proc')
    for (const entry of procEntries) {
      const pid = parseInt(entry, 10)
      if (isNaN(pid) || pid < 1) continue

      const fdDir = `/proc/${pid}/fd`
      try {
        const fds = readdirSync(fdDir)
        for (const fd of fds) {
          try {
            const link = readlinkSync(join(fdDir, fd))
            const socketMatch = link.match(/^socket:\[(\d+)\]$/)
            if (socketMatch) {
              const inode = parseInt(socketMatch[1], 10)
              if (targetInodes.has(inode)) {
                inodeToPid.set(inode, pid)
                // Early exit if we found all
                if (inodeToPid.size === targetInodes.size) return inodeToPid
              }
            }
          } catch {
            // Permission denied or fd gone — skip
          }
        }
      } catch {
        // Can't read fd dir — skip
      }
    }
  } catch {
    // Can't read /proc
  }

  return inodeToPid
}

/**
 * Read process info from /proc/{pid}/.
 */
function getProcessInfo(pid: number): { command: string; cmdline: string; cwd: string } {
  let command = ''
  let cmdline = ''
  let cwd = ''

  try {
    command = readFileSync(`/proc/${pid}/comm`, 'utf-8').trim()
  } catch {}

  try {
    // cmdline uses NUL separators
    const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
    cmdline = raw.replace(/\0/g, ' ').trim()
  } catch {}

  try {
    cwd = readlinkSync(`/proc/${pid}/cwd`)
  } catch {}

  return { command, cmdline, cwd }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Scan for all non-infrastructure processes listening on TCP ports.
 * Uses /proc/net/tcp + /proc/{pid}/fd to match ports to processes.
 */
export function scanListeningProcesses(): ListeningProcess[] {
  // 1. Parse listening sockets from /proc/net/tcp and tcp6
  const tcpSockets = parseListeningSockets('/proc/net/tcp')
  const tcp6Sockets = parseListeningSockets('/proc/net/tcp6')

  // Merge (tcp6 may duplicate tcp4 ports — dedup by port, prefer tcp4)
  const allSockets = new Map(tcpSockets)
  for (const [port, inode] of tcp6Sockets) {
    if (!allSockets.has(port)) {
      allSockets.set(port, inode)
    }
  }

  if (allSockets.size === 0) return []

  // 2. Map inodes to PIDs
  const targetInodes = new Set(allSockets.values())
  const inodeToPid = buildInodeToPidMap(targetInodes)

  // 3. Build results — filter out infrastructure processes & ephemeral high ports
  const results: ListeningProcess[] = []
  for (const [port, inode] of allSockets) {
    const pid = inodeToPid.get(inode)
    if (!pid) continue

    const info = getProcessInfo(pid)

    // Skip infrastructure processes by command name
    if (EXCLUDED_COMMANDS.has(info.command)) continue

    // Skip processes whose CWD is outside /workspace (likely infrastructure)
    // but allow /workspace itself and any subdirectory
    const isWorkspaceProcess = info.cwd === '/workspace' || info.cwd.startsWith('/workspace/')
    if (!isWorkspaceProcess && port > 10000) continue // high port + non-workspace = infra

    results.push({
      port,
      pid,
      command: info.command,
      cmdline: info.cmdline,
      cwd: info.cwd,
    })
  }

  // Sort by port
  results.sort((a, b) => a.port - b.port)

  return results
}
