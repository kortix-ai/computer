#!/usr/bin/with-contenv bash
# SSH daemon setup — key-only auth, keepalive for Cursor/VS Code tunnels.

echo "[init] Setting up SSH daemon..."

# ── Host keys ────────────────────────────────────────────────────────────────
[ -f /etc/ssh/ssh_host_ed25519_key ] || ssh-keygen -A

# ── sshd config ──────────────────────────────────────────────────────────────
cat > /etc/ssh/sshd_config <<'EOF'
Port 22
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key

# Auth
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication no
PermitRootLogin no
AllowUsers abc

# SFTP + forwarding (Cursor/VS Code need all of these)
Subsystem sftp /usr/lib/ssh/sftp-server
AllowTcpForwarding yes
AllowStreamLocalForwarding yes
AllowAgentForwarding yes
PermitTunnel yes
MaxSessions 10

# Keepalive — prevents Cloudflare/proxies from killing idle tunnels
TCPKeepAlive yes
ClientAliveInterval 15
ClientAliveCountMax 4
EOF

# ── VS Code / Cursor Remote SSH stdin fix ────────────────────────────────────
# Problem: VS Code's install script runs the CLI binary with:
#   "$CLI_PATH" command-shell ... < /dev/null &
# The binary reads EOF on stdin and exits immediately ("closing socket reader:
# eof"), even when --on-port is used and stdin isn't needed.
#
# Fix: Replace ELF binaries with a thin shell wrapper. The wrapper detects
# command-shell mode and pipes stdin from 'sleep infinity' instead of
# /dev/null, keeping the binary alive. For all other modes (--version,
# serve-web, etc.) the wrapper passes through transparently.
#
# Two parts:
#   1. Wrap any existing binaries now (container restart with existing install)
#   2. Background watcher wraps newly-downloaded binaries within ~1s

# The wrapper script template — same for VS Code and Cursor
# Fixes THREE problems with VS Code/Cursor Remote SSH:
#   1. stdin EOF: The install script runs the CLI with < /dev/null. The binary
#      reads EOF on stdin and exits ("closing socket reader: eof"). Fixed by
#      piping stdin from `sleep infinity`.
#   2. parent-process-id: The install script passes --parent-process-id $$
#      (its own shell PID). That shell exits after reporting the port. The
#      binary monitors that PID and self-terminates when it disappears. Fixed
#      by rewriting the PID to the wrapper's container-namespace PID.
#   3. PID namespace mismatch: SSH sessions inside Docker containers see TWO
#      PID namespaces. Shell $$ returns the HOST namespace PID, but /proc/
#      inside the container only contains CONTAINER namespace PIDs. The binary
#      checks /proc/PID/stat to monitor the parent — if PID is from the host
#      namespace, /proc/PID/ doesn't exist and the binary exits immediately.
#      Fixed by using `sh -c 'cut -d" " -f4 /proc/self/stat'` to get the
#      wrapper's PID in the container namespace (a child's PPID in /proc/self/stat
#      field 4 gives the parent's container-internal PID).
# NOTE: busybox ash (Alpine /bin/sh) — no bash-isms allowed.
WRAPPER_CONTENT='#!/bin/sh
REAL="${0}.real"
case "$*" in *command-shell*)
    # Get our PID in the container namespace (not host namespace).
    # SSH sessions set $$ to the host-namespace PID which is invisible in /proc/.
    # A child PPID in /proc/self/stat (field 4) gives the parent container-namespace PID.
    MY_PID=$(sh -c '"'"'cut -d" " -f4 /proc/self/stat'"'"')
    # Rebuild positional params with --parent-process-id rewritten.
    # CRITICAL: must use eval+set to preserve proper "$@" quoting — the binary
    # crashes with "fatal library error, lookup self" if args are word-split
    # from an unquoted string variable.
    NEWSET=""
    SKIP=0
    for a in "$@"; do
        if [ $SKIP -eq 1 ]; then
            NEWSET="$NEWSET \"$MY_PID\""
            SKIP=0
            continue
        fi
        case "$a" in --parent-process-id) SKIP=1 ;; esac
        NEWSET="$NEWSET \"$a\""
    done
    eval "set -- $NEWSET"
    sleep infinity | "$REAL" "$@" &
    wait $!
    exit $?
    ;; esac
exec "$REAL" "$@"'

_wrap_cli_binary() {
  local bin="$1"
  case "$bin" in *.real*) return 1 ;; esac
  [ -x "$bin" ] || return 1
  [ -f "$bin.real" ] && return 1
  file "$bin" | grep -q ELF || return 1
  mv "$bin" "$bin.real"
  printf '%s\n' "$WRAPPER_CONTENT" > "$bin"
  chmod +x "$bin"
  chown abc:abc "$bin" "$bin.real"
  echo "[vscode-fix] Wrapped: $bin"
}

# Paths where VS Code / Cursor download their CLI binaries.
# Both /config and /workspace are checked — the location depends on
# VSCODE_AGENT_FOLDER, which the install script may override.
_WRAP_DIRS="/config/.vscode-server /config/.cursor-server /workspace/.vscode-server /workspace/.cursor-server"

# Part 1: wrap existing binaries right now
for _dir in $_WRAP_DIRS; do
  for _bin in "$_dir"/code-* "$_dir"/cursor-*; do
    _wrap_cli_binary "$_bin" 2>/dev/null
  done
done

# Part 2: background watcher for newly-downloaded binaries
# Polls every 1s — lightweight (just stat + file checks), no extra packages.
# Stops itself once a wrap succeeds (new downloads are one-time per commit).
(
  while true; do
    for _dir in $_WRAP_DIRS; do
      [ -d "$_dir" ] || continue
      for _bin in "$_dir"/code-* "$_dir"/cursor-*; do
        _wrap_cli_binary "$_bin" 2>/dev/null
      done
    done
    sleep 1
  done
) &

# ── Authorized keys ─────────────────────────────────────────────────────────
mkdir -p /config/.ssh
touch /config/.ssh/authorized_keys
chmod 700 /config/.ssh
chmod 600 /config/.ssh/authorized_keys
chown -R abc:abc /config/.ssh

# ── Secrets dir (single-volume layout) ──────────────────────────────────────
mkdir -p /workspace/.secrets
chown abc:abc /workspace/.secrets
chmod 700 /workspace/.secrets

# ── Editor server dirs (Cursor/VS Code download here on first connect) ──────
for d in .vscode-server .cursor-server; do
  mkdir -p /config/$d/bin /config/$d/extensions /config/$d/data
  chown -R abc:abc /config/$d
done

# ── Cache dir (Cursor needs /config/.cache/Microsoft) ───────────────────────
# /config/.cache may be owned by a different UID from the base image;
# ensure abc can write to it.
mkdir -p /config/.cache/Microsoft
chown -R abc:abc /config/.cache 2>/dev/null

# ── Fix Cursor's bundled Node.js (segfaults on Alpine ARM64) ────────────────
# Cursor downloads a Node.js v22 binary compiled for alpine-arm64 (musl).
# This binary intermittently segfaults (SIGSEGV / signal 11) when processing
# WebSocket connections, causing the code server to crash on first connection.
# The container's system Node.js (v24, also musl/ARM64) does not have this bug.
# If Cursor has installed its server, replace the bundled node with a symlink
# to the system node. The install script already has fallback logic for this.
_fix_cursor_node() {
  local cursor_base="/config/.cursor-server/bin"
  [ -d "$cursor_base" ] || return 0
  for node_bin in "$cursor_base"/*/511523af765daeb1fa69500ab0df5b6524424610/node "$cursor_base"/*/*/node; do
    [ -f "$node_bin" ] || continue
    [ -L "$node_bin" ] && continue  # already a symlink, skip
    local sys_node
    sys_node="$(command -v node 2>/dev/null)" || continue
    cp "$node_bin" "${node_bin}.bundled" 2>/dev/null
    rm -f "$node_bin"
    ln -s "$sys_node" "$node_bin"
    echo "[init] Replaced Cursor bundled node with system node ($sys_node) at $node_bin"
  done
}
_fix_cursor_node

# ── Login profile for SSH sessions ──────────────────────────────────────────
cat > /config/.profile <<'PROFILE'
export PATH="$HOME/.local/bin:$PATH"

# ── Ensure background processes survive SSH disconnect ──
# When SSH drops, the kernel sends SIGHUP to the session. This trap
# disowns all background jobs (Cursor's code server) before bash exits,
# preventing them from receiving the fatal SIGHUP.
trap 'disown -a 2>/dev/null' HUP
PROFILE
chown abc:abc /config/.profile

# Also source .profile from .bashrc for non-login shells
if ! grep -q '\.profile' /config/.bashrc 2>/dev/null; then
  cat >> /config/.bashrc <<'BASHRC'

# Source .profile for SSH sessions
[ -f "$HOME/.profile" ] && . "$HOME/.profile"
BASHRC
  chown abc:abc /config/.bashrc
fi

echo "[init] SSH ready."
