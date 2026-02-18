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
    limits: {
      concurrentRuns: 0,
      customWorkers: 0,
      scheduledTriggers: 0,
      appTriggers: 0,
    },
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
    limits: {
      concurrentRuns: 2,
      customWorkers: 0,
      scheduledTriggers: 0,
      appTriggers: 0,
    },
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
    limits: {
      concurrentRuns: 3,
      customWorkers: 5,
      scheduledTriggers: 5,
      appTriggers: 25,
    },
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
    limits: {
      concurrentRuns: 5,
      customWorkers: 20,
      scheduledTriggers: 10,
      appTriggers: 50,
    },
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
    limits: {
      concurrentRuns: 20,
      customWorkers: 100,
      scheduledTriggers: 50,
      appTriggers: 200,
    },
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
    limits: {
      concurrentRuns: 5,
      customWorkers: 20,
      scheduledTriggers: 10,
      appTriggers: 50,
    },
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
    limits: {
      concurrentRuns: 20,
      customWorkers: 100,
      scheduledTriggers: 50,
      appTriggers: 200,
    },
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
    limits: {
      concurrentRuns: 50,
      customWorkers: 200,
      scheduledTriggers: 100,
      appTriggers: 500,
    },
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
    limits: {
      concurrentRuns: 50,
      customWorkers: 200,
      scheduledTriggers: 100,
      appTriggers: 500,
    },
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
    limits: {
      concurrentRuns: 50,
      customWorkers: 200,
      scheduledTriggers: 100,
      appTriggers: 500,
    },
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
    free:          { monthly: 'price_1RIGvuG6l1KZGqIrw14abxeL' },
    tier_2_20:     { monthly: 'price_1RIGvuG6l1KZGqIrCRu0E4Gi', yearly: 'price_1ReGogG6l1KZGqIrEyBTmtPk', yearlyCommitment: 'price_1RqYGaG6l1KZGqIrIzcdPzeQ' },
    tier_6_50:     { monthly: 'price_1RIGvuG6l1KZGqIrvjlz5p5V', yearly: 'price_1ReGoJG6l1KZGqIr0DJWtoOc', yearlyCommitment: 'price_1RqYH1G6l1KZGqIrWDKh8xIU' },
    tier_12_100:   { monthly: 'price_1RIGvuG6l1KZGqIrT6UfgblC', yearly: 'price_1ReGnZG6l1KZGqIr0ThLEl5S' },
    tier_25_200:   { monthly: 'price_1RIGvuG6l1KZGqIrOVLKlOMj', yearly: 'price_1ReGmzG6l1KZGqIre31mqoEJ', yearlyCommitment: 'price_1RqYHbG6l1KZGqIrAUVf8KpG' },
    tier_50_400:   { monthly: 'price_1RIKNgG6l1KZGqIrvsat5PW7', yearly: 'price_1ReGmgG6l1KZGqIrn5nBc7e5' },
    tier_125_800:  { monthly: 'price_1RIKNrG6l1KZGqIrjKT0yGvI', yearly: 'price_1ReGmMG6l1KZGqIrvE2ycrAX' },
    tier_200_1000: { monthly: 'price_1RIKQ2G6l1KZGqIrum9n8SI7', yearly: 'price_1ReGlXG6l1KZGqIrlgurP5GU' },
  },
  credits: {
    10:  'price_1RxXOvG6l1KZGqIrMqsiYQvk',
    25:  'price_1RxXPNG6l1KZGqIrQprPgDme',
    50:  'price_1RxmNhG6l1KZGqIrTq2zPtgi',
    100: 'price_1RxmNwG6l1KZGqIrnliwPDM6',
    250: 'price_1RxmO6G6l1KZGqIrBF8Kx87G',
    500: 'price_1RxmOFG6l1KZGqIrn4wgORnH',
  },
  productId: 'prod_SCgIj3G7yPOAWY',
};

function getStripePrices(): StripePriceConfig {
  return config.STRIPE_ENV === 'staging' ? STRIPE_PRICES_STAGING : STRIPE_PRICES_PROD;
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

export function getTierLimits(tierName: string) {
  return getTier(tierName).limits;
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
