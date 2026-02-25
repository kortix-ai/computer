/**
 * Shared tunnel permission types, capability registry, and expiry options.
 * Mirrors the DB scope types from packages/db/src/schema/kortix.ts.
 */

import {
  HardDrive,
  Terminal,
  Globe,
  AppWindow,
  Cpu,
  Monitor,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// ─── Scope Types ────────────────────────────────────────────────────────────

export interface FilesystemScope {
  paths: string[];
  operations: ('read' | 'write' | 'list' | 'delete')[];
  maxFileSize?: number;
  excludePatterns?: string[];
}

export interface ShellScope {
  commands: string[];
  workingDir?: string;
  maxTimeout?: number;
}

export interface NetworkScope {
  ports: number[];
  hosts: string[];
  protocols: ('http' | 'tcp')[];
}

export type PermissionScope = FilesystemScope | ShellScope | NetworkScope | Record<string, unknown>;

// ─── Capability Registry ────────────────────────────────────────────────────

export interface CapabilityInfo {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  hasScopeEditor: boolean;
}

export const CAPABILITY_REGISTRY: CapabilityInfo[] = [
  {
    key: 'filesystem',
    label: 'Filesystem',
    description: 'Read, write, list, and delete local files',
    icon: HardDrive,
    hasScopeEditor: true,
  },
  {
    key: 'shell',
    label: 'Shell',
    description: 'Execute commands in a local terminal',
    icon: Terminal,
    hasScopeEditor: true,
  },
  {
    key: 'network',
    label: 'Network',
    description: 'HTTP requests and TCP connections to local services',
    icon: Globe,
    hasScopeEditor: true,
  },
  {
    key: 'apps',
    label: 'Applications',
    description: 'Launch and interact with local applications',
    icon: AppWindow,
    hasScopeEditor: false,
  },
  {
    key: 'hardware',
    label: 'Hardware',
    description: 'Access hardware information and sensors',
    icon: Cpu,
    hasScopeEditor: false,
  },
  {
    key: 'desktop',
    label: 'Desktop',
    description: 'Screen capture, mouse, and keyboard control',
    icon: Monitor,
    hasScopeEditor: false,
  },
  {
    key: 'gpu',
    label: 'GPU',
    description: 'GPU compute and acceleration',
    icon: Zap,
    hasScopeEditor: false,
  },
];

// ─── Expiry Options ─────────────────────────────────────────────────────────

export interface ExpiryOption {
  label: string;
  value: string; // ISO duration key or 'never'
  ms: number | null; // null = never expires
}

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '1 hour', value: '1h', ms: 3_600_000 },
  { label: '24 hours', value: '24h', ms: 86_400_000 },
  { label: '7 days', value: '7d', ms: 604_800_000 },
  { label: '30 days', value: '30d', ms: 2_592_000_000 },
  { label: 'Never', value: 'never', ms: null },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getExpiresAt(option: ExpiryOption): string | undefined {
  if (option.ms === null) return undefined;
  return new Date(Date.now() + option.ms).toISOString();
}

export function getCapabilityInfo(key: string): CapabilityInfo | undefined {
  return CAPABILITY_REGISTRY.find((c) => c.key === key);
}

/** Default scope for a capability when adding a new rule. */
export function getDefaultScope(capability: string): PermissionScope {
  switch (capability) {
    case 'filesystem':
      return { paths: [], operations: ['read', 'list'], excludePatterns: [] } satisfies FilesystemScope;
    case 'shell':
      return { commands: [], workingDir: '' } satisfies ShellScope;
    case 'network':
      return { ports: [], hosts: [], protocols: ['http'] } satisfies NetworkScope;
    default:
      return {};
  }
}
