export type MarketplaceComponentType =
  | 'ocx:skill'
  | 'ocx:tool'
  | 'ocx:plugin'
  | 'ocx:agent'
  | 'ocx:command'
  | 'ocx:bundle'
  | 'ocx:profile';

export interface MarketplaceComponentSummary {
  name: string;
  type: MarketplaceComponentType;
  description?: string;
}

export interface MarketplaceIndex {
  name: string;
  namespace: string;
  components: MarketplaceComponentSummary[];
}

export interface MarketplaceComponentVersion {
  name: string;
  type: MarketplaceComponentType;
  description?: string;
  files?: string[];
  dependencies?: string[];
}

export interface MarketplaceComponentPackument {
  name: string;
  versions: Record<string, MarketplaceComponentVersion>;
  'dist-tags'?: {
    latest?: string;
  };
}

export interface InstalledSnapshot {
  installedByType: Record<MarketplaceComponentType, Set<string>>;
  lockComponents: Set<string>;
}
