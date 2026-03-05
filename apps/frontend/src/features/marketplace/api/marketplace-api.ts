import { getClient } from '@/lib/opencode-sdk';
import type {
  InstalledSnapshot,
  MarketplaceComponentPackument,
  MarketplaceComponentType,
  MarketplaceIndex,
} from '../types';

const REGISTRY_URL = (process.env.NEXT_PUBLIC_KORTIX_REGISTRY_URL || 'https://registry.kortix.com').replace(/\/+$/, '');

const COMPONENT_TYPE_TO_DIR: Partial<Record<MarketplaceComponentType, string>> = {
  'ocx:skill': '/workspace/.opencode/skills',
  'ocx:tool': '/workspace/.opencode/tools',
  'ocx:plugin': '/workspace/.opencode/plugin',
  'ocx:agent': '/workspace/.opencode/agents',
  'ocx:command': '/workspace/.opencode/commands',
};

function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error) {
    const err = result.error as any;
    throw new Error(err?.data?.message || err?.message || 'SDK request failed');
  }
  return result.data as T;
}

function emptySnapshot(): InstalledSnapshot {
  return {
    installedByType: {
      'ocx:skill': new Set<string>(),
      'ocx:tool': new Set<string>(),
      'ocx:plugin': new Set<string>(),
      'ocx:agent': new Set<string>(),
      'ocx:command': new Set<string>(),
      'ocx:bundle': new Set<string>(),
      'ocx:profile': new Set<string>(),
    },
    lockComponents: new Set<string>(),
  };
}

export async function fetchMarketplaceIndex(): Promise<MarketplaceIndex> {
  const res = await fetch(`${REGISTRY_URL}/index.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load registry index (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data?.components)) {
    throw new Error('Registry index is malformed');
  }
  return data as MarketplaceIndex;
}

export async function fetchMarketplaceComponent(slug: string): Promise<MarketplaceComponentPackument> {
  const res = await fetch(`${REGISTRY_URL}/components/${encodeURIComponent(slug)}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load component ${slug} (${res.status})`);
  return res.json() as Promise<MarketplaceComponentPackument>;
}

function normalizeComponentName(name: string): string {
  return name.replace(/\.(md|ts|tsx|js|json)$/i, '');
}

async function readInstalledNames(path: string): Promise<string[]> {
  const client = getClient();
  const result = await client.file.list({ path });
  const entries = unwrap<Array<{ name: string; type: 'file' | 'directory' }>>(result);
  return entries
    .filter((entry) => entry.type === 'directory' || entry.type === 'file')
    .map((entry) => normalizeComponentName(entry.name));
}

async function readOcxLockComponents(): Promise<Set<string>> {
  try {
    const client = getClient();
    const result = await client.file.read({ path: '/workspace/.opencode/ocx.lock' });
    const file = unwrap<{ content?: string }>(result);
    const raw = file.content || '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return new Set(Object.keys(parsed).map((key) => key.split('/').pop() || key));
  } catch {
    return new Set<string>();
  }
}

export async function fetchInstalledSnapshot(): Promise<InstalledSnapshot> {
  const snapshot = emptySnapshot();
  const lockComponents = await readOcxLockComponents();
  snapshot.lockComponents = lockComponents;

  const types = Object.entries(COMPONENT_TYPE_TO_DIR) as Array<[MarketplaceComponentType, string]>;
  await Promise.all(types.map(async ([type, dir]) => {
    try {
      const names = await readInstalledNames(dir);
      names.forEach((name) => snapshot.installedByType[type].add(name));
    } catch {
      // Optional local dirs can be missing.
    }
  }));

  lockComponents.forEach((name) => {
    snapshot.installedByType['ocx:bundle'].add(name);
  });

  return snapshot;
}

export function isComponentInstalled(
  snapshot: InstalledSnapshot,
  componentType: MarketplaceComponentType,
  componentName: string,
): boolean {
  if (snapshot.installedByType[componentType]?.has(componentName)) return true;
  return snapshot.lockComponents.has(componentName);
}

export function getRegistryUrl(): string {
  return REGISTRY_URL;
}
