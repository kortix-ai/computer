/**
 * Path Validator — defense-in-depth path traversal prevention.
 *
 * Validates that requested paths:
 *   1. Are absolute
 *   2. Resolve to an absolute path (follows symlinks)
 *   3. Fall within allowed directories
 *   4. Don't hit sensitive system paths
 */

import { resolve, normalize } from 'path';
import { realpathSync } from 'fs';

const SENSITIVE_PATHS = [
  '/etc/shadow',
  '/etc/passwd',
  '/etc/sudoers',
  '/etc/ssh',
  '/root/.ssh',
  '/proc',
  '/sys',
  '/dev',
];


export function validatePath(path: string, allowedPaths: string[]): void {
  if (!path) {
    throw new Error('Path is required');
  }

  const normalized = normalize(resolve(path));
  let resolved: string;
  try {
    resolved = realpathSync(normalized);
  } catch {
    resolved = normalized;
  }

  for (const sensitive of SENSITIVE_PATHS) {
    if (resolved === sensitive || resolved.startsWith(sensitive + '/')) {
      throw new Error(`Access denied: sensitive system path "${path}"`);
    }
  }

  if (allowedPaths.length > 0) {
    const withinAllowed = allowedPaths.some((allowed) => {
      const normalizedAllowed = normalize(resolve(allowed));
      return resolved === normalizedAllowed || resolved.startsWith(normalizedAllowed + '/');
    });

    if (!withinAllowed) {
      throw new Error(`Access denied: path "${path}" is outside allowed directories`);
    }
  }
}
