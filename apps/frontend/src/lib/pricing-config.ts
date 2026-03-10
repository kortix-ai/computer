import { config } from '@/lib/config';

interface UpgradePlan {
  /** @deprecated */
  hours: string;
  price: string;
  tierKey: string;
}

export interface PricingTier {
  name: string;
  price: string;
  yearlyPrice?: string;
  description: string;
  buttonText: string;
  buttonColor: string;
  isPopular: boolean;
  /** @deprecated */
  hours: string;
  features: string[];
  disabledFeatures?: string[];
  baseCredits?: number;
  bonusCredits?: number;
  tierKey: string;
  upgradePlans: UpgradePlan[];
  hidden?: boolean;
  billingPeriod?: 'monthly' | 'yearly';
  originalYearlyPrice?: string;
  discountPercentage?: number;
}

export const pricingTiers: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    description: 'Bring your own compute & keys',
    buttonText: 'Get Started',
    buttonColor: 'bg-secondary text-white',
    isPopular: false,
    hours: '0 hours',
    features: [
      'Connect your own instance',
      'Bring your own API keys',
      '1 Chat',
      'Basic Mode',
    ],
    disabledFeatures: [
      'No cloud instance',
      'No credits included',
      'No custom AI Workers',
      'No integrations',
    ],
    tierKey: config.SUBSCRIPTION_TIERS.FREE_TIER.tierKey,
    upgradePlans: [],
    hidden: true,
  },
  {
    name: 'Pro',
    price: '$20',
    description: 'Everything you need to build with AI',
    buttonText: 'Get started',
    buttonColor: 'bg-primary text-white dark:text-black',
    isPopular: true,
    hours: '0',
    baseCredits: 1000,
    features: [
      '$10 in credits (1,000 credits/month)',
      '1 Cloud Instance included',
      'Auto-topup available',
      'Add additional instances',
    ],
    tierKey: config.SUBSCRIPTION_TIERS.PRO.tierKey,
    upgradePlans: [],
  },
];
