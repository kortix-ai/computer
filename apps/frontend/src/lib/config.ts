// Environment mode types — only two modes: local (Docker) and cloud (hosted)
export enum EnvMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
}

// Subscription tier structure - tier keys only, no price IDs
export interface SubscriptionTierData {
  tierKey: string;  // Backend tier key like 'free', 'tier_2_20', etc.
  name: string;     // Display name like 'Basic', 'Plus', 'Pro'
}

// Subscription tiers structure - ONLY tier keys, price IDs come from backend
export interface SubscriptionTiers {
  FREE_TIER: SubscriptionTierData;
  TIER_2_20: SubscriptionTierData;
  TIER_6_50: SubscriptionTierData;
  TIER_12_100: SubscriptionTierData;
  TIER_25_200: SubscriptionTierData;
  TIER_50_400: SubscriptionTierData;
  TIER_125_800: SubscriptionTierData;
  TIER_200_1000: SubscriptionTierData;
}

// Configuration object
interface Config {
  ENV_MODE: EnvMode;
  IS_LOCAL: boolean;
  IS_CLOUD: boolean;
  SUBSCRIPTION_TIERS: SubscriptionTiers;
}

// Tier keys - single source, no environment-specific price IDs
const TIERS: SubscriptionTiers = {
  FREE_TIER: {
    tierKey: 'free',
    name: 'Basic/$0',
  },
  TIER_2_20: {
    tierKey: 'tier_2_20',
    name: 'Plus/$20',
  },
  TIER_6_50: {
    tierKey: 'tier_6_50',
    name: 'Pro/$50',
  },
  TIER_12_100: {
    tierKey: 'tier_12_100',
    name: 'Business/$100',
  },
  TIER_25_200: {
    tierKey: 'tier_25_200',
    name: 'Ultra/$200',
  },
  TIER_50_400: {
    tierKey: 'tier_50_400',
    name: 'Enterprise/$400',
  },
  TIER_125_800: {
    tierKey: 'tier_125_800',
    name: 'Scale/$800',
  },
  TIER_200_1000: {
    tierKey: 'tier_200_1000',
    name: 'Max/$1000',
  },
} as const;

function getEnvironmentMode(): EnvMode {
  const envMode = process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase();
  if (envMode === 'local') {
    return EnvMode.LOCAL;
  }
  // Everything else (cloud, production, staging, or unset) is cloud
  return EnvMode.CLOUD;
}

const currentEnvMode = getEnvironmentMode();

export const config: Config = {
  ENV_MODE: currentEnvMode,
  IS_LOCAL: currentEnvMode === EnvMode.LOCAL,
  IS_CLOUD: currentEnvMode === EnvMode.CLOUD,
  SUBSCRIPTION_TIERS: TIERS,
};

export const isLocalMode = (): boolean => {
  return config.IS_LOCAL;
};

export const isCloudMode = (): boolean => {
  return config.IS_CLOUD;
};


