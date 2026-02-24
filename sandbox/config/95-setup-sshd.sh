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

# ── Authorized keys ─────────────────────────────────────────────────────────
mkdir -p /workspace/.ssh
touch /workspace/.ssh/authorized_keys
chmod 700 /workspace/.ssh
chmod 600 /workspace/.ssh/authorized_keys
chown -R abc:abc /workspace/.ssh

# ── Secrets dir (single-volume layout) ──────────────────────────────────────
mkdir -p /workspace/.secrets
chown abc:abc /workspace/.secrets
chmod 700 /workspace/.secrets

# ── Editor server dirs (Cursor/VS Code download here on first connect) ──────
for d in .vscode-server .cursor-server; do
  mkdir -p /workspace/$d/bin /workspace/$d/extensions /workspace/$d/data
  chown -R abc:abc /workspace/$d
done

# ── Login profile for SSH sessions ──────────────────────────────────────────
# Handles two critical issues with Cursor Remote SSH:
# 1. Stale cursor-server processes from previous SSH sessions pile up
# 2. Background processes (code server) die when SSH disconnects (SIGHUP)
cat > /workspace/.profile <<'PROFILE'
export PATH="$HOME/.local/bin:$PATH"

# ── Cursor Remote SSH: clean up stale servers from previous sessions ──
# Each new Cursor SSH session starts its own servers; old ones just waste RAM.
_cursor_cleanup() {
  local stale
  stale=$(pgrep -c -f 'cursor-server.*--start-server' 2>/dev/null || echo 0)
  if [ "$stale" -gt 0 ]; then
    pkill -f 'cursor-server.*--start-server' 2>/dev/null
    pkill -f 'multiplex-server.*\.js' 2>/dev/null
    pkill -f 'bootstrap-fork.*--type=extensionHost' 2>/dev/null
    sleep 0.2
  fi
}
_cursor_cleanup
unset -f _cursor_cleanup

# ── Ensure background processes survive SSH disconnect ──
# When SSH drops, the kernel sends SIGHUP to the session. This trap
# disowns all background jobs (Cursor's code server) before bash exits,
# preventing them from receiving the fatal SIGHUP.
trap 'disown -a 2>/dev/null' HUP
PROFILE
chown abc:abc /workspace/.profile

# Also source .profile from .bashrc for non-login shells
if ! grep -q '\.profile' /workspace/.bashrc 2>/dev/null; then
  cat >> /workspace/.bashrc <<'BASHRC'

# Source .profile for SSH sessions
[ -f "$HOME/.profile" ] && . "$HOME/.profile"
BASHRC
  chown abc:abc /workspace/.bashrc
fi

echo "[init] SSH ready."
