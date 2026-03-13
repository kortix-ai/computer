/**
 * Hooks to fetch marketplace components and check real install state.
 *
 * Install state is derived from the OpenCode SDK's skill list — the actual
 * skills on disk — NOT localStorage. This ensures the UI always reflects
 * reality.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchComponentBundle,
  fetchRegistryComponents,
  type RegistryComponent,
  type RegistryComponentBundle,
} from '../api/marketplace-api';
import { listSkills } from '../api/skills-api';
import { skillsKeys } from './use-skills';

const MARKETPLACE_KEYS = {
  all: ['marketplace', 'components'] as const,
  detail: (componentName: string) => ['marketplace', 'component', componentName] as const,
};

export function useMarketplaceSkills() {
  return useQuery({
    queryKey: MARKETPLACE_KEYS.all,
    queryFn: fetchRegistryComponents,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Returns a referentially-stable Set of skill names that are actually
 * installed on the server.
 *
 * This queries `client.app.skills()` (the real filesystem) so the UI
 * never shows "Installed" for something that isn't there.
 *
 * The Set is memoised on the `skills` data reference so it won't cause
 * unnecessary re-renders in consumers that use it as a useMemo dependency.
 */
export function useInstalledSkillNames(): Set<string> {
  const { data: skills } = useQuery({
    queryKey: skillsKeys.all,
    queryFn: listSkills,
    staleTime: 0, // always fresh — we need accurate install state
    refetchOnWindowFocus: true,
  });

  return useMemo(() => {
    const installed = new Set<string>();
    if (skills) {
      for (const s of skills) {
        const name = s.name.toLowerCase();
        installed.add(name);
        // Also add with "skill-" prefix so registry names match
        // e.g. server returns "agent-browser", registry has "skill-agent-browser"
        installed.add(`skill-${name}`);
      }
    }
    return installed;
  }, [skills]);
}

/**
 * Check if a single registry component name is installed.
 */
export function useIsSkillInstalled(componentName: string): boolean {
  const installed = useInstalledSkillNames();
  return installed.has(componentName.toLowerCase());
}

export function useMarketplaceComponent(componentName: string | null) {
  return useQuery<RegistryComponentBundle>({
    queryKey: MARKETPLACE_KEYS.detail(componentName ?? ''),
    queryFn: () => fetchComponentBundle(componentName ?? ''),
    enabled: Boolean(componentName),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}

export { type RegistryComponent, type RegistryComponentBundle } from '../api/marketplace-api';
