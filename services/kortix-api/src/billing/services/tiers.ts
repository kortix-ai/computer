import type { TierConfig, DailyCreditConfig } from '../../types';
import { config } from '../../config';

export const TOKEN_PRICE_MULTIPLIER = 1.2;
export const MINIMUM_CREDIT_FOR_RUN = 0.01;
export const DEFAULT_TOKEN_COST = 0.000002;
export const CREDITS_PER_DOLLAR = 100;

const FREE_DAILY_CREDITS: DailyCreditConfig = {
  dailyAmount: 3,
  refreshIntervalHours: 24,
  maxAccumulation: 21,
};

const TIERS: Record<string, TierConfig> = {
  none: {
    name: 'none',
    displayName: 'No Plan',
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyCredits: 0,
    canPurchaseCredits: false,
    models: [],
    dailyCreditConfig: null,
    hidden: true,
  },

  free: {
    name: 'free',
    displayName: 'Basic',
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyCredits: 0,
    canPurchaseCredits: false,
    models: ['haiku'],
    dailyCreditConfig: FREE_DAILY_CREDITS,
    hidden: false,
  },

  tier_2_20: {
    name: 'tier_2_20',
    displayName: 'Plus',
    monthlyPrice: 20,
    yearlyPrice: 204,
    monthlyCredits: 40,
    canPurchaseCredits: false,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: false,
  },

  tier_6_50: {
    name: 'tier_6_50',
    displayName: 'Pro',
    monthlyPrice: 50,
    yearlyPrice: 510,
    monthlyCredits: 100,
    canPurchaseCredits: false,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: false,
  },

  tier_25_200: {
    name: 'tier_25_200',
    displayName: 'Ultra',
    monthlyPrice: 200,
    yearlyPrice: 2040,
    monthlyCredits: 400,
    canPurchaseCredits: true,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: false,
  },

  tier_12_100: {
    name: 'tier_12_100',
    displayName: 'Business',
    monthlyPrice: 100,
    yearlyPrice: 1020,
    monthlyCredits: 100,
    canPurchaseCredits: false,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: true,
  },

  tier_50_400: {
    name: 'tier_50_400',
    displayName: 'Enterprise',
    monthlyPrice: 400,
    yearlyPrice: 4080,
    monthlyCredits: 400,
    canPurchaseCredits: true,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: true,
  },

  tier_125_800: {
    name: 'tier_125_800',
    displayName: 'Scale',
    monthlyPrice: 800,
    yearlyPrice: 8160,
    monthlyCredits: 800,
    canPurchaseCredits: true,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: true,
  },

  tier_200_1000: {
    name: 'tier_200_1000',
    displayName: 'Max',
    monthlyPrice: 1000,
    yearlyPrice: 10200,
    monthlyCredits: 1000,
    canPurchaseCredits: true,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: true,
  },

  tier_150_1200: {
    name: 'tier_150_1200',
    displayName: 'Enterprise Max',
    monthlyPrice: 1200,
    yearlyPrice: 12240,
    monthlyCredits: 1200,
    canPurchaseCredits: true,
    models: ['all'],
    dailyCreditConfig: null,
    hidden: true,
  },
};

interface TierPriceIds {
  monthly?: string;
  yearly?: string;
  yearlyCommitment?: string;
}

interface StripePriceConfig {
  subscriptions: Record<string, TierPriceIds>;
  credits: Record<number, string>;
  productId: string;
}

const STRIPE_PRICES_PROD: StripePriceConfig = {
  subscriptions: {
    free:          { monthly: 'price_1RILb4G6l1KZGqIrK4QLrx9i' },
    tier_2_20:     { monthly: 'price_1RILb4G6l1KZGqIrhomjgDnO', yearly: 'price_1ReHB5G6l1KZGqIrD70I1xqM', yearlyCommitment: 'price_1RqtqiG6l1KZGqIrhjVPtE1s' },
    tier_6_50:     { monthly: 'price_1RILb4G6l1KZGqIr5q0sybWn', yearly: 'price_1ReHAsG6l1KZGqIrlAog487C', yearlyCommitment: 'price_1Rqtr8G6l1KZGqIrQ0ql0qHi' },
    tier_12_100:   { monthly: 'price_1RILb4G6l1KZGqIr5Y20ZLHm', yearly: 'price_1ReHAWG6l1KZGqIrBHer2PQc' },
    tier_25_200:   { monthly: 'price_1RILb4G6l1KZGqIrGAD8rNjb', yearly: 'price_1ReH9uG6l1KZGqIrsvMLHViC', yearlyCommitment: 'price_1RqtrUG6l1KZGqIrEb8hLsk3' },
    tier_50_400:   { monthly: 'price_1RILb4G6l1KZGqIruNBUMTF1', yearly: 'price_1ReH9fG6l1KZGqIrsPtu5KIA' },
    tier_125_800:  { monthly: 'price_1RILb3G6l1KZGqIrbJA766tN', yearly: 'price_1ReH9GG6l1KZGqIrfgqaJyat' },
    tier_200_1000: { monthly: 'price_1RILb3G6l1KZGqIrmauYPOiN', yearly: 'price_1ReH8qG6l1KZGqIrK1akY90q' },
  },
  credits: {
    10:  'price_1RxmQUG6l1KZGqIru453O1zW',
    25:  'price_1RxmQlG6l1KZGqIr3hS5WtGg',
    50:  'price_1RxmQvG6l1KZGqIrLbMZ3D6r',
    100: 'price_1RxmR3G6l1KZGqIrpLwFCGac',
    250: 'price_1RxmRAG6l1KZGqIrtBIMsZAj',
    500: 'price_1RxmRGG6l1KZGqIrSyvl6w1G',
  },
  productId: 'prod_SCl7AQ2C8kK1CD',
};

const STRIPE_PRICES_STAGING: StripePriceConfig = {
  subscriptions: {
    free:          { monthly: 'price_1T56XgG6CaZppiKcTG03LXxn' },
    tier_2_20:     { monthly: 'price_1T56XhG6CaZppiKcc8F5GXgp', yearly: 'price_1T56XhG6CaZppiKc2Kp1UlY1', yearlyCommitment: 'price_1T56XiG6CaZppiKcdd4v1ebQ' },
    tier_6_50:     { monthly: 'price_1T56XwG6CaZppiKcvrKuO2Ye', yearly: 'price_1T56XxG6CaZppiKcdVyFiWxG', yearlyCommitment: 'price_1T56XyG6CaZppiKcpqwihCTg' },
    tier_25_200:   { monthly: 'price_1T56XyG6CaZppiKcYI5GZ01F', yearly: 'price_1T56XzG6CaZppiKc5H9VkyLO', yearlyCommitment: 'price_1T56Y0G6CaZppiKcavvswvQ8' },
  },
  credits: {
    10:  'price_1T56YGG6CaZppiKcSwnwZSoE',
    25:  'price_1T56YHG6CaZppiKcFhLsjEHI',
    50:  'price_1T56YIG6CaZppiKc6fdKANgh',
    100: 'price_1T56YIG6CaZppiKcBsRi2UH0',
    250: 'price_1T56YKG6CaZppiKcGeILSj6N',
    500: 'price_1T56YKG6CaZppiKcHDTLQLIM',
  },
  productId: 'prod_U3CxqRenahYVvj',
};

function getStripePrices(): StripePriceConfig {
  return config.INTERNAL_KORTIX_ENV === 'staging' ? STRIPE_PRICES_STAGING : STRIPE_PRICES_PROD;
}

export function getProductId(): string {
  return getStripePrices().productId;
}

export function resolvePriceId(tierKey: string, billingPeriod?: string): string | null {
  const prices = getStripePrices();
  const tierPrices = prices.subscriptions[tierKey];
  if (!tierPrices) return null;

  if (billingPeriod === 'yearly_commitment') return tierPrices.yearlyCommitment ?? null;
  if (billingPeriod === 'yearly') return tierPrices.yearly ?? null;
  return tierPrices.monthly ?? null;
}

export function resolveCreditPriceId(amountDollars: number): string | null {
  const prices = getStripePrices();
  return prices.credits[amountDollars] ?? null;
}

export function getCreditPackageAmounts(): number[] {
  return Object.keys(getStripePrices().credits).map(Number).sort((a, b) => a - b);
}

const priceIdToTier = new Map<string, string>();

function registerPriceId(priceId: string, tierName: string) {
  priceIdToTier.set(priceId, tierName);
}

function initPriceIdMap() {
  for (const priceConfig of [STRIPE_PRICES_PROD, STRIPE_PRICES_STAGING]) {
    for (const [tierName, tierPrices] of Object.entries(priceConfig.subscriptions)) {
      if (tierPrices.monthly) registerPriceId(tierPrices.monthly, tierName);
      if (tierPrices.yearly) registerPriceId(tierPrices.yearly, tierName);
      if (tierPrices.yearlyCommitment) registerPriceId(tierPrices.yearlyCommitment, tierName);
    }
  }
}
initPriceIdMap();

export function getTier(name: string): TierConfig {
  return TIERS[name] ?? TIERS.none;
}

export function getTierByPriceId(priceId: string): TierConfig | null {
  const name = priceIdToTier.get(priceId);
  return name ? TIERS[name] ?? null : null;
}

export function getAllTiers(): TierConfig[] {
  return Object.values(TIERS);
}

export function getVisibleTiers(): TierConfig[] {
  return Object.values(TIERS).filter((t) => !t.hidden && t.name !== 'none');
}

export function isValidTier(name: string): boolean {
  return name in TIERS;
}

export function getMonthlyCredits(tierName: string): number {
  return getTier(tierName).monthlyCredits;
}

export function canPurchaseCredits(tierName: string): boolean {
  return getTier(tierName).canPurchaseCredits;
}

export function isModelAllowed(tierName: string, model: string): boolean {
  const tier = getTier(tierName);
  if (tier.models.includes('all')) return true;
  return tier.models.includes(model);
}

export function getDailyCreditConfig(tierName: string): DailyCreditConfig | null {
  return getTier(tierName).dailyCreditConfig;
}

export function getTierOrder(tierName: string): number {
  const order = [
    'none',
    'free',
    'tier_2_20',
    'tier_6_50',
    'tier_12_100',
    'tier_25_200',
    'tier_50_400',
    'tier_125_800',
    'tier_200_1000',
    'tier_150_1200',
  ];
  const idx = order.indexOf(tierName);
  return idx >= 0 ? idx : 0;
}

export function isUpgrade(fromTier: string, toTier: string): boolean {
  return getTierOrder(toTier) > getTierOrder(fromTier);
}

export function isDowngrade(fromTier: string, toTier: string): boolean {
  return getTierOrder(toTier) < getTierOrder(fromTier);
}

const REVENUECAT_PRODUCT_MAPPING: Record<string, string> = {
  'kortix_plus_monthly': 'tier_2_20',
  'kortix_plus_yearly': 'tier_2_20',
  'plus:plus-monthly': 'tier_2_20',

  'kortix_pro_monthly': 'tier_6_50',
  'kortix_pro_yearly': 'tier_6_50',
  'pro:pro-monthly': 'tier_6_50',

  'kortix_ultra_monthly': 'tier_25_200',
  'kortix_ultra_yearly': 'tier_25_200',
  'ultra:ultra-monthly': 'tier_25_200',
};

export function mapRevenueCatProductToTier(productId: string): string | null {
  return REVENUECAT_PRODUCT_MAPPING[productId.toLowerCase()] ?? null;
}

export function getRevenueCatPeriodType(productId: string): 'monthly' | 'yearly' | 'yearly_commitment' {
  if (!productId) return 'monthly';
  const lower = productId.toLowerCase();
  if (lower.includes('commitment')) return 'yearly_commitment';
  if (lower.includes('yearly') || lower.includes('annual')) return 'yearly';
  return 'monthly';
}

export function isRevenueCatAnonymous(appUserId: string): boolean {
  return appUserId.startsWith('$RCAnonymousID:');
}
