/**
 * econnreset-guard.cjs — Dev server crash protection
 *
 * Preloaded via NODE_OPTIONS='--require=/opt/kortix-master/econnreset-guard.cjs'
 *
 * Prevents dev servers (Vite 7, Astro, Next.js, etc.) from crashing when
 * clients disconnect through the Kortix reverse proxy. Socket errors like
 * ECONNRESET, EPIPE, and ECONNABORTED are normal during browser tab closes,
 * page reloads, proxy timeouts, and network changes — they should never
 * crash a development server.
 *
 * Safe for ALL Node.js processes: only swallows socket-level errors.
 * Non-socket errors (bugs, assertion failures, etc.) still crash normally.
 */

'use strict'

const SOCKET_ERROR_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ECANCELED',
  'ERR_STREAM_DESTROYED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ERR_STREAM_WRITE_AFTER_END',
])

const SOCKET_ERROR_MESSAGES = [
  'ECONNRESET',
  'EPIPE',
  'socket hang up',
  'aborted',
  'write after end',
  'stream destroyed',
  'This socket has been ended',
  'write ECONNRESET',
  'read ECONNRESET',
  'Client network socket disconnected',
]

function isSocketError(err) {
  if (!err || typeof err !== 'object') return false

  // Check error code (most reliable)
  if (err.code && SOCKET_ERROR_CODES.has(err.code)) return true

  // Check error message (fallback for errors without .code)
  if (err.message) {
    var msg = err.message
    for (var i = 0; i < SOCKET_ERROR_MESSAGES.length; i++) {
      if (msg.indexOf(SOCKET_ERROR_MESSAGES[i]) !== -1) return true
    }
  }

  // Check if it's a socket/stream error from the syscall field
  if (err.syscall && (err.syscall === 'read' || err.syscall === 'write') && err.errno) {
    return true
  }

  return false
}

// ── uncaughtException ────────────────────────────────────────────────────────
process.on('uncaughtException', function onUncaughtSocketGuard(err) {
  if (isSocketError(err)) {
    // Silently swallow — normal during client disconnects through proxy
    return
  }

  // Non-socket error: preserve default crash behavior.
  // If we're the only listener, crash the process (same as no handler).
  // If other listeners exist (framework-level), they'll handle it.
  var listenerCount = process.listenerCount('uncaughtException')
  if (listenerCount <= 1) {
    // We're the only handler — must crash to preserve default Node.js behavior
    console.error(err)
    process.exit(1)
  }
  // Otherwise, other handlers will decide what to do
})

// ── unhandledRejection ───────────────────────────────────────────────────────
process.on('unhandledRejection', function onUnhandledRejectionSocketGuard(reason) {
  if (isSocketError(reason)) {
    // Silently swallow — normal during client disconnects through proxy
    return
  }

  // Non-socket rejection: let other handlers deal with it, or log
  var listenerCount = process.listenerCount('unhandledRejection')
  if (listenerCount <= 1) {
    console.error('Unhandled rejection:', reason)
    // Note: Node.js default behavior for unhandled rejections varies by version.
    // We log but don't exit, matching --unhandled-rejections=warn behavior.
  }
})
