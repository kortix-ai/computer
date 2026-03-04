/**
 * Command Validator — defense-in-depth command injection prevention.
 *
 * Validates that shell commands:
 *   1. Are in the allowed commands list (if configured)
 *   2. Don't contain shell metacharacters
 *   3. Don't execute dangerous system commands
 */

/** Commands that should never be executed via tunnel regardless of config. */
const BLOCKED_COMMANDS = new Set([
  'rm',
  'rmdir',
  'mkfs',
  'dd',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init',
  'systemctl',
  'sudo',
  'su',
  'passwd',
  'chown',
  'chmod',
  'chgrp',
  'mount',
  'umount',
  'fdisk',
  'parted',
  'iptables',
  'ufw',
  'firewall-cmd',
]);

const SHELL_METACHAR_REGEX = /[;&|`$(){}[\]<>!#~]/;

export function validateCommand(command: string, allowedCommands: string[]): void {
  if (!command || typeof command !== 'string') {
    throw new Error('Command is required');
  }

  const trimmed = command.trim();

  if (SHELL_METACHAR_REGEX.test(trimmed)) {
    throw new Error(`Command contains disallowed characters: "${trimmed}"`);
  }

  const executable = trimmed.split(/\s+/)[0];

  if (BLOCKED_COMMANDS.has(executable)) {
    throw new Error(`Command "${executable}" is blocked for security reasons`);
  }

  if (allowedCommands.length > 0) {
    if (!allowedCommands.includes(executable)) {
      throw new Error(`Command "${executable}" is not in the allowed commands list`);
    }
  }
}
